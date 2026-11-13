/**
 * Test de mutation, écrit à la main : la promesse « aucun agent ne dépasse son
 * niveau » tient-elle à une règle, ou seulement au hasard des tests ?
 *
 * Sans outil de mutation, on fait le travail à l'envers : pour **chaque** règle
 * de `authorize`, on construit un couple de situations qui ne diffèrent que par
 * la condition de cette règle. Le témoin doit être autorisé, le mutant refusé,
 * et le refus doit porter **la règle exacte** — pas seulement `allow: false`.
 * Si la règle disparaissait du code (mutation), le mutant passerait et ce test
 * rougirait ; si elle était décalée d'un cran, la montée niveau par niveau le
 * verrait. C'est la seule façon de prouver qu'une règle sert, plutôt que de
 * constater qu'elle est là.
 *
 * Les sept règles éprouvées : niveau (`level-too-low`), carte
 * (`not-own-card`), verrou (`locked-field`), éveil (`agent-asleep`), mode
 * (`mode-browse`), élévation (`no-elevation`), jeton (`no-token`).
 */

import { describe, expect, it } from "vitest";
import { acceptanceToken, authorize, authorizeOp } from "../src/authorize";
import type { AgentAction, ActorContext } from "../src/authorize";
import type { AgentLevel, Op, Stack, Verdict } from "../src/types";
import { IDS, buildStack } from "./generators-auth";
import { OP_RULES } from "./rights-table";

const LEVELS: AgentLevel[] = [1, 2, 3, 4, 5];

function stackAt(level: AgentLevel, awake = true): Stack {
  return buildStack({ level, awake, provenance: { kind: "created" } });
}

function ctxAt(stack: Stack, level: AgentLevel, cardId: number = IDS.agentCard): ActorContext {
  return { stack, actor: { kind: "agent", cardId, level }, cardId };
}

function ruleOf(verdict: Verdict): string {
  return verdict.allow ? "allow" : verdict.rule;
}

/**
 * Une opération bien formée par variante : sur sa propre carte, sans verrou et
 * sans partage, pour que seule la règle du niveau puisse la refuser.
 */
function opByKind(stack: Stack): Record<string, Op> {
  const own = stack.cards[0];
  return {
    setText: { kind: "setText", cardId: IDS.agentCard, partId: IDS.ownField, before: "", after: "x", inkBefore: null, inkAfter: null },
    setProp: { kind: "setProp", target: { kind: "part", cardId: IDS.agentCard, partId: IDS.ownField }, prop: "visible", before: "true", after: "false" },
    setScript: { kind: "setScript", target: { kind: "card", cardId: IDS.agentCard }, before: "", after: "on tick\nend tick\n" },
    createPart: { kind: "createPart", cardId: IDS.agentCard, part: own.parts[0], index: 0 },
    deletePart: { kind: "deletePart", cardId: IDS.agentCard, part: own.parts[0], index: 0 },
    createCard: { kind: "createCard", card: own, index: 0 },
    deleteCard: { kind: "deleteCard", card: own, index: 0 },
    moveCard: { kind: "moveCard", cardId: IDS.agentCard, from: 0, to: 1 },
    navigate: { kind: "navigate", before: IDS.agentCard, after: IDS.otherCard },
    createBackground: { kind: "createBackground", background: { id: 880, name: "B", persona: "", script: "", parts: [] } },
    deleteBackground: { kind: "deleteBackground", background: stack.backgrounds[1] },
    setAgent: { kind: "setAgent", cardId: IDS.agentCard, before: null, after: null },
    setStackProp: { kind: "setStackProp", prop: "name", before: "Probe", after: "Renamed" },
    setSettings: { kind: "setSettings", before: stack.settings, after: stack.settings },
  };
}

/** Les variantes qu'une suite de crans doit ouvrir, cran par cran. */
const OPENS_AT: Record<AgentLevel, Op["kind"][]> = {
  1: [],
  2: ["setText"],
  3: ["setProp"],
  4: ["createPart", "deletePart", "createCard", "deleteCard", "moveCard", "navigate"],
  5: [],
};

