/**
 * Exécution des appels d'outils d'un tour d'agent (7.5, CAR-P-11).
 *
 * Chaque appel est RE-VÉRIFIÉ, même si le modèle n'a reçu que les outils de
 * son niveau : outil connu, niveau requis, forme des arguments. Un appel hors
 * droits n'est PAS exécuté — il rend un `tool_result` en erreur, en anglais,
 * et le tour continue. L'exécution passe toujours par l'hôte, donc par
 * `authorize` : c'est lui qui garantit que l'agent n'agit que sur sa carte
 * (`not-own-card`), et chaque opération réussie y est tracée.
 */

import type { ObjRef, PropName, ResolvedRef, ScriptError, Span } from "@cardwake/lang";
import type { AgentLevel, ModelHost } from "@cardwake/model";
import { effectiveLevel } from "@cardwake/model";
import { equivalentLine, validateToolArgs } from "./tools";
import { TOOL_LEVEL } from "./types";
import type { LlmBlock, ToolName, WriteMode } from "./types";

/** Ce dont un exécuteur a besoin : l'hôte et la carte de l'agent. */
export type ToolScope = { host: ModelHost; cardId: number };

/** Ce qu'un outil exécuté dépose pour le tour ; tout le reste passe par l'hôte. */
export type ToolEffects = {
  reply: string;
  /** Proposition de script en attente d'acceptation humaine (CAR-P-17). */
  proposal?: { object: string; script: string; explanation: string };
};

/** Résultat d'un appel : contenu toujours en anglais (le modèle le relit). */
type CallResult = { content: string; isError: boolean };

type Executor = (
  args: Record<string, unknown>,
  scope: ToolScope,
  effects: ToolEffects,
) => CallResult;

// --------------------------------------------------------------------------
// Désignations : l'agent nomme, l'hôte résout (jamais d'identifiant deviné)
// --------------------------------------------------------------------------

/** Empan nul : une référence d'agent ne vient pas d'un texte source. */
const SPAN: Span = {
  start: { line: 0, col: 0, offset: 0 },
  end: { line: 0, col: 0, offset: 0 },
};

function isScriptError(value: ResolvedRef | ScriptError): value is ScriptError {
  return typeof value === "object" && value !== null && "category" in value;
}

/** `agent of card "Nom"` : la cible d'un `send_message`. */
function agentRefOf(name: string): ObjRef {
  return {
    kind: "agent",
    ref: {
      of: { kind: "card", by: { kind: "name", name, span: SPAN }, span: SPAN },
      span: SPAN,
    },
    span: SPAN,
  };
}

/** `card "Nom"` : la cible d'un `go_to_card`. */
function cardRefOf(name: string): ObjRef {
  return {
    kind: "card",
    ref: { kind: "card", by: { kind: "name", name, span: SPAN }, span: SPAN },
    span: SPAN,
  };
}

/** Élément par nom : champ d'abord, bouton ensuite (l'ordre du langage). */
function resolvePartByName(host: ModelHost, name: string): ResolvedRef | undefined {
  for (const kind of ["field", "button"] as const) {
    const resolved = host.resolve(host.partRef(kind, name));
    if (!isScriptError(resolved)) return resolved;
  }
  return undefined;
}

/** Argument texte ; chaîne vide s'il manque (la validation a déjà eu lieu). */
function argText(args: Record<string, unknown>, key: string): string {
  return typeof args[key] === "string" ? (args[key] as string) : "";
}

// --------------------------------------------------------------------------
// Exécuteurs : toujours via l'hôte, donc via `authorize`
// --------------------------------------------------------------------------

const done = (content: string): CallResult => ({ content, isError: false });
const failed = (content: string): CallResult => ({ content, isError: true });

/**
 * Lit les refus apparus depuis `before` : un refus d'`authorize` veut dire que
 * l'opération n'a pas été appliquée — le résultat porte sa raison, en anglais.
 */
function afterHost(scope: ToolScope, before: number, line: string): CallResult {
  const refusal = scope.host.lastRefusals.slice(before).find((verdict) => !verdict.allow);
  return refusal && !refusal.allow ? failed(refusal.reason) : done(line);
}

function execReply(args: Record<string, unknown>, effects: ToolEffects): CallResult {
  effects.reply = argText(args, "text");
  return done(equivalentLine("reply", args));
}

function execSendMessage(args: Record<string, unknown>, scope: ToolScope): CallResult {
  const resolved = scope.host.resolve(agentRefOf(argText(args, "to_card")));
  if (isScriptError(resolved)) return failed(resolved.message);
  const before = scope.host.lastRefusals.length;
  scope.host.tell(resolved, argText(args, "text"));
  return afterHost(scope, before, equivalentLine("send_message", args));
}

function execWriteField(args: Record<string, unknown>, scope: ToolScope): CallResult {
  const name = argText(args, "field");
  const before = scope.host.lastRefusals.length;
  const written = scope.host.writeFieldByName(
    name,
    argText(args, "text"),
    argText(args, "mode") as WriteMode,
  );
  if (!written) return failed(`There is no field "${name}" on your card.`);
  return afterHost(scope, before, equivalentLine("write_field", args));
}

