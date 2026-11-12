/**
 * Le moteur réel du site, construit sur `@cardwake/model` (11.1, 11.8). Trois
 * règles le tiennent : chaque action humaine ouvre une transaction du journal
 * avec une cause en anglais ; toute opération passe par `authorizeOp` (en mode
 * Jouer la structure est refusée, CAR-F-05, un champ verrouillé refuse la
 * saisie humaine, CAR-F-06) ; horloge **injectée** et graine fournie — ni
 * `Date.now()` ni `Math.random()` n'apparaissent ici.
 *
 * L'exécution des scripts passe par l'adaptateur de dispatch (lot C5b) : un
 * clic sur un bouton à script exécute le handler `mouseUp` via le
 * `Dispatcher`, resynchronise la pile et notifie les abonnés (`changed`) ;
 * `click(partId): void` reste synchrone, le travail asynchrone est interne.
 *
 * Les tours d'agent passent par le pont enregistré (`agent-bridge`) : la
 * passerelle est la cassette de la pile, jamais le réseau, jamais une clé
 * (CAR-N-09). Un tour qui n'a pas d'enregistrement ne consomme ni tour ni
 * saut, et le moteur rend le saut que le `Dispatcher` avait avancé.
 */

import { ActionBudgetTracker, SessionBudgetTracker } from "@cardwake/agent";
import type { LlmGateway } from "@cardwake/agent";
import type { Actor, PropName } from "@cardwake/lang";
import { Journal, applyOps, authorizeOp, clampSettings, currentInk, currentText } from "@cardwake/model";
import type { Card, DispatchResult, Op, Rect, Stack, Verdict } from "@cardwake/model";
import type { BudgetView, CardwakeEngine, EngineEvent, JournalView, Mode, Refusal, SpyView } from "./types";
import { createDispatchAdapter, noticeOf, runDispatch, stepSeed } from "./dispatch-adapter";
import type { DispatchAdapter, DispatchRequest } from "./dispatch-adapter";
import { createAgentBridge } from "./agent-bridge";
import { cassetteForStack } from "../data/cassettes";
import {
  addBackgroundOps,
  addCardOps,
  addPartOps,
  deletePartOps,
  fieldTarget,
  findPart,
  setPartPropOps,
  setPartRectOps,
} from "./ops";
import { describeRequest, emptySpy, spyView } from "./spy";
import type { SpyRequest } from "./spy";

export type ModelEngineOptions = {
  /** Horloge injectée : rend un horodatage ISO (CAR-F-17). */
  clock: () => string;
  /** Graine de la session : les graines des transactions en découlent. */
  seed: number;
  /**
   * La passerelle des tours d'agent : la cassette de la pile par défaut,
   * jamais le réseau. Les tests peuvent en injecter une autre.
   */
  gatewayOf?: (stack: Stack) => LlmGateway | null;
};

class ModelEngine implements CardwakeEngine {
  private stack: Stack | null = null;
  private currentMode: Mode = "play";
  private journalInstance = new Journal();
  private session: SessionBudgetTracker | null = null;
  private action: ActionBudgetTracker | null = null;
  private refusal: Refusal | null = null;
  private notice: string | null = null;
  private redoable = false;
  private seed: number;
  private lastSpy: SpyView | null = null;
  private readonly clock: () => string;
  private readonly gatewayOf: (stack: Stack) => LlmGateway | null;
  private readonly listeners = new Set<(event: EngineEvent) => void>();

  constructor(options: ModelEngineOptions) {
    this.clock = options.clock;
    this.seed = options.seed >>> 0;
    this.gatewayOf = options.gatewayOf ?? cassetteForStack;
  }

  // ---- Ouverture et lecture ----

  openStack(stack: Stack): void {
    this.stack = stack;
    this.journalInstance = new Journal();
    // Les compteurs sont bâtis sur les réglages **recadrés** : c'est eux que
    // le `Dispatcher` et le pont enregistré utilisent, donc les deux jauges
    // ne peuvent pas diverger (CAR-P-13).
    const settings = clampSettings(stack.settings);
    this.session = new SessionBudgetTracker(settings);
    this.action = new ActionBudgetTracker(settings);
    this.refusal = null;
    this.notice = null;
    this.redoable = false;
    this.lastSpy = null;
    this.emit({ type: "opened", stack });
  }

  state(): Stack | null {
    return this.stack;
  }

  currentCard(): Card | null {
    if (this.stack === null) return null;
    const id = this.stack.currentCardId;
    return this.stack.cards.find((card) => card.id === id) ?? null;
  }

  mode(): Mode {
    return this.currentMode;
  }