describe("mutation — la règle de niveau, cran par cran", () => {
  it("chaque cran ouvre exactement les variantes dont il est le minimum", () => {
    for (const level of LEVELS) {
      const stack = stackAt(level);
      const ops = opByKind(stack);
      const allowed = Object.entries(ops)
        .filter(([, op]) => authorizeOp(ctxAt(stack, level), op).allow)
        .map(([kind]) => kind)
        .sort();
      // Ce que le niveau ouvre *par rapport aux variantes gouvernées* : les
      // opérations de droits et de structure partagée restent fermées.
      const opened = LEVELS.filter((value) => value <= level).flatMap((value) => OPENS_AT[value]).sort();
      expect(allowed, `niveau ${level} : variantes ouvertes`).toEqual(opened);
    }
  });

  it("n'ouvre aucune variante d'opération au-delà du niveau 4 : Program sert ailleurs", () => {
    const level5 = opByKind(stackAt(5));
    const level4 = opByKind(stackAt(4));
    const at4 = Object.keys(level4).filter((kind) => authorizeOp(ctxAt(stackAt(4), 4), level4[kind]).allow);
    const at5 = Object.keys(level5).filter((kind) => authorizeOp(ctxAt(stackAt(5), 5), level5[kind]).allow);
    expect(at5.sort()).toEqual(at4.sort());
  });

  it("refuse tout, sauf rien, au niveau 1 : Browse ne modifie pas la pile", () => {
    const stack = stackAt(1);
    for (const [kind, op] of Object.entries(opByKind(stack))) {
      expect(ruleOf(authorizeOp(ctxAt(stack, 1), op)), `niveau 1 — ${kind}`).not.toBe("allow");
    }
  });

  it("décale d'un cran si le minimum de chaque variante était faux", () => {
    // Le témoin : au niveau minimum, la variante passe. Le mutant : un cran
    // plus bas, elle est refusée pour la bonne raison. Si le minimum de la
    // table et celui du code divergeaient, ce couple ne tiendrait pas.
    for (const level of LEVELS) {
      const stack = stackAt(level);
      const ops = opByKind(stack);
      for (const kind of OPENS_AT[level]) {
        const op = ops[kind];
        expect(authorizeOp(ctxAt(stack, level), op).allow, `niveau ${level} — ${kind} doit passer`).toBe(true);
        if (level === 1) continue;
        const below = stackAt((level - 1) as AgentLevel);
        const verdict = authorizeOp(ctxAt(below, (level - 1) as AgentLevel), opByKind(below)[kind]);
        expect(ruleOf(verdict), `niveau ${level - 1} — ${kind} doit être refusé`).toBe("level-too-low");
      }
    }
  });

  it("nomme le niveau requis et le niveau constaté dans chaque refus", () => {
    const stack = stackAt(1);
    const verdict = authorizeOp(ctxAt(stack, 1), opByKind(stack).setProp);
    if (verdict.allow) throw new Error("setProp doit être refusé au niveau 1");
    expect(verdict.reason).toContain('"setProp"');
    expect(verdict.reason).toContain("needs level 3 (Paint)");
    expect(verdict.reason).toContain("level 1 (Browse)");
    // La table dit la même chose que le message.
    expect(OP_RULES.setProp.min).toBe(3);
  });
});

describe("mutation — retirer une règle change le verdict", () => {
  const cases: { rule: string; witness: () => Verdict; mutant: () => Verdict; why: string }[] = [
    {
      rule: "level-too-low",
      why: "même outil, même carte, un niveau de moins",
      witness: () => authorize(ctxAt(stackAt(2), 2), { kind: "write_field", partId: IDS.ownField, locked: false, onOwnCard: true }),
      mutant: () => authorize(ctxAt(stackAt(1), 1), { kind: "write_field", partId: IDS.ownField, locked: false, onOwnCard: true }),
    },
    {
      rule: "not-own-card",
      why: "même niveau, la même écriture déclarée hors de sa carte",
      witness: () => authorize(ctxAt(stackAt(5), 5), { kind: "write_field", partId: IDS.ownField, locked: false, onOwnCard: true }),
      mutant: () => authorize(ctxAt(stackAt(5), 5), { kind: "write_field", partId: IDS.ownField, locked: false, onOwnCard: false }),
    },
    {
      rule: "locked-field",
      why: "deux champs de la même carte, l'un verrouillé",
      witness: () => authorize(ctxAt(stackAt(5), 5), { kind: "write_field", partId: IDS.ownField, locked: false, onOwnCard: true }),
      mutant: () => authorize(ctxAt(stackAt(5), 5), { kind: "write_field", partId: IDS.ownLockedField, locked: true, onOwnCard: true }),
    },
    {
      rule: "agent-asleep",
      why: "même carte, même niveau déclaré, l'agent dort",
      witness: () => authorize(ctxAt(stackAt(4), 4), { kind: "create_card" }),
      mutant: () => authorize(ctxAt(stackAt(4, false), 4), { kind: "create_card" }),
    },
    {
      rule: "mode-browse",
      why: "même opération permise à l'auteur, refusée au joueur",
      witness: () =>
        authorizeOp(
          { stack: stackAt(1), actor: { kind: "human", mode: "author" }, cardId: IDS.agentCard },
          { kind: "createCard", card: stackAt(1).cards[0], index: 0 },
        ),
      mutant: () =>
        authorizeOp(
          { stack: stackAt(1), actor: { kind: "human", mode: "browse" }, cardId: IDS.agentCard },
          { kind: "createCard", card: stackAt(1).cards[0], index: 0 },
        ),
    },
    {
      rule: "no-elevation",
      why: "même opération, l'acteur n'est pas humain",
      witness: () =>
        authorizeOp(
          { stack: stackAt(1), actor: { kind: "human", mode: "author" }, cardId: IDS.agentCard },
          { kind: "setAgent", cardId: IDS.agentCard, before: null, after: null },
        ),
      mutant: () =>
        authorizeOp(ctxAt(stackAt(5), 5), { kind: "setAgent", cardId: IDS.agentCard, before: null, after: null }),
    },
    {
      rule: "no-token",
      why: "même proposition, avec puis sans jeton vivant",
      witness: () => {
        const stack = stackAt(5);
        const action: AgentAction = { kind: "propose_script", onOwnCard: true, acceptanceToken: acceptanceToken() };
        return authorize(ctxAt(stack, 5), action);
      },
      mutant: () => authorize(ctxAt(stackAt(5), 5), { kind: "propose_script", onOwnCard: true }),
    },
  ];

  it("a un témoin autorisé et un mutant refusé pour chacune des sept règles", () => {
    for (const entry of cases) {
      expect(ruleOf(entry.witness()), `${entry.rule} — témoin (${entry.why})`).toBe("allow");
      expect(ruleOf(entry.mutant()), `${entry.rule} — mutant (${entry.why})`).toBe(entry.rule);
    }
  });

  it("couvre les sept règles de refus, sans en oublier une", () => {
    const covered = new Set(cases.map((entry) => entry.rule));
    expect([...covered].sort()).toEqual(
      ["agent-asleep", "level-too-low", "locked-field", "mode-browse", "no-elevation", "no-token", "not-own-card"].sort(),
    );
  });
});
