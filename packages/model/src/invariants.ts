/**
 * Invariants structurels du modèle : ce qui doit rester vrai **après toute
 * suite d'opérations**, quelle qu'elle soit (CAR-P-10, CAR-P-18).
 *
 * Ces invariants sont le filet des régressions futures : ils ne disent pas ce
 * qu'une opération fait, ils disent ce qu'aucune suite ne doit casser. Un
 * `applyOp` maladroit, un `migrate` incomplet ou une fabrique distraite les
 * font tousser immédiatement — c'est moins cher qu'un fichier exporté que plus
 * personne ne peut relire.
 *
 * Trois familles, toutes vérifiables sur la seule pile :
 * - identité : identifiants uniques, `nextId` au-dessus de tout identifiant en
 *   usage (donc jamais réutilisé, même après suppression) ;
 * - références : un fond cité existe, le contenu et l'encre d'une carte ne
 *   désignent que des champs de son fond, la carte affichée existe ;
 * - verrou : un champ verrouillé ne change pas par une écriture d'agent ou
 *   d'humain (CAR-F-06). Celui-là est relationnel — il faut l'avant et
 *   l'après — d'où `checkLockedHeld`, la seconde fonction, que la propriété
 *   appelle avec `checkInvariants`.
 *
 * Paquet **pur** : ni horloge, ni graine, ni effets.
 */

import type { Card, Part, Stack } from "./types";

/** Tous les éléments de la pile, fonds puis cartes. */
function allParts(stack: Stack): Part[] {
  return [...stack.backgrounds.flatMap((background) => background.parts), ...stack.cards.flatMap((card) => card.parts)];
}

/** Tous les identifiants en usage : fonds, cartes, éléments. */
export function usedModelIds(stack: Stack): number[] {
  const ids: number[] = [];
  for (const background of stack.backgrounds) ids.push(background.id, ...background.parts.map((part) => part.id));
  for (const card of stack.cards) ids.push(card.id, ...card.parts.map((part) => part.id));
  return ids;
}

/** Aucun identifiant en double : un identifiant désigne un objet, une fois. */
function checkUniqueIds(stack: Stack, errors: string[]): void {
  const seen = new Set<number>();
  const reported = new Set<number>();
  for (const id of usedModelIds(stack)) {
    if (seen.has(id) && !reported.has(id)) {
      errors.push(`duplicate id ${id}`);
      reported.add(id);
    }
    seen.add(id);
  }
}

/** `nextId` reste strictement au-dessus de tout identifiant : aucun réemploi. */
function checkNextId(stack: Stack, errors: string[]): void {
  if (!Number.isInteger(stack.nextId) || stack.nextId < 1) {
    errors.push("nextId is not a positive integer");
    return;
  }
  const highest = usedModelIds(stack).reduce((max, id) => Math.max(max, id), 0);
  if (highest >= stack.nextId) {
    errors.push(`nextId ${stack.nextId} is not above the highest used id ${highest}`);
  }
}

/** Un champ de la carte : le sien, ou celui de son fond. */
function fieldOf(stack: Stack, card: Card, partId: number): Part | undefined {
  const own = card.parts.find((part) => part.id === partId);
  if (own !== undefined) return own;
  return stack.backgrounds.find((background) => background.id === card.background)?.parts.find((part) => part.id === partId);
}

/** Le contenu et l'encre ne désignent que des champs réellement présents. */
function checkCardReferences(stack: Stack, card: Card, errors: string[]): void {
  for (const key of Object.keys(card.content)) {
    if (fieldOf(stack, card, Number(key)) === undefined) {
      errors.push(`card ${card.id} has content for a missing field ${key}`);
    }
  }
  for (const key of Object.keys(card.ink)) {
    const part = fieldOf(stack, card, Number(key));
    if (part === undefined || part.kind !== "field") {
      errors.push(`card ${card.id} has an ink mark for a missing field ${key}`);
    }
  }
}

/** Fonds cités et carte affichée : deux références qui doivent tenir. */
function checkReferences(stack: Stack, errors: string[]): void {
  const backgrounds = new Set(stack.backgrounds.map((background) => background.id));
  for (const card of stack.cards) {
    if (card.background !== null && !backgrounds.has(card.background)) {
      errors.push(`card ${card.id} references a missing background ${card.background}`);
    }
    checkCardReferences(stack, card, errors);
  }
  if (stack.currentCardId !== null && !stack.cards.some((card) => card.id === stack.currentCardId)) {
    errors.push(`the current card ${stack.currentCardId} does not exist`);
  }
}

/** Toutes les violations observables ; une pile saine rend une liste vide. */
export function checkInvariants(stack: Stack): string[] {
  const errors: string[] = [];
  checkUniqueIds(stack, errors);
  checkNextId(stack, errors);
  checkReferences(stack, errors);
  return errors;
}

/** Texte effectif d'un champ : `card.content` pour un champ de fond, sinon `part.text`. */
function effectiveText(stack: Stack, card: Card, partId: number): string {
  const background = stack.backgrounds.find((item) => item.id === card.background);
  if (background?.parts.some((part) => part.id === partId) === true) return card.content[String(partId)] ?? "";
  const own = card.parts.find((part) => part.id === partId);
  return own !== undefined && own.kind === "field" ? own.text : "";
}

/** Champs verrouillés d'une carte, par identifiant. */
function lockedFields(stack: Stack, card: Card): Map<number, string> {
  const locked = new Map<number, string>();
  for (const part of [...card.parts, ...(stack.backgrounds.find((item) => item.id === card.background)?.parts ?? [])]) {
    if (part.kind === "field" && part.locked) locked.set(part.id, effectiveText(stack, card, part.id));
  }
  return locked;
}

/**
 * Le verrou a-t-il tenu ? Un champ verrouillé garde son texte, sauf si un
 * script a écrit (CAR-F-06) : c'est la seule écriture que le verrou n'arrête
 * pas. À appeler avec la pile d'avant et celle d'après une opération.
 */
export function checkLockedHeld(before: Stack, after: Stack, actorKind: "human" | "script" | "agent"): string[] {
  if (actorKind === "script") return [];
  const errors: string[] = [];
  for (const card of before.cards) {
    const previous = lockedFields(before, card);
    const next = after.cards.find((item) => item.id === card.id);
    if (next === undefined) continue;
    for (const [partId, text] of previous) {
      const now = effectiveText(after, next, partId);
      if (now !== text) errors.push(`locked field ${partId} of card ${card.id} was written by a ${actorKind}`);
    }
  }
  return errors;
}

/** Identifiants des champs verrouillés d'une carte, dans l'ordre : aide aux tests. */
export function lockedFieldIds(stack: Stack, cardId: number): number[] {
  const card = stack.cards.find((item) => item.id === cardId);
  if (card === undefined) return [];
  return [...lockedFields(stack, card).keys()].sort((left, right) => left - right);
}
