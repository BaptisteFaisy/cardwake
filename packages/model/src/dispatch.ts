/**
 * La hiérarchie des messages (7.2), la file de livraison et le compteur de
 * sauts (7.6).
 *
 * Un message part d'une cible et monte : élément → carte → fond → pile. Le
 * premier script qui a un handler pour ce message s'arrête là — sauf s'il
 * appelle `pass`, qui le fait monter volontairement. Quand aucun script ne le
 * prend et que le message s'appelle `message`, l'agent éveillé de la carte se
 * réveille : c'est le chemin par lequel les cartes se parlent.
 *
 * Deux plafonds bornent les bavardages : chaque action humaine accorde
 * `hopBudget` sauts (un message qui réveille un agent en consomme un) et
 * `agentTurnsPerAction` tours. À zéro, les messages ne réveillent plus
 * personne : ils ne sont remis qu'aux scripts, et le journal note « sauts
 * épuisés » (CAR-P-14).
 */

import { parseScript, runHandler } from "@cardwake/lang";
import type { Determinism, Guards, Script } from "@cardwake/lang";
import type { Card, Message, MessageTarget, Stack, TransactionActor, Verdict } from "./types";
import type { StackSettings } from "./limits";
import type { Journal } from "./journal";
import { ModelHost } from "./host";

/** Ce qu'un agent reçoit quand il se réveille. */
export type AgentTurnRequest = {
  cardId: number;
  /** Texte reçu. */
  text: string;
  /** Qui parle : une autre carte, un script, ou l'humain. */
  sender: string;
  /** Sauts restants au moment du réveil. */
  hops: number;
};

export type DispatchContext = {
  stack: Stack;
  journal: Journal;
  guards: Guards;
  determinism: Determinism;
  settings: StackSettings;
  /** Horloge de la transaction : injectée, jamais `Date.now()`. */
  clock?: () => string;
  ask?: (prompt: string) => string;
  /**
   * Le tour d'agent. L'agent reçoit la demande et un hôte : il écrit par
   * l'hôte, donc par `authorize` et le journal, comme n'importe quel script.
   */
  onAgentTurn?: (request: AgentTurnRequest, host: ModelHost) => string | Promise<string>;
};

export type DispatchResult = {
  stack: Stack;
  /** Objets traversés, dans l'ordre : la trace de l'espion de messages. */
  path: string[];
  /** L'objet qui a traité le message, s'il y en a un. */
  handledBy: string | null;
  /** Réponse d'un agent, si un agent s'est réveillé. */
  reply: string | null;
  agentTurns: number;
  hopsLeft: number;
  trace: string[];
  /** Refus rencontrés pendant l'action, avec la règle qui les motive. */
  refusals: Verdict[];
};

/** Un niveau de la hiérarchie : un objet, son script, et qui le porte. */
type Level = {
  kind: "part" | "card" | "background" | "stack";
  label: string;
  script: string;
  cardId: number;
};

type Pending = { message: Message; hops: number };

export class Dispatcher {
  private stack: Stack;
  private queue: Pending[] = [];
  private hops = 0;
  private turns = 0;
  private sessionTurns = 0;
  /** Tours d'agent consommés par l'action en cours, quelle que soit la voie. */
  private turnsTaken = 0;
  private readonly lines: string[] = [];
  private readonly path: string[] = [];
  private readonly refusals: Verdict[] = [];
  /** État partagé par tous les hôtes d'une même action humaine. */
  private shared: { stack: Stack } = { stack: undefined as unknown as Stack };

  constructor(private readonly ctx: DispatchContext) {
    this.stack = ctx.stack;
    this.shared = { stack: ctx.stack };
  }

  /** La pile courante : c'est elle qu'on sauvegarde et qu'on annule. */
  get current(): Stack {
    return this.stack;
  }

  /** Le journal des événements, pour l'espion de messages et le panneau. */
  get trace(): string[] {
    return this.lines;
  }

  private now(): string {
    return this.ctx.clock ? this.ctx.clock() : "1970-01-01T00:00:00.000Z";
  }

  private log(text: string): void {
    this.lines.push(text);
  }

  /** Une action humaine : trois sauts et huit tours repartent de zéro. */
  beginAction(): void {
    this.hops = this.ctx.settings.hopBudget;
    this.turns = this.ctx.settings.agentTurnsPerAction;
  }

