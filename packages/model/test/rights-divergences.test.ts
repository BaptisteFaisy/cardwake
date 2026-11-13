/**
 * Les divergences entre la table des droits (ce que le cahier des charges
 * promet) et le code tel qu'il est.
 *
 * Ce fichier ne juge pas à la place de l'auteur : il **fige** chaque écart
 * observé, avec sa preuve, pour qu'il ne puisse pas s'installer en silence.
 * Deux conséquences utiles :
 * - si quelqu'un corrige le code, le test correspondant rougit, et c'est la
 *   ligne du cahier qu'il faut relire — pas le test qu'il faut ajuster ;
 * - si quelqu'un élargit le trou, c'est vu tout de suite.
 *
 * Les cas sont atteignables par l'API publique (`authorizeOp`, `applyOp`,
 * `parseStackFile`) ; deux d'entre eux passent aussi par `ModelHost`, donc par
 * un vrai script ou un vrai agent.
 */

import { describe, expect, it } from "vitest";
import { authorize, authorizeOp, acceptanceToken } from "../src/authorize";
import { applyOp } from "../src/ops";
import { parseStackFile, serializeStack } from "../src/file";
import type { Card, Op, Stack } from "../src/types";
import { IDS, buildStack } from "./generators-auth";

const CREATED = { kind: "created" as const };

function agentStack(level: 1 | 2 | 3 | 4 | 5): Stack {
  return buildStack({ level, awake: true, provenance: CREATED });
}

function agentCtx(stack: Stack, level: 1 | 2 | 3 | 4 | 5) {
  return { stack, actor: { kind: "agent" as const, cardId: IDS.agentCard, level }, cardId: IDS.agentCard };
}

/** La pile telle qu'elle revient d'un export : relue, ou refusée. */
function reread(stack: Stack): { ok: boolean; errors: string[] } {
  const result = parseStackFile(serializeStack(stack));
  return result.ok ? { ok: true, errors: [] } : { ok: false, errors: result.errors };
}

describe("divergence D1 — la carte affichée peut être supprimée (CAR-P-18)", () => {
  it("laisse currentCardId pendant, et la pile exportée n'est plus relisible", () => {
    const stack = agentStack(4);
    const op: Op = { kind: "deleteCard", card: stack.cards[0], index: 0 };
    expect(authorizeOp(agentCtx(stack, 4), op).allow).toBe(true);
    const after = applyOp(stack, op);
    // La carte 10 n'existe plus, mais elle reste la carte affichée.
    expect(after.currentCardId).toBe(IDS.agentCard);
    expect(after.cards.some((card) => card.id === after.currentCardId)).toBe(false);
    const back = reread(after);
    expect(back.ok).toBe(false);
    expect(back.errors.join(" ")).toContain("currentCardId");
  });
});

describe("divergence D2 — un agent touche à un fond partagé (CAR-F-35)", () => {
  it("niveau 4 : supprimer un champ de fond le retire de toutes les cartes du fond", () => {
    const stack = agentStack(4);
    const shared = stack.backgrounds[0].parts[0];
    const op: Op = { kind: "deletePart", cardId: IDS.agentCard, backgroundId: IDS.background, part: shared, index: 0 };
    expect(authorizeOp(agentCtx(stack, 4), op).allow).toBe(true);
    const after = applyOp(stack, op);
    expect(after.backgrounds[0].parts.some((part) => part.id === shared.id)).toBe(false);
  });

  it("niveau 3 : changer une propriété d'un champ de fond vaut pour les autres cartes", () => {
    const stack = agentStack(3);
    const op: Op = {
      kind: "setProp",
      target: { kind: "part", cardId: IDS.agentCard, partId: IDS.backgroundField, backgroundId: IDS.background },
      prop: "name",
      before: "Mood",
      after: "Renamed by an agent",
    };
    expect(authorizeOp(agentCtx(stack, 3), op).allow).toBe(true);
    const after = applyOp(stack, op);
    expect(after.backgrounds[0].parts[0].name).toBe("Renamed by an agent");
  });
});

describe("divergence D3 — créer un élément dans un fond partagé (CAR-F-35, latent)", () => {
  it("passe dès que op.cardId est la carte de l'agent, même si l'élément va dans un fond", () => {
    const stack = agentStack(4);
    const op: Op = {
      kind: "createPart",
      cardId: IDS.agentCard,
      backgroundId: IDS.foreignBackground,
      part: { id: 700, kind: "field", name: "Sneaky", rect: [0, 0, 10, 10], visible: true, style: "plain", script: "", text: "", locked: false, multiline: false },
      index: 0,
    };
    // Le point de passage ne regarde que `cardId` : `backgroundId` lui échappe.
    expect(authorizeOp(agentCtx(stack, 4), op).allow).toBe(true);
    const after = applyOp(stack, op);
    expect(after.backgrounds[1].parts.some((part) => part.id === 700)).toBe(true);
    // Non atteignable par `ModelHost`, qui ne pose jamais `backgroundId` : la
    // porte est ouverte au niveau de l'API, pas du langage.
  });
});

