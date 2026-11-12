/**
 * Opérations réversibles : le cœur de l'annulation.
 *
 * Chaque modification de la pile est une donnée (`Op`) qui porte son avant et
 * son après. `applyOp` est **pure** : elle rend une nouvelle pile et ne mute
 * jamais l'entrée, ce qui rend l'essai à blanc gratuit (7.7) et garantit que
 * l'inverse calculé avant application ramène exactement à l'état de départ
 * (CAR-P-08).
 */

import type { PropName } from "@cardwake/lang";
import type { Agent, Background, Card, Op, Part, Stack } from "./types";
import { cloneCard, clonePart, cloneStack } from "./clone";

const BOOL_PROPS = new Set(["visible", "enabled", "locked", "hilite"]);

/** La pile avec une carte remplacée (ou inchangée si absente). */
function withCard(stack: Stack, cardId: number, patch: (card: Card) => Card): Stack {
  return { ...stack, cards: stack.cards.map((card) => (card.id === cardId ? patch(card) : card)) };
}

function withBackground(stack: Stack, id: number, patch: (background: Background) => Background): Stack {
  return {
    ...stack,
    backgrounds: stack.backgrounds.map((item) => (item.id === id ? patch(item) : item)),
  };
}

/** Un champ de fond vit dans `card.content`, un champ de carte dans `part.text`. */
function isBackgroundField(stack: Stack, card: Card, partId: number): boolean {
  const background = stack.backgrounds.find((item) => item.id === card.background);
  return background?.parts.some((part) => part.id === partId) ?? false;
}

function fieldText(stack: Stack, card: Card, partId: number): string {
  if (isBackgroundField(stack, card, partId)) return card.content[String(partId)] ?? "";
  const part = card.parts.find((item) => item.id === partId);
  return part && part.kind === "field" ? part.text : "";
}

function patchPartText(card: Card, partId: number, text: string): Card {
  return {
    ...card,
    parts: card.parts.map((part) => (part.id === partId && part.kind === "field" ? { ...part, text } : part)),
  };
}

function applySetText(stack: Stack, op: Extract<Op, { kind: "setText" }>): Stack {
  return withCard(stack, op.cardId, (card) => {
    const shared = op.backgroundId !== undefined || isBackgroundField(stack, card, op.partId);
    const content = shared ? { ...card.content, [String(op.partId)]: op.after } : card.content;
    const ink = { ...card.ink };
    if (op.inkAfter === null) delete ink[String(op.partId)];
    else ink[String(op.partId)] = op.inkAfter;
    const grown: Card = { ...card, content, ink };
    return shared ? grown : patchPartText(grown, op.partId, op.after);
  });
}

