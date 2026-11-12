/**
 * Les opérations de construction (mode Fabriquer, CAR-F-02) et les cibles
 * d'élément : tout ce que le moteur **calcule** avant de faire passer une
 * opération par `authorizeOp`.
 *
 * Ces fonctions sont pures : elles rendent les opérations à journaliser,
 * jamais elles ne touchent au journal ni à la pile. Le moteur garde la
 * décision (autoriser ou refuser) et la cause lisible, en anglais.
 *
 * Elles vivent hors du moteur pour une raison simple : `model-engine.ts` est
 * au plus long, et la règle du dépôt veut des fichiers de moins de cinq
 * cents lignes.
 */
import { createBackground, createButton, createCard, createField } from "@cardwake/model";
import type { Card, Op, Part, Rect, Stack } from "@cardwake/model";
import type { PropName } from "@cardwake/lang";

/** Cible d'un champ sur une carte : propre à la carte, ou champ de son fond. */
export type FieldTarget = { backgroundId?: number; locked: boolean; part: Part };

/** Ce qu'une action de construction produit : les opérations, et le compteur. */
export type BuiltOps = { ops: Op[]; nextId?: number };

/**
 * Valeur texte actuelle d'une propriété d'élément : miroir local de l'`ops.ts`
 * du modèle (fonction non exportée, contrat figé), borné aux propriétés de
 * l'inspecteur. `before` doit être exact pour que l'inverse du journal
 * ramène à l'état d'avant.
 */
export function readPropText(part: Part, prop: PropName): string {
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

/** L'élément visé : propre à la carte, ou élément de son fond (CAR-F-03). */
export function findPart(stack: Stack, card: Card, partId: number): Part | undefined {
  const own = card.parts.find((part) => part.id === partId);
  if (own !== undefined) return own;
  if (card.background === null) return undefined;
  const background = stack.backgrounds.find((item) => item.id === card.background);
  return background?.parts.find((part) => part.id === partId);
}

/** Cible d'un champ, avec son fond éventuel et son verrou. */
export function fieldTarget(stack: Stack, card: Card, partId: number): FieldTarget | null {
  const own = card.parts.find((part) => part.id === partId);
  if (own !== undefined) return { locked: own.kind === "field" && own.locked, part: own };
  if (card.background === null) return null;
  const background = stack.backgrounds.find((item) => item.id === card.background);
  const part = background?.parts.find((item) => item.id === partId);
  if (part === undefined || background === undefined) return null;
  return { backgroundId: background.id, locked: part.kind === "field" && part.locked, part };
}

/** Les opérations d'une carte créée. */
export function addCardOps(stack: Stack, name: string): BuiltOps {
  const built = createCard(stack, { name });
  const ops: Op[] = [{ kind: "createCard", card: built.card, index: stack.cards.length }];
  if (stack.currentCardId === null) {
    ops.push({ kind: "navigate", before: null, after: built.card.id });
  }
  return { ops, nextId: built.stack.nextId };
}

/** Les opérations d'un élément ajouté à une carte. */
export function addPartOps(
  stack: Stack,
  card: Card,
  kind: "button" | "field",
  name: string,
): BuiltOps {
  const built =
    kind === "button"
      ? createButton(stack, { name, cardId: card.id })
      : createField(stack, { name, cardId: card.id });
  return {
    ops: [{ kind: "createPart", cardId: card.id, part: built.part, index: card.parts.length }],
    nextId: built.stack.nextId,
  };
}

/** Les opérations d'un fond ajouté à la pile. */
export function addBackgroundOps(stack: Stack, name: string): BuiltOps {
  const built = createBackground(stack, name);
  return {
    ops: [{ kind: "createBackground", background: built.background }],
    nextId: built.stack.nextId,
  };
}

/** L'opération d'un redimensionnement d'élément. */
export function setPartRectOps(card: Card, part: Part, rect: Rect): Op {
  return {
    kind: "setProp",
    target: { kind: "part", cardId: card.id, partId: part.id },
    prop: "rect",
    before: part.rect.join(","),
    after: rect.join(","),
  };
}

/** L'opération d'un changement de propriété d'élément. */
export function setPartPropOps(card: Card, part: Part, prop: PropName, value: string): Op {
  return {
    kind: "setProp",
    target: { kind: "part", cardId: card.id, partId: part.id },
    prop,
    before: readPropText(part, prop),
    after: value,
  };
}

/** L'opération d'une suppression d'élément. */
export function deletePartOps(card: Card, part: Part): Op {
  const onBackground = !card.parts.some((item) => item.id === part.id);
  return {
    kind: "deletePart",
    cardId: card.id,
    ...(onBackground && card.background !== null ? { backgroundId: card.background } : {}),
    part,
    index: onBackground ? 0 : card.parts.findIndex((item) => item.id === part.id),
  };
}
