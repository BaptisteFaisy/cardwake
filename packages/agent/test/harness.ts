/**
 * Harnais commun des tests de la boucle : un VRAI `ModelHost` sur la pile de
 * référence, un vrai journal, les deux suiveurs de budget, et le contexte d'un
 * tour. Aucun réseau, aucune horloge réelle, aucun tirage aléatoire (CAR-N-09).
 */

import type { Determinism, Guards } from "@cardwake/lang";
import type { AgentLevel, MessageTarget, Stack, StackSettings } from "@cardwake/model";
import { APP_LIMITS, Journal, ModelHost } from "@cardwake/model";
import type { AgentTurnRequest } from "@cardwake/model";
import { ActionBudgetTracker, SessionBudgetTracker } from "../src/budget";
import type { TurnContext } from "../src/loop";
import type { LlmBlock, LlmGateway } from "../src/types";
import type { FakeModel } from "../src/testing/fake-model";
import { kitchenStack } from "./fixtures";

const GUARDS: Guards = {
  maxSteps: APP_LIMITS.maxSteps,
  maxMessageDepth: 50,
  maxWaitMs: APP_LIMITS.maxWaitMs,
  maxTextChars: APP_LIMITS.maxFieldChars,
};

const DETERMINISM: Determinism = {
  seed: 7,
  random: () => 0.5,
  now: () => ({ date: "11/12/26", time: "00:30", longDate: "Thursday, November 12, 2026", epochMs: 0 }),
};

/** Un message envoyé par l'agent via l'hôte, capté pour vérification. */
export type SentMessage = { name: string; args: string[]; target: MessageTarget };

export type Harness = {
  ctx: TurnContext;
  host: ModelHost;
  journal: Journal;
  sent: SentMessage[];
  stack: Stack;
};

export type HarnessOptions = {
  stack?: Stack;
  cardId?: number;
  level?: AgentLevel;
  settings?: StackSettings;
  signal?: AbortSignal;
};

/** La pile de référence avec l'agent de « Cook » au niveau demandé. */
export function stackAtLevel(level: AgentLevel): Stack {
  const stack = kitchenStack();
  const cook = stack.cards.find((card) => card.id === 1);
  if (cook?.agent) cook.agent = { ...cook.agent, level };
  return stack;
}

/** Construit l'hôte, le journal et le contexte d'un tour pour un faux modèle. */
export function harness(gateway: LlmGateway, options: HarnessOptions = {}): Harness {
  const stack = options.stack ?? stackAtLevel((options.level ?? 3) as AgentLevel);
  const cardId = options.cardId ?? 1;
  const level = options.level ?? stack.cards.find((card) => card.id === cardId)?.agent?.level ?? 1;
  const settings = options.settings ?? stack.settings;
  const sent: SentMessage[] = [];
  const journal = new Journal();
  journal.begin({ kind: "agent", cardId, level }, "agent turn (test)", DETERMINISM.seed);
  const host = new ModelHost({
    stack,
    journal,
    actor: { kind: "agent", cardId, level },
    cardId,
    guards: GUARDS,
    determinism: DETERMINISM,
    settings,
    txId: 1,
    onMessage: (name, args, target) => sent.push({ name, args, target }),
  });
  const ctx: TurnContext = {
    stack,
    cardId,
    gateway,
    host,
    session: new SessionBudgetTracker(settings),
    action: new ActionBudgetTracker(settings),
    settings,
  };
  if (options.signal) ctx.signal = options.signal;
  return { ctx, host, journal, sent, stack };
}

/** La demande de réveil la plus simple : l'humain parle à la carte 1. */
export function turnRequest(overrides: Partial<AgentTurnRequest> = {}): AgentTurnRequest {
  return { cardId: 1, text: "Hello?", sender: "you", hops: 3, ...overrides };
}

type ToolResult = Extract<LlmBlock, { type: "tool_result" }>;

/** Tous les `tool_result` déjà renvoyés au modèle, dédoublonnés par identifiant. */
export function toolResultsOf(model: FakeModel): ToolResult[] {
  const seen = new Map<string, ToolResult>();
  for (const request of model.requests) {
    for (const message of request.messages) {
      for (const block of message.blocks) {
        if (block.type === "tool_result") seen.set(block.toolUseId, block);
      }
    }
  }
  return [...seen.values()];
}
