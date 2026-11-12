/**
 * La boucle d'un tour d'agent (cahier des charges 7.5, 7.6).
 *
 * Un tour : le contexte est construit (les quatre blocs et rien d'autre), la
 * passerelle est appelée avec **seulement** les outils du niveau effectif
 * (`toolsForLevel`), et chaque appel d'outil est re-vérifié puis exécuté via
 * l'hôte — donc via `authorize` — jusqu'à ce que le modèle finisse, qu'un
 * budget s'épuise ou qu'un plafond soit atteint (`loop-tools`).
 *
 * Aucune exception ne sort de `runAgentTurn` : erreur de passerelle, délai
 * dépassé, cassette manquante, budget épuisé ou plafond d'itérations
 * deviennent un résultat lisible (`refusal`, en anglais), jamais une panne.
 */

import type { AgentTurnRequest, ModelHost, Stack, StackSettings, TokenUsage } from "@cardwake/model";
import type { ActionBudgetTracker, SessionBudgetTracker } from "./budget";
import { toolsForLevel } from "./tools";
import { CassetteMiss } from "./types";
import type {
  AgentContext,
  BudgetVerdict,
  LlmBlock,
  LlmGateway,
  LlmMessage,
  LlmRequest,
  LlmResponse,
  LlmSpeed,
  LlmStop,
  ToolSchema,
} from "./types";
import { currentLevel, runToolCalls } from "./loop-tools";
import { buildAgentContext } from "./view";

// --------------------------------------------------------------------------
// Contrat public
// --------------------------------------------------------------------------

export type TurnContext = {
  stack: Stack;
  cardId: number;
  gateway: LlmGateway;
  host: ModelHost;
  session: SessionBudgetTracker;
  action: ActionBudgetTracker;
  settings: StackSettings;
  signal?: AbortSignal;
};

export type TurnOutcome = {
  reply: string;
  /** Motif d'arrêt du modèle ; « end » quand la boucle s'arrête sans lui. */
  stop: LlmStop;
  iterations: number;
  usage: TokenUsage;
  /** Pourquoi le tour s'est arrêté tôt, en anglais ; absent s'il est fini. */
  refusal?: string;
  /** Proposition de script en attente d'acceptation humaine (CAR-P-17). */
  proposal?: { object: string; script: string; explanation: string };
};

/** État du tour en cours : ce que les appels successifs produisent. */
type TurnState = {
  reply: string;
  proposal?: { object: string; script: string; explanation: string };
  refusal?: string;
  stop: LlmStop;
  usage: TokenUsage;
  iterations: number;
  finished: boolean;
};

// --------------------------------------------------------------------------
// Budgets (7.6, CAR-P-15) : vérifiés avant CHAQUE appel, jamais d'exception
// --------------------------------------------------------------------------

type BudgetReason = Exclude<BudgetVerdict, { ok: true }>["reason"];

const BUDGET_MESSAGES: Record<BudgetReason, string> = {
  "turns-session": "Session budget exhausted: the agents have no turn left in this session.",
  "tokens-session": "Session budget exhausted: no input token left in this session.",
  hops: "Hop budget exhausted: the cards cannot wake each other anymore.",
  "turns-action": "Action budget exhausted: no agent turn left for this action.",
  queue: "The agent queue is full: this turn was dropped.",
};

/** Vérifie les deux budgets puis consomme un tour de chacun ; rend la raison. */
function takeBudgets(ctx: TurnContext): string | undefined {
  const session = ctx.session.verdict();
  if (!session.ok) return BUDGET_MESSAGES[session.reason];
  const action = ctx.action.verdict();
  if (!action.ok) return BUDGET_MESSAGES[action.reason];
  ctx.session.consumeTurn();
  ctx.action.consumeTurn();
  return undefined;
}

// --------------------------------------------------------------------------
// La requête : les quatre blocs, et rien d'autre (7.5, CAR-P-16)
// --------------------------------------------------------------------------

/** Bloc système : les règles fixes, puis les trois consignes héritées. */
function systemOf(context: AgentContext): string {
  return [
    context.rules,
    "",
    `Persona of the stack: ${context.personas.stack}`,
    `Persona of the background: ${context.personas.background}`,
    `Persona of your card: ${context.personas.card}`,
  ].join("\n");
}

/** Premier bloc utilisateur : la vue de la carte et le message reçu. */
function firstMessage(context: AgentContext): LlmMessage {
  const text =
    `Your card, and all you can see:\n${JSON.stringify(context.view)}\n\n` +
    `Message received from ${context.message.sender} ` +
    `(${context.message.hops} hops left in this action):\n${context.message.text}`;
  return { role: "user", blocks: [{ type: "text", text }] };
}

/** Ce qui est calculé une fois pour tout le tour. */
type TurnSetup = {
  system: string;
  speed: LlmSpeed;
  tools: ToolSchema[];
  messages: LlmMessage[];
  maxOutputTokens: number;
  signal: AbortSignal;
  /** Signal du délai seul : distingue un délai dépassé d'une annulation. */
  timedOut: AbortSignal;
};

