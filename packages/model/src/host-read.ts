/**
 * Lecture du monde pour le pont `ModelHost` (lot C4a).
 *
 * Ce module résout les désignations du langage (`me`, `the target`, `this card`,
 * `card "Nom"`, `card 3`, `card id 7`, `next`/`previous`/`first`/`last`,
 * `field`/`button` par nom, rang ou identifiant) en identifiants internes, et
 * lit textes et propriétés. Toute référence introuvable rend un `ScriptError`
 * lisible en anglais (objet + piste) — jamais d'exception (CAR-F-15).
 *
 * Paquet **pur** : ni `Date.now`, ni `Math.random`, ni navigateur.
 */

import type { CardRef, Expr, ObjRef, PropName, RefBy, ScriptError } from "@cardwake/lang";
import { referenceError } from "@cardwake/lang";
import type { ResolvedRef } from "@cardwake/lang";
import type { Card, Part, Stack } from "./types";
import { byId, byIndex, byName, findCard, readFieldText } from "./ids";
import type { Ref } from "./ids";

/** Un élément localisé : sa carte, son fond le cas échéant, son origine. */
export type LocatedPart = {
  part: Part;
  cardId: number;
  /** Identifiant du fond si l'élément vient du fond partagé. */
  backgroundId?: number;
  fromBackground: boolean;
};

/** Évalue une expression littérale (nombre, chaîne, négation, parenthèse). */
function literalOf(expr: Expr): string | number | undefined {
  switch (expr.kind) {
    case "num":
      return expr.value;
    case "str":
      return expr.value;
    case "empty":
      return "";
    case "neg": {
      const inner = literalOf(expr.operand);
      return typeof inner === "number" ? -inner : undefined;
    }
    case "paren":
      return literalOf(expr.inner);
    default:
      return undefined;
  }
}

/** Construit la `Ref` du modèle depuis une désignation du langage. */
function refOf(by: RefBy): Ref | ScriptError {
  if (by.kind === "name") return byName(by.name);
  const value = literalOf(by.kind === "id" ? by.id : by.index);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return referenceError(by.span, `The ${by.kind} here must be a whole number.`, undefined, "Write a number, a card name in quotes, or an id.");
  }
  return by.kind === "id" ? byId(value) : byIndex(value);
}

function cardById(stack: Stack, id: number): Card | undefined {
  return stack.cards.find((card) => card.id === id);
}

/** Carte voisine dans l'ordre de la pile, en bouclant (next/previous). */
function neighbour(stack: Stack, from: number, delta: number): number | undefined {
  const total = stack.cards.length;
  if (total === 0) return undefined;
  const at = stack.cards.findIndex((card) => card.id === from);
  const base = at < 0 ? 0 : at;
  return stack.cards[(base + delta + total) % total]?.id;
}

/** Résout une référence de carte en identifiant, ou rend une erreur lisible. */
export function resolveCardRef(stack: Stack, fallback: number, ref: CardRef): number | ScriptError {
  const displayed = stack.currentCardId ?? fallback;
  if (ref.kind === "this") return displayed;
  if (ref.kind === "next") return neighbour(stack, displayed, 1) ?? missingCard(ref, "the next card");
  if (ref.kind === "previous") return neighbour(stack, displayed, -1) ?? missingCard(ref, "the previous card");
  if (ref.kind === "first") return stack.cards[0]?.id ?? missingCard(ref, "the first card");
  if (ref.kind === "last") return stack.cards[stack.cards.length - 1]?.id ?? missingCard(ref, "the last card");
  // Garde explicite : au-delà des cinq formes relatives, il ne reste que `card`.
  if (ref.kind !== "card") return missingCard(ref, "that card");
  const by = refOf(ref.by);
  if (typeof by !== "object" || "category" in by) return by as ScriptError;
  const card = findCard(stack, by);
  return card ? card.id : missingCard(ref, describeBy(ref.by));
}

