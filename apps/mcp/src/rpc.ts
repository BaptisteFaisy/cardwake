/**
 * JSON-RPC 2.0 sur stdio — le strict nécessaire pour un serveur MCP, sans le
 * moindre SDK : on lit des lignes JSON, on répond par des lignes JSON.
 *
 * Deux codes d'erreur seulement : -32700 (le texte reçu n'est pas du JSON)
 * et -32602 (paramètres invalides, outil inconnu, méthode inconnue traitée
 * comme demande). Une seule implémentation de `respond` et de `error` :
 * chaque réponse du serveur passe par elles, jamais autrement.
 */

/** Version du protocole MCP annoncée quand l'appelant n'en propose pas. */
export const PROTOCOL_VERSION = "2024-11-05";

/** Texte reçu qui n'est pas du JSON. */
const PARSE_ERROR = -32700;
/** Paramètres invalides ou outil inconnu. */
const INVALID_PARAMS = -32602;
/** Méthode que le serveur n'implémente pas. */
const METHOD_NOT_FOUND = -32601;

/** Identifiant d'une demande : chaîne, nombre, `null`, ou absent (notification). */
export type JsonRpcId = string | number | null;

/** Ce que le transport attend du serveur : lister et exécuter des outils. */
export type RpcApi = {
  listTools(): Array<{ name: string; description: string; inputSchema: unknown }>;
  callTool(name: string, args: unknown): Promise<unknown>;
};

/** Paramètres invalides : le transport les rend à l'appelant en -32602. */
export class ParamError extends Error {}

function writeLine(write: (text: string) => void, payload: unknown): void {
  write(`${JSON.stringify(payload)}\n`);
}

/** Une seule façon de répondre : un résultat. */
export function respond(write: (text: string) => void, id: JsonRpcId, result: unknown): void {
  writeLine(write, { jsonrpc: "2.0", id, result });
}

/** Une seule façon de répondre : une erreur. */
export function error(write: (text: string) => void, id: JsonRpcId, code: number, message: string): void {
  writeLine(write, { jsonrpc: "2.0", id, error: { code, message } });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Les paramètres d'une demande, tels quels : absents, c'est un objet vide. */
function paramsOf(message: Record<string, unknown>): Record<string, unknown> {
  const params = message.params;
  if (params === undefined) return {};
  if (!isObject(params)) throw new ParamError("params must be an object");
  return params;
}

/** Réponse d'initialisation : protocole écho, capacités, carte du serveur. */
function initializeResult(params: Record<string, unknown>): unknown {
  const asked = params.protocolVersion;
  return {
    protocolVersion: typeof asked === "string" ? asked : PROTOCOL_VERSION,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: "cardwake-mcp", version: "0.1.0" },
  };
}

/** Résultat d'un `tools/call`, mis en forme MCP : un contenu texte JSON. */
function toolContent(result: unknown): unknown {
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}

/** Exécute un outil nommé ; ParamError devient -32602, le reste remonte. */
async function callTool(api: RpcApi, write: (text: string) => void, id: JsonRpcId, params: Record<string, unknown>): Promise<void> {
  if (typeof params.name !== "string") {
    return error(write, id, INVALID_PARAMS, 'tools/call needs a string "name"');
  }
  try {
    const result = await api.callTool(params.name, params.arguments ?? {});
    return respond(write, id, toolContent(result));
  } catch (cause) {
    if (cause instanceof ParamError) return error(write, id, INVALID_PARAMS, cause.message);
    throw cause;
  }
}

/** Aiguillage des méthodes connues ; une notification inconnue est ignorée. */
async function dispatch(api: RpcApi, write: (text: string) => void, hasId: boolean, id: JsonRpcId, message: Record<string, unknown>): Promise<void> {
  switch (message.method) {
    case "initialize":
      return respond(write, id, initializeResult(paramsOf(message)));
    case "notifications/initialized":
    case "initialized":
      return; // notification : jamais de réponse
    case "tools/list":
      return respond(write, id, { tools: api.listTools() });
    case "tools/call":
      return callTool(api, write, id, paramsOf(message));
    default:
      return hasId
        ? error(write, id, METHOD_NOT_FOUND, `unknown method: ${String(message.method)}`)
        : undefined;
  }
}

/** Traite une ligne : JSON invalide → -32700, demande mal formée → -32602. */
async function handleLine(api: RpcApi, write: (text: string) => void, line: string): Promise<void> {
  const text = line.trim();
  if (text === "") return;
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    return error(write, null, PARSE_ERROR, "Parse error");
  }
  if (!isObject(message) || typeof message.method !== "string") {
    return error(write, null, INVALID_PARAMS, "Invalid Request");
  }
  const id = (message.id ?? null) as JsonRpcId;
  try {
    await dispatch(api, write, "id" in message, id, message);
  } catch (cause) {
    if (cause instanceof ParamError) return error(write, id, INVALID_PARAMS, cause.message);
    throw cause;
  }
}

/** Construit le transport : `handleLine` traite une ligne, les réponses passent par `write`. */
export function createRpc(api: RpcApi, write: (text: string) => void) {
  return { handleLine: (line: string) => handleLine(api, write, line) };
}
