/**
 * Piles minimales et tirages pour les tests de propriétés de `authorize`
 * (CAR-P-11, CAR-P-12, CAR-P-13, CAR-P-17).
 *
 * Tout est construit à la main : aucune dépendance aux fichiers des autres
 * lots (`apply`, `journal`, `dispatch`). La pile de référence contient
 * exactement ce qu'il faut pour éprouver les règles :
 * - la carte de l'agent (10), avec un champ libre (11) et un champ verrouillé (12) ;
 * - son fond (2), avec un champ de fond libre (3) et verrouillé (4) ;
 * - une carte voisine (20) sur un autre fond (5), avec son champ (51).
 */

import fc from "fast-check";
import type { AgentAction } from "../src/authorize";
import { DEFAULT_SETTINGS } from "../src/limits";
import type {
  AgentLevel,
  Background,
  Card,
  FieldPart,
  Op,
  OpTarget,
  Part,
  Provenance,
  Rect,
  Stack,
} from "../src/types";

/** Identifiants fixes, lisibles dans les messages d'échec. */
export const IDS = {
  agentCard: 10,
  ownField: 11,
  ownLockedField: 12,
  otherCard: 20,
  otherField: 51,
  background: 2,
  backgroundField: 3,
  backgroundLockedField: 4,
  foreignBackground: 5,
  unknownPart: 999,
} as const;

const RECT: Rect = [0, 0, 100, 24];

function makeField(id: number, name: string, locked = false): FieldPart {
  return {
    id,
    kind: "field",
    name,
    rect: RECT,
    visible: true,
    style: "",
    script: "",
    text: "",
    locked,
    multiline: false,
  };
}

function makeCard(spec: {
  id: number;
  name: string;
  background: number | null;
  parts: Part[];
  agent: Card["agent"];
}): Card {
  return {
    id: spec.id,
    name: spec.name,
    background: spec.background,
    content: {},
    agent: spec.agent,
    script: "",
    parts: spec.parts,
    ink: {},
  };
}

/** Pile de référence : une carte d'agent, un fond, une carte voisine. */
export function buildStack(spec: {
  level: AgentLevel;
  awake: boolean;
  provenance: Provenance;
}): Stack {
  const background: Background = {
    id: IDS.background,
    name: "Character",
    persona: "Write what you learn in field Mood.",
    script: "",
    parts: [
      makeField(IDS.backgroundField, "Mood"),
      makeField(IDS.backgroundLockedField, "Says", true),
    ],
  };
  const foreign: Background = {
    id: IDS.foreignBackground,
    name: "Elsewhere",
    persona: "",
    script: "",
    parts: [makeField(IDS.otherField, "Theirs")],
  };
  const agentCard = makeCard({
    id: IDS.agentCard,
    name: "Guard",
    background: IDS.background,
    parts: [makeField(IDS.ownField, "Notes"), makeField(IDS.ownLockedField, "Says", true)],
    agent: { awake: spec.awake, level: spec.level, speed: "fast", persona: "You guard the door." },
  });
  const otherCard = makeCard({
    id: IDS.otherCard,
    name: "Visitor",
    background: IDS.foreignBackground,
    parts: [makeField(IDS.otherField, "Theirs")],
    agent: null,
  });
  return {
    format: "cardwake/1",
    name: "Probe",
    persona: "A stack built for the authorization tests.",
    settings: { ...DEFAULT_SETTINGS },
    backgrounds: [background, foreign],
    cards: [agentCard, otherCard],
    script: "",
    provenance: spec.provenance,
    nextId: 100,
    currentCardId: IDS.agentCard,
  };
}

export const levelArb = fc.constantFrom<AgentLevel>(1, 2, 3, 4, 5);

export const provenanceArb: fc.Arbitrary<Provenance> = fc.oneof(
  fc.constant<Provenance>({ kind: "created" }),
  fc.constant<Provenance>({
    kind: "received",
    trusted: true,
    receivedAt: "2026-01-01T00:00:00Z",
  }),
  fc.constant<Provenance>({
    kind: "received",
    trusted: false,
    receivedAt: "2026-01-01T00:00:00Z",
  }),
);

/** Toutes les cibles plausibles, y compris une qui n'existe nulle part. */
export const partIdArb = fc.constantFrom(
  IDS.ownField,
  IDS.ownLockedField,
  IDS.backgroundField,
  IDS.backgroundLockedField,
  IDS.otherField,
  IDS.unknownPart,
);

export const cardIdArb = fc.constantFrom(IDS.agentCard, IDS.otherCard, IDS.unknownPart);

/**
 * Un appel d'outil tiré au sort, **faux modèle adversaire** compris : les
 * actions interdites au niveau courant sont tirées aussi souvent que les
 * autres, et `onOwnCard` ment une fois sur deux.
 */