function missingCard(ref: CardRef, what: string): ScriptError {
  return referenceError(ref.span, `There is no ${what} in this stack.`, what, "Check the card name, its number or its id.");
}

function describeBy(by: RefBy): string {
  if (by.kind === "name") return `card named "${by.name}"`;
  return `card ${by.kind} ${literalOf(by.kind === "id" ? by.id : by.index) ?? "?"}`;
}

/** Cherche un élément d'un type donné sur une carte : d'abord les siens, puis son fond. */
function locatePartByKind(stack: Stack, cardId: number, partKind: "field" | "button", by: RefBy): LocatedPart | undefined {
  const card = cardById(stack, cardId);
  if (!card) return undefined;
  const ref = refOf(by);
  if (typeof ref === "object" && "category" in ref) return undefined;
  const own = card.parts.filter((part) => part.kind === partKind);
  const ownFound = pickByRef(own, ref as Ref);
  if (ownFound) return { part: ownFound, cardId, fromBackground: false };
  const background = stack.backgrounds.find((item) => item.id === card.background);
  if (!background) return undefined;
  const shared = pickByRef(background.parts.filter((part) => part.kind === partKind), ref as Ref);
  if (!shared) return undefined;
  return { part: shared, cardId, backgroundId: background.id, fromBackground: true };
}

/** Sélectionne un élément par nom, rang (1-based, négatif depuis la fin) ou identifiant. */
function pickByRef(parts: Part[], ref: Ref): Part | undefined {
  if (ref.kind === "id") return parts.find((part) => part.id === Number(ref.value));
  if (ref.kind === "name") {
    const wanted = String(ref.value).toLowerCase();
    return parts.find((part) => part.name.toLowerCase() === wanted);
  }
  const raw = Number(ref.value);
  if (!Number.isFinite(raw)) return undefined;
  const position = raw < 0 ? parts.length + raw + 1 : raw;
  return position >= 1 && position <= parts.length ? parts[position - 1] : undefined;
}

/** Résout une désignation d'objet du langage en `ResolvedRef`, ou rend une erreur. */
export function resolveObjRef(stack: Stack, cardId: number, ref: ObjRef): ResolvedRef | ScriptError {
  switch (ref.kind) {
    case "me":
    case "target":
      return { kind: "card", id: cardId };
    case "thisStack":
      return { kind: "stack" };
    case "thisBackground": {
      const background = stack.backgrounds.find((item) => item.id === cardById(stack, cardId)?.background);
      return background ? { kind: "background", id: background.id } : referenceError(ref.span, "This card has no background.", "this background", "Attach the card to a background first.");
    }
    case "card": {
      const id = resolveCardRef(stack, cardId, ref.ref);
      return typeof id === "number" ? { kind: "card", id } : id;
    }
    case "agent": {
      const target = ref.ref.of ? resolveCardRef(stack, cardId, ref.ref.of) : cardId;
      return typeof target === "number" ? { kind: "agent", cardId: target } : target;
    }
    case "part": {
      const host = ref.ref.of ? resolveCardRef(stack, cardId, ref.ref.of) : cardId;
      if (typeof host !== "number") return host;
      const found = locatePartByKind(stack, host, ref.ref.partKind, ref.ref.by);
      if (!found) return referenceError(ref.span, `There is no ${ref.ref.partKind} ${describeBy2(ref.ref.by)} on this card.`, ref.ref.partKind, `Check the ${ref.ref.partKind} name, its number or its id.`);
      return { kind: "part", id: found.part.id, partKind: found.part.kind, cardId: found.cardId };
    }
  }
}

function describeBy2(by: RefBy): string {
  if (by.kind === "name") return `named "${by.name}"`;
  return `${by.kind} ${literalOf(by.kind === "id" ? by.id : by.index) ?? "?"}`;
}