function execSetAppearance(args: Record<string, unknown>, scope: ToolScope): CallResult {
  const name = argText(args, "part");
  const part = resolvePartByName(scope.host, name);
  if (part === undefined) return failed(`There is no field or button "${name}" on your card.`);
  const value = typeof args.value === "boolean" ? String(args.value) : argText(args, "value");
  const before = scope.host.lastRefusals.length;
  scope.host.writeProp(part, argText(args, "property") as PropName, value);
  return afterHost(scope, before, equivalentLine("set_appearance", args));
}

function execCreatePart(args: Record<string, unknown>, scope: ToolScope): CallResult {
  const before = scope.host.lastRefusals.length;
  scope.host.createPart(
    argText(args, "kind") as "field" | "button",
    argText(args, "name"),
    scope.cardId,
  );
  return afterHost(scope, before, equivalentLine("create_part", args));
}

function execDeletePart(args: Record<string, unknown>, scope: ToolScope): CallResult {
  const name = argText(args, "part");
  const part = resolvePartByName(scope.host, name);
  if (part === undefined) return failed(`There is no field or button "${name}" on your card.`);
  const before = scope.host.lastRefusals.length;
  scope.host.delete(part);
  return afterHost(scope, before, equivalentLine("delete_part", args));
}

function execCreateCard(args: Record<string, unknown>, scope: ToolScope): CallResult {
  // L'hôte nomme les fonds ; l'outil donne un identifiant — traduit ici.
  const wanted = typeof args.background === "number" ? args.background : null;
  const background = scope.host.stack.backgrounds.find((item) => item.id === wanted)?.name;
  const before = scope.host.lastRefusals.length;
  scope.host.createCard(argText(args, "name"), background);
  return afterHost(scope, before, equivalentLine("create_card", args));
}

function execGoToCard(args: Record<string, unknown>, scope: ToolScope): CallResult {
  const resolved = scope.host.resolve(cardRefOf(argText(args, "card")));
  if (isScriptError(resolved)) return failed(resolved.message);
  if (resolved.kind !== "card") return failed(`There is no card "${argText(args, "card")}".`);
  const before = scope.host.lastRefusals.length;
  scope.host.goToCard(resolved.id);
  return afterHost(scope, before, equivalentLine("go_to_card", args));
}

function execProposeScript(args: Record<string, unknown>, effects: ToolEffects): CallResult {
  // `propose_script` ne modifie RIEN : la proposition attend un humain.
  effects.proposal = {
    object: argText(args, "object"),
    script: argText(args, "script"),
    explanation: argText(args, "explanation"),
  };
  return done(equivalentLine("propose_script", args));
}

/** Table unique : un exécuteur par outil, tous via l'hôte. */
const EXECUTORS: Record<ToolName, Executor> = {
  reply: (args, _scope, effects) => execReply(args, effects),
  send_message: (args, scope) => execSendMessage(args, scope),
  write_field: (args, scope) => execWriteField(args, scope),
  set_appearance: (args, scope) => execSetAppearance(args, scope),
  create_part: (args, scope) => execCreatePart(args, scope),
  delete_part: (args, scope) => execDeletePart(args, scope),
  create_card: (args, scope) => execCreateCard(args, scope),
  go_to_card: (args, scope) => execGoToCard(args, scope),
  propose_script: (args, _scope, effects) => execProposeScript(args, effects),
};

// --------------------------------------------------------------------------
// Re-vérification à l'exécution (CAR-P-11)
// --------------------------------------------------------------------------

/** Niveau effectif, relu sur la pile vivante à chaque appel : jamais caché. */
export function currentLevel(scope: ToolScope): AgentLevel {
  const card = scope.host.stack.cards.find((item) => item.id === scope.cardId);
  return effectiveLevel(scope.host.stack, card);
}

/**
 * Le garde d'un appel : outil connu, niveau requis, forme des arguments.
 * La carte visée est garantie par l'hôte, qui ne résout et n'autorise que
 * sur la carte de l'agent.
 */
function gateCall(
  block: Extract<LlmBlock, { type: "tool_use" }>,
  scope: ToolScope,
): { ok: true; name: ToolName } | { ok: false; reason: string } {
  if (!(block.name in TOOL_LEVEL)) return { ok: false, reason: `Unknown tool "${block.name}".` };
  const name = block.name as ToolName;
  const level = currentLevel(scope);
  if (TOOL_LEVEL[name] > level) {
    return {
      ok: false,
      reason:
        `Tool "${name}" needs level ${TOOL_LEVEL[name]}; you are at level ${level}. ` +
        "The call was refused and nothing happened.",
    };
  }
  const check = validateToolArgs(name, block.input);
  return check.ok ? { ok: true, name } : { ok: false, reason: check.reason };
}

/** Exécute les appels d'une réponse et rend les résultats à renvoyer. */
export function runToolCalls(
  blocks: readonly LlmBlock[],
  scope: ToolScope,
  effects: ToolEffects,
): LlmBlock[] {
  const results: LlmBlock[] = [];
  for (const block of blocks) {
    if (block.type !== "tool_use") continue;
    const gate = gateCall(block, scope);
    if (!gate.ok) {
      results.push({ type: "tool_result", toolUseId: block.id, content: gate.reason, isError: true });
      continue;
    }
    const result = EXECUTORS[gate.name](block.input, scope, effects);
    results.push({
      type: "tool_result",
      toolUseId: block.id,
      content: result.content,
      isError: result.isError,
    });
  }
  return results;
}
