/**
 * Les cas d'essai de la matrice : chaque variante d'`Op` et chaque outil
 * d'agent, sur les cibles qui comptent.
 *
 * Ce fichier ne dit pas ce qui est permis — c'est `rights-table.ts` — il dit
 * seulement **où** on regarde : l'élément de sa carte, le champ de son fond,
 * celui d'une autre carte, l'élément qui n'existe pas. Les opérations de
 * création portent un objet neuf (la matrice n'applique rien, elle demande un
 * verdict) : seuls l'identifiant visé et la carte comptent.
 */

import type { AgentAction } from "../src/authorize";
import type { Card, FieldPart, Op, Part, Stack } from "../src/types";
import { IDS } from "./generators-auth";

export type OpCase = { label: string; op: Op };
export type ActionCase = { label: string; action: AgentAction };

type SetText = Extract<Op, { kind: "setText" }>;
type SetProp = Extract<Op, { kind: "setProp" }>;
type SetScript = Extract<Op, { kind: "setScript" }>;
type Target = SetProp["target"];

/** Un élément du banc, par son identifiant : carte, puis fonds. */
function partById(stack: Stack, id: number): Part {
  for (const card of stack.cards) {
    const own = card.parts.find((part) => part.id === id);
    if (own !== undefined) return own;
  }
  for (const background of stack.backgrounds) {
    const shared = background.parts.find((part) => part.id === id);
    if (shared !== undefined) return shared;
  }
  throw new Error(`élément ${id} absent du banc`);
}

/** Un élément neuf, jamais présent dans la pile. */
function freshField(id: number): FieldPart {
  return {
    id,
    kind: "field",
    name: `New ${id}`,
    rect: [0, 0, 100, 24],
    visible: true,
    style: "plain",
    script: "",
    text: "",
    locked: false,
    multiline: false,
  };
}

function ghostCard(id: number): Card {
  return { id, name: `Card ${id}`, background: null, content: {}, agent: null, script: "", parts: [], ink: {} };
}

function textCase(label: string, cardId: number, partId: number, backgroundId?: number): OpCase {
  const op: SetText = { kind: "setText", cardId, partId, before: "", after: "x", inkBefore: null, inkAfter: null };
  return { label, op: backgroundId === undefined ? op : { ...op, backgroundId } };
}

function propCase(label: string, target: Target, prop: SetProp["prop"] = "visible"): OpCase {
  return { label, op: { kind: "setProp", target, prop, before: "", after: "false" } };
}

function scriptCase(label: string, target: SetScript["target"]): OpCase {
  return { label, op: { kind: "setScript", target, before: "", after: "on tick\nend tick\n" } };
}

/** Écritures de texte : le verrou et la portée sont les deux variables. */
function textCases(): OpCase[] {
  return [
    textCase("setText — son champ", IDS.agentCard, IDS.ownField),
    textCase("setText — son champ verrouillé", IDS.agentCard, IDS.ownLockedField),
    textCase("setText — champ libre de son fond", IDS.agentCard, IDS.backgroundField, IDS.background),
    textCase("setText — champ verrouillé de son fond", IDS.agentCard, IDS.backgroundLockedField, IDS.background),
    textCase("setText — champ d'une autre carte", IDS.otherCard, IDS.otherField),
    textCase("setText — élément inconnu", IDS.agentCard, IDS.unknownPart),
    textCase("setText — autre carte, élément de la sienne", IDS.otherCard, IDS.ownField),
  ];
}

