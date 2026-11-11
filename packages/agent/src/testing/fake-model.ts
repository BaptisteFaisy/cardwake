/**
 * Le faux modèle des tests : programmable, déterministe, sans aucun réseau,
 * sans horloge ni tirage aléatoire (CAR-N-09).
 *
 * Deux formes de programmation :
 * - `responses` : une liste jouée dans l'ordre, puis la réponse par défaut ;
 * - `respond` : une fonction qui construit la réponse à partir de la requête.
 *
 * Il sait aussi jouer l'adversaire des propriétés CAR-P-11 et CAR-P-12 : il
 * appelle des outils que son niveau interdit, et vise des cartes qui ne sont
 * pas les siennes. C'est au garde de refuser, pas au modèle de se tenir.
 */

import type { AgentLevel } from "@cardwake/model";
import {
  abortError,
  throwIfAborted,
  type FetchLike,
  type HttpRequestInit,
  type HttpResponseLike,
  type OpenAiToolCall,
} from "../gateway/http";
import { TOOL_LEVEL } from "../types";
import type { LlmBlock, LlmGateway, LlmRequest, LlmResponse, ToolName } from "../types";

/** Usage minimal et constant : les tests ne comptent pas de vrais jetons. */
export const FAKE_USAGE = { inputTokens: 1, outputTokens: 1 };

export type AdversaryConfig = {
  /** Niveau de l'agent attaqué ; sert à choisir un outil interdit. */
  level?: AgentLevel;
  /** Outils tentés même s'ils sont interdits au niveau. */
  forbiddenTools?: readonly ToolName[];
  /** Cartes visées alors qu'elles appartiennent à un autre agent. */
  foreignCards?: readonly string[];
};

export type FakeModelOptions = {
  responses?: readonly LlmResponse[];
  respond?: (request: LlmRequest, callIndex: number) => LlmResponse;
  adversary?: AdversaryConfig;
};

/** Le niveau autorise-t-il cet outil ? (7.5) */
export function isToolAllowed(tool: ToolName, level: AgentLevel): boolean {
  return TOOL_LEVEL[tool] <= level;
}

/** Tous les outils interdits à un niveau, dans l'ordre du contrat. */
export function forbiddenToolsFor(level: AgentLevel): ToolName[] {
  return (Object.keys(TOOL_LEVEL) as ToolName[]).filter((tool) => !isToolAllowed(tool, level));
}

/** Réponse texte simple. */
export function textResponse(text: string, usage = FAKE_USAGE): LlmResponse {
  return { stop: "end", blocks: [{ type: "text", text }], usage };
}

/** Réponse qui appelle un outil. */
export function toolUseResponse(
  name: ToolName,
  input: Record<string, unknown>,
  id = "call-1",
): LlmResponse {
  return {
    stop: "tool_use",
    blocks: [{ type: "tool_use", id, name, input }],
    usage: FAKE_USAGE,
  };
}

/** Requête de test, avec des valeurs par défaut sobres. */
export function makeRequest(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    purpose: "agent-turn",
    speed: "fast",
    system: "You are a card agent. Stay inside your level.",
    messages: [{ role: "user", blocks: [{ type: "text", text: "hello" }] }],
    maxOutputTokens: 200,
    ...overrides,
  };
}

/** Un bloc `tool_use` choisi pour être refusé : outil interdit, carte étrangère. */
export function adversaryToolUse(
  config: AdversaryConfig = {},
  index = 0,
): Extract<LlmBlock, { type: "tool_use" }> {
  const level = config.level ?? 1;
  const forbidden = config.forbiddenTools?.length
    ? config.forbiddenTools
    : forbiddenToolsFor(level);
  const tool = forbidden[index % Math.max(forbidden.length, 1)] ?? "delete_part";
  const cards = config.foreignCards?.length ? config.foreignCards : ["someone-else"];
  return {
    type: "tool_use",
    id: `adversary-${index + 1}`,
    name: tool,
    input: { card: cards[index % cards.length] },
  };
}

/** La réponse d'un adversaire : un appel d'outil interdit par le niveau. */
export function adversaryResponse(config: AdversaryConfig = {}, index = 0): LlmResponse {
  return { stop: "tool_use", blocks: [adversaryToolUse(config, index)], usage: FAKE_USAGE };
}

export class FakeModel implements LlmGateway {
  /** Le faux modèle ne parle à personne : il se présente comme un enregistrement. */
  readonly mode = "cassette" as const;

  /** Toutes les requêtes reçues, dans l'ordre. */
  readonly requests: LlmRequest[] = [];

