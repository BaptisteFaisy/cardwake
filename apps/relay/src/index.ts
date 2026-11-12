#!/usr/bin/env -S node --experimental-strip-types
/**
 * Le point d'entrée du relais local (7.11, 11.6).
 *
 * Il lit l'environnement, trouve la clé du fournisseur, puis démarre le
 * serveur. La clé vient de `CARDWAKE_API_KEY`, sinon du fichier
 * `~/.inferhub-key` : elle n'est ni journalisée, ni renvoyée, ni exportée.
 *
 * Réglages : `PORT` (8787), `CARDWAKE_ALLOWED_ORIGINS`, `CARDWAKE_ALLOWED_MODELS`,
 * `CARDWAKE_UPSTREAM_BASE_URL`, `CARDWAKE_PUBLIC_BASE_URL`,
 * `CARDWAKE_MAX_REQUEST_CHARS`, `CARDWAKE_SESSION_REQUESTS_PER_HOUR`,
 * `CARDWAKE_DAILY_REQUESTS`.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";

/** La clé du fournisseur : l'environnement d'abord, le fichier ensuite. */
function readApiKey(): string {
  const fromEnv = (process.env.CARDWAKE_API_KEY ?? "").trim();
  if (fromEnv.length > 0) return fromEnv;
  try {
    return readFileSync(`${homedir()}/.inferhub-key`, "utf8").trim();
  } catch {
    return "";
  }
}

/** Un nombre de l'environnement, ou la valeur par défaut. */
function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/** Une liste séparée par des virgules, ou la valeur par défaut. */
function listEnv(name: string, fallback: readonly string[]): string[] {
  const raw = process.env[name];
  if (raw === undefined) return [...fallback];
  const items = raw.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
  return items.length > 0 ? items : [...fallback];
}

/**
 * Node exige l'extension « .ts » dans un import, et le vérificateur de types
 * du dépôt refuse cette extension. D'où l'import dynamique résolu à
 * l'exécution, dont le type est repris du module lui-même.
 */
const serverUrl = new URL("./server.ts", import.meta.url).href;
const serverModule = (await import(serverUrl)) as typeof import("./server.js");

const port = numberEnv("PORT", 8787);
const models = listEnv("CARDWAKE_ALLOWED_MODELS", serverModule.ALLOWED_MODELS);
const origins = listEnv("CARDWAKE_ALLOWED_ORIGINS", serverModule.DEFAULT_ALLOWED_ORIGINS);
const publicBaseUrl = (process.env.CARDWAKE_PUBLIC_BASE_URL ?? "").trim() || `http://127.0.0.1:${port}/v1`;
const apiKey = readApiKey();
const defaults = serverModule.RELAY_LIMITS;
const maxRequestChars = numberEnv("CARDWAKE_MAX_REQUEST_CHARS", defaults.maxRequestChars);
const sessionRequests = numberEnv("CARDWAKE_SESSION_REQUESTS_PER_HOUR", defaults.sessionRequestsPerHour);
const dailyRequests = numberEnv("CARDWAKE_DAILY_REQUESTS", defaults.dailyRequests);

const server = serverModule.createRelayServer({
  apiKey,
  upstreamBaseUrl: (process.env.CARDWAKE_UPSTREAM_BASE_URL ?? "").trim() || undefined,
  publicBaseUrl,
  allowedModels: models,
  allowedOrigins: origins,
  limits: { maxRequestChars, sessionRequestsPerHour: sessionRequests, dailyRequests },
});

server.on("error", (error: NodeJS.ErrnoException) => {
  console.error(`[relay] cannot listen on port ${port} (${error.code ?? "unknown error"})`);
  process.exit(1);
});

server.listen(port, () => {
  const key = apiKey.length > 0 ? "found" : "missing";
  console.log(`[relay] listening on ${publicBaseUrl} — ${models.length} model(s), key: ${key}`);
});