  /** Émet un message et vide la file jusqu'à épuisement. */
  async emit(message: Message): Promise<DispatchResult> {
    this.beginAction();
    this.shared.stack = this.stack;
    this.path.length = 0;
    this.lines.length = 0;
    this.refusals.length = 0;
    this.turnsTaken = 0;
    this.queue = [{ message, hops: this.hops }];
    let reply: string | null = null;
    let handledBy: string | null = null;
    while (this.queue.length > 0) {
      const pending = this.queue.shift();
      if (!pending) break;
      const outcome = await this.deliver(pending);
      // Le premier objet qui prend le message est celui qui compte : les
      // suivants sont des conséquences (messages entre cartes).
      if (outcome.handledBy !== null && handledBy === null) handledBy = outcome.handledBy;
      if (outcome.reply !== null) reply = outcome.reply;
    }
    return {
      stack: this.stack,
      path: [...this.path],
      handledBy,
      reply,
      agentTurns: this.turnsTaken,
      hopsLeft: this.hops,
      trace: [...this.lines],
      refusals: [...this.refusals],
    };
  }

  /** Clic humain sur un élément : le message `mouseUp` part de l'élément. */
  async click(cardId: number, partId: number): Promise<DispatchResult> {
    return this.emit({
      name: "mouseUp",
      params: [],
      target: { kind: "part", cardId, partId },
      sender: { kind: "human" },
      hops: this.ctx.settings.hopBudget,
    });
  }

  /** La barre de discussion : l'humain parle à l'agent de la carte. */
  async chat(cardId: number, text: string): Promise<DispatchResult> {
    return this.emit({
      name: "message",
      params: [text],
      target: { kind: "card", cardId },
      sender: { kind: "human" },
      hops: this.ctx.settings.hopBudget,
    });
  }

  // ------------------------------------------------------------ livraison

  /** Remet un message dans la file : c'est le chemin des cartes qui se parlent. */
  private enqueue(name: string, args: string[], target: MessageTarget): void {
    this.queue.push({
      message: {
        name,
        params: args,
        target,
        sender: { kind: "script", objectId: 0 },
        hops: this.hops,
      },
      hops: this.hops,
    });
    this.log(`queued "${name}" for ${describeTarget(target)}`);
  }

  /** Fait monter le message : le script courant a décidé de ne pas le traiter. */
  private pass(message: string): void {
    this.log(`pass ${message}`);
  }

  private async deliver(pending: Pending): Promise<{ handledBy: string | null; reply: string | null; turns: number }> {
    const { message } = pending;
    const levels = this.levelsFor(message.target);
    for (const level of levels) {
      this.path.push(level.label);
      const outcome = await this.runAt(level, message);
      if (outcome.passed) continue;
      if (outcome.handled) return { handledBy: level.label, reply: null, turns: 0 };
    }
    // Aucun script n'a pris le message : l'agent de la carte se réveille, si
    // le message est bien « message », que l'agent dort pas et qu'il reste des
    // sauts (7.2, 7.6).
    if (message.name === "message") {
      const cardId = cardOf(message.target);
      const answer = await this.wakeAgent(cardId, message.params.join(" "), describeSender(message), pending.hops);
      if (answer !== null) return { handledBy: `agent of card "${this.cardName(cardId)}"`, reply: answer, turns: 1 };
    }
    this.log(`ignored "${message.name}"`);
    return { handledBy: null, reply: null, turns: 0 };
  }

  /** Exécute le handler d'un niveau, s'il en a un pour ce message. */
  private async runAt(
    level: Level,
    message: Message,
  ): Promise<{ handled: boolean; passed: boolean }> {
    if (level.script.trim() === "") return { handled: false, passed: false };
    const parsed = parseScript(level.script);
    if (!parsed.ok) {
      this.log(`syntax error in ${level.label}: ${parsed.errors[0]?.message ?? "unknown"}`);
      return { handled: false, passed: false };
    }
    const handler = this.findHandler(parsed.script, message.name);
    if (!handler) return { handled: false, passed: false };

    let passed = false;
    const actor: TransactionActor = { kind: "script", cardId: level.cardId, objectId: 0 };
    this.ctx.journal.begin(actor, `${message.name} on ${level.label}`, this.ctx.determinism.seed);
    const host = new ModelHost({
      stack: this.stack,
      journal: this.ctx.journal,
      actor,
      cardId: level.cardId,
      guards: this.ctx.guards,
      determinism: this.ctx.determinism,
      settings: this.ctx.settings,
      txId: this.ctx.journal.length + 1,
      shared: this.shared,
      ask: this.ctx.ask,
      consult: async (cardId, text) =>
        (await this.wakeAgent(cardId, text, level.label, this.hops)) ?? "The card did not answer.",
      onMessage: (name, args, target) => this.enqueue(name, args, target),
      onPass: () => {
        passed = true;
      },
    });
    const result = await runHandler(parsed.script, handler, message.params, host);
    this.stack = this.shared.stack;
    this.absorb(host);
    if (result.ok) {
      this.ctx.journal.commit(this.stack, this.now());
      this.log(`${level.label} handled "${message.name}"`);
    } else {
      this.ctx.journal.abort();
      this.log(`${level.label} failed on "${message.name}": ${result.error.message}`);
    }
    return { handled: true, passed };
  }