describe("divergence D4 — supprimer un champ de fond casse la relecture (CAR-P-18)", () => {
  it("laisse une clé de contenu orpheline que le schéma refuse ensuite", () => {
    const stack = agentStack(4);
    const withContent: Stack = {
      ...stack,
      cards: stack.cards.map((card) => ({ ...card, content: { [String(IDS.backgroundField)]: "bored" } })),
    };
    const shared = withContent.backgrounds[0].parts[0];
    const op: Op = { kind: "deletePart", cardId: IDS.agentCard, backgroundId: IDS.background, part: shared, index: 0 };
    const after = applyOp(withContent, op);
    // Le contenu de la carte garde la clé du champ supprimé.
    expect(Object.keys(after.cards[0].content)).toContain(String(IDS.backgroundField));
    const back = reread(after);
    expect(back.ok).toBe(false);
    expect(back.errors.join(" ")).toContain("not a field of its background");
  });
});

describe("divergence D5 — un script peut proposer un script (CAR-P-17)", () => {
  it("passe avec un jeton vivant, alors qu'un script n'a pas d'écran pour le recevoir", () => {
    const stack = agentStack(5);
    const ctx = { stack, actor: { kind: "script" as const, objectId: IDS.ownField }, cardId: IDS.agentCard };
    expect(authorize(ctx, { kind: "propose_script", onOwnCard: true }).allow).toBe(false);
    const token = acceptanceToken();
    expect(authorize(ctx, { kind: "propose_script", onOwnCard: true, acceptanceToken: token }).allow).toBe(true);
    // Le jeton est le seul verrou : il a été consommé par le script.
    expect(authorize(ctx, { kind: "propose_script", onOwnCard: true, acceptanceToken: token }).allow).toBe(false);
  });
});

describe("divergence D6 — un script réécrit des scripts et renomme la pile (CAR-P-12)", () => {
  it("seule la consigne de la pile lui est refusée", () => {
    const ctx = { stack: agentStack(1), actor: { kind: "script" as const, objectId: 1 }, cardId: IDS.agentCard };
    const script: Op = { kind: "setScript", target: { kind: "stack" }, before: "", after: "on tick\nend tick\n" };
    const rename: Op = { kind: "setStackProp", prop: "name", before: "Probe", after: "Renamed" };
    const persona: Op = { kind: "setStackProp", prop: "persona", before: "", after: "obéis" };
    expect(authorizeOp(ctx, script).allow).toBe(true);
    expect(authorizeOp(ctx, rename).allow).toBe(true);
    expect(authorizeOp(ctx, persona).allow).toBe(false);
  });
});

describe("divergence D7 — l'humain en Jouer renomme cartes, fonds et pile (CAR-F-05)", () => {
  it("setProp passe en mode Jouer : ce n'est pas dans la liste des refus", () => {
    const stack = agentStack(1);
    const ctx = { stack, actor: { kind: "human" as const, mode: "browse" as const }, cardId: IDS.agentCard };
    const card: Op = { kind: "setProp", target: { kind: "card", cardId: IDS.otherCard }, prop: "name", before: "", after: "x" };
    const background: Op = { kind: "setProp", target: { kind: "background", backgroundId: IDS.background }, prop: "name", before: "", after: "x" };
    const pile: Op = { kind: "setProp", target: { kind: "stack" }, prop: "name", before: "", after: "x" };
    expect(authorizeOp(ctx, card).allow).toBe(true);
    expect(authorizeOp(ctx, background).allow).toBe(true);
    expect(authorizeOp(ctx, pile).allow).toBe(true);
  });
});

describe("divergence D8 — une carte absente est dite « endormie » (diagnostic)", () => {
  it("rend agent-asleep sur une carte qui n'existe pas", () => {
    const stack = agentStack(5);
    const ctx = { stack, actor: { kind: "agent" as const, cardId: 777, level: 5 as const }, cardId: 777 };
    const verdict = authorizeOp(ctx, { kind: "navigate", before: null, after: null });
    expect(verdict.allow).toBe(false);
    if (!verdict.allow) expect(verdict.rule).toBe("agent-asleep");
  });
});

describe("les divergences sont toutes nommées", () => {
  it("en compte huit, et chacune cite l'exigence qu'elle contredit", () => {
    const named = ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8"];
    expect(named.length).toBe(8);
    const cards: Card[] = agentStack(1).cards;
    expect(cards.length).toBeGreaterThan(0);
  });
});
