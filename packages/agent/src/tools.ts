/**
 * Outils d'un agent de carte (cahier des charges 7.5).
 *
 * Trois responsabilités, et rien d'autre :
 * - le **schéma strict** de chaque outil, tel qu'il est présenté au modèle ;
 * - la **validation** des arguments avant tout traitement, pour ne jamais
 *   exécuter un appel de forme douteuse ;
 * - la **ligne de Murmur** équivalente, celle que le journal affiche.
 *
 * Le contrôle des droits (niveau, carte visée) n'est pas ici : il appartient
 * au point de passage unique `model/authorize`. `toolsForLevel` ne fait que
 * choisir ce qu'on montre au modèle ; le contrôle est refait à l'exécution.
 */

import type { AgentLevel } from "@cardwake/model";
import type { ToolName, ToolSchema } from "./types";
import { TOOL_LEVEL } from "./types";

// --------------------------------------------------------------------------
// Description des arguments
// --------------------------------------------------------------------------

/** Le peu de types dont les outils ont besoin, décrit une seule fois. */
type ArgType =
  | { kind: "string" }
  | { kind: "stringOrBoolean" }
  | { kind: "enum"; values: readonly string[] }
  | { kind: "rect" }
  | { kind: "cardRef" };

type Arg = { name: string; type: ArgType; description: string };

type ToolSpec = { description: string; args: readonly Arg[] };

const str = (name: string, description: string): Arg => ({
  name,
  type: { kind: "string" },
  description,
});
const oneOf = (name: string, values: readonly string[], description: string): Arg => ({
  name,
  type: { kind: "enum", values },
  description,
});

const WRITE_MODES = ["replace", "append", "prepend"] as const;
const APPEARANCE_PROPS = ["visible", "enabled", "locked", "hilite", "label", "style"] as const;
const PART_KINDS = ["field", "button"] as const;

/** Table unique : le schéma présenté au modèle et la validation en découlent. */
const TOOL_SPECS: Record<ToolName, ToolSpec> = {
  reply: {
    description: "Give your answer back to whoever woke you. Call it once, then stop.",
    args: [str("text", "The answer, in the language of the message you received.")],
  },
  send_message: {
    description:
      "Send a message to another card of the stack. That card decides what to do with it; you never write in it.",
    args: [
      str("to_card", "Name of the card you write to."),
      str("text", "What you say to that card."),
    ],
  },
  write_field: {
    description:
      "Write text into a field of your own card. The field must be unlocked and you must be at level 2 or above.",
    args: [
      str("field", "Name of the field of your card."),
      str("text", "The text to write."),
      oneOf("mode", WRITE_MODES, "replace the text, or append/prepend the new text to it."),
    ],
  },
  set_appearance: {
    description: "Change one property of a part of your own card. Level 3 or above.",
    args: [
      str("part", "Name of the field or button of your card."),
      oneOf("property", APPEARANCE_PROPS, "The property to change."),
      { name: "value", type: { kind: "stringOrBoolean" }, description: "The new value." },
    ],
  },
  create_part: {
    description: "Create a new field or button in your own card. Level 4 or above.",
    args: [
      oneOf("kind", PART_KINDS, "The kind of part to create."),
      str("name", "Name of the new part, unique in the card."),
      {
        name: "rect",
        type: { kind: "rect" },
        description: "Position and size: [x, y, width, height] in card points.",
      },
      str("label", "Label shown on a button; ignored for a field, give an empty string."),
    ],
  },
  delete_part: {
    description: "Delete a part from your own card. Level 4 or above.",
    args: [str("part", "Name of the field or button to delete.")],
  },
  create_card: {
    description: "Create a new card in the stack. Level 4 or above.",
    args: [
      str("name", "Name of the new card, unique in the stack."),
      {
        name: "background",
        type: { kind: "cardRef" },
        description: "Id of the background to share, or null for a card without background.",
      },
    ],
  },
  go_to_card: {
    description: "Change the card displayed. Level 4 or above.",
    args: [str("card", "Name of the card to display.")],
  },
  propose_script: {
    description:
      "Propose a script for an object of your own card. A human accepts or refuses it; nothing is installed by yourself. Level 5.",
    args: [
      str("object", "Name of the part the script is for."),
      str("script", "The script, in Murmur."),
      str("explanation", "One plain sentence, for the human who reviews it."),
    ],
  },
};

// --------------------------------------------------------------------------
// Schéma JSON strict
// --------------------------------------------------------------------------

/** Traduction d'un type d'argument en schéma JSON. */
function jsonType(type: ArgType): Record<string, unknown> {
  switch (type.kind) {
    case "string":
      return { type: "string" };
    case "stringOrBoolean":
      return { type: ["string", "boolean"] };
    case "enum":
      return { type: "string", enum: [...type.values] };
    case "rect":
      return {
        type: "array",
        items: { type: "number" },
        minItems: 4,
        maxItems: 4,
      };
    case "cardRef":
      return { type: ["integer", "null"] };
  }
}

export function toolSchema(name: ToolName): ToolSchema {
  const spec = TOOL_SPECS[name];
  const properties: Record<string, unknown> = {};
  for (const arg of spec.args) {
    properties[arg.name] = { ...jsonType(arg.type), description: arg.description };
  }
  return {
    name,
    description: spec.description,
    inputSchema: {
      type: "object",
      properties,
      required: spec.args.map((arg) => arg.name),
      additionalProperties: false,
    },
  };
}

/** Les outils permis à ce niveau, du plus simple au plus puissant (7.4). */
export function toolsForLevel(level: AgentLevel): ToolSchema[] {
  return (Object.keys(TOOL_SPECS) as ToolName[])
    .filter((name) => TOOL_LEVEL[name] <= level)
    .sort((left, right) => TOOL_LEVEL[left] - TOOL_LEVEL[right])
    .map(toolSchema);
}

// --------------------------------------------------------------------------
// Validation des arguments
// --------------------------------------------------------------------------

const isRect = (value: unknown): boolean =>
  Array.isArray(value) && value.length === 4 && value.every((item) => Number.isFinite(item));

/** Vérifie une valeur contre un type d'argument ; rend la raison du refus. */
function checkArg(arg: Arg, value: unknown): string | undefined {
  const type = arg.type;
  switch (type.kind) {
    case "string":
      if (typeof value === "string") return undefined;
      break;
    case "stringOrBoolean":
      if (typeof value === "string" || typeof value === "boolean") return undefined;
      break;
    case "enum":
      if (typeof value === "string" && type.values.includes(value)) return undefined;
      break;
    case "rect":
      if (isRect(value)) return undefined;
      break;
    case "cardRef":
      if (value === null || (typeof value === "number" && Number.isInteger(value))) {
        return undefined;
      }
      break;
  }
  return `Tool argument "${arg.name}" has an unexpected value.`;
}

export function validateToolArgs(
  name: ToolName,
  args: Record<string, unknown>,
): { ok: true } | { ok: false; reason: string } {
  const spec = TOOL_SPECS[name];
  if (!spec) return { ok: false, reason: `Unknown tool "${name}".` };
  const known = new Set(spec.args.map((arg) => arg.name));
  for (const key of Object.keys(args)) {
    if (!known.has(key)) return { ok: false, reason: `Unknown argument "${key}".` };
  }
  for (const arg of spec.args) {
    if (!(arg.name in args)) {
      return { ok: false, reason: `Missing argument "${arg.name}".` };
    }
    const reason = checkArg(arg, args[arg.name]);
    if (reason) return { ok: false, reason };
  }
  return { ok: true };
}

// --------------------------------------------------------------------------
// Ligne de Murmur équivalente, pour le journal
// --------------------------------------------------------------------------

/** Une chaîne Murmur, entre guillemets, échappée comme le veut le langage. */
function quote(value: unknown): string {
  const text = typeof value === "string" ? value : String(value ?? "");
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function text(args: Record<string, unknown>, key: string): string {
  return typeof args[key] === "string" ? (args[key] as string) : "";
}

/**
 * Propriétés qui n'existent que sur un bouton : elles désignent le type de
 * l'élément visé. Les autres sont communes aux champs et aux boutons, et la
 * ligne parle alors d'un champ, comme le veut l'usage.
 */
const BUTTON_ONLY_PROPS = new Set(["enabled", "hilite", "label"]);

export function equivalentLine(name: ToolName, args: Record<string, unknown>): string {
  switch (name) {
    case "reply":
      return `reply ${quote(text(args, "text"))}`;
    case "send_message":
      return `tell agent of card ${quote(text(args, "to_card"))} ${quote(text(args, "text"))}`;
    case "write_field": {
      const verb = { replace: "into", append: "after", prepend: "before" };
      const target = verb[text(args, "mode") as keyof typeof verb] ?? "into";
      return `put ${quote(text(args, "text"))} ${target} field ${quote(text(args, "field"))}`;
    }
    case "set_appearance": {
      const kind = BUTTON_ONLY_PROPS.has(text(args, "property")) ? "button" : "field";
      return `set the ${text(args, "property")} of ${kind} ${quote(
        text(args, "part"),
      )} to ${formatValue(args.value)}`;
    }
    case "create_part":
      return `create ${text(args, "kind")} ${quote(text(args, "name"))}`;
    case "delete_part":
      return `delete ${quote(text(args, "part"))}`;
    case "create_card":
      return `create card ${quote(text(args, "name"))}`;
    case "go_to_card":
      return `go to card ${quote(text(args, "card"))}`;
    case "propose_script":
      return `Proposed script for button "${text(args, "object")}" (awaiting acceptance)`;
  }
}

/** Une valeur telle que le langage l'écrit : `true`, `false`, ou un texte. */
function formatValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  return typeof value === "string" ? value : String(value ?? "");
}