/** Localise un élément déjà résolu (pour l'écriture) : carte, fond, origine. */
export function locatePart(stack: Stack, ref: ResolvedRef): LocatedPart | undefined {
  if (ref.kind !== "part") return undefined;
  const card = cardById(stack, ref.cardId);
  if (!card) return undefined;
  const own = card.parts.find((part) => part.id === ref.id);
  if (own) return { part: own, cardId: card.id, fromBackground: false };
  const background = stack.backgrounds.find((item) => item.id === card.background);
  const shared = background?.parts.find((part) => part.id === ref.id);
  if (!shared || !background) return undefined;
  return { part: shared, cardId: card.id, backgroundId: background.id, fromBackground: true };
}

/** Texte d'un élément résolu : contenu d'un champ, libellé d'un bouton. */
export function readResolvedText(stack: Stack, ref: ResolvedRef): string | ScriptError {
  if (ref.kind === "part") {
    const located = locatePart(stack, ref);
    if (!located) return referenceError(undefined, "There is no such field or button here.", ref.partKind, "Check the object name or id.");
    const card = cardById(stack, located.cardId);
    if (!card) return referenceError(undefined, "There is no such card here.", "card");
    return located.part.kind === "field" ? readFieldText(stack, card, located.part) : located.part.label;
  }
  if (ref.kind === "card") return cardById(stack, ref.id)?.name ?? "";
  if (ref.kind === "background") return stack.backgrounds.find((item) => item.id === ref.id)?.name ?? "";
  return stack.name;
}

/** Propriété d'un élément, lue comme texte. */
function readPartProp(part: Part, prop: PropName): string {
  if (prop === "name") return part.name;
  if (prop === "visible") return String(part.visible);
  if (prop === "style") return part.style;
  if (prop === "rect") return part.rect.join(",");
  if (part.kind === "field") {
    if (prop === "locked") return String(part.locked);
    if (prop === "text") return part.text;
    return "";
  }
  if (prop === "label") return part.label;
  if (prop === "enabled") return String(part.enabled);
  if (prop === "hilite") return String(part.hilite);
  return "";
}

/** Lit une propriété d'un objet résolu (carte, fond, pile, élément). */
export function readResolvedProp(stack: Stack, ref: ResolvedRef, prop: PropName): string | ScriptError {
  if (ref.kind === "part") {
    const located = locatePart(stack, ref);
    if (!located) return referenceError(undefined, "There is no such field or button here.", ref.partKind, "Check the object name or id.");
    if (prop === "text" && located.fromBackground) {
      const card = cardById(stack, located.cardId);
      return card ? readFieldText(stack, card, located.part) : "";
    }
    return readPartProp(located.part, prop);
  }
  if (ref.kind === "card") return prop === "name" ? cardById(stack, ref.id)?.name ?? "" : "";
  if (ref.kind === "background") return prop === "name" ? stack.backgrounds.find((item) => item.id === ref.id)?.name ?? "" : "";
  return prop === "name" ? stack.name : prop === "text" ? stack.persona : "";
}

/** Nom d'un élément, cherché sur toutes les cartes et tous les fonds. */
export function partNameIn(stack: Stack, id: number): string {
  for (const card of stack.cards) {
    const part = card.parts.find((item) => item.id === id);
    if (part) return part.name;
  }
  for (const background of stack.backgrounds) {
    const part = background.parts.find((item) => item.id === id);
    if (part) return part.name;
  }
  return "";
}

/** Cartes dont un champ contient le texte, pour la commande `find`. */
export function findTextCards(stack: Stack, text: string): number[] {
  const needle = text.toLowerCase();
  const hits: number[] = [];
  for (const card of stack.cards) {
    const background = stack.backgrounds.find((item) => item.id === card.background);
    const fields = [...card.parts, ...(background?.parts ?? [])].filter((part) => part.kind === "field");
    if (fields.some((part) => readFieldText(stack, card, part).toLowerCase().includes(needle))) hits.push(card.id);
  }
  return hits;
}
