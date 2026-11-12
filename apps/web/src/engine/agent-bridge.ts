/**
 * Le pont entre le `Dispatcher` et un vrai tour d'agent (7.5), en trois modes
 * d'accès : la cassette de la pile (`recorded`, le défaut), le relais local
 * (`live`), ou l'un puis l'autre (`auto`).
 *
 * Le tour passe par `runAgentTurn`, avec l'hôte fourni par le Dispatcher, les
 * compteurs de budget du moteur et les réglages de la pile.
 *
 * Budget honnête (CAR-P-15) : chaque appel de modèle réussi paie un tour
 * d'action et un tour de session ; un tour parti sans rien produire
 * (`CassetteMiss`, ou pas de cassette du tout) ne consomme RIEN — il remonte
 * l'avis lisible en anglais, et le moteur rend le saut qu'il avait avancé.
 * Pour que les compteurs réels ne paient que les appels réellement faits, la
 * boucle tourne sur des compteurs fantômes recadrés sur l'état des compteurs
 * réels, et le coût (appels, jetons) n'est reporté sur les vrais compteurs
 * qu'après coup, à l'image de ce qui a réellement tourné.
 *
 * **Repli honnête** : quand le relais ne répond pas (page publique qui ne
 * peut pas joindre `127.0.0.1`, relais arrêté, plafond atteint), le tour est
 * rejoué sur la cassette et l'avis lisible le dit. Une clé n'est jamais
 * demandée ni conservée : le relais la détient, pas le navigateur (CAR-N-09).
 */

import { ActionBudgetTracker, CassetteMiss, SessionBudgetTracker, runAgentTurn } from "@cardwake/agent";
import type { LlmGateway, TurnContext, TurnOutcome } from "@cardwake/agent";
import type { AgentTurnRequest, ModelHost, Stack, StackSettings } from "@cardwake/model";
import { clampSettings } from "@cardwake/model";
import { relayFailureOf } from "./relay-gateway";
import type { RelayFailure } from "./relay-gateway";

/**
 * L'avis lisible d'une situation sans enregistrement : le même texte que
 * `CassetteMiss`, relu sur l'erreur elle-même pour ne pas dupliquer la chaîne.
 */
export const NO_RECORDING = new CassetteMiss("").message;

/** L'avis quand le relais n'a pas répondu du tout. */
export const RELAY_UNREACHABLE =
  "the live relay is not reachable from this browser — the demo runs in recorded mode";

/** L'avis quand le relais a atteint son plafond du jour. */
export const RELAY_LIMIT =
  "the live relay reached its daily limit — the demo runs in recorded mode";

/** L'avis quand le relais a refusé la requête. */
export const RELAY_REFUSED =
  "the live relay refused the call — the demo runs in recorded mode";

/** L'avis lisible d'un échec du relais. */
export function noticeOfRelayFailure(failure: RelayFailure | null): string {
  if (failure === "limit") return RELAY_LIMIT;
  if (failure === "refused") return RELAY_REFUSED;
  return RELAY_UNREACHABLE;
}

/** Ce dont le pont a besoin : la passerelle d'une pile et les compteurs du moteur. */
export type AgentBridgeOptions = {
  /** La passerelle principale d'une pile : le relais, ou la cassette. */
  gatewayOf: (stack: Stack) => LlmGateway | null;
  /** La cassette de repli, jouée quand le relais ne répond pas. */
  fallbackOf?: (stack: Stack) => LlmGateway | null;
  /** Le relais était-il attendu pour ce tour ? */
  relayExpected?: (stack: Stack) => boolean;
  /** Le compteur de session du moteur, relu à chaque tour. */
  session: () => SessionBudgetTracker | null;
  /** Le compteur d'action du moteur, relu à chaque tour. */
  action: () => ActionBudgetTracker | null;
};

/** Le pont branché sur le `Dispatcher` : un `onAgentTurn` et ses compteurs. */
export type AgentBridge = {
  /** Le `onAgentTurn` du Dispatcher : rend toujours une réponse lisible. */
  onAgentTurn: (request: AgentTurnRequest, host: ModelHost) => Promise<string>;
  /** Tours partis sans rien produire : le moteur rend leurs sauts. */
  misses: number;
  /** L'avis sur le repli du relais, s'il y en a eu un. */
  notice: string | null;
};

/** Les deux compteurs réels d'un tour, tels que le moteur les porte. */
type EngineTrackers = { session: SessionBudgetTracker; action: ActionBudgetTracker };

/**
 * Compteur de session fantôme : mêmes plafonds et mêmes dépenses que le réel,
 * mais aucune écriture dedans — seul `applyCost` touche au compteur réel.
 */
