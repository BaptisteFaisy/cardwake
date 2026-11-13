/**
 * L'enregistreur des cassettes de démonstration (7.11).
 *
 * Il joue un scénario — une suite de parcours humains (clic sur un bouton,
 * phrase libre dans la discussion) — avec une passerelle de substitution
 * SCRIPTÉE : les réponses sont écrites à la main, aucun réseau n'est ouvert,
 * aucune clé n'est lue (CAR-N-09). Chaque appel du modèle est capturé dans
 * une `CassetteGateway` comme un couple (empreinte canonique, réponse) ; un
 * doublon d'empreinte est une erreur : la cassette mentirait au rejeu.
 *
 * Le même harnais sert au rejeu (`replayScenario`) : le `Dispatcher` exécute
 * les mêmes scripts, et la boucle `runAgentTurn` interroge la cassette. La
 * graine et l'horloge sont figées, jamais `Date.now()` ni `Math.random()` :
 * un enregistrement rejoue à l'identique (CAR-P-20).
 */

import type { AgentTurnRequest, ModelHost, Stack, StackSettings } from "@cardwake/model";
import type { Card, Part } from "@cardwake/model";
import type { Determinism, Guards } from "@cardwake/lang";
import { APP_LIMITS, Dispatcher, Journal, clampSettings, cloneStack } from "@cardwake/model";
import { ActionBudgetTracker, SessionBudgetTracker } from "./budget";
import { CassetteGateway } from "./gateway/cassette";
import { fingerprint } from "./gateway/canon";
import { throwIfAborted } from "./gateway/http";
import { runAgentTurn, type TurnOutcome } from "./loop";
import { cardSummaryOf } from "./script-summary";
import { LANGUAGE_REFERENCE } from "./language-reference";
import { textResponse } from "./testing/fake-model";
import { responseText } from "./types";
import type { LlmGateway, LlmRequest, LlmResponse } from "./types";
import { draftText, scriptDraftRequest } from "./write-script";
import type { ModelDraft } from "./write-script";

/** Graine et horloge figées : le même scénario rejoue le même état (CAR-P-20). */
const RECORDER_SEED = 2026;
const RECORDER_CLOCK = "1970-01-01T00:00:00.000Z";

/** Les quatre horloges du langage, dérivées de l'instant figé ci-dessus. */
const RECORDER_NOW: ReturnType<Determinism["now"]> = {
  date: "1/1/70",
  time: "12:00 AM",
  longDate: "Thursday, January 1, 1970",
  epochMs: 0,
};

/** Garde-fous d'exécution : les plafonds de l'application, rien d'autre. */
function recorderGuards(): Guards {
  return {
    maxSteps: APP_LIMITS.maxSteps,
    maxMessageDepth: 50,
    maxWaitMs: APP_LIMITS.maxWaitMs,
    maxTextChars: APP_LIMITS.maxFieldChars,
  };
}

/** Un clic sur un bouton nommé, sur une carte nommée. */
export type ClickAction = { kind: "click"; card: string; button: string };

/** Une phrase libre, envoyée à l'agent d'une carte nommée. */
export type ChatAction = { kind: "chat"; card: string; text: string };

/**
 * Une demande de brouillon : la phrase de l'auteur, l'élément visé, et la
 * réponse rendue par le modèle. L'enregistreur construit **exactement** la
 * requête que l'écran enverrait, puis range cette réponse.
 */
export type DraftAction = {
  kind: "draft";
  /** La carte dont on écrit le script. */
  card: string;
  /** L'élément de cette carte dont on écrit le script. */
  part: string;
  /** La phrase de l'auteur, en clair. */
  phrase: string;
  /** La sortie structurée du modèle, telle qu'elle a été rendue. */
  response: ModelDraft;
};

/** Un parcours humain : un clic, une phrase libre, ou une demande de brouillon. */
export type ScenarioAction = ClickAction | ChatAction | DraftAction;

/**
 * Un parcours, avec les réponses du modèle écrites à la main, dans l'ordre.
 * Une étape de brouillon porte sa réponse dans l'action : elle n'a pas de
 * réponse écrite à part.
 */
export type ScenarioStep = { action: ScenarioAction; responses?: readonly LlmResponse[] };

/** Un parcours enregistré : l'action, les empreintes captées, la réponse. */
export type RecordedStep = { action: ScenarioAction; fingerprints: readonly string[]; reply: string };

/** Le produit d'un enregistrement : cassette pleine, détail, état final. */
export type ScenarioRecording = { cassette: CassetteGateway; steps: readonly RecordedStep[]; stack: Stack };

/** Le produit d'un rejeu : la réponse de chaque parcours, l'état final. */
export type ScenarioReplay = { replies: readonly string[]; stack: Stack };