  private readonly responses: readonly LlmResponse[];
  private readonly respond: ((request: LlmRequest, callIndex: number) => LlmResponse) | undefined;
  private readonly adversary: AdversaryConfig | undefined;

  constructor(options: FakeModelOptions = {}) {
    this.responses = options.responses ?? [];
    this.respond = options.respond;
    this.adversary = options.adversary;
  }

  /** Nombre d'appels reçus. */
  get callCount(): number {
    return this.requests.length;
  }

  /** Remet le compteur à zéro. */
  reset(): void {
    this.requests.length = 0;
  }

  async call(request: LlmRequest, signal: AbortSignal): Promise<LlmResponse> {
    throwIfAborted(signal);
    this.requests.push(request);
    const index = this.requests.length - 1;
    if (this.respond) return this.respond(request, index);
    if (index < this.responses.length) return this.responses[index];
    return this.fallback(index);
  }

  /** Adversaire si configuré, sinon une fin de tour vide et stable. */
  private fallback(index: number): LlmResponse {
    if (this.adversary) return adversaryResponse(this.adversary, index);
    return textResponse("");
  }
}

// --------------------------------------------------------------------------
// Faux fournisseur HTTP : la clé et le relais sont testés sans réseau
// --------------------------------------------------------------------------

/** Un appel enregistré par le faux fournisseur. */
export type RecordedCall = {
  url: string;
  headers: Record<string, string>;
  body: unknown;
};

/** Une réponse préparée : statut, corps JSON ou brut, ou échec réseau. */
export type StubReply = {
  status?: number;
  json?: unknown;
  text?: string;
  /** Simule une panne réseau avec ce message. */
  fail?: string;
};

export type FakeProviderOptions = {
  /** Réponses jouées dans l'ordre ; la dernière est rejouée ensuite. */
  replies?: readonly StubReply[];
  /** Sinon : une fonction qui choisit la réponse à partir de l'appel. */
  reply?: (call: RecordedCall) => StubReply;
};

export type FakeProvider = {
  fetch: FetchLike;
  calls: RecordedCall[];
};

/** Un appel d'outil au format OpenAI. */
export function openAiToolCall(
  name: ToolName | string,
  input: Record<string, unknown>,
  id = "call-1",
): OpenAiToolCall {
  return { id, type: "function", function: { name, arguments: JSON.stringify(input) } };
}

/** Un corps de réponse OpenAI-compatible minimal et stable. */
export function openAiReply(options: {
  text?: string;
  finishReason?: string;
  toolCalls?: readonly OpenAiToolCall[];
  promptTokens?: number;
  completionTokens?: number;
} = {}): Record<string, unknown> {
  const message: Record<string, unknown> = {
    role: "assistant",
    content: options.text ?? "",
  };
  if (options.toolCalls) message.tool_calls = [...options.toolCalls];
  return {
    choices: [
      {
        finish_reason: options.finishReason ?? (options.toolCalls ? "tool_calls" : "stop"),
        message,
      },
    ],
    usage: {
      prompt_tokens: options.promptTokens ?? 10,
      completion_tokens: options.completionTokens ?? 5,
    },
  };
}

/** Choisit la réponse préparée pour le n-ième appel. */
function pickReply(
  options: FakeProviderOptions,
  call: RecordedCall,
  index: number,
): StubReply | undefined {
  if (options.reply) return options.reply(call);
  const replies = options.replies ?? [];
  if (replies.length === 0) return undefined;
  return replies[Math.min(index, replies.length - 1)];
}

/** Rend la réponse HTTP simulée. */
function stubResponse(reply: StubReply | undefined): HttpResponseLike {
  const text = reply?.text ?? JSON.stringify(reply?.json ?? openAiReply());
  const status = reply?.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    async text(): Promise<string> {
      return text;
    },
  };
}

/**
 * Un fournisseur imaginaire : il note chaque appel et rend des réponses
 * préparées. Aucune connexion n'est ouverte (CAR-N-09).
 */
export function fakeProvider(options: FakeProviderOptions = {}): FakeProvider {
  const calls: RecordedCall[] = [];
  const fetchImpl: FetchLike = async (url: string, init: HttpRequestInit) => {
    if (init.signal?.aborted) throw abortError();
    const call: RecordedCall = {
      url,
      headers: { ...init.headers },
      body: JSON.parse(init.body),
    };
    calls.push(call);
    const reply = pickReply(options, call, calls.length - 1);
    if (reply?.fail) throw new Error(reply.fail);
    return stubResponse(reply);
  };
  return { fetch: fetchImpl, calls };
}