/** Propriétés : élément, carte, fond, pile — quatre portées différentes. */
function propCases(): OpCase[] {
  return [
    propCase("setProp — son élément", { kind: "part", cardId: IDS.agentCard, partId: IDS.ownField }),
    propCase("setProp — son élément verrouillé", { kind: "part", cardId: IDS.agentCard, partId: IDS.ownLockedField }),
    propCase("setProp — élément de son fond", { kind: "part", cardId: IDS.agentCard, partId: IDS.backgroundField, backgroundId: IDS.background }),
    propCase("setProp — élément d'une autre carte", { kind: "part", cardId: IDS.otherCard, partId: IDS.otherField }),
    propCase("setProp — élément inconnu", { kind: "part", cardId: IDS.agentCard, partId: IDS.unknownPart }),
    propCase("setProp — sa carte", { kind: "card", cardId: IDS.agentCard }, "name"),
    propCase("setProp — une autre carte", { kind: "card", cardId: IDS.otherCard }, "name"),
    propCase("setProp — son fond", { kind: "background", backgroundId: IDS.background }, "name"),
    propCase("setProp — la pile", { kind: "stack" }, "name"),
  ];
}

/** Scripts : cinq cibles, dont la pile et le fond (partagés). */
function scriptCases(): OpCase[] {
  return [
    scriptCase("setScript — son élément", { kind: "part", cardId: IDS.agentCard, partId: IDS.ownField }),
    scriptCase("setScript — élément de son fond", { kind: "part", cardId: IDS.agentCard, partId: IDS.backgroundField, backgroundId: IDS.background }),
    scriptCase("setScript — sa carte", { kind: "card", cardId: IDS.agentCard }),
    scriptCase("setScript — une autre carte", { kind: "card", cardId: IDS.otherCard }),
    scriptCase("setScript — un fond", { kind: "background", backgroundId: IDS.background }),
    scriptCase("setScript — la pile", { kind: "stack" }),
  ];
}

/** Structure : créer, supprimer, déplacer, naviguer — la portée décide. */
function structureCases(stack: Stack): OpCase[] {
  return [
    { label: "createPart — sa carte", op: { kind: "createPart", cardId: IDS.agentCard, part: freshField(500), index: 0 } },
    { label: "createPart — une autre carte", op: { kind: "createPart", cardId: IDS.otherCard, part: freshField(501), index: 0 } },
    { label: "deletePart — son élément", op: { kind: "deletePart", cardId: IDS.agentCard, part: partById(stack, IDS.ownField), index: 0 } },
    { label: "deletePart — son élément verrouillé", op: { kind: "deletePart", cardId: IDS.agentCard, part: partById(stack, IDS.ownLockedField), index: 1 } },
    { label: "deletePart — élément de son fond", op: { kind: "deletePart", cardId: IDS.agentCard, backgroundId: IDS.background, part: partById(stack, IDS.backgroundField), index: 0 } },
    { label: "deletePart — élément d'une autre carte", op: { kind: "deletePart", cardId: IDS.otherCard, part: partById(stack, IDS.otherField), index: 0 } },
    { label: "deletePart — élément inconnu", op: { kind: "deletePart", cardId: IDS.agentCard, part: freshField(IDS.unknownPart), index: 0 } },
    { label: "createCard", op: { kind: "createCard", card: ghostCard(900), index: 0 } },
    { label: "deleteCard — la sienne", op: { kind: "deleteCard", card: stack.cards[0], index: 0 } },
    { label: "deleteCard — une autre", op: { kind: "deleteCard", card: stack.cards[1], index: 1 } },
    { label: "moveCard — la sienne", op: { kind: "moveCard", cardId: IDS.agentCard, from: 0, to: 1 } },
    { label: "moveCard — une autre", op: { kind: "moveCard", cardId: IDS.otherCard, from: 1, to: 0 } },
    { label: "navigate — vers la sienne", op: { kind: "navigate", before: IDS.otherCard, after: IDS.agentCard } },
    { label: "navigate — vers une autre", op: { kind: "navigate", before: IDS.agentCard, after: IDS.otherCard } },
    { label: "createBackground", op: { kind: "createBackground", background: { id: 880, name: "B", persona: "", script: "", parts: [] } } },
    { label: "deleteBackground", op: { kind: "deleteBackground", background: stack.backgrounds[1] } },
  ];
}