  setMode(mode: Mode): void {
    if (this.currentMode === mode) return;
    this.currentMode = mode;
    this.refusal = null;
    this.emit({ type: "mode-changed", mode });
  }

  // ---- Actions humaines ----

  navigate(cardId: number | null): void {
    if (this.stack === null) return;
    const before = this.stack.currentCardId;
    if (before === cardId) return;
    this.applyAuthorized(`human navigation to card ${cardId ?? "(none)"}`, [
      { kind: "navigate", before, after: cardId },
    ]);
  }

  click(partId: number): void {
    const stack = this.stack;
    const card = this.currentCard();
    if (stack === null || card === null) return;
    // Une action humaine ouvre un nouveau compteur de sauts (7.6).
    this.action = new ActionBudgetTracker(clampSettings(stack.settings));
    const part = findPart(stack, card, partId);
    this.emit({ type: "clicked", partId });
    if (part === undefined || part.kind !== "button") return;
    if (part.script.trim() === "") return;
    // Le bouton a un script : l'adaptateur l'exécute réellement (lot C5b).
    this.dispatch({ kind: "click", cardId: card.id, partId });
  }

  /** Barre de discussion : l'humain parle à l'agent de la carte affichée. Hors
   * contrat figé, exposée par `createModelEngine` ; asynchrone, comme `click`. */
  chat(text: string): void {
    const stack = this.stack;
    const card = this.currentCard();
    if (stack === null || card === null) return;
    this.action = new ActionBudgetTracker(clampSettings(stack.settings));
    this.dispatch({ kind: "chat", cardId: card.id, text });
  }

  editField(partId: number, text: string): void {
    const stack = this.stack;
    const card = this.currentCard();
    if (stack === null || card === null) return;
    const target = fieldTarget(stack, card, partId);
    if (target === null || target.part.kind !== "field") return;
    const before = currentText(stack, card.id, partId);
    if (before === text) return;
    const op: Op = {
      kind: "setText",
      cardId: card.id,
      partId,
      ...(target.backgroundId !== undefined ? { backgroundId: target.backgroundId } : {}),
      before,
      after: text,
      // Un humain écrit à l'encre noire : l'encre d'agent tombe (CAR-F-42).
      inkBefore: currentInk(stack, card.id, partId),
      inkAfter: null,
    };
    this.applyAuthorized(`human edit of field "${target.part.name}"`, [op]);
  }

  // ---- Construction (mode Fabriquer seulement, CAR-F-02, CAR-F-05) ----

  addCard(name: string): void {
    if (this.stack === null) return;
    const built = addCardOps(this.stack, name);
    this.applyAuthorized(`human creation of card "${name}"`, built.ops, built.nextId);
  }

  addPart(kind: "button" | "field", name: string): void {
    const stack = this.stack;
    const card = this.currentCard();
    if (stack === null || card === null) {
      this.say("Create a card first: the palette adds to the current card.");
      return;
    }
    const built = addPartOps(stack, card, kind, name);
    this.applyAuthorized(`human creation of ${kind} "${name}"`, built.ops, built.nextId);
  }

  addBackground(name: string): void {
    if (this.stack === null) return;
    const built = addBackgroundOps(this.stack, name);
    this.applyAuthorized(`human creation of background "${name}"`, built.ops, built.nextId);
  }

  setPartRect(partId: number, rect: Rect): void {
    const stack = this.stack;
    const card = this.currentCard();
    if (stack === null || card === null) return;
    const part = findPart(stack, card, partId);
    if (part === undefined) return;
    this.applyAuthorized(`human resize of "${part.name}"`, [setPartRectOps(card, part, rect)]);
  }

  setPartProp(partId: number, prop: PropName, value: string): void {
    const stack = this.stack;
    const card = this.currentCard();
    if (stack === null || card === null) return;
    const part = findPart(stack, card, partId);
    if (part === undefined) return;
    this.applyAuthorized(`human edit of "${part.name}" (${prop})`, [setPartPropOps(card, part, prop, value)]);
  }

  deletePart(partId: number): void {
    const stack = this.stack;
    const card = this.currentCard();
    if (stack === null || card === null) return;
    const part = findPart(stack, card, partId);
    if (part === undefined) return;
    this.applyAuthorized(`human deletion of "${part.name}"`, [deletePartOps(card, part)]);
  }

  // ---- Réception (7.10, CAR-F-52) ----

