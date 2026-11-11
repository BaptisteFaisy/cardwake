/**
 * Validation du format de pile `cardwake/1`.
 *
 * Écrite à la main plutôt qu'avec une bibliothèque de schémas : le format est
 * petit, les messages d'erreur doivent citer le chemin exact en anglais, et
 * aucune dépendance ne s'impose pour un contrôle qui tourne aussi dans la CI.
 * Une pile reçue est considérée comme hostile jusqu'ici (7.10) : tout ce qui
 * n'est pas reconnu est refusé, rien n'est deviné.
 */

import type { Agent, AgentLevel, Background, Card, Part, Provenance, Rect, Stack } from "./types";
import { APP_LIMITS, clampSettings, type StackSettings } from "./limits";

export type Validation = { ok: true; stack: Stack } | { ok: false; errors: string[] };

type Record_ = Record<string, unknown>;

function isRecord(value: unknown): value is Record_ {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function knownKeys(value: Record_, allowed: string[], path: string, errors: string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${path}.${key}: unknown key`);
  }
}

function str(value: Record_, key: string, path: string, errors: string[], max: number, optional = false): string {
  const raw = value[key];
  if (raw === undefined) {
    if (!optional) errors.push(`${path}.${key}: missing`);
    return "";
  }
  if (typeof raw !== "string") {
    errors.push(`${path}.${key}: expected text`);
    return "";
  }
  if (raw.length > max) errors.push(`${path}.${key}: longer than ${max} characters`);
  return raw;
}

function bool(value: Record_, key: string, path: string, errors: string[], fallback: boolean): boolean {
  const raw = value[key];
  if (raw === undefined) return fallback;
  if (typeof raw !== "boolean") {
    errors.push(`${path}.${key}: expected true or false`);
    return fallback;
  }
  return raw;
}

function int(value: Record_, key: string, path: string, errors: string[]): number {
  const raw = value[key];
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    errors.push(`${path}.${key}: expected a whole number`);
    return 0;
  }
  return raw;
}

function rect(value: unknown, path: string, errors: string[]): Rect {
  if (!Array.isArray(value) || value.length !== 4 || value.some((n) => typeof n !== "number")) {
    errors.push(`${path}.rect: expected four numbers [x, y, width, height]`);
    return [0, 0, 0, 0];
  }
  return [value[0], value[1], value[2], value[3]] as Rect;
}

const PART_KEYS = ["id", "kind", "name", "rect", "visible", "style", "script", "text", "locked", "multiline", "label", "enabled", "hilite"];
const FIELD_KEYS = ["id", "kind", "name", "rect", "visible", "style", "script", "text", "locked", "multiline"];
const BUTTON_KEYS = ["id", "kind", "name", "rect", "visible", "style", "script", "label", "enabled", "hilite"];

function parsePart(raw: unknown, path: string, errors: string[]): Part | null {
  if (!isRecord(raw)) {
    errors.push(`${path}: expected an object`);
    return null;
  }
  knownKeys(raw, PART_KEYS, path, errors);
  const id = int(raw, "id", path, errors);
  const name = str(raw, "name", path, errors, 200);
  const box = rect(raw.rect, path, errors);
  const visible = bool(raw, "visible", path, errors, true);
  const style = str(raw, "style", path, errors, 40) || "plain";
  const script = str(raw, "script", path, errors, APP_LIMITS.maxScriptChars);
  if (raw.kind === "field") {
    knownKeys(raw, FIELD_KEYS, path, errors);
    return {
      id, kind: "field", name, rect: box, visible, style, script,
      text: str(raw, "text", path, errors, APP_LIMITS.maxFieldChars),
      locked: bool(raw, "locked", path, errors, false),
      multiline: bool(raw, "multiline", path, errors, false),
    };
  }
  if (raw.kind === "button") {
    knownKeys(raw, BUTTON_KEYS, path, errors);
    return {
      id, kind: "button", name, rect: box, visible, style, script,
      label: str(raw, "label", path, errors, 200) || name,
      enabled: bool(raw, "enabled", path, errors, true),
      hilite: bool(raw, "hilite", path, errors, false),
    };
  }
  errors.push(`${path}.kind: expected "field" or "button"`);
  return null;
}

function parseAgent(raw: unknown, path: string, errors: string[]): Agent | null {
  if (raw === null || raw === undefined) return null;
  if (!isRecord(raw)) {
    errors.push(`${path}.agent: expected an object or null`);
    return null;
  }
  knownKeys(raw, ["awake", "level", "speed", "persona"], `${path}.agent`, errors);
  const level = int(raw, "level", `${path}.agent`, errors);
  if (level < APP_LIMITS.agentLevelMin || level > APP_LIMITS.agentLevelMax) {
    errors.push(`${path}.agent.level: expected a level from 1 to 5`);
  }
  const speedText = str(raw, "speed", `${path}.agent`, errors, 10) || "fast";
  if (speedText !== "fast" && speedText !== "careful") {
    errors.push(`${path}.agent.speed: expected "fast" or "careful"`);
  }
  const speed: Agent["speed"] = speedText === "careful" ? "careful" : "fast";
  return {
    awake: bool(raw, "awake", `${path}.agent`, errors, false),
    level: level as AgentLevel,
    speed,
    persona: str(raw, "persona", `${path}.agent`, errors, APP_LIMITS.maxPersonaChars),
  };
}

function parseContent(raw: unknown, path: string, errors: string[], limit: number): Record<string, string> {
  if (raw === undefined) return {};
  if (!isRecord(raw)) {
    errors.push(`${path}.content: expected an object keyed by part id`);
    return {};
  }
  const content: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") {
      errors.push(`${path}.content.${key}: expected text`);
      continue;
    }
    if (value.length > limit) errors.push(`${path}.content.${key}: longer than ${limit} characters`);
    content[key] = value;
  }
  return content;
}

function parseInk(raw: unknown, path: string, errors: string[]): Record<string, number> {
  if (raw === undefined) return {};
  if (!isRecord(raw)) {
    errors.push(`${path}.ink: expected an object keyed by part id`);
    return {};
  }
  const ink: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "number") {
      errors.push(`${path}.ink.${key}: expected a transaction number`);
      continue;
    }
    ink[key] = value;
  }
  return ink;
}

function parseParts(raw: unknown, path: string, errors: string[]): Part[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    errors.push(`${path}.parts: expected a list`);
    return [];
  }
  if (raw.length > APP_LIMITS.maxPartsPerCard) {
    errors.push(`${path}.parts: more than ${APP_LIMITS.maxPartsPerCard} parts`);
  }
  const parts: Part[] = [];
  raw.forEach((item, index) => {
    const part = parsePart(item, `${path}.parts[${index}]`, errors);
    if (part) parts.push(part);
  });
  return parts;
}

function parseBackground(raw: unknown, index: number, errors: string[]): Background | null {
  const path = `backgrounds[${index}]`;
  if (!isRecord(raw)) {
    errors.push(`${path}: expected an object`);
    return null;
  }
  knownKeys(raw, ["id", "name", "persona", "script", "parts"], path, errors);
  return {
    id: int(raw, "id", path, errors),
    name: str(raw, "name", path, errors, 200),
    persona: str(raw, "persona", path, errors, APP_LIMITS.maxPersonaChars),
    script: str(raw, "script", path, errors, APP_LIMITS.maxScriptChars),
    parts: parseParts(raw.parts, path, errors),
  };
}

function parseCard(raw: unknown, index: number, errors: string[]): Card | null {
  const path = `cards[${index}]`;
  if (!isRecord(raw)) {
    errors.push(`${path}: expected an object`);
    return null;
  }
  knownKeys(raw, ["id", "name", "background", "content", "agent", "script", "parts", "ink"], path, errors);
  const background = raw.background === null || raw.background === undefined ? null : int(raw, "background", path, errors);
  return {
    id: int(raw, "id", path, errors),
    name: str(raw, "name", path, errors, 200),
    background,
    content: parseContent(raw.content, path, errors, APP_LIMITS.maxFieldChars),
    agent: parseAgent(raw.agent, path, errors),
    script: str(raw, "script", path, errors, APP_LIMITS.maxScriptChars),
    parts: parseParts(raw.parts, path, errors),
    ink: parseInk(raw.ink, path, errors),
  };
}

function parseProvenance(raw: unknown, errors: string[]): Provenance {
  if (raw === undefined) return { kind: "created" };
  if (!isRecord(raw) || (raw.kind !== "created" && raw.kind !== "received")) {
    errors.push('provenance: expected {"kind":"created"} or {"kind":"received","trusted":…,"receivedAt":…}');
    return { kind: "created" };
  }
  if (raw.kind === "created") return { kind: "created" };
  return {
    kind: "received",
    trusted: bool(raw, "trusted", "provenance", errors, false),
    receivedAt: str(raw, "receivedAt", "provenance", errors, 40),
  };
}

/** Contrôle les références croisées : fonds, carte affichée, contenu des champs. */
function crossCheck(stack: Stack, errors: string[]): void {
  const backgrounds = new Set(stack.backgrounds.map((item) => item.id));
  for (const card of stack.cards) {
    if (card.background !== null && !backgrounds.has(card.background)) {
      errors.push(`cards[${card.name}].background: no background with id ${card.background}`);
    }
    const background = stack.backgrounds.find((item) => item.id === card.background);
    for (const key of Object.keys(card.content)) {
      if (!background?.parts.some((part) => String(part.id) === key)) {
        errors.push(`cards[${card.name}].content.${key}: not a field of its background`);
      }
    }
  }
  if (stack.currentCardId !== null && !stack.cards.some((card) => card.id === stack.currentCardId)) {
    errors.push("currentCardId: no card with that id");
  }
}

/** Valide un objet déjà désérialisé. Ne lève jamais d'exception. */
export function validateStack(json: unknown): Validation {
  const errors: string[] = [];
  if (!isRecord(json)) return { ok: false, errors: ["the file is not a JSON object"] };
  knownKeys(json, ["format", "name", "persona", "settings", "backgrounds", "cards", "script", "provenance", "nextId", "currentCardId"], "stack", errors);
  if (json.format !== "cardwake/1") {
    errors.push(`stack.format: expected "cardwake/1", found ${JSON.stringify(json.format)}`);
  }
  const cards: Card[] = [];
  if (Array.isArray(json.cards)) {
    if (json.cards.length > APP_LIMITS.maxCardsPerStack) {
      errors.push(`cards: more than ${APP_LIMITS.maxCardsPerStack} cards`);
    }
    json.cards.forEach((raw, index) => {
      const card = parseCard(raw, index, errors);
      if (card) cards.push(card);
    });
  } else if (json.cards !== undefined) {
    errors.push("cards: expected a list");
  }
  const backgrounds: Background[] = [];
  if (Array.isArray(json.backgrounds)) {
    json.backgrounds.forEach((raw, index) => {
      const background = parseBackground(raw, index, errors);
      if (background) backgrounds.push(background);
    });
  } else if (json.backgrounds !== undefined) {
    errors.push("backgrounds: expected a list");
  }
  const stack: Stack = {
    format: "cardwake/1",
    name: str(json, "name", "stack", errors, 200),
    persona: str(json, "persona", "stack", errors, APP_LIMITS.maxPersonaChars),
    settings: clampSettings(isRecord(json.settings) ? (json.settings as Partial<StackSettings>) : undefined),
    backgrounds,
    cards,
    script: str(json, "script", "stack", errors, APP_LIMITS.maxScriptChars),
    provenance: parseProvenance(json.provenance, errors),
    nextId: json.nextId === undefined ? 1 : int(json, "nextId", "stack", errors),
    currentCardId: json.currentCardId === null || json.currentCardId === undefined ? null : int(json, "currentCardId", "stack", errors),
  };
  crossCheck(stack, errors);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, stack };
}