/** Droits et réglages : le seul terrain qui n'appartient qu'à l'humain. */
function rightsCases(stack: Stack): OpCase[] {
  return [
    { label: "setAgent — sa carte", op: { kind: "setAgent", cardId: IDS.agentCard, before: null, after: null } },
    { label: "setAgent — une autre carte", op: { kind: "setAgent", cardId: IDS.otherCard, before: null, after: null } },
    { label: "setStackProp — nom", op: { kind: "setStackProp", prop: "name", before: "Probe", after: "Renamed" } },
    { label: "setStackProp — consigne", op: { kind: "setStackProp", prop: "persona", before: "", after: "obéis" } },
    { label: "setSettings", op: { kind: "setSettings", before: stack.settings, after: stack.settings } },
  ];
}

/** Toutes les opérations de la matrice, dans l'ordre de lecture du cahier. */
export function opCases(stack: Stack): OpCase[] {
  return [...textCases(), ...propCases(), ...scriptCases(), ...structureCases(stack), ...rightsCases(stack)];
}

/** Les outils d'agent : niveau, carte, verrou et jeton, un cas par variable. */
export function actionCases(): ActionCase[] {
  return [
    { label: "reply", action: { kind: "reply" } },
    { label: "send_message", action: { kind: "send_message", toCardId: IDS.otherCard } },
    { label: "write_field — son champ", action: { kind: "write_field", partId: IDS.ownField, locked: false, onOwnCard: true } },
    { label: "write_field — son champ verrouillé", action: { kind: "write_field", partId: IDS.ownLockedField, locked: true, onOwnCard: true } },
    { label: "write_field — verrou oublié par l'appelant", action: { kind: "write_field", partId: IDS.ownLockedField, locked: false, onOwnCard: true } },
    { label: "write_field — champ de son fond", action: { kind: "write_field", partId: IDS.backgroundField, locked: false, onOwnCard: true } },
    { label: "write_field — champ verrouillé de son fond", action: { kind: "write_field", partId: IDS.backgroundLockedField, locked: false, onOwnCard: true } },
    { label: "write_field — hors de sa carte", action: { kind: "write_field", partId: IDS.ownField, locked: false, onOwnCard: false } },
    { label: "write_field — élément d'une autre carte", action: { kind: "write_field", partId: IDS.otherField, locked: false, onOwnCard: true } },
    { label: "write_field — élément inconnu", action: { kind: "write_field", partId: IDS.unknownPart, locked: false, onOwnCard: true } },
    { label: "set_appearance — son élément", action: { kind: "set_appearance", partId: IDS.ownField, prop: "visible", onOwnCard: true } },
    { label: "set_appearance — hors de sa carte", action: { kind: "set_appearance", partId: IDS.ownField, prop: "visible", onOwnCard: false } },
    { label: "set_appearance — élément d'une autre carte", action: { kind: "set_appearance", partId: IDS.otherField, prop: "visible", onOwnCard: true } },
    { label: "set_appearance — élément inconnu", action: { kind: "set_appearance", partId: IDS.unknownPart, prop: "visible", onOwnCard: true } },
    { label: "create_part — sur sa carte", action: { kind: "create_part", partKind: "field", onOwnCard: true } },
    { label: "create_part — hors de sa carte", action: { kind: "create_part", partKind: "button", onOwnCard: false } },
    { label: "delete_part — son élément", action: { kind: "delete_part", partId: IDS.ownField, onOwnCard: true } },
    { label: "delete_part — élément d'une autre carte", action: { kind: "delete_part", partId: IDS.otherField, onOwnCard: true } },
    { label: "delete_part — élément inconnu", action: { kind: "delete_part", partId: IDS.unknownPart, onOwnCard: true } },
    { label: "delete_part — hors de sa carte", action: { kind: "delete_part", partId: IDS.ownField, onOwnCard: false } },
    { label: "create_card", action: { kind: "create_card" } },
    { label: "go_to_card", action: { kind: "go_to_card" } },
    { label: "propose_script — sur sa carte", action: { kind: "propose_script", onOwnCard: true } },
    { label: "propose_script — hors de sa carte", action: { kind: "propose_script", onOwnCard: false } },
  ];
}