function prepareTurn(request: AgentTurnRequest, ctx: TurnContext): TurnSetup {
  const context = buildAgentContext(
    ctx.stack,
    ctx.cardId,
    { text: request.text, sender: request.sender, hops: request.hops },
    ctx.settings,
  );
  const card = ctx.stack.cards.find((item) => item.id === ctx.cardId);
  const timedOut = AbortSignal.timeout(Math.max(1, Math.trunc(ctx.settings.agentTimeoutMs)));
  return {
    system: systemOf(context),
    speed: card?.agent?.speed ?? "fast",
    tools: toolsForLevel(currentLevel(ctx)),
    messages: [firstMessage(context)],
    maxOutputTokens: ctx.settings.agentMaxOutputTokens,
    signal: ctx.signal ? AbortSignal.any([ctx.signal, timedOut]) : timedOut,
    timedOut,
  };
}

/** Une requête neuve par appel : l'historique reçu est une copie figée. */
function requestOf(setup: TurnSetup): LlmRequest {
  return {
    purpose: "agent-turn",
    speed: setup.speed,
    system: setup.system,
    messages: [...setup.messages],
    tools: setup.tools,
    maxOutputTokens: setup.maxOutputTokens,
  };
}

// --------------------------------------------------------------------------
// La boucle
// --------------------------------------------------------------------------

/** Raison lisible d'un appel manqué : cassette, délai, annulation, accident. */
function failureOf(error: unknown, setup: TurnSetup, ctx: TurnContext): string {
  if (error instanceof CassetteMiss) return error.message;
  if (setup.timedOut.aborted) {
    return "The turn ran out of time: the model did not answer within the delay.";
  }
  if (ctx.signal?.aborted) return "The turn was aborted before the model answered.";
  const message = error instanceof Error ? error.message : "unknown error";
  return `The model call failed: ${message}`;
}

/** Note ce qu'une réponse a coûté : un appel, ses jetons, son motif d'arrêt. */
function absorb(state: TurnState, response: LlmResponse, ctx: TurnContext): void {
  state.iterations += 1;
  state.stop = response.stop;
  state.usage.calls += 1;
  state.usage.inputTokens += Math.max(0, response.usage.inputTokens);
  state.usage.outputTokens += Math.max(0, response.usage.outputTokens);
  ctx.session.addInputTokens(response.usage.inputTokens);
}

function textOf(response: LlmResponse): string {
  return response.blocks
    .filter((block): block is Extract<LlmBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/** `tool_use` continue le tour ; les autres motifs le terminent en disant pourquoi. */
function handleStop(
  response: LlmResponse,
  setup: TurnSetup,
  ctx: TurnContext,
  state: TurnState,
): void {
  if (response.stop === "tool_use") {
    setup.messages.push({ role: "assistant", blocks: [...response.blocks] });
    setup.messages.push({ role: "user", blocks: runToolCalls(response.blocks, ctx, state) });
    return;
  }
  state.finished = true;
  if (state.reply === "") state.reply = textOf(response);
  if (response.stop === "max_tokens") {
    state.refusal = "The model ran out of output tokens before finishing the turn.";
  }
  if (response.stop === "refusal") {
    state.refusal = textOf(response) === "" ? "The model refused to answer." : textOf(response);
  }
}

/** Une itération : budgets, un appel de passerelle, puis le motif d'arrêt. */
async function runIteration(ctx: TurnContext, setup: TurnSetup, state: TurnState): Promise<void> {
  const blocked = takeBudgets(ctx);
  if (blocked !== undefined) {
    state.refusal = blocked;
    state.finished = true;
    return;
  }
  let response: LlmResponse;
  try {
    response = await ctx.gateway.call(requestOf(setup), setup.signal);
  } catch (error) {
    state.refusal = failureOf(error, setup, ctx);
    state.finished = true;
    return;
  }
  absorb(state, response, ctx);
  handleStop(response, setup, ctx, state);
}

function outcomeOf(state: TurnState): TurnOutcome {
  const outcome: TurnOutcome = {
    reply: state.reply,
    stop: state.stop,
    iterations: state.iterations,
    usage: state.usage,
  };
  if (state.refusal !== undefined) outcome.refusal = state.refusal;
  if (state.proposal !== undefined) outcome.proposal = state.proposal;
  return outcome;
}

/**
 * Un tour d'agent complet : au plus `agentMaxIterations` appels, au plus
 * `agentMaxOutputTokens` jetons de sortie par appel. Rend toujours un
 * résultat ; `refusal` dit pourquoi le tour s'est arrêté tôt, le cas échéant.
 */
export async function runAgentTurn(
  request: AgentTurnRequest,
  ctx: TurnContext,
): Promise<TurnOutcome> {
  const setup = prepareTurn(request, ctx);
  const state: TurnState = {
    reply: "",
    stop: "end",
    usage: { inputTokens: 0, outputTokens: 0, calls: 0 },
    iterations: 0,
    finished: false,
  };
  const limit = Math.max(1, Math.trunc(ctx.settings.agentMaxIterations));
  while (!state.finished && state.iterations < limit) {
    await runIteration(ctx, setup, state);
  }
  if (!state.finished) {
    state.refusal = `The turn reached the iteration limit (${limit} model calls) without finishing.`;
  }
  return outcomeOf(state);
}
