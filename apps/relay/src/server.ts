/**
 * Le relais local (7.11, 11.6) : un petit serveur HTTP qui détient la clé du
 * modèle et la relaie vers le fournisseur, sous des plafonds.
 *
 * La clé ne quitte pas cette machine : elle part dans l'en-tête `Authorization`
 * de l'appel au fournisseur, et n'apparaît ni dans une réponse, ni dans un
 * journal, ni dans un export. Aucun contenu de requête ou de réponse n'est
 * journalisé : le journal ne porte que des métadonnées (heure, modèle, statut,
 * durée, jetons). Aucune dépendance : seulement `node:http`.
 */

import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Budget, FetchLike, RelayLimits } from "./garde-fous.js";

/**
 * Node exige l'extension « .ts » dans un import, et le vérificateur de types
 * du dépôt refuse cette extension. D'où l'import dynamique résolu à
 * l'exécution, dont le type est repris du module lui-même.
 */
const gardeFousUrl = new URL("./garde-fous.ts", import.meta.url).href;
const gardeFous = (await import(gardeFousUrl)) as typeof import("./garde-fous.js");

/** Les valeurs par défaut, reprises des garde-fous : une seule source. */
export const RELAY_LIMITS = gardeFous.RELAY_LIMITS;
export const ALLOWED_MODELS = gardeFous.ALLOWED_MODELS;
export const DEFAULT_ALLOWED_ORIGINS = gardeFous.DEFAULT_ALLOWED_ORIGINS;

// --------------------------------------------------------------------------
// Contrats
// --------------------------------------------------------------------------

/** Ce que le relais peut servir, et comment. */
export type RelayServerOptions = {
  /** La clé du fournisseur ; vide si le relais n'a pas de clé. */
  apiKey?: string;
  /** La racine de l'API du fournisseur, sans `/chat/completions`. */
  upstreamBaseUrl?: string;
  /** L'adresse du relais, telle que le site la voit. */
  publicBaseUrl?: string;
  /** La liste fermée des modèles servis. */
  allowedModels?: readonly string[];
  /** Le modèle annoncé par `/health`. */
  defaultModel?: string;
  /** Les plafonds, en partie. */
  limits?: Partial<RelayLimits>;
  /** Les origines autorisées à appeler le relais. */
  allowedOrigins?: readonly string[];
  /** Le `fetch` vers le fournisseur : injectable, pour les tests. */
  fetchImpl?: FetchLike;
  /** L'horloge : injectable, pour les tests. */
  now?: () => number;
  /** Le journal : injectable, pour les tests. */
  log?: (line: string) => void;
};

/** Ce dont les handlers ont besoin, réuni en un seul objet. */
type RelayContext = Budget & {
  apiKey: string;
  upstreamBaseUrl: string;
  publicBaseUrl: string;
  allowedModels: readonly string[];
  defaultModel: string;
  allowedOrigins: readonly string[];
  doFetch: FetchLike;
  log: (line: string) => void;
};

// --------------------------------------------------------------------------
// Petits outils
// --------------------------------------------------------------------------

/** La valeur d'un en-tête, réduite à une chaîne. */
function headerValue(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name];
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === "string" ? raw : undefined;
}

/** L'identifiant de session : l'en-tête du client, sinon une session commune. */
function sessionIdOf(req: IncomingMessage): string {
  const raw = (headerValue(req, "x-cardwake-session") ?? "").trim();
  return raw.length === 0 ? "anonymous" : raw.slice(0, 128);
}

/** Retire la clé d'un texte, sans rien changer d'autre. */
export function removeSecret(text: string, secret: string): string {
  return secret.length > 0 ? text.split(secret).join("***") : text;
}

/** Enlève la clé d'un texte, puis le raccourcit : une erreur ne fuit pas. */
export function scrub(text: string, secret: string, limit = 300): string {
  const flat = removeSecret(text, secret).replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

/** Envoie une réponse JSON, avec les en-têtes CORS. */
function sendJson(
  res: ServerResponse,
  status: number,
  payload: Record<string, unknown>,
  cors: Record<string, string>,
): void {
  res.writeHead(status, { ...cors, "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

/** Les en-têtes CORS : seulement pour une origine autorisée. */
function corsHeaders(origin: string | undefined, allowed: readonly string[]): Record<string, string> {
  const headers: Record<string, string> = { vary: "Origin" };
  if (origin !== undefined && allowed.includes(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = "GET,POST,OPTIONS";
    headers["access-control-allow-headers"] = "content-type,x-cardwake-session";
  }
  return headers;
}

/** Les jetons d'une réponse de fournisseur, s'il y en a. */
function usageOf(text: string): { input: number; output: number } | undefined {
  const read = (value: unknown): number => (typeof value === "number" ? value : 0);
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const usage = (parsed as Record<string, unknown>).usage;
    if (typeof usage !== "object" || usage === null) return undefined;
    const record = usage as Record<string, unknown>;
    const input = record.prompt_tokens ?? record.input_tokens;
    const output = record.completion_tokens ?? record.output_tokens;
    if (typeof input !== "number" && typeof output !== "number") return undefined;
    return { input: read(input), output: read(output) };
  } catch {
    return undefined;
  }
}

// --------------------------------------------------------------------------
// Corps de requête
// --------------------------------------------------------------------------

type BodyResult = { ok: true; text: string } | { ok: false; reason: "too-long" | "unreadable" };

/** Lit le corps de la requête, en refusant les corps trop longs. */
function readBody(req: IncomingMessage, maxChars: number): Promise<BodyResult> {
  return new Promise((resolve) => {
    let kept = "";
    let length = 0;
    let settled = false;
    const finish = (result: BodyResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      length += chunk.length;
      if (length > maxChars) {
        finish({ ok: false, reason: "too-long" });
        return;
      }
      kept += chunk;
    });
    req.on("end", () => finish({ ok: true, text: kept }));
    req.on("error", () => finish({ ok: false, reason: "unreadable" }));
  });
}

/** Le corps JSON de la requête, ou rien s'il n'est pas valide. */
function parseBody(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// Réponses fixes
// --------------------------------------------------------------------------

/** `/health` : l'état du relais, sans aucun secret. */
function healthPayload(ctx: RelayContext): Record<string, unknown> {
  return { ok: ctx.apiKey.length > 0, model: ctx.defaultModel, remainingToday: gardeFous.remainingToday(ctx) };
}

/** `/config` : ce que le site lit pour savoir qu'il peut parler en direct. */
function configPayload(ctx: RelayContext): Record<string, unknown> {
  return {
    baseUrl: ctx.publicBaseUrl,
    mode: "relay",
    models: [...ctx.allowedModels],
    dailyLimit: ctx.limits.dailyRequests,
  };
}

// --------------------------------------------------------------------------
// Handler du chat
// --------------------------------------------------------------------------

/** Relaye une requête vers le fournisseur, puis rend sa réponse. */
async function forward(
  ctx: RelayContext,
  res: ServerResponse,
  cors: Record<string, string>,
  body: string,
  model: string,
  started: number,
): Promise<void> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ctx.apiKey.length > 0) headers.authorization = `Bearer ${ctx.apiKey}`;
  let upstream: { ok: boolean; status: number; text(): Promise<string> };
  try {
    upstream = await ctx.doFetch(`${ctx.upstreamBaseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(gardeFous.UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    logMeta(ctx, { model, status: 502, durationMs: ctx.now() - started });
    sendJson(res, 502, { error: "the provider could not be reached" }, cors);
    return;
  }
  const raw = await upstream.text();
  if (!upstream.ok) {
    logMeta(ctx, { model, status: upstream.status, durationMs: ctx.now() - started });
    sendJson(res, upstream.status, { error: scrub(raw, ctx.apiKey) }, cors);
    return;
  }
  const text = removeSecret(raw, ctx.apiKey);
  logMeta(ctx, { model, status: 200, durationMs: ctx.now() - started, tokens: usageOf(text) });
  res.writeHead(200, { ...cors, "content-type": "application/json" });
  res.end(text);
}

/** Une ligne de journal : heure, modèle, statut, durée, jetons. Jamais de contenu. */
function logMeta(
  ctx: RelayContext,
  meta: { model: string | null; status: number; durationMs: number; tokens?: { input: number; output: number } },
): void {
  let line = `[relay] ${new Date(ctx.now()).toISOString()} status=${meta.status} duration_ms=${meta.durationMs}`;
  if (meta.model !== null) line += ` model=${meta.model}`;
  if (meta.tokens !== undefined) line += ` tokens_in=${meta.tokens.input} tokens_out=${meta.tokens.output}`;
  ctx.log(line);
}

/** `POST /v1/chat/completions` : les quatre garde-fous, puis le relais. */
async function handleChat(
  ctx: RelayContext,
  req: IncomingMessage,
  res: ServerResponse,
  cors: Record<string, string>,
): Promise<void> {
  const started = ctx.now();
  const body = await readBody(req, ctx.limits.maxRequestChars);
  if (!body.ok) {
    const tooLong = body.reason === "too-long";
    logMeta(ctx, { model: null, status: tooLong ? 413 : 400, durationMs: ctx.now() - started });
    sendJson(res, tooLong ? 413 : 400, { error: tooLong ? "request too long" : "unreadable request body" }, cors);
    return;
  }
  const parsed = parseBody(body.text);
  if (parsed === null) {
    sendJson(res, 400, { error: "invalid JSON body" }, cors);
    return;
  }
  const model = parsed.model;
  if (typeof model !== "string" || model.length === 0) {
    sendJson(res, 400, { error: "missing model" }, cors);
    return;
  }
  if (!ctx.allowedModels.includes(model)) {
    logMeta(ctx, { model, status: 403, durationMs: ctx.now() - started });
    sendJson(res, 403, { error: "model is not allowed" }, cors);
    return;
  }
  if (!gardeFous.takeSession(ctx, sessionIdOf(req))) {
    logMeta(ctx, { model, status: 429, durationMs: ctx.now() - started });
    sendJson(res, 429, { error: "session limit reached" }, cors);
    return;
  }
  if (!gardeFous.takeDaily(ctx)) {
    logMeta(ctx, { model, status: 429, durationMs: ctx.now() - started });
    sendJson(res, 429, { error: "daily limit reached" }, cors);
    return;
  }
  await forward(ctx, res, cors, body.text, model, started);
}

// --------------------------------------------------------------------------
// Serveur
// --------------------------------------------------------------------------

/** Aiguille une requête vers le bon handler. */
function route(ctx: RelayContext, req: IncomingMessage, res: ServerResponse): void {
  const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
  const cors = corsHeaders(headerValue(req, "origin"), ctx.allowedOrigins);
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  if (req.method === "GET" && path === "/health") {
    sendJson(res, 200, healthPayload(ctx), cors);
    return;
  }
  if (req.method === "GET" && path === "/config") {
    sendJson(res, 200, configPayload(ctx), cors);
    return;
  }
  if (req.method === "POST" && path === "/v1/chat/completions") {
    void handleChat(ctx, req, res, cors);
    return;
  }
  sendJson(res, 404, { error: "not found" }, cors);
}

/** Le relais : un serveur HTTP, rien de plus. */
export function createRelayServer(options: RelayServerOptions = {}): Server {
  const allowedModels = options.allowedModels ?? gardeFous.ALLOWED_MODELS;
  const ctx: RelayContext = {
    apiKey: options.apiKey ?? "",
    upstreamBaseUrl: (options.upstreamBaseUrl ?? gardeFous.DEFAULT_UPSTREAM_BASE_URL).replace(/\/+$/, ""),
    publicBaseUrl: options.publicBaseUrl ?? "",
    allowedModels,
    defaultModel: options.defaultModel ?? allowedModels[0] ?? "",
    limits: { ...gardeFous.RELAY_LIMITS, ...options.limits },
    allowedOrigins: options.allowedOrigins ?? [],
    doFetch: options.fetchImpl ?? globalThis.fetch,
    now: options.now ?? Date.now,
    log: options.log ?? ((line: string) => console.log(line)),
    counters: { day: -1, daily: 0, sessions: new Map() },
  };
  return createServer((req, res) => {
    route(ctx, req, res);
  });
}
