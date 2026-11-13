/**
 * Contrat du paquet `agent` : la passerelle vers le modèle, les outils d'un
 * agent de carte, et les budgets (cahier des charges 7.5, 7.11, 11.6).
 *
 * Deux règles absolues :
 * - `LlmGateway` est le **seul** point par lequel l'application parle à un
 *   modèle. Aucune autre partie du code ne connaît un fournisseur.
 * - Les types ci-dessous sont ceux du projet, pas ceux d'un SDK : chaque
 *   réalisation traduit.
 */

import type { AgentLevel } from "@cardwake/model";

// --------------------------------------------------------------------------
// Passerelle
// --------------------------------------------------------------------------

export type LlmPurpose = "agent-turn" | "write-script" | "repair-script";
export type LlmSpeed = "fast" | "careful";

export type ToolSchema = {
  name: string;
  description: string;
  /** Schéma JSON de l'entrée, en mode strict : aucune clé supplémentaire. */
  inputSchema: Record<string, unknown>;
};

export type LlmMessage = {
  role: "user" | "assistant";
  blocks: LlmBlock[];
};

export type LlmBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

export type LlmRequest = {
  purpose: LlmPurpose;
  speed: LlmSpeed;
  system: string;
  messages: LlmMessage[];
  tools?: ToolSchema[];
  outputSchema?: Record<string, unknown>;
  maxOutputTokens: number;
};

export type LlmStop = "end" | "tool_use" | "max_tokens" | "refusal";

export type LlmResponse = {
  stop: LlmStop;
  blocks: LlmBlock[];
  usage: { inputTokens: number; outputTokens: number };
};

export interface LlmGateway {
  /** Un appel au modèle. La boucle d'outils est faite par l'appelant. */
  call(request: LlmRequest, signal: AbortSignal): Promise<LlmResponse>;
  /** Nom du mode, pour l'interface et le journal. */
  readonly mode: "cassette" | "key" | "relay";
}

/**
 * Le texte des blocs texte d'une réponse, dans l'ordre, sans séparateur.
 *
 * Une seule implémentation : la chaîne « phrase → script » et l'enregistreur
 * des cassettes lisent la même sortie structurée, de la même façon.
 */
export function responseText(response: LlmResponse): string {
  return response.blocks
    .filter((block): block is Extract<LlmBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/** Erreur propre au mode enregistré : aucune cassette pour cette empreinte. */
export class CassetteMiss extends Error {
  readonly fingerprint: string;
  constructor(fingerprint: string) {
    super("No recording for this situation. Add an API key to go further.");
    this.name = "CassetteMiss";
    this.fingerprint = fingerprint;
  }
}

// --------------------------------------------------------------------------
// Outils d'agent
// --------------------------------------------------------------------------

export type ToolName =
  | "reply"
  | "send_message"
  | "write_field"
  | "set_appearance"
  | "create_part"
  | "delete_part"
  | "create_card"
  | "go_to_card"
  | "propose_script";

/** Niveau minimum requis, et ligne de Murmur équivalente pour le journal. */
export const TOOL_LEVEL: Record<ToolName, AgentLevel> = {
  reply: 1,
  send_message: 1,
  write_field: 2,
  set_appearance: 3,
  create_part: 4,
  delete_part: 4,
  create_card: 4,
  go_to_card: 4,
  propose_script: 5,
};

export type WriteMode = "replace" | "append" | "prepend";

export type ToolCall = { name: ToolName; id: string; args: Record<string, unknown> };

/** Vue de la carte donnée à l'agent, et rien d'autre (7.5, CAR-P-16). */
export type CardView = {
  stackName: string;
  cardName: string;
  level: AgentLevel;
  fields: { name: string; locked: boolean; text: string }[];
  buttons: { name: string; label: string }[];
  otherCards: string[];
};

/** Les quatre blocs du contexte d'un tour (7.5). */
export type AgentContext = {
  rules: string;
  personas: { stack: string; background: string; card: string };
  view: CardView;
  message: { text: string; sender: string; hops: number };
};

// --------------------------------------------------------------------------
// Budgets
// --------------------------------------------------------------------------

/** Compteurs de session, par pile. Jamais exportés (CAR-P-22). */
export type SessionBudget = {
  turnsUsed: number;
  turnsMax: number;
  inputTokensUsed: number;
  inputTokensMax: number;
};

/** Compteurs d'une action humaine (7.6). */
export type ActionBudget = {
  hopsLeft: number;
  turnsLeft: number;
};

export type BudgetVerdict =
  | { ok: true }
  | { ok: false; reason: "turns-session" | "tokens-session" | "hops" | "turns-action" | "queue" };