/** Un parcours, dit en anglais pour les messages d'erreur. */
export function describeAction(action: ScenarioAction): string {
  if (action.kind === "chat") return `chat on card "${action.card}"`;
  if (action.kind === "draft") return `draft for "${action.part}" on card "${action.card}"`;
  return `click "${action.button}" on card "${action.card}"`;
}

/**
 * La passerelle scriptée d'un enregistrement : elle rend les réponses écrites
 * à la main, dans l'ordre, et les capture dans la cassette. Réponses épuisées
 * ou situation déjà vue : erreur — jamais un silence, jamais un doublon.
 */
class ScriptedGateway implements LlmGateway {
  readonly mode = "cassette" as const;
  /** Les empreintes captées, dans l'ordre des appels. */
  readonly captured: string[] = [];
  private readonly queue: LlmResponse[];

  constructor(responses: readonly LlmResponse[], private readonly cassette: CassetteGateway, private readonly label: string) {
    this.queue = [...responses];
  }

  async call(request: LlmRequest, signal: AbortSignal): Promise<LlmResponse> {
    throwIfAborted(signal);
    const response = this.queue.shift();
    if (response === undefined) {
      throw new Error(`Recording "${this.label}" ran out of handwritten answers: add one more.`);
    }
    const fp = fingerprint(request);
    if (this.cassette.has(fp)) {
      throw new Error(`Recording "${this.label}" hit the same situation twice (${fp}): split the scenario.`);
    }
    this.cassette.record(request, response);
    this.captured.push(fp);
    return response;
  }
}

/** Résout une carte par son nom ; erreur lisible sinon. */
function cardOf(stack: Stack, name: string): Card {
  const card = stack.cards.find((item) => item.name === name);
  if (!card) throw new Error(`No card "${name}" in stack "${stack.name}".`);
  return card;
}

/** Résout une carte par son nom ; son identifiant suffice à la plupart des cas. */
function cardIdOf(stack: Stack, name: string): number {
  return cardOf(stack, name).id;
}

/** Résout un bouton par son nom sur une carte ; erreur lisible sinon. */
function buttonIdOf(stack: Stack, cardName: string, buttonName: string): { cardId: number; partId: number } {
  const card = cardOf(stack, cardName);
  const button = card.parts.find((item) => item.kind === "button" && item.name === buttonName);
  if (!button) throw new Error(`No button "${buttonName}" on card "${cardName}".`);
  return { cardId: card.id, partId: button.id };
}

/** Résout un élément par son nom : ceux de la carte, puis ceux de son fond. */
function partOf(stack: Stack, card: Card, name: string): Part {
  const background = stack.backgrounds.find((item) => item.id === card.background);
  const part =
    card.parts.find((item) => item.name === name) ??
    background?.parts.find((item) => item.name === name);
  if (!part) throw new Error(`No part "${name}" on card "${card.name}".`);
  return part;
}

/**
 * La requête de brouillon d'une étape de démonstration : exactement celle que
 * l'écran enverrait — même résumé de pile, même référence du langage, même
 * schéma de sortie, même plafond de jetons. Une seule construction, sinon les
 * empreintes ne concorderaient jamais au rejeu.
 */
export function draftRequestOf(action: DraftAction, stack: Stack): LlmRequest {
  const card = cardOf(stack, action.card);
  const part = partOf(stack, card, action.part);
  return scriptDraftRequest(
    {
      phrase: action.phrase,
      objectKind: "part",
      objectName: part.name,
      stackSummary: cardSummaryOf(stack, card, part),
      currentScript: part.script,
    },
    { languageReference: LANGUAGE_REFERENCE, stack, cardId: card.id },
  );
}

/** Le harnais d'un scénario complet : la pile se modifie de parcours en parcours. */
class ScenarioRunner {
  private gateway: LlmGateway | undefined;
  private action: ActionBudgetTracker | undefined;
  private readonly turns: TurnOutcome[] = [];
  private readonly session: SessionBudgetTracker;
  private readonly settings: StackSettings;
  private readonly dispatcher: Dispatcher;

  constructor(stack: Stack) {
    this.settings = clampSettings(stack.settings);
    this.session = new SessionBudgetTracker(this.settings);
    this.dispatcher = new Dispatcher({
      stack,
      journal: new Journal(),
      guards: recorderGuards(),
      determinism: { seed: RECORDER_SEED, random: () => 0.5, now: () => RECORDER_NOW },
      settings: this.settings,
      clock: () => RECORDER_CLOCK,
      onAgentTurn: (request: AgentTurnRequest, host: ModelHost) => this.agentTurn(request, host),
    });
  }

  /** La pile courante : l'état final du scénario. */
  get current(): Stack {
    return this.dispatcher.current;
  }

  /** Le tour d'agent, branché sur la passerelle du parcours (scriptée ou cassette). */
  private async agentTurn(request: AgentTurnRequest, host: ModelHost): Promise<string> {
    if (!this.gateway || !this.action) throw new Error("No gateway for this scenario step.");
    const outcome = await runAgentTurn(request, {
      stack: this.dispatcher.current,
      cardId: request.cardId,
      gateway: this.gateway,
      host,
      session: this.session,
      action: this.action,
      settings: this.settings,
    });
    this.turns.push(outcome);
    return outcome.reply;
  }

  /** Un parcours : pose la passerelle et le budget, joue l'action, rend les tours. */
  async step(action: ClickAction | ChatAction, gateway: LlmGateway): Promise<TurnOutcome[]> {
    this.gateway = gateway;
    this.action = new ActionBudgetTracker(this.settings);
    this.turns.length = 0;
    if (action.kind === "chat") {
      await this.dispatcher.chat(cardIdOf(this.dispatcher.current, action.card), action.text);
    } else {
      const target = buttonIdOf(this.dispatcher.current, action.card, action.button);
      await this.dispatcher.click(target.cardId, target.partId);
    }
    return [...this.turns];
  }
}

/** Le dernier aboutissement d'un parcours : la réponse rendue à l'humain. */
function lastReply(outcomes: readonly TurnOutcome[]): string {
  return outcomes.at(-1)?.reply ?? "";
}

/**
 * Enregistre une demande de brouillon : la requête est celle de l'écran, mot
 * pour mot, et la réponse est la sortie structurée du modèle mise dans un
 * bloc texte JSON — la forme que lit le parseur de `write-script.ts`.
 */
function recordDraft(action: DraftAction, stack: Stack, cassette: CassetteGateway): RecordedStep {
  const request = draftRequestOf(action, stack);
  const fp = fingerprint(request);
  if (cassette.has(fp)) {
    throw new Error(`Recording "${describeAction(action)}" hit the same situation twice (${fp}): split the scenario.`);
  }
  const text = draftText(action.response);
  cassette.record(request, textResponse(text));
  return { action, fingerprints: [fp], reply: text };
}

/** Rejoue une demande de brouillon : la cassette rend la réponse enregistrée. */
async function replayDraft(
  action: DraftAction,
  stack: Stack,
  gateway: LlmGateway,
): Promise<string> {
  const response = await gateway.call(draftRequestOf(action, stack), new AbortController().signal);
  return responseText(response);
}

/** La réponse du premier tour avorté d'un parcours, s'il y en a un. */
function refusalOf(outcomes: readonly TurnOutcome[]): string | undefined {
  return outcomes.find((outcome) => outcome.refusal !== undefined)?.refusal;
}

/**
 * Joue un scénario complet avec les réponses écrites à la main et rend la
 * cassette pleine, le détail par parcours et l'état final de la pile. Un
 * parcours avorté (refus, tour manqué, réponse vide) est une erreur : une
 * cassette enregistrée sur un tour incomplet mentirait au rejeu.
 */
export async function recordScenario(stack: Stack, steps: readonly ScenarioStep[]): Promise<ScenarioRecording> {
  const runner = new ScenarioRunner(cloneStack(stack));
  const cassette = new CassetteGateway();
  const recorded: RecordedStep[] = [];
  for (const step of steps) {
    const label = describeAction(step.action);
    if (step.action.kind === "draft") {
      recorded.push(recordDraft(step.action, runner.current, cassette));
      continue;
    }
    const scripted = new ScriptedGateway(step.responses ?? [], cassette, label);
    const outcomes = await runner.step(step.action, scripted);
    const refusal = refusalOf(outcomes);
    if (outcomes.length === 0 || refusal !== undefined || lastReply(outcomes) === "") {
      throw new Error(`Recording "${label}" stopped early: ${refusal ?? "no agent answered"}.`);
    }
    recorded.push({ action: step.action, fingerprints: scripted.captured, reply: lastReply(outcomes) });
  }
  return { cassette, steps: recorded, stack: runner.current };
}

/**
 * Rejoue un scénario avec la cassette donnée : mêmes actions, réponses
 * enregistrées. Rend la réponse de chaque parcours et l'état final, que
 * l'appelant compare à ceux de l'enregistrement (CAR-P-20).
 */
export async function replayScenario(
  stack: Stack,
  actions: readonly ScenarioAction[],
  gateway: LlmGateway,
): Promise<ScenarioReplay> {
  const runner = new ScenarioRunner(cloneStack(stack));
  const replies: string[] = [];
  for (const action of actions) {
    if (action.kind === "draft") {
      replies.push(await replayDraft(action, runner.current, gateway));
      continue;
    }
    const outcomes = await runner.step(action, gateway);
    replies.push(lastReply(outcomes));
  }
  return { replies, stack: runner.current };
}