function shadowSession(real: SessionBudgetTracker, settings: StackSettings): SessionBudgetTracker {
  const shadow = new SessionBudgetTracker(settings);
  const snapshot = real.snapshot();
  for (let turn = 0; turn < snapshot.turnsUsed; turn += 1) shadow.consumeTurn();
  shadow.addInputTokens(snapshot.inputTokensUsed);
  return shadow;
}

/** Compteur d'action fantôme : recadré sur les sauts et tours déjà dépensés. */
function shadowAction(real: ActionBudgetTracker, settings: StackSettings): ActionBudgetTracker {
  const shadow = new ActionBudgetTracker(settings);
  const snapshot = real.snapshot();
  for (let hop = 0; hop < settings.hopBudget - snapshot.hopsLeft; hop += 1) shadow.consumeHop();
  for (let turn = 0; turn < settings.agentTurnsPerAction - snapshot.turnsLeft; turn += 1) {
    shadow.consumeTurn();
  }
  return shadow;
}

/** Reporte sur les compteurs réels le coût d'un tour qui a réellement tourné. */
function applyCost(trackers: EngineTrackers, outcome: TurnOutcome): void {
  for (let call = 0; call < outcome.usage.calls; call += 1) {
    trackers.action.consumeTurn();
    trackers.session.consumeTurn();
  }
  trackers.session.addInputTokens(outcome.usage.inputTokens);
}

/** La réponse à rendre au Dispatcher : celle du modèle, sinon l'avis lisible. */
function replyOf(outcome: TurnOutcome): string {
  if (outcome.reply !== "") return outcome.reply;
  return outcome.refusal ?? NO_RECORDING;
}

/** Un tour joué sur une passerelle donnée, avec les compteurs fantômes. */
async function playOn(
  request: AgentTurnRequest,
  host: ModelHost,
  gateway: LlmGateway,
  trackers: EngineTrackers,
  settings: StackSettings,
): Promise<TurnOutcome> {
  return runAgentTurn(request, {
    stack: host.stack,
    cardId: request.cardId,
    gateway,
    host,
    session: shadowSession(trackers.session, settings),
    action: shadowAction(trackers.action, settings),
    settings,
  } satisfies TurnContext);
}

/**
 * Le relais a échoué : le tour est rejoué sur la cassette, et l'avis lisible
 * dit pourquoi. Le coût du relais perdu n'est pas reporté : rien n'a été
 * produit par ce côté-là.
 */
async function replayOnCassette(
  bridge: AgentBridge,
  request: AgentTurnRequest,
  host: ModelHost,
  fallback: LlmGateway,
  trackers: EngineTrackers,
  settings: StackSettings,
): Promise<string> {
  const outcome = await playOn(request, host, fallback, trackers, settings);
  applyCost(trackers, outcome);
  if (outcome.usage.calls === 0) {
    bridge.misses += 1;
    return outcome.refusal ?? NO_RECORDING;
  }
  return replyOf(outcome);
}

/** Un tour d'agent complet : cassette ou relais, budgets honnêtes, avis lisible. */
async function runTurn(
  bridge: AgentBridge,
  options: AgentBridgeOptions,
  request: AgentTurnRequest,
  host: ModelHost,
): Promise<string> {
  const stack = host.stack;
  const gateway = options.gatewayOf(stack);
  const session = options.session();
  const action = options.action();
  if (gateway === null || session === null || action === null) {
    bridge.misses += 1;
    return NO_RECORDING;
  }
  const expected = options.relayExpected?.(stack) === true;
  const trackers: EngineTrackers = { session, action };
  // Le relais était attendu mais la cassette répond : on le dit quand même.
  if (expected && gateway.mode !== "relay") bridge.notice = noticeOfRelayFailure(null);
  const settings = clampSettings(stack.settings);
  const outcome = await playOn(request, host, gateway, trackers, settings);
  const failure = relayFailureOf(gateway);
  if (failure !== null) {
    const fallback = options.fallbackOf?.(stack) ?? null;
    bridge.notice = noticeOfRelayFailure(failure);
    if (fallback === null) {
      bridge.misses += 1;
      return outcome.refusal ?? NO_RECORDING;
    }
    return replayOnCassette(bridge, request, host, fallback, trackers, settings);
  }
  applyCost(trackers, outcome);
  if (outcome.usage.calls === 0) {
    bridge.misses += 1;
    return outcome.refusal ?? NO_RECORDING;
  }
  return replyOf(outcome);
}

/** Fabrique du pont : le `onAgentTurn` à passer au `Dispatcher`. */
export function createAgentBridge(options: AgentBridgeOptions): AgentBridge {
  const bridge: AgentBridge = {
    misses: 0,
    notice: null,
    onAgentTurn: (request, host) => runTurn(bridge, options, request, host),
  };
  return bridge;
}
