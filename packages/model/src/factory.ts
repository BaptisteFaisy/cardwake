/**
 * Fabriques d'objets : une pile, un fond, une carte, un champ, un bouton.
 *
 * Deux règles tiennent tout : aucune fabrique ne mute la pile reçue (elle rend
 * une copie modifiée), et chaque identifiant alloué est unique et jamais
 * réutilisé — `nextId` ne fait que monter (CAR-F-04, CAR-P-10).
 */

import type { Background, ButtonPart, Card, FieldPart, Part, Rect, Stack } from "./types";
import { APP_LIMITS, DEFAULT_SETTINGS } from "./limits";
import { CARD_SIZE } from "./types";

/** Réserve un identifiant et rend la pile mise à jour avec. */
function allocate(stack: Stack): { stack: Stack; id: number } {
  return { stack: { ...stack, nextId: stack.nextId + 1 }, id: stack.nextId };
}

function tooMany(message: string): never {
  throw new RangeError(message);
}

/** Rectangle libre suivant : sous le dernier élément, dans les proportions d'origine. */
export function nextRect(parts: Part[]): Rect {
  const [, , width, height] = CARD_SIZE;
  const bottom = parts.reduce((max, part) => Math.max(max, part.rect[1] + part.rect[3]), 32);
  const nextTop = bottom + 8;
  return nextTop + 24 > height ? [16, 32, Math.min(240, width - 32), 24] : [16, nextTop, Math.min(240, width - 32), 24];
}

export function createStack(name: string): Stack {
  return {
    format: "cardwake/1",
    name,
    persona: "",
    settings: { ...DEFAULT_SETTINGS },
    backgrounds: [],
    cards: [],
    script: "",
    provenance: { kind: "created" },
    nextId: 1,
    currentCardId: null,
  };
}

export function createBackground(stack: Stack, name: string): { stack: Stack; background: Background } {
  const { stack: withId, id } = allocate(stack);
  const background: Background = { id, name, persona: "", script: "", parts: [] };
  return {
    stack: { ...withId, backgrounds: [...withId.backgrounds, background] },
    background,
  };
}

/** Contenu initial d'une carte rattachée à un fond : une chaîne vide par champ. */
function contentFor(background: Background | undefined): Record<string, string> {
  const content: Record<string, string> = {};
  for (const part of background?.parts ?? []) {
    if (part.kind === "field") content[String(part.id)] = "";
  }
  return content;
}

export function createCard(
  stack: Stack,
  opts: { name: string; backgroundId?: number | null },
): { stack: Stack; card: Card } {
  if (stack.cards.length >= APP_LIMITS.maxCardsPerStack) {
    tooMany(`A stack holds at most ${APP_LIMITS.maxCardsPerStack} cards.`);
  }
  const backgroundId = opts.backgroundId ?? null;
  const background = backgroundId === null ? undefined : stack.backgrounds.find((item) => item.id === backgroundId);
  const { stack: withId, id } = allocate(stack);
  const card: Card = {
    id,
    name: opts.name,
    background: backgroundId,
    content: contentFor(background),
    agent: null,
    script: "",
    parts: [],
    ink: {},
  };
  return {
    stack: {
      ...withId,
      cards: [...withId.cards, card],
      currentCardId: withId.currentCardId ?? card.id,
    },
    card,
  };
}

function targetParts(stack: Stack, cardId?: number, backgroundId?: number): { parts: Part[]; where: "card" | "background"; owner: number } {
  if (backgroundId !== undefined) {
    const background = stack.backgrounds.find((item) => item.id === backgroundId);
    if (!background) throw new RangeError(`No background with id ${backgroundId}.`);
    return { parts: background.parts, where: "background", owner: background.id };
  }
  const id = cardId ?? stack.currentCardId;
  const card = stack.cards.find((item) => item.id === id);
  if (!card) throw new RangeError("No card to add a part to: create a card first.");
  return { parts: card.parts, where: "card", owner: card.id };
}

function withPart(stack: Stack, where: "card" | "background", owner: number, part: Part): Stack {
  if (where === "background") {
    return {
      ...stack,
      backgrounds: stack.backgrounds.map((item) =>
        item.id === owner ? { ...item, parts: [...item.parts, part] } : item,
      ),
    };
  }
  return {
    ...stack,
    cards: stack.cards.map((item) => (item.id === owner ? { ...item, parts: [...item.parts, part] } : item)),
  };
}

function checkPartLimit(stack: Stack, where: "card" | "background", owner: number): void {
  if (where === "background") return;
  const card = stack.cards.find((item) => item.id === owner);
  const background = stack.backgrounds.find((item) => item.id === card?.background);
  const total = (card?.parts.length ?? 0) + (background?.parts.length ?? 0);
  if (total >= APP_LIMITS.maxPartsPerCard) {
    tooMany(`A card holds at most ${APP_LIMITS.maxPartsPerCard} parts.`);
  }
}

export function createField(
  stack: Stack,
  opts: { name: string; cardId?: number; backgroundId?: number; rect?: Rect; multiline?: boolean; locked?: boolean; script?: string },
): { stack: Stack; part: FieldPart } {
  const { parts, where, owner } = targetParts(stack, opts.cardId, opts.backgroundId);
  checkPartLimit(stack, where, owner);
  const { stack: withId, id } = allocate(stack);
  const part: FieldPart = {
    id,
    kind: "field",
    name: opts.name,
    rect: opts.rect ?? nextRect(parts),
    visible: true,
    style: "plain",
    script: opts.script ?? "",
    text: "",
    locked: opts.locked ?? false,
    multiline: opts.multiline ?? false,
  };
  const grown = withPart(withId, where, owner, part);
  return { stack: addContentIfNeeded(grown, where, owner, part), part };
}

/** Un champ ajouté à un fond apparaît, vide, sur toutes les cartes de ce fond. */
function addContentIfNeeded(stack: Stack, where: "card" | "background", owner: number, part: Part): Stack {
  if (where !== "background" || part.kind !== "field") return stack;
  return {
    ...stack,
    cards: stack.cards.map((card) =>
      card.background === owner ? { ...card, content: { ...card.content, [String(part.id)]: "" } } : card,
    ),
  };
}

export function createButton(
  stack: Stack,
  opts: { name: string; cardId?: number; label?: string; rect?: Rect; script?: string },
): { stack: Stack; part: ButtonPart } {
  const { parts, where, owner } = targetParts(stack, opts.cardId, undefined);
  checkPartLimit(stack, where, owner);
  const { stack: withId, id } = allocate(stack);
  const part: ButtonPart = {
    id,
    kind: "button",
    name: opts.name,
    rect: opts.rect ?? nextRect(parts),
    visible: true,
    style: "plain",
    script: opts.script ?? "",
    label: opts.label ?? opts.name,
    enabled: true,
    hilite: false,
  };
  return { stack: withPart(withId, where, owner, part), part };
}

/** Pose un agent sur une carte — réservé à l'humain (CAR-F-36). */
export function setAgent(stack: Stack, cardId: number, agent: Card["agent"]): Stack {
  return {
    ...stack,
    cards: stack.cards.map((card) => (card.id === cardId ? { ...card, agent } : card)),
  };
}
