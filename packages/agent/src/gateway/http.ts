/**
 * Traduction `LlmRequest` ↔ corps/réponse OpenAI-compatible, et l'appel HTTP
 * lui-même (7.11). C'est **la seule** traduction du paquet : la clé
 * personnelle et le relais passent tous les deux par ici, sans duplication.
 *
 * Trois règles :
 * - `fetch` est injectable : les tests n'ouvrent jamais de connexion réelle
 *   (CAR-N-09) ;
 * - `AbortSignal` est transmis au transport ;
 * - aucune erreur, aucun journal ne contient la clé : les textes de
 *   fournisseur sont nettoyés avant d'être cités.
 */

import { resolveModel } from "./canon";
import type { LlmBlock, LlmMessage, LlmRequest, LlmResponse, LlmSpeed, LlmStop } from "../types";

// --------------------------------------------------------------------------
// Transport injectable
// --------------------------------------------------------------------------

export type HttpResponseLike = {
  ok: boolean;
  status: number;
  statusText?: string;
  text(): Promise<string>;
};

export type HttpRequestInit = {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
};

/** Un `fetch` minimal ; le `fetch` natif est compatible. */
export type FetchLike = (url: string, init: HttpRequestInit) => Promise<HttpResponseLike>;

// --------------------------------------------------------------------------
// Erreurs : lisibles, jamais secrètes
// --------------------------------------------------------------------------

/** Requête annulée : même forme que celle du `fetch` natif. */
export function abortError(reason = "The call was cancelled."): Error {
  const error = new Error(reason);
  error.name = "AbortError";
  return error;
}

/** Lève une erreur d'annulation si le signal est déjà coupé. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Erreur d'un fournisseur ou du relais : statut, cause courte, piste. */
export class GatewayError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
  }
}

/** Remplace chaque occurrence d'un secret par des astérisques. */
export function scrub(text: string, secrets: readonly (string | undefined)[]): string {
  let out = text;
  for (const secret of secrets) {
    if (!secret) continue;
    out = out.split(secret).join("***");
  }
  return out;
}

/** Extrait court et nettoyé d'un corps d'erreur, sans secret. */
export function errorExcerpt(
  body: string,
  secrets: readonly (string | undefined)[],
  limit = 200,
): string {
  const clean = scrub(body, secrets).replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
}

/** Piste lisible selon le statut du fournisseur. */
function hintForStatus(status: number): string {
  if (status === 401 || status === 403) return "Check the API key: the provider refused it.";
  if (status === 429) return "The provider rate limit was reached; try again later.";
  if (status === 400) return "The request was rejected; check the model name and the tool schemas.";
  if (status >= 500) return "The provider is unavailable; try again later.";
  return "Try again later.";
}

// --------------------------------------------------------------------------
// Corps de requête OpenAI-compatible
// --------------------------------------------------------------------------

export type OpenAiContentPart = { type: "text"; text: string };

export type OpenAiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type OpenAiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | OpenAiContentPart[] | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
};

export type OpenAiBody = {
  model: string;
  messages: OpenAiMessage[];
  max_tokens: number;
  tools?: {
    type: "function";
    function: { name: string; description: string; parameters: unknown };
  }[];
  response_format?: {
    type: "json_schema";
    json_schema: { name: string; strict: boolean; schema: unknown };
  };
};

/** Le modèle choisi par vitesse, éventuellement forcé par un réglage. */
export type ModelChoice = Partial<Record<LlmSpeed, string>>;

/** Un message d'assistant : texte et appels d'outils. */
function assistantMessage(blocks: readonly LlmBlock[]): OpenAiMessage {
  const texts: string[] = [];
  const toolCalls: OpenAiToolCall[] = [];
  for (const block of blocks) {
    if (block.type === "text") texts.push(block.text);
    else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: { name: block.name, arguments: JSON.stringify(block.input) },
      });
    }
  }
  const message: OpenAiMessage = {
    role: "assistant",
    content: texts.length > 0 ? texts.join("\n") : null,
  };
  if (toolCalls.length > 0) message.tool_calls = toolCalls;
  return message;
}

/**
 * Un message utilisateur : les textes deviennent des parties, les résultats
 * d'outils deviennent des messages `tool` séparés (format OpenAI).
 */
function userMessages(blocks: readonly LlmBlock[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [];
  const texts: OpenAiContentPart[] = [];
  const flush = (): void => {
    if (texts.length === 0) return;
    out.push({ role: "user", content: [...texts] });
    texts.length = 0;
  };
  for (const block of blocks) {
    if (block.type === "text") {
      texts.push({ type: "text", text: block.text });
    } else if (block.type === "tool_result") {
      flush();
      const prefix = block.isError === true ? "Error: " : "";
      out.push({ role: "tool", tool_call_id: block.toolUseId, content: `${prefix}${block.content}` });
    }
  }
  flush();
  return out;
}

/** Les messages du projet vers ceux d'OpenAI. */
export function toOpenAiMessages(messages: readonly LlmMessage[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [];
  for (const message of messages) {
    if (message.role === "assistant") out.push(assistantMessage(message.blocks));
    else out.push(...userMessages(message.blocks));
  }
  return out;
}

export type ToBodyOptions = {
  model?: string;
  /** Plafond appliqué au relais ; sinon celui de la requête. */
  maxTokens?: number;
};

/** Le corps complet d'un appel, modèle résolu depuis la vitesse. */
export function toOpenAiBody(request: LlmRequest, options: ToBodyOptions = {}): OpenAiBody {
  const body: OpenAiBody = {
    model: options.model ?? resolveModel(request),
    messages: [{ role: "system", content: request.system }, ...toOpenAiMessages(request.messages)],
    max_tokens: options.maxTokens ?? request.maxOutputTokens,
  };
  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map((tool) => ({
      type: "function" as const,
      function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
    }));
  }
  if (request.outputSchema !== undefined) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: `${request.purpose}-output`,
        strict: true,
        schema: request.outputSchema,
      },
    };
  }
  return body;
}

// --------------------------------------------------------------------------
// Réponse OpenAI-compatible → réponse du projet
// --------------------------------------------------------------------------

/** Table de correspondance des raisons d'arrêt (OpenAI et Anthropic). */
const STOP_BY_REASON: Record<string, LlmStop> = {
  stop: "end",
  end_turn: "end",
  tool_calls: "tool_use",
  tool_use: "tool_use",
  length: "max_tokens",
  max_tokens: "max_tokens",
  content_filter: "refusal",
  refusal: "refusal",
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function firstChoice(root: Record<string, unknown>): Record<string, unknown> {
  const choices = Array.isArray(root.choices) ? root.choices : [];
  return asRecord(choices[0]);
}

/** Raison d'arrêt lue en premier : `refusal` se traite avant le contenu. */
function readStop(
  choice: Record<string, unknown>,
  root: Record<string, unknown>,
): LlmStop {
  const raw =
    typeof choice.finish_reason === "string"
      ? choice.finish_reason
      : typeof root.stop_reason === "string"
        ? root.stop_reason
        : "";
  return STOP_BY_REASON[raw] ?? "end";
}

/** Les parties texte d'un contenu (chaîne ou liste de parties). */
function contentTexts(content: unknown): string[] {
  if (typeof content === "string") return content.length > 0 ? [content] : [];
  if (!Array.isArray(content)) return [];
  const texts: string[] = [];
  for (const part of content) {
    const record = asRecord(part);
    if (record.type === "text" && typeof record.text === "string") texts.push(record.text);
  }
  return texts;
}

/** Les arguments d'un appel d'outil : un JSON objet, sinon une erreur lisible. */
function parseArguments(raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw === "object") return asRecord(raw);
  if (typeof raw !== "string" || raw.length === 0) return {};
  try {
    return asRecord(JSON.parse(raw));
  } catch {
    throw new GatewayError(
      "The model returned tool arguments that are not JSON; ask it to call the tool again.",
    );
  }
}

/** Les appels d'outils du fournisseur en blocs `tool_use`. */
function readToolCalls(raw: unknown): LlmBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: LlmBlock[] = [];
  for (const item of raw) {
    const record = asRecord(item);
    const fn = asRecord(record.function);
    const name = typeof fn.name === "string" ? fn.name : "";
    if (name.length === 0) continue;
    out.push({
      type: "tool_use",
      id: typeof record.id === "string" ? record.id : "",
      name,
      input: parseArguments(fn.arguments),
    });
  }
  return out;
}

function readUsage(root: Record<string, unknown>): {
  inputTokens: number;
  outputTokens: number;
} {
  const usage = asRecord(root.usage);
  const pick = (...values: unknown[]): number => {
    for (const value of values) {
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return 0;
  };
  return {
    inputTokens: pick(usage.prompt_tokens, usage.input_tokens),
    outputTokens: pick(usage.completion_tokens, usage.output_tokens),
  };
}

/** Réponse du fournisseur → `LlmResponse`. */
export function fromOpenAiResponse(json: unknown): LlmResponse {
  const root = asRecord(json);
  const choice = firstChoice(root);
  const stop = readStop(choice, root);
  const usage = readUsage(root);
  if (stop === "refusal") return { stop, blocks: [], usage };
  const message = asRecord(choice.message);
  const blocks: LlmBlock[] = [
    ...contentTexts(message.content).map((text) => ({ type: "text" as const, text })),
    ...readToolCalls(message.tool_calls),
  ];
  return { stop, blocks, usage };
}

// --------------------------------------------------------------------------
// L'appel HTTP
// --------------------------------------------------------------------------

export type OpenAiCallOptions = {
  url: string;
  body: OpenAiBody;
  apiKey?: string;
  headers?: Record<string, string>;
  signal: AbortSignal;
  fetchImpl?: FetchLike;
};

/** Un seul chemin HTTP pour la clé personnelle et pour le relais. */
export async function callOpenAiCompatible(
  options: OpenAiCallOptions,
): Promise<LlmResponse> {
  throwIfAborted(options.signal);
  const secrets = [options.apiKey];
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...options.headers,
  };
  if (options.apiKey) headers.authorization = `Bearer ${options.apiKey}`;
  const doFetch: FetchLike = options.fetchImpl ?? globalThis.fetch;
  let raw: HttpResponseLike;
  try {
    raw = await doFetch(options.url, {
      method: "POST",
      headers,
      body: JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new GatewayError(
      `The model provider could not be reached (${scrub(messageOf(error), secrets)}). ` +
        "Check the network or the relay address.",
    );
  }
  const text = await raw.text();
  if (!raw.ok) {
    throw new GatewayError(
      `The model provider refused the call (status ${raw.status}): ` +
        `${errorExcerpt(text, secrets)} ${hintForStatus(raw.status)}`,
      raw.status,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new GatewayError(
      `The model provider returned something that is not JSON: ${errorExcerpt(text, secrets)}`,
      raw.status,
    );
  }
  return fromOpenAiResponse(json);
}