export const agentActionArb: fc.Arbitrary<AgentAction> = fc.oneof(
  fc.constant<AgentAction>({ kind: "reply" }),
  fc
    .record({ toCardId: cardIdArb })
    .map((value): AgentAction => ({ kind: "send_message", toCardId: value.toCardId })),
  fc
    .record({ partId: partIdArb, locked: fc.boolean(), onOwnCard: fc.boolean() })
    .map(
      (value): AgentAction => ({
        kind: "write_field",
        partId: value.partId,
        locked: value.locked,
        onOwnCard: value.onOwnCard,
      }),
    ),
  fc
    .record({ partId: partIdArb, onOwnCard: fc.boolean() })
    .map(
      (value): AgentAction => ({
        kind: "set_appearance",
        partId: value.partId,
        prop: "visible",
        onOwnCard: value.onOwnCard,
      }),
    ),
  fc
    .record({ partKind: fc.constantFrom<"field" | "button">("field", "button"), onOwnCard: fc.boolean() })
    .map(
      (value): AgentAction => ({
        kind: "create_part",
        partKind: value.partKind,
        onOwnCard: value.onOwnCard,
      }),
    ),
  fc
    .record({ partId: partIdArb, onOwnCard: fc.boolean() })
    .map(
      (value): AgentAction => ({
        kind: "delete_part",
        partId: value.partId,
        onOwnCard: value.onOwnCard,
      }),
    ),
  fc.constant<AgentAction>({ kind: "create_card" }),
  fc.constant<AgentAction>({ kind: "go_to_card" }),
  fc
    .record({ onOwnCard: fc.boolean(), acceptanceToken: fc.option(fc.string(), { nil: undefined }) })
    .map(
      (value): AgentAction => ({
        kind: "propose_script",
        onOwnCard: value.onOwnCard,
        acceptanceToken: value.acceptanceToken,
      }),
    ),
);

const targetArb: fc.Arbitrary<OpTarget> = fc.oneof(
  fc.record({ cardId: cardIdArb, partId: partIdArb }).map(
    (value): OpTarget => ({ kind: "part", cardId: value.cardId, partId: value.partId }),
  ),
  fc.record({ cardId: cardIdArb }).map((value): OpTarget => ({ kind: "card", cardId: value.cardId })),
  fc.constant<OpTarget>({ kind: "background", backgroundId: IDS.foreignBackground }),
  fc.constant<OpTarget>({ kind: "stack" }),
);

const agentOrNull = fc.oneof(
  fc.constant(null),
  fc
    .record({ awake: fc.boolean(), level: levelArb })
    .map((value) => ({ awake: value.awake, level: value.level, speed: "fast" as const, persona: "p" })),
);

/** Une opération du journal tirée au sort, y compris celles hors de portée. */
export const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc
    .record({ cardId: cardIdArb, partId: partIdArb })
    .map(
      (value): Op => ({
        kind: "setText",
        cardId: value.cardId,
        partId: value.partId,
        before: "",
        after: "x",
        inkBefore: null,
        inkAfter: null,
      }),
    ),
  targetArb.map(
    (target): Op => ({ kind: "setProp", target, prop: "visible", before: "true", after: "false" }),
  ),
  targetArb.map((target): Op => ({ kind: "setScript", target, before: "", after: "on tick" })),
  fc
    .record({ cardId: cardIdArb })
    .map(
      (value): Op => ({
        kind: "createPart",
        cardId: value.cardId,
        part: makeField(500, "New"),
        index: 0,
      }),
    ),
  fc
    .record({ cardId: cardIdArb, partId: partIdArb })
    .map(
      (value): Op => ({
        kind: "deletePart",
        cardId: value.cardId,
        part: makeField(value.partId, "Gone"),
        index: 0,
      }),
    ),
  fc
    .record({ agent: agentOrNull })
    .map(
      (value): Op => ({
        kind: "setAgent",
        cardId: IDS.agentCard,
        before: null,
        after: value.agent,
      }),
    ),
  fc
    .record({ hopBudget: fc.nat({ max: 10 }) })
    .map(
      (value): Op => ({
        kind: "setSettings",
        before: { ...DEFAULT_SETTINGS },
        after: { ...DEFAULT_SETTINGS, hopBudget: value.hopBudget },
      }),
    ),
  fc
    .record({ prop: fc.constantFrom<"name" | "persona">("name", "persona"), after: fc.string() })
    .map(
      (value): Op => ({
        kind: "setStackProp",
        prop: value.prop,
        before: "",
        after: value.after,
      }),
    ),
  fc.constant<Op>({ kind: "createCard", card: makeCard({ id: 900, name: "New", background: null, parts: [], agent: null }), index: 0 }),
  fc.constant<Op>({ kind: "deleteCard", card: makeCard({ id: IDS.agentCard, name: "Guard", background: IDS.background, parts: [], agent: null }), index: 0 }),
  fc.constant<Op>({ kind: "moveCard", cardId: IDS.agentCard, from: 0, to: 1 }),
  fc.constant<Op>({ kind: "navigate", before: IDS.agentCard, after: IDS.otherCard }),
);

/** Suite d'opérations de longueur variable. */
export const opListArb = fc.array(opArb, { maxLength: 12 });

/** Suite d'appels d'outils de longueur variable. */
export const actionListArb = fc.array(agentActionArb, { maxLength: 12 });

/** L'élément appartient-il à la carte de l'agent (la sienne, ou son fond) ? */
export function partOnAgentCard(stack: Stack, partId: number): boolean {
  const card = stack.cards.find((candidate) => candidate.id === IDS.agentCard);
  if (card === undefined) return false;
  if (card.parts.some((part) => part.id === partId)) return true;
  const background = stack.backgrounds.find((bg) => bg.id === card.background);
  return background !== undefined && background.parts.some((part) => part.id === partId);
}