  /**
   * Reprend la trace et les refus d'un hôte dans ceux de l'expéditeur : c'est
   * ce qui rend l'espion de messages complet — on y voit ce qu'un agent a fait,
   * et pourquoi une écriture a été refusée.
   */
  private absorb(host: ModelHost): void {
    for (const entry of host.trace) this.lines.push(entry.text);
    for (const refusal of host.lastRefusals) this.refusals.push(refusal);
  }

  /** Le tour d'agent : sa propre transaction, donc annulable d'un geste. */
  private async wakeAgent(cardId: number, text: string, sender: string, hops: number): Promise<string | null> {
    const card = this.stack.cards.find((item) => item.id === cardId);
    if (!card || card.agent === null || !card.agent.awake) return null;
    if (hops <= 0) {
      this.log("hops exhausted: the message is only handed to scripts");
      return null;
    }
    if (this.turns <= 0 || this.sessionTurns >= this.ctx.settings.agentTurnsPerSession) {
      this.log("no turn left: the agents sleep, the scripts keep working");
      return null;
    }
    // Sans enregistrement ni clé, la carte le dit — et ne consomme aucun
    // budget : un tour qui n'a pas eu lieu n'a pas eu lieu.
    if (!this.ctx.onAgentTurn) {
      this.log(`agent of card "${card.name}" has no recording: no answer`);
      return null;
    }
    this.hops -= 1;
    this.turns -= 1;
    this.sessionTurns += 1;
    this.turnsTaken += 1;
    const actor: TransactionActor = { kind: "agent", cardId, level: card.agent.level };
    this.ctx.journal.begin(actor, `agent turn on card "${card.name}"`, this.ctx.determinism.seed);
    const host = new ModelHost({
      stack: this.stack,
      journal: this.ctx.journal,
      actor,
      cardId,
      guards: this.ctx.guards,
      determinism: this.ctx.determinism,
      settings: this.ctx.settings,
      txId: this.ctx.journal.length + 1,
      shared: this.shared,
      onMessage: (name, args, target) => this.enqueue(name, args, target),
    });
    const reply = await this.ctx.onAgentTurn({ cardId, text, sender, hops: this.hops }, host);
    this.stack = this.shared.stack;
    this.absorb(host);
    this.ctx.journal.commit(this.stack, this.now());
    this.log(`agent of card "${card.name}" answered (${this.hops} hops left)`);
    return reply;
  }

  /** Les niveaux traversés pour une cible, du plus proche au plus haut. */
  private levelsFor(target: MessageTarget): Level[] {
    const levels: Level[] = [];
    if (target.kind === "part") {
      const card = this.card(target.cardId);
      const part = card?.parts.find((item) => item.id === target.partId);
      const shared = this.backgroundOf(card)?.parts.find((item) => item.id === target.partId);
      const found = part ?? shared;
      if (found) {
        levels.push({
          kind: "part",
          label: `${found.kind} "${found.name}"`,
          script: found.script,
          cardId: target.cardId,
        });
      }
    }
    const cardId = cardOf(target);
    const card = this.card(cardId);
    if (card) {
      levels.push({ kind: "card", label: `card "${card.name}"`, script: card.script, cardId });
      const background = this.backgroundOf(card);
      if (background) {
        levels.push({
          kind: "background",
          label: `background "${background.name}"`,
          script: background.script,
          cardId,
        });
      }
    }
    levels.push({ kind: "stack", label: `stack "${this.stack.name}"`, script: this.stack.script, cardId });
    return levels;
  }

  private findHandler(script: Script, name: string): string | null {
    const wanted = name.toLowerCase();
    const handler = script.handlers.find((item) => item.name.toLowerCase() === wanted);
    return handler ? handler.name : null;
  }

  private card(id: number): Card | undefined {
    return this.stack.cards.find((item) => item.id === id);
  }

  private backgroundOf(card: Card | undefined) {
    if (!card) return undefined;
    return this.stack.backgrounds.find((item) => item.id === card.background);
  }

  private cardName(id: number): string {
    return this.card(id)?.name ?? "";
  }
}

/** La carte porteuse d'une cible. */
export function cardOf(target: MessageTarget): number {
  if (target.kind === "part" || target.kind === "card") return target.cardId;
  return 0;
}

function describeTarget(target: MessageTarget): string {
  if (target.kind === "part") return `part ${target.partId}`;
  if (target.kind === "card") return `card ${target.cardId}`;
  if (target.kind === "background") return `background ${target.backgroundId}`;
  return "the stack";
}

function describeSender(message: Message): string {
  const sender = message.sender;
  if (sender.kind === "human") return "you";
  if (sender.kind === "system") return "the system";
  if (sender.kind === "agent") return `the agent of card ${sender.cardId}`;
  return "a script";
}
