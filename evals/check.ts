/**
 * Vérificateur du jeu d'évaluation : il juge la pile finale, jamais le texte
 * du script (7.7). Réutilise `findCard`, `findPart` et `readFieldText` de
 * `@cardwake/model` : une attente ne regarde que ce que l'auteur verrait à
 * l'écran, avec les mêmes règles de désignation que le langage (noms
 * insensibles à la casse, champs de fond inclus).
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { byId, byName, findCard, findPart, readFieldText, type Card, type Stack } from "@cardwake/model";
import { validateTask, type EvalTask, type Expectation } from "./schema";

export type CheckResult = { ok: boolean; failures: string[] };
export type LoadedTasks = { ok: true; tasks: EvalTask[] } | { ok: false; errors: string[] };

function backgroundOf(stack: Stack, card: Card) {
  return stack.backgrounds.find((item) => item.id === card.background);
}

/** Texte d'un champ nommé sur une carte nommée ; null si introuvable. */
function fieldText(stack: Stack, cardName: string, fieldName: string, failures: string[]): string | null {
  const card = findCard(stack, byName(cardName));
  if (!card) {
    failures.push(`no card named "${cardName}"`);
    return null;
  }
  const found = findPart(stack, card.id, byName(fieldName));
  if (!found || found.part.kind !== "field") {
    failures.push(`no field named "${fieldName}" on card "${cardName}"`);
    return null;
  }
  return readFieldText(stack, card, found.part);
}

/** Vrai si un champ quelconque de la carte contient le texte (sans casse). */
function cardHasText(stack: Stack, cardName: string, wanted: string): boolean {
  const card = findCard(stack, byName(cardName));
  if (!card) return false;
  const parts = [...card.parts, ...(backgroundOf(stack, card)?.parts ?? [])];
  return parts.some(
    (part) => part.kind === "field" && readFieldText(stack, card, part).toLowerCase().includes(wanted.toLowerCase()),
  );
}

/** Nombre d'éléments d'une carte : les siens plus ceux de son fond. */
function countParts(stack: Stack, cardName: string): number | null {
  const card = findCard(stack, byName(cardName));
  if (!card) return null;
  return card.parts.length + (backgroundOf(stack, card)?.parts.length ?? 0);
}

/** Les attentes qui portent sur le texte d'un champ nommé. */
function judgeField(expect: Expectation, stack: Stack, failures: string[]): void {
  if (expect.kind !== "fieldEquals" && expect.kind !== "fieldContains" && expect.kind !== "fieldEmpty") return;
  const text = fieldText(stack, expect.card, expect.field, failures);
  if (text === null) return;
  if (expect.kind === "fieldEquals" && text !== expect.value) {
    failures.push(`field "${expect.field}" of card "${expect.card}" is ${JSON.stringify(text)}, expected ${JSON.stringify(expect.value)}`);
  }
  if (expect.kind === "fieldContains" && !text.toLowerCase().includes(expect.text.toLowerCase())) {
    failures.push(`field "${expect.field}" of card "${expect.card}" does not contain ${JSON.stringify(expect.text)}`);
  }
  if (expect.kind === "fieldEmpty" && text !== "") {
    failures.push(`field "${expect.field}" of card "${expect.card}" is ${JSON.stringify(text)}, expected empty`);
  }
}

/** Évalue une attente ; pousse une phrase d'échec en anglais le cas échéant. */
function judge(expect: Expectation, stack: Stack, failures: string[]): void {
  switch (expect.kind) {
    case "fieldEquals":
    case "fieldContains":
    case "fieldEmpty":
      judgeField(expect, stack, failures);
      return;
    case "cardIs": {
      const card = findCard(stack, byId(stack.currentCardId ?? -1));
      if (!card || card.name.toLowerCase() !== expect.name.toLowerCase()) {
        failures.push(`the card shown is "${card?.name ?? "none"}", expected "${expect.name}"`);
      }
      return;
    }
    case "partExists": {
      const card = findCard(stack, byName(expect.card));
      const found = card ? findPart(stack, card.id, byName(expect.name)) : undefined;
      if (!found || found.part.kind !== expect.part) {
        failures.push(`no ${expect.part} named "${expect.name}" on card "${expect.card}"`);
      }
      return;
    }
    case "partCount": {
      const count = countParts(stack, expect.card);
      if (count === null) failures.push(`no card named "${expect.card}"`);
      else if (count !== expect.count) failures.push(`card "${expect.card}" has ${count} part(s), expected ${expect.count}`);
      return;
    }
    case "agentSaid":
      if (!cardHasText(stack, expect.card, expect.contains)) {
        failures.push(`no field of card "${expect.card}" contains what the agent said: ${JSON.stringify(expect.contains)}`);
      }
      return;
    case "messageSent":
      if (!cardHasText(stack, expect.to, expect.contains)) {
        failures.push(`no field of card "${expect.to}" shows the message sent: ${JSON.stringify(expect.contains)}`);
      }
      return;
    case "noError":
      // Une erreur d'exécution ne se voit pas dans une pile finale : c'est le
      // lanceur du jeu qui la constate et échoue la tâche avant `checkTask`.
      return;
  }
}

/** Évalue toutes les attentes d'une tâche sur la pile finale. */
export function checkTask(task: EvalTask, stack: Stack): CheckResult {
  const failures: string[] = [];
  for (const expect of task.expect) judge(expect, stack, failures);
  return { ok: failures.length === 0, failures };
}

/** Lit un dossier de tâches, valide chaque fichier, rend la liste triée par id. */
export function loadTasks(dir: string): LoadedTasks {
  const errors: string[] = [];
  const tasks: EvalTask[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(join(dir, file), "utf8"));
    } catch {
      errors.push(`${file}: not valid JSON`);
      continue;
    }
    const parsed = validateTask(json);
    if (parsed.ok) tasks.push(parsed.task);
    else errors.push(...parsed.errors.map((error) => `${file}: ${error}`));
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, tasks: tasks.sort((first, second) => first.id.localeCompare(second.id)) };
}
