/**
 * Le filet des invariants : toute suite d'opérations tirée au hasard laisse la
 * pile conforme (CAR-P-10, CAR-P-18), et le verrou tient pour tout ce que
 * `authorize` laisse passer (CAR-F-06).
 *
 * Les opérations ne sont pas tirées « à l'aveugle » : chacune est construite
 * sur la pile **courante**, avec des identifiants neufs et les valeurs d'avant
 * relues, donc elles s'appliquent réellement. Une suite de douze opérations
 * inapplicables n'apprendrait rien ; celle-ci modifie vraiment la pile.
 *
 * Deux propriétés, deux filets :
 * - `checkInvariants` après chaque suite : identifiants uniques, `nextId` au
 *   dessus de tout identifiant (aucun réemploi), références de fond, contenu,
 *   encre, carte affichée ;
 * - `checkLockedHeld` après chaque opération autorisée : un champ verrouillé
 *   garde son texte, sauf écriture de script.
 *
 * Nombre de tirages : `CARDWAKE_PROP_RUNS`, 100 par défaut.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { authorizeOp } from "../src/authorize";
import type { ActorContext } from "../src/authorize";
import { checkInvariants, checkLockedHeld } from "../src/invariants";
import { applyOp, currentText } from "../src/ops";
import { serializeStack } from "../src/file";
import type { AgentLevel, Card, Op, Part, Stack } from "../src/types";
import { IDS, buildStack } from "./generators-auth";

const RUNS = Number(process.env.CARDWAKE_PROP_RUNS ?? 100);

/** Une intention d'opération, sans identifiant : les ids viennent de la pile. */
type Intent =
  | { kind: "setText"; where: "own" | "shared" | "locked" }
  | { kind: "createPart" }
  | { kind: "deletePart" }
  | { kind: "createCard"; withBackground: boolean }
  | { kind: "deleteCard" }
  | { kind: "moveCard" }
  | { kind: "navigate"; to: "first" | "last" | "none" }
  | { kind: "setProp"; target: "part" | "card" | "background" | "stack" }
  | { kind: "setScript"; target: "part" | "card" | "background" | "stack" }
  | { kind: "setAgent" }
  | { kind: "setSettings" }
  | { kind: "createBackground" };

const intentArb: fc.Arbitrary<Intent> = fc.oneof(
  fc.constantFrom<"own" | "shared" | "locked">("own", "shared", "locked").map((where): Intent => ({ kind: "setText", where })),
  fc.constant<Intent>({ kind: "createPart" }),
  // Suppression d'un élément **propre** à la carte : supprimer un champ de fond
  // laisse une clé de contenu orpheline, divergence D4 consignée à part.
  fc.constant<Intent>({ kind: "deletePart" }),
  fc.boolean().map((withBackground): Intent => ({ kind: "createCard", withBackground })),
  fc.constant<Intent>({ kind: "deleteCard" }),
  fc.constant<Intent>({ kind: "moveCard" }),
  fc.constantFrom<"first" | "last" | "none">("first", "last", "none").map((to): Intent => ({ kind: "navigate", to })),
  fc.constantFrom<"part" | "card" | "background" | "stack">("part", "card", "background", "stack").map((target): Intent => ({ kind: "setProp", target })),
  fc.constantFrom<"part" | "card" | "background" | "stack">("part", "card", "background", "stack").map((target): Intent => ({ kind: "setScript", target })),
  fc.constant<Intent>({ kind: "setAgent" }),
  fc.constant<Intent>({ kind: "setSettings" }),
  fc.constant<Intent>({ kind: "createBackground" }),
);

/** La carte affichée, ou la première : le décor de la plupart des intentions. */
function displayed(stack: Stack): Card {
  const card = stack.cards.find((item) => item.id === stack.currentCardId) ?? stack.cards[0];
  if (card === undefined) throw new Error("pile sans carte");
  return card;
}

/** Premier champ de la carte, ou de son fond, ou rien. */
function pickField(stack: Stack, card: Card, fromBackground: boolean): Part | undefined {
  if (fromBackground) {
    const background = stack.backgrounds.find((item) => item.id === card.background);
    return background?.parts.find((part) => part.kind === "field");
  }
  return card.parts.find((part) => part.kind === "field");
}

