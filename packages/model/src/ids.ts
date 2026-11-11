/**
 * Désignation des objets : par nom, par rang ou par identifiant (7.1).
 * Un champ de fond est cherché d'abord parmi les éléments propres de la carte,
 * puis parmi ceux du fond — c'est ce qui rend `field "Mood"` naturel à écrire.
 */

import type { Background, Card, Part, Stack } from "./types";

export type Ref = { kind: "name" | "index" | "id"; value: string | number };

/** Construit les trois formes de référence, pour éviter de les écrire partout. */
export const byName = (value: string): Ref => ({ kind: "name", value });
export const byIndex = (value: number): Ref => ({ kind: "index", value });
export const byId = (value: number): Ref => ({ kind: "id", value });

function indexFrom(value: string | number, total: number): number {
  const raw = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(raw)) return -1;
  return raw < 0 ? total + raw + 1 : raw;
}

export function findBackground(stack: Stack, ref: Ref): Background | undefined {
  return pick(stack.backgrounds, ref);
}

export function findCard(stack: Stack, ref: Ref): Card | undefined {
  return pick(stack.cards, ref);
}

function pick<T extends { id: number; name: string }>(items: T[], ref: Ref): T | undefined {
  if (ref.kind === "id") {
    const id = Number(ref.value);
    return items.find((item) => item.id === id);
  }
  if (ref.kind === "name") {
    const wanted = String(ref.value).toLowerCase();
    return items.find((item) => item.name.toLowerCase() === wanted);
  }
  const position = indexFrom(ref.value, items.length);
  return position >= 1 && position <= items.length ? items[position - 1] : undefined;
}

export type FoundPart = { part: Part; fromBackground: boolean };

/** Cherche un élément sur une carte : d'abord les siens, puis ceux de son fond. */
export function findPart(stack: Stack, cardId: number, ref: Ref): FoundPart | undefined {
  const card = stack.cards.find((item) => item.id === cardId);
  if (!card) return undefined;
  const own = pick(card.parts, ref);
  if (own) return { part: own, fromBackground: false };
  const background = stack.backgrounds.find((item) => item.id === card.background);
  const shared = background ? pick(background.parts, ref) : undefined;
  return shared ? { part: shared, fromBackground: true } : undefined;
}

/** Contenu d'un champ de la carte, en tenant compte des champs de fond. */
export function readFieldText(stack: Stack, card: Card, part: Part): string {
  if (part.kind !== "field") return "";
  const background = stack.backgrounds.find((item) => item.id === card.background);
  const fromBackground = background?.parts.some((item) => item.id === part.id) ?? false;
  if (fromBackground) return card.content[String(part.id)] ?? "";
  return part.text;
}

export function cardNames(stack: Stack): string[] {
  return stack.cards.map((card) => card.name);
}

/** Tous les identifiants en usage : pile, fonds, cartes, éléments. */
export function usedIds(stack: Stack): number[] {
  const ids: number[] = [];
  for (const background of stack.backgrounds) {
    ids.push(background.id, ...background.parts.map((part) => part.id));
  }
  for (const card of stack.cards) {
    ids.push(card.id, ...card.parts.map((part) => part.id));
  }
  return ids;
}

/**
 * Vérifie les deux invariants d'identité : aucun doublon, et aucun identifiant
 * déjà alloué qui réapparaîtrait (CAR-P-10). Rend la liste des problèmes.
 */
export function assertIdsUnique(stack: Stack): string[] {
  const problems: string[] = [];
  const seen = new Set<number>();
  for (const id of usedIds(stack)) {
    if (seen.has(id)) problems.push(`duplicate id ${id}`);
    seen.add(id);
  }
  if (seen.size > 0 && Math.max(...seen) >= stack.nextId) {
    problems.push(`nextId ${stack.nextId} is not above the highest used id`);
  }
  return problems;
}
