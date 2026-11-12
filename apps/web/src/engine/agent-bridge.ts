/**
 * Le pont entre le `Dispatcher` et un vrai tour d'agent (7.5), en mode
 * enregistré : la passerelle est la cassette de la pile courante, jamais le
 * réseau. Le tour passe par `runAgentTurn`, avec l'hôte fourni par le
 * Dispatcher, les compteurs de budget du moteur et les réglages de la pile.
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
 * Aucun `fetch`, aucune clé : la passerelle est toujours une cassette.
 */

import { ActionBudgetTracker, CassetteMiss, SessionBudgetTracker, runAgentTurn } from "@cardwake/agent";
import type { LlmGateway, TurnContext, TurnOutcome } from "@cardwake/agent";
import type { AgentTurnRequest, ModelHost, Stack, StackSettings } from "@cardwake/model";
import { clampSettings } from "@cardwake/model";

/**
 * L'avis lisible d'une situation sans enregistrement : le même texte que
 * `CassetteMiss`, relu sur l'erreur elle-même pour ne pas dupliquer la chaîne.
 */
export const NO_RECORDING = new CassetteMiss("").message;

/** Ce dont le pont a besoin : la passerelle d'une pile et les compteurs du moteur. */
export type AgentBridgeOptions = {
  /** La passerelle d'une pile : la cassette de la démo, ou `null` (pas de tour). */
  gatewayOf: (stack: Stack) => LlmGateway | null;
  /** Le compteur de session du moteur, relu à chaque tour. */
  session: () => SessionBudgetTracker | null;
  /** Le compteur d'action du moteur, relu à chaque tour. */
  action: () => ActionBudgetTracker | null;
};

/** Le pont branché sur le `Dispatcher` : un `onAgentTurn` et son nombre d'échecs. */
export type AgentBridge = {
  /** Le `onAgentTurn` du Dispatcher : rend toujours une réponse lisible. */
  onAgentTurn: (request: AgentTurnRequest, host: ModelHost) => Promise<string>;
  /** Tours partis sans rien produire : le moteur rend leurs sauts. */
  misses: number;
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

/** Un tour d'agent complet : cassette de la pile, budgets honnêtes, avis lisible. */
async function runTurn(
  bridge: AgentBridge,
  options: AgentBridgeOptions,
  request: AgentTurnRequest,
  host: ModelHost,
): Promise<string> {
  const gateway = options.gatewayOf(host.stack);
  const session = options.session();
  const action = options.action();
  if (gateway === null || session === null || action === null) {
    bridge.misses += 1;
    return NO_RECORDING;
  }
  const settings = clampSettings(host.stack.settings);
  const outcome = await runAgentTurn(request, {
    stack: host.stack,
    cardId: request.cardId,
    gateway,
    host,
    session: shadowSession(session, settings),
    action: shadowAction(action, settings),
    settings,
  } satisfies TurnContext);
  applyCost({ session, action }, outcome);
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
    onAgentTurn: (request, host) => runTurn(bridge, options, request, host),
  };
  return bridge;
}