  /**
   * Réveille les agents d'une pile reçue ; `effectiveLevel` plafonne le niveau
   * à 2 tant que la pile n'est pas déclarée fiable. Passe par `authorizeOp` :
   * n'aboutit qu'en mode Fabriquer — l'écran de réception bascule dans ce mode.
   */
  wakeAgents(): void {
    if (this.stack === null) return;
    const ops: Op[] = this.stack.cards
      .filter((card) => card.agent !== null && !card.agent.awake)
      .map((card) => ({
        kind: "setAgent",
        cardId: card.id,
        before: card.agent,
        after: card.agent === null ? null : { ...card.agent, awake: true },
      }));
    if (ops.length === 0) {
      this.say("Every agent is already awake.");
      return;
    }
    this.applyAuthorized("human wakes the agents of a received stack", ops);
  }

  /** « Je fais confiance à cette pile » : second geste, distinct du réveil. La
   * provenance n'a pas d'opération réversible : hors journal, change la confiance. */
  trustStack(): void {
    const stack = this.stack;
    if (stack === null || stack.provenance.kind !== "received") return;
    this.stack = { ...stack, provenance: { ...stack.provenance, trusted: true } };
    this.say("You declared that you trust this stack.");
    this.emit({ type: "changed", stack: this.stack });
  }

  // ---- Journal et budget ----

  undo(): void {
    if (this.stack === null) return;
    const result = this.journalInstance.undo(this.stack);
    if (result === null) {
      this.say("Nothing left to undo.");
      return;
    }
    this.stack = result.stack;
    this.redoable = true;
    this.emit({ type: "undone", stack: this.stack });
  }

  redo(): void {
    if (this.stack === null) return;
    const result = this.journalInstance.redo(this.stack);
    if (result === null) {
      this.say("Nothing left to redo.");
      return;
    }
    this.stack = result.stack;
    this.redoable = false;
    this.emit({ type: "redone", stack: this.stack });
  }

  journal(): JournalView {
    return {
      entries: this.journalInstance.entries(),
      exportText: this.journalInstance.exportText(),
      canUndo: this.journalInstance.length > 0,
      canRedo: this.redoable,
    };
  }

  budget(): BudgetView {
    const session = this.session?.snapshot();
    const turnsUsed = session?.turnsUsed ?? 0;
    const turnsMax = session?.turnsMax ?? 0;
    const inputTokensUsed = session?.inputTokensUsed ?? 0;
    const inputTokensMax = session?.inputTokensMax ?? 0;
    const hopsLeft = this.action?.snapshot().hopsLeft ?? 0;
    return {
      turnsUsed,
      turnsMax,
      inputTokensUsed,
      inputTokensMax,
      hopsLeft,
      exhausted: (turnsMax > 0 && turnsUsed >= turnsMax) || (inputTokensMax > 0 && inputTokensUsed >= inputTokensMax),
      hopsExhausted: this.action !== null && hopsLeft <= 0,
    };
  }

  lastRefusal(): Refusal | null {
    return this.refusal;
  }

  lastNotice(): string | null {
    return this.notice;
  }

  /** L'espion de messages : la trace de la dernière action (CAR-F-19). */
  spy(): SpyView {
    return this.lastSpy ?? emptySpy();
  }

  // ---- Abonnements ----

  subscribe(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.listeners.clear();
    this.stack = null;
    this.emit({ type: "disposed" });
  }

  // ---- Mécanique interne ----

  /** Le mode humain, dans le vocabulaire du modèle (`browse`/`author`). */
  private humanMode(): "browse" | "author" {
    return this.currentMode === "play" ? "browse" : "author";
  }

  /** L'acteur humain du moment, pour le point de passage des droits. */
  private actor(): Actor {
    return { kind: "human", mode: this.humanMode() };
  }

  /** Verdict du point de passage unique des droits pour une opération. */
  private authorize(op: Op): Verdict {
    if (this.stack === null) return { allow: false, reason: "No stack is open.", rule: "no-stack" };
    const cardId = this.stack.currentCardId ?? 0;
    return authorizeOp({ stack: this.stack, actor: this.actor(), cardId }, op);
  }

  /**
   * Autorise puis applique : chaque opération passe par `authorizeOp`, la
   * première refusée arrête tout (CAR-F-05/06). `nextIdAfter` garde le compteur
   * avancé même en cas de refus : un identifiant alloué n'est jamais réutilisé.
   */
  private applyAuthorized(cause: string, ops: Op[], nextIdAfter?: number): void {
    if (this.stack === null || ops.length === 0) return;
    for (const op of ops) {
      const verdict = this.authorize(op);
      if (!verdict.allow) {
        if (nextIdAfter !== undefined) this.stack = { ...this.stack, nextId: nextIdAfter };
        this.refuse(verdict.reason, verdict.rule);
        return;
      }
    }
    const pre = this.stack;
    this.journalInstance.begin({ kind: "human", mode: this.humanMode() }, cause, this.nextSeed());
    for (const op of ops) this.journalInstance.record(op);
    this.stack = applyOps(pre, ops);
    this.journalInstance.commit(this.stack, this.clock());
    this.redoable = false;
    this.refusal = null;
    this.emit({ type: "changed", stack: this.stack });
    if (ops.some((op) => op.kind === "navigate")) {
      this.emit({ type: "navigated", cardId: this.stack.currentCardId });
    }
  }