/** Champ verrouillé de la carte ou de son fond, s'il en reste un. */
function pickLocked(stack: Stack, card: Card): Part | undefined {
  const background = stack.backgrounds.find((item) => item.id === card.background);
  return [...card.parts, ...(background?.parts ?? [])].find((part) => part.kind === "field" && part.locked);
}

function newField(stack: Stack): Part {
  return {
    id: stack.nextId,
    kind: "field",
    name: `New ${stack.nextId}`,
    rect: [0, 0, 100, 24],
    visible: true,
    style: "plain",
    script: "",
    text: "",
    locked: false,
    multiline: false,
  };
}

/** Traduit une intention en opération applicable **maintenant**, ou rien. */
export function materialize(stack: Stack, intent: Intent, tag: number): Op | null {
  const card = displayed(stack);
  switch (intent.kind) {
    case "setText": {
      const part = intent.where === "locked" ? pickLocked(stack, card) : pickField(stack, card, intent.where === "shared");
      if (part === undefined) return null;
      const before = currentText(stack, card.id, part.id);
      return { kind: "setText", cardId: card.id, partId: part.id, before, after: `v${tag}`, inkBefore: null, inkAfter: null };
    }
    case "createPart":
      return { kind: "createPart", cardId: card.id, part: newField(stack), index: card.parts.length };
    case "deletePart": {
      const part = pickField(stack, card, false);
      return part === undefined ? null : { kind: "deletePart", cardId: card.id, part, index: 0 };
    }
    case "createCard":
      return { kind: "createCard", card: freshCard(stack, intent.withBackground), index: stack.cards.length };
    case "deleteCard": {
      // La carte affichée reste en vie : sa suppression est une divergence
      // connue (D1 de `rights-divergences.test.ts`), pas un invariant.
      //
      // « La carte affichée » veut dire celle que le reste du générateur
      // traite comme affichée — celle que `displayed` rend. Après un
      // `navigate` vers le néant, `currentCardId` est `null` et le
      // générateur ne pouvait plus l'exclure : il supprimait alors la carte
      // qu'il venait de désigner, et la pile sortait de la lecture (D1).
      const shown = displayed(stack);
      const victim = stack.cards.find((item) => item.id !== shown.id);
      return victim === undefined ? null : { kind: "deleteCard", card: victim, index: 1 };
    }
    case "moveCard":
      return { kind: "moveCard", cardId: card.id, from: 0, to: stack.cards.length - 1 };
    case "navigate": {
      const target = intent.to === "none" ? null : (intent.to === "first" ? stack.cards[0]?.id : stack.cards[stack.cards.length - 1]?.id) ?? null;
      return { kind: "navigate", before: stack.currentCardId, after: target };
    }
    case "setProp":
      return propOp(stack, card, intent.target);
    case "setScript":
      return scriptOp(card, intent.target);
    case "setAgent":
      return { kind: "setAgent", cardId: card.id, before: card.agent, after: agentAt(stack) };
    case "setSettings":
      return { kind: "setSettings", before: stack.settings, after: { ...stack.settings, hopBudget: tag % 4 } };
    case "createBackground":
      return { kind: "createBackground", background: { id: stack.nextId, name: `Bg ${stack.nextId}`, persona: "", script: "", parts: [] } };
  }
}

function freshCard(stack: Stack, withBackground: boolean): Card {
  const background = withBackground ? (stack.backgrounds[0]?.id ?? null) : null;
  const content: Record<string, string> = {};
  if (background !== null) {
    for (const part of stack.backgrounds.find((item) => item.id === background)?.parts ?? []) {
      if (part.kind === "field") content[String(part.id)] = "";
    }
  }
  return { id: stack.nextId, name: `Card ${stack.nextId}`, background, content, agent: null, script: "", parts: [], ink: {} };
}

function agentAt(stack: Stack): { awake: boolean; level: AgentLevel; speed: "fast" | "careful"; persona: string } {
  const level = ((stack.nextId % 5) + 1) as AgentLevel;
  return { awake: true, level, speed: "fast", persona: "Observe." };
}

function propOp(stack: Stack, card: Card, target: "part" | "card" | "background" | "stack"): Op | null {
  if (target === "part") {
    const part = pickField(stack, card, false);
    if (part === undefined) return null;
    return { kind: "setProp", target: { kind: "part", cardId: card.id, partId: part.id }, prop: "visible", before: String(part.visible), after: "false" };
  }
  if (target === "card") return { kind: "setProp", target: { kind: "card", cardId: card.id }, prop: "name", before: card.name, after: "Renamed" };
  if (target === "background" && card.background !== null) {
    return { kind: "setProp", target: { kind: "background", backgroundId: card.background }, prop: "name", before: "", after: "Renamed" };
  }
  // La consigne de la pile n'est pas une propriété d'objet : c'est `setStackProp`.
  return { kind: "setStackProp", prop: "persona", before: stack.persona, after: "Later." };
}

