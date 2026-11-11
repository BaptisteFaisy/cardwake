/**
 * Forme canonique d'une `LlmRequest` et empreinte SHA-256 (7.11, CAR-P-19).
 *
 * La forme canonique :
 * - ne garde que les champs qui décrivent la situation (liste blanche) ;
 * - classe les clés, à toute profondeur, pour que l'ordre n'ait pas d'effet ;
 * - remplace le modèle par celui que la vitesse désigne ;
 * - remplace les identifiants d'outils (générés par le modèle) par des
 *  ordinals, pour qu'un rejeu trouve son enregistrement malgré des
 *   identifiants différents.
 *
 * L'empreinte ne dépend donc que du contenu : changer la consigne, un message
 * ou un schéma d'outil change l'empreinte ; changer l'ordre des clés non.
 */

import { sha256Hex } from "./sha256";
import type { LlmBlock, LlmMessage, LlmRequest, LlmSpeed, ToolSchema } from "../types";

/** Modèles de référence : la vitesse choisit le modèle (7.12). */
export const MODEL_BY_SPEED: Record<LlmSpeed, string> = {
  fast: "claude-haiku-5-5",
  careful: "claude-sonnet-5-5",
};

/** Modèle retenu pour une requête, éventuellement forcé par un réglage. */
export function resolveModel(
  request: Pick<LlmRequest, "speed">,
  override?: Partial<Record<LlmSpeed, string>>,
): string {
  return override?.[request.speed] ?? MODEL_BY_SPEED[request.speed];
}

export type CanonicalBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: string; isError: boolean };

export type CanonicalMessage = { role: "user" | "assistant"; blocks: CanonicalBlock[] };

export type CanonicalTool = { name: string; description: string; inputSchema: unknown };

export type CanonicalRequest = {
  purpose: LlmRequest["purpose"];
  model: string;
  system: string;
  messages: CanonicalMessage[];
  tools?: CanonicalTool[];
  outputSchema?: unknown;
  maxOutputTokens: number;
};

/**
 * Classe les clés d'un objet, à toute profondeur. Les tableaux gardent leur
 * ordre (il porte du sens : l'ordre des messages, des blocs).
 */
export function canonicalValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    const item = source[key];
    if (item === undefined) continue;
    out[key] = canonicalValue(item);
  }
  return out;
}

/** Chaîne JSON stable : mêmes valeurs, même chaîne. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

/** Un bloc, avec des identifiants d'outil ordinaux et stables. */
function canonicalBlock(
  block: LlmBlock,
  placeholder: (id: string) => string,
): CanonicalBlock {
  if (block.type === "text") return { type: "text", text: block.text };
  if (block.type === "tool_use") {
    return {
      type: "tool_use",
      id: placeholder(block.id),
      name: block.name,
      input: canonicalValue(block.input),
    };
  }
  return {
    type: "tool_result",
    toolUseId: placeholder(block.toolUseId),
    content: block.content,
    isError: block.isError === true,
  };
}

/** Les messages, avec les identifiants d'outils remplacés par des ordinals. */
function canonicalMessages(messages: readonly LlmMessage[]): CanonicalMessage[] {
  const ids = new Map<string, string>();
  let counter = 0;
  const placeholder = (id: string): string => {
    const known = ids.get(id);
    if (known !== undefined) return known;
    counter += 1;
    const fresh = `#tool-${counter}`;
    ids.set(id, fresh);
    return fresh;
  };
  return messages.map((message) => ({
    role: message.role,
    blocks: message.blocks.map((block) => canonicalBlock(block, placeholder)),
  }));
}

/** Un outil, réduit à ce qui change la situation. */
function canonicalTool(tool: ToolSchema): CanonicalTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: canonicalValue(tool.inputSchema),
  };
}

/** Forme canonique d'une requête : liste blanche, clés triées, modèle résolu. */
export function canonicalRequest(
  request: LlmRequest,
  model: string = resolveModel(request),
): CanonicalRequest {
  const canonical: CanonicalRequest = {
    purpose: request.purpose,
    model,
    system: request.system,
    messages: canonicalMessages(request.messages),
    maxOutputTokens: request.maxOutputTokens,
  };
  if (request.tools && request.tools.length > 0) {
    canonical.tools = request.tools.map(canonicalTool);
  }
  if (request.outputSchema !== undefined) {
    canonical.outputSchema = canonicalValue(request.outputSchema);
  }
  return canonical;
}

/** Empreinte SHA-256 hexadécimale d'une requête (CAR-P-19). */
export function fingerprint(request: LlmRequest, model?: string): string {
  const canonical = canonicalRequest(request, model ?? resolveModel(request));
  return sha256Hex(canonicalJson(canonical));
}