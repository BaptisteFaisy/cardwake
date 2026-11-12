/**
 * Schéma d'une tâche du jeu d'évaluation « phrase → script » (7.7).
 *
 * Écrit à la main, dans l'esprit de `packages/model/src/schema.ts` : les
 * erreurs citent le chemin exact en anglais, rien n'est deviné, aucune
 * exception n'est levée. La pile inline de chaque tâche passe par
 * `validateStack` de `@cardwake/model` — une tâche ne peut pas contenir une
 * pile que l'application refuserait, et son `object` doit désigner un objet
 * qui existe vraiment.
 */

import { byName, findCard, findPart, validateStack, type Stack } from "@cardwake/model";

export type Expectation =
  | { kind: "fieldEquals"; card: string; field: string; value: string }
  | { kind: "fieldContains"; card: string; field: string; text: string }
  | { kind: "fieldEmpty"; card: string; field: string }
  | { kind: "cardIs"; name: string }
  // La consigne donnait deux clés `kind` à cette forme (impossible en JSON et
  // en TS) : la nature de l'élément s'appelle donc `part`.
  | { kind: "partExists"; card: string; part: "field" | "button"; name: string }
  | { kind: "partCount"; card: string; count: number }
  | { kind: "agentSaid"; card: string; contains: string }
  | { kind: "messageSent"; to: string; contains: string }
  | { kind: "noError" };

export type EvalTask = {
  id: string;
  family: "calcul" | "chunks" | "navigation" | "conditions" | "loops" | "agents";
  phrase: string;
  object: string;
  stack: unknown;
  events: { click?: string; type?: { field: string; text: string }; chat?: string }[];
  expect: Expectation[];
  notes?: string;
};

export type TaskValidation = { ok: true; task: EvalTask } | { ok: false; errors: string[] };

type Record_ = Record<string, unknown>;

const FAMILIES = ["calcul", "chunks", "navigation", "conditions", "loops", "agents"];
const TASK_KEYS = ["id", "family", "phrase", "object", "stack", "events", "expect", "notes"];
// Les clés propres à chaque forme d'attente : tout le reste est refusé.
const EXPECT_FIELDS: Record<string, string[]> = {
  fieldEquals: ["card", "field", "value"],
  fieldContains: ["card", "field", "text"],
  fieldEmpty: ["card", "field"],
  cardIs: ["name"],
  partExists: ["card", "part", "name"], // `part` vaut "field" ou "button"
  partCount: ["card", "count"], // `count` est un entier ≥ 0
  agentSaid: ["card", "contains"],
  messageSent: ["to", "contains"],
  noError: [],
};

function isRecord(value: unknown): value is Record_ {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function knownKeys(value: Record_, allowed: string[], path: string, errors: string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${path}.${key}: unknown key`);
  }
}

/** Champ texte obligatoire et non vide. */
function text(raw: Record_, key: string, path: string, errors: string[]): string {
  const value = raw[key];
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${path}.${key}: expected non-empty text`);
    return "";
  }
  return value;
}

/** Contrôle une attente : forme connue, clés exactes, valeurs du bon type. */
function checkExpectation(raw: unknown, path: string, errors: string[]): void {
  if (!isRecord(raw)) {
    errors.push(`${path}: expected an object`);
    return;
  }
  const keys = EXPECT_FIELDS[String(raw.kind)];
  if (!keys) {
    errors.push(`${path}.kind: unknown expectation`);
    return;
  }
  knownKeys(raw, ["kind", ...keys], path, errors);
  // `part` et `count` ne sont pas des textes : ils sont contrôlés juste après.
  for (const key of keys.filter((item) => item !== "part" && item !== "count")) text(raw, key, path, errors);
  if (raw.kind === "partExists" && raw.part !== "field" && raw.part !== "button") errors.push(`${path}.part: expected "field" or "button"`);
  if (raw.kind === "partCount" && (typeof raw.count !== "number" || !Number.isInteger(raw.count) || raw.count < 0)) {
    errors.push(`${path}.count: expected a whole number from 0`);
  }
}

/** Un événement fait une seule chose : cliquer, taper, ou parler à l'agent. */
function checkEvent(raw: unknown, path: string, errors: string[]): void {
  if (!isRecord(raw)) {
    errors.push(`${path}: expected an object`);
    return;
  }
  knownKeys(raw, ["click", "type", "chat"], path, errors);
  const actions = ["click", "type", "chat"].filter((key) => raw[key] !== undefined);
  if (actions.length !== 1) {
    errors.push(`${path}: expected exactly one of click, type, chat`);
    return;
  }
  const name = actions[0];
  if (name === "type") {
    if (!isRecord(raw.type)) {
      errors.push(`${path}.type: expected an object`);
      return;
    }
    knownKeys(raw.type, ["field", "text"], `${path}.type`, errors);
    text(raw.type, "field", `${path}.type`, errors);
    text(raw.type, "text", `${path}.type`, errors);
    return;
  }
  text(raw, name, path, errors);
}

/** L'objet cible « Carte/Partie » doit désigner une carte et un élément réels. */
function checkObjectTarget(object: string, stack: Stack, path: string, errors: string[]): void {
  const slash = object.indexOf("/");
  if (slash <= 0 || slash === object.length - 1) {
    errors.push(`${path}: expected "Card/Part"`);
    return;
  }
  const card = findCard(stack, byName(object.slice(0, slash)));
  if (!card) {
    errors.push(`${path}: no card named "${object.slice(0, slash)}"`);
    return;
  }
  if (!findPart(stack, card.id, byName(object.slice(slash + 1)))) {
    errors.push(`${path}: no part named "${object.slice(slash + 1)}" on card "${card.name}"`);
  }
}

/** Valide une tâche déjà désérialisée. Ne lève jamais d'exception. */
export function validateTask(json: unknown): TaskValidation {
  const errors: string[] = [];
  if (!isRecord(json)) return { ok: false, errors: ["the task is not a JSON object"] };
  knownKeys(json, TASK_KEYS, "task", errors);
  const id = text(json, "id", "task", errors);
  const phrase = text(json, "phrase", "task", errors);
  const object = text(json, "object", "task", errors);
  if (typeof json.family !== "string" || !FAMILIES.includes(json.family)) errors.push("task.family: unknown family");
  if (phrase.length > 0 && phrase.length < 20) errors.push("task.phrase: shorter than 20 characters");
  if (json.notes !== undefined && typeof json.notes !== "string") errors.push("task.notes: expected text");
  if (!Array.isArray(json.events) || json.events.length === 0) {
    errors.push("task.events: expected a non-empty list");
  } else {
    json.events.forEach((item, index) => checkEvent(item, `task.events[${index}]`, errors));
  }
  if (!Array.isArray(json.expect) || json.expect.length === 0) {
    errors.push("task.expect: expected a non-empty list");
  } else {
    json.expect.forEach((item, index) => checkExpectation(item, `task.expect[${index}]`, errors));
  }
  const parsed = validateStack(json.stack);
  if (!parsed.ok) errors.push(...parsed.errors.map((error) => `stack: ${error}`));
  else checkObjectTarget(object, parsed.stack, "task.object", errors);
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    task: {
      id,
      family: json.family as EvalTask["family"],
      phrase,
      object,
      stack: json.stack,
      events: json.events as EvalTask["events"],
      expect: json.expect as Expectation[],
      notes: json.notes as string | undefined,
    },
  };
}