  private nextSeed(): number {
    this.seed = stepSeed(this.seed);
    return this.seed;
  }

  /**
   * Lance l'exécution asynchrone via l'adaptateur : journal, graine et horloge
   * du moteur. Le pont enregistré est branché sur le `Dispatcher` : les tours
   * d'agent passent par la cassette de la pile, jamais par le réseau.
   */
  private dispatch(request: DispatchRequest): void {
    const stack = this.stack;
    if (stack === null) return;
    const bridge = createAgentBridge({
      gatewayOf: (current) => this.gatewayOf(current),
      session: () => this.session,
      action: () => this.action,
    });
    const adapter = createDispatchAdapter({
      stack,
      journal: this.journalInstance,
      seed: this.nextSeed(),
      clock: this.clock,
      onAgentTurn: bridge.onAgentTurn,
    });
    const described = describeRequest(stack, request);
    runDispatch(adapter, request)
      .then((result) => this.settleDispatch(adapter, described, result, bridge.misses))
      .catch(() => this.say("The script failed and its transaction was rolled back."));
  }

  /** Fin d'une exécution : pile resynchronisée, budget, refus ou avis, `changed`. */
  private settleDispatch(
    adapter: DispatchAdapter,
    request: SpyRequest,
    result: DispatchResult,
    misses: number,
  ): void {
    this.stack = adapter.current;
    this.redoable = false;
    // L'espion montre les sauts qui restent **vraiment** : `absorbBudget` a
    // déjà rendu ceux des tours partis sans rien produire, donc la jauge et
    // la trace ne peuvent pas se contredire.
    const hopsLeft = this.absorbBudget(result, misses);
    this.lastSpy = spyView(request, result, hopsLeft);
    const refused = result.refusals.find((verdict) => !verdict.allow);
    if (refused !== undefined && !refused.allow) {
      this.refuse(refused.reason, refused.rule);
    } else {
      this.notice = noticeOf(result);
      this.refusal = null;
    }
    this.emit({ type: "changed", stack: this.stack });
  }

  /**
   * Reporte les sauts consommés par l'action dans la jauge et rend ce qu'il
   * en reste. Les tours, eux, sont déjà comptés : le pont les porte un par
   * appel de modèle, comme l'enregistreur. Un tour sans enregistrement ne
   * consomme rien : le saut que le `Dispatcher` avait avancé est rendu ici.
   */
  private absorbBudget(result: DispatchResult, misses: number): number {
    const hopBudget = clampSettings(this.stack?.settings).hopBudget;
    const spentHops = Math.max(0, hopBudget - result.hopsLeft - misses);
    for (let hop = 0; hop < spentHops; hop += 1) this.action?.consumeHop();
    return this.action?.snapshot().hopsLeft ?? Math.max(0, hopBudget - spentHops);
  }

  private refuse(reason: string, rule: string): void {
    this.refusal = { reason, rule };
    this.notice = reason;
    this.emit({ type: "refused", reason, rule });
  }

  /** Pose un état lisible, sans transaction (rien n'a changé). */
  private say(notice: string): void {
    this.notice = notice;
    this.refusal = null;
  }

  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

/** Le moteur réel : le contrat figé, plus la barre de discussion. */
export type ModelEngineApi = CardwakeEngine & {
  /** Parle à l'agent de la carte affichée (asynchrone en interne). */
  chat(text: string): void;
};

/**
 * Attend la fin d'une action asynchrone : le moteur émet `changed` quand le
 * dispatch est réglé. À appeler AVANT l'action. Un seul exemplaire : les
 * tests et les preuves du site attendent de la même façon.
 */
export function settled(engine: CardwakeEngine): Promise<void> {
  return new Promise((resolve) => {
    const off = engine.subscribe((event) => {
      if (event.type === "changed") {
        off();
        resolve();
      }
    });
  });
}

/** Fabrique du moteur réel : c'est elle que le site et les tests utilisent. */
export function createModelEngine(options: ModelEngineOptions): ModelEngineApi {
  return new ModelEngine(options);
}