function scriptOp(card: Card, target: "part" | "card" | "background" | "stack"): Op {
  const script = "on tick\n  put 1 into field \"Notes\"\nend tick\n";
  if (target === "card") return { kind: "setScript", target: { kind: "card", cardId: card.id }, before: card.script, after: script };
  if (target === "background" && card.background !== null) {
    return { kind: "setScript", target: { kind: "background", backgroundId: card.background }, before: "", after: script };
  }
  if (target === "background") return { kind: "setScript", target: { kind: "stack" }, before: "", after: script };
  const part = card.parts[0];
  if (part === undefined) return { kind: "setScript", target: { kind: "card", cardId: card.id }, before: card.script, after: script };
  return { kind: "setScript", target: { kind: "part", cardId: card.id, partId: part.id }, before: part.script, after: script };
}

describe("invariants — toute suite d'opérations laisse la pile conforme (CAR-P-10)", () => {
  it("résiste à douze opérations réelles tirées au hasard", () => {
    fc.assert(
      fc.property(fc.array(intentArb, { maxLength: 12 }), (intents) => {
        let stack = buildStack({ level: 4, awake: true, provenance: { kind: "created" } });
        intents.forEach((intent, index) => {
          const op = materialize(stack, intent, index);
          if (op === null) return;
          stack = applyOp(stack, op);
        });
        expect(checkInvariants(stack)).toEqual([]);
        // Un export qui ne se relit pas est une perte de données : on le dit ici.
        expect(serializeStack(stack).length).toBeGreaterThan(0);
      }),
      { numRuns: RUNS },
    );
  });
});

describe("invariants — le verrou tient pour ce qui est autorisé (CAR-F-06)", () => {
  const actors: { name: string; actor: ActorContext["actor"] }[] = [
    { name: "humain en Jouer", actor: { kind: "human", mode: "browse" } },
    { name: "agent de niveau 5", actor: { kind: "agent", cardId: IDS.agentCard, level: 5 } },
  ];

  it("aucune opération autorisée ne change le texte d'un champ verrouillé", () => {
    fc.assert(
      fc.property(fc.array(intentArb, { maxLength: 10 }), fc.constantFrom(...actors.map((entry) => entry.name)), (intents, name) => {
        const chosen = actors.find((entry) => entry.name === name);
        if (chosen === undefined) throw new Error("acteur inconnu");
        let stack = buildStack({ level: 5, awake: true, provenance: { kind: "created" } });
        intents.forEach((intent, index) => {
          const op = materialize(stack, intent, index);
          if (op === null) return;
          const ctx: ActorContext = { stack, actor: chosen.actor, cardId: IDS.agentCard };
          if (!authorizeOp(ctx, op).allow) return;
          const after = applyOp(stack, op);
          expect(checkLockedHeld(stack, after, chosen.actor.kind), `${name} — ${op.kind}`).toEqual([]);
          stack = after;
        });
        expect(checkInvariants(stack)).toEqual([]);
      }),
      { numRuns: RUNS },
    );
  });

  it("un script, lui, écrit dans un champ verrouillé sans que le verrou crie", () => {
    const stack = buildStack({ level: 5, awake: true, provenance: { kind: "created" } });
    const op: Op = { kind: "setText", cardId: IDS.agentCard, partId: IDS.ownLockedField, before: "", after: "script", inkBefore: null, inkAfter: null };
    const ctx: ActorContext = { stack, actor: { kind: "script", objectId: IDS.ownField }, cardId: IDS.agentCard };
    expect(authorizeOp(ctx, op).allow).toBe(true);
    const after = applyOp(stack, op);
    expect(checkLockedHeld(stack, after, "script")).toEqual([]);
    // Et l'agent, lui, aurait été refusé : le contraste est la preuve.
    const agent: ActorContext = { stack, actor: { kind: "agent", cardId: IDS.agentCard, level: 5 }, cardId: IDS.agentCard };
    expect(authorizeOp(agent, op).allow).toBe(false);
  });
});