/** Lit une propriété d'élément sous forme de texte, pour `setProp`. */
function propOf(part: Part, prop: PropName): string {
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

function partWithProp(part: Part, prop: PropName, value: string): Part {
  const flag = value.trim().toLowerCase() === "true";
  if (prop === "name") return { ...part, name: value };
  if (prop === "visible") return { ...part, visible: flag };
  if (prop === "style") return { ...part, style: value };
  if (prop === "rect") {
    const numbers = value.split(",").map((item) => Number(item.trim()));
    if (numbers.length !== 4 || numbers.some((n) => !Number.isFinite(n))) return part;
    return { ...part, rect: [numbers[0], numbers[1], numbers[2], numbers[3]] };
  }
  if (part.kind === "field") {
    if (prop === "locked") return { ...part, locked: flag };
    if (prop === "text") return { ...part, text: value };
    return part;
  }
  if (prop === "label") return { ...part, label: value };
  if (prop === "enabled") return { ...part, enabled: flag };
  if (prop === "hilite") return { ...part, hilite: flag };
  return part;
}

function mapPart(stack: Stack, partId: number, patch: (part: Part) => Part): Stack {
  const inCards = stack.cards.some((card) => card.parts.some((part) => part.id === partId));
  if (inCards) {
    return {
      ...stack,
      cards: stack.cards.map((card) =>
        card.parts.some((part) => part.id === partId)
          ? { ...card, parts: card.parts.map((part) => (part.id === partId ? patch(part) : part)) }
          : card,
      ),
    };
  }
  return {
    ...stack,
    backgrounds: stack.backgrounds.map((background) => ({
      ...background,
      parts: background.parts.map((part) => (part.id === partId ? patch(part) : part)),
    })),
  };
}

/**
 * Un identifiant alloué ne doit jamais être réutilisé (CAR-P-10) : toute
 * création relève `nextId` au-dessus du plus grand identifiant introduit.
 */
function bumpNextId(stack: Stack, ids: number[]): Stack {
  const highest = ids.reduce((max, id) => Math.max(max, id), 0);
  return highest >= stack.nextId ? { ...stack, nextId: highest + 1 } : stack;
}

/** Applique une opération ; une opération impossible rend la pile inchangée. */
export function applyOp(stack: Stack, op: Op): Stack {
  switch (op.kind) {
    case "setText":
      return applySetText(stack, op);
    case "setProp":
      if (op.target.kind === "part") return mapPart(stack, op.target.partId, (part) => partWithProp(part, op.prop, op.after));
      return stack;
    case "setScript":
      if (op.target.kind === "part") return mapPart(stack, op.target.partId, (part) => ({ ...part, script: op.after }));
      if (op.target.kind === "card") return withCard(stack, op.target.cardId, (card) => ({ ...card, script: op.after }));
      if (op.target.kind === "background") return withBackground(stack, op.target.backgroundId, (b) => ({ ...b, script: op.after }));
      return { ...stack, script: op.after };
    case "createPart": {
      const grown =
        op.backgroundId !== undefined
          ? withBackground(stack, op.backgroundId, (b) => ({ ...b, parts: insert(b.parts, op.part, op.index) }))
          : withCard(stack, op.cardId, (card) => ({ ...card, parts: insert(card.parts, op.part, op.index) }));
      return bumpNextId(grown, [op.part.id]);
    }
    case "deletePart":
      if (op.backgroundId !== undefined) {
        return withBackground(stack, op.backgroundId, (b) => ({ ...b, parts: b.parts.filter((p) => p.id !== op.part.id) }));
      }
      return withCard(stack, op.cardId, (card) => ({ ...card, parts: card.parts.filter((p) => p.id !== op.part.id) }));
    case "createCard":
      return bumpNextId({ ...stack, cards: insert(stack.cards, op.card, op.index) }, [op.card.id]);
    case "deleteCard":
      return { ...stack, cards: stack.cards.filter((card) => card.id !== op.card.id) };
    case "moveCard":
      return moveCard(stack, op.cardId, op.to);
    case "navigate":
      return { ...stack, currentCardId: op.after };
    case "createBackground":
      return bumpNextId({ ...stack, backgrounds: [...stack.backgrounds, op.background] }, [op.background.id]);
    case "deleteBackground":
      return { ...stack, backgrounds: stack.backgrounds.filter((b) => b.id !== op.background.id) };
    case "setAgent":
      return withCard(stack, op.cardId, (card) => ({ ...card, agent: op.after ? cloneAgent(op.after) : null }));
    case "setStackProp":
      return op.prop === "name" ? { ...stack, name: op.after } : { ...stack, persona: op.after };
    case "setSettings":
      return { ...stack, settings: { ...op.after } };
  }
}

function cloneAgent(agent: Agent): Agent {
  return { ...agent };
}

function insert<T>(items: T[], item: T, index: number): T[] {
  const at = Math.max(0, Math.min(index, items.length));
  return [...items.slice(0, at), item, ...items.slice(at)];
}

function moveCard(stack: Stack, cardId: number, to: number): Stack {
  const from = stack.cards.findIndex((card) => card.id === cardId);
  if (from < 0) return stack;
  const cards = [...stack.cards];
  const [moved] = cards.splice(from, 1);
  cards.splice(Math.max(0, Math.min(to, cards.length)), 0, moved);
  return { ...stack, cards };
}

/** L'inverse d'une opération, calculé sur l'état **avant** application. */
export function invertOp(stack: Stack, op: Op): Op {
  switch (op.kind) {
    case "setText":
      return { ...op, before: op.after, after: op.before, inkBefore: op.inkAfter, inkAfter: op.inkBefore };
    case "setProp":
      return { ...op, before: op.after, after: op.before };
    case "setScript":
      return { ...op, before: op.after, after: op.before };
    case "createPart":
      return { kind: "deletePart", cardId: op.cardId, backgroundId: op.backgroundId, part: clonePart(op.part), index: op.index };
    case "deletePart":
      return { kind: "createPart", cardId: op.cardId, backgroundId: op.backgroundId, part: clonePart(op.part), index: op.index };
    case "createCard":
      return { kind: "deleteCard", card: cloneCard(op.card), index: op.index };
    case "deleteCard":
      return { kind: "createCard", card: cloneCard(op.card), index: op.index };
    case "moveCard":
      return { ...op, from: op.to, to: op.from };
    case "navigate":
      return { ...op, before: op.after, after: op.before };
    case "createBackground":
      return { kind: "deleteBackground", background: op.background };
    case "deleteBackground":
      return { kind: "createBackground", background: op.background };
    case "setAgent":
      return { ...op, before: op.after, after: op.before };
    case "setStackProp":
      return { ...op, before: op.after, after: op.before };
    case "setSettings":
      return { ...op, before: op.after, after: op.before };
  }
}

export function applyOps(stack: Stack, ops: Op[]): Stack {
  return ops.reduce((current, op) => applyOp(current, op), stack);
}

/** Les inverses, en ordre inverse : c'est ce qui rend l'annulation exacte. */
export function invertOps(stack: Stack, ops: Op[]): Op[] {
  const inverses: Op[] = [];
  let current = stack;
  for (const op of ops) {
    inverses.push(invertOp(current, op));
    current = applyOp(current, op);
  }
  return inverses.reverse();
}

/** Texte actuel d'un champ, pour préparer un `setText` et son encre. */
export function currentText(stack: Stack, cardId: number, partId: number): string {
  const card = stack.cards.find((item) => item.id === cardId);
  return card ? fieldText(stack, card, partId) : "";
}

/** Marque d'encre actuelle d'un champ (identifiant de transaction ou null). */
export function currentInk(stack: Stack, cardId: number, partId: number): number | null {
  const card = stack.cards.find((item) => item.id === cardId);
  return card?.ink[String(partId)] ?? null;
}

export { cloneStack };
