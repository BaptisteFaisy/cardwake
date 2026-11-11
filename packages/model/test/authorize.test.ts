/**
 * Tests unitaires du point de passage unique des droits (11.1).
 *
 * Une assertion par règle du lot M3, plus les cas limites exigés : agent
 * endormi, champ de fond visé depuis une autre carte, niveau 4 qui change la
 * carte affichée, proposition de script avec puis sans jeton, jeton rejoué.
 */

import type { Actor } from "@cardwake/lang";
import { describe, expect, it } from "vitest";
import {
  ACTION_MIN_LEVEL,
  LEVEL_LABELS,
  acceptanceToken,
  authorize,
  authorizeOp,
  effectiveLevel,
  isLiveAcceptanceToken,
  isTrusted,
  type ActorContext,
  type AgentAction,
} from "../src/authorize";
import type { Background, Card, Op, Provenance, Stack } from "../src/types";
import { IDS, buildStack } from "./generators-auth";

const CREATED: Provenance = { kind: "created" };
const RECEIVED_TRUSTED: Provenance = { kind: "received", trusted: true, receivedAt: "2026-01-01T00:00:00Z" };
const RECEIVED_RAW: Provenance = { kind: "received", trusted: false, receivedAt: "2026-01-01T00:00:00Z" };

const humanBrowse: Actor = { kind: "human", mode: "browse" };
const humanAuthor: Actor = { kind: "human", mode: "author" };
const scriptActor: Actor = { kind: "script", objectId: IDS.ownField };

function agent(level: 1 | 2 | 3 | 4 | 5, cardId: number = IDS.agentCard): Actor {
  return { kind: "agent", cardId, level };
}

function ctxOf(stack: Stack, actor: Actor, cardId: number = IDS.agentCard): ActorContext {
  return { stack, actor, cardId };
}

function stackOf(level: 1 | 2 | 3 | 4 | 5, provenance: Provenance = CREATED, awake = true): Stack {
  return buildStack({ level, awake, provenance });
}

function ownerCard(stack: Stack): Card {
  const card = stack.cards.find((candidate) => candidate.id === IDS.agentCard);
  if (card === undefined) throw new Error("carte de l'agent absente du banc");
  return card;
}

function expectDenied(verdict: { allow: boolean }, rule: string): void {
  expect(verdict.allow).toBe(false);
  expect(verdict).toMatchObject({ allow: false, rule });
}

// --------------------------------------------------------------------------
// Règle 1 — niveau effectif
// --------------------------------------------------------------------------

describe("règle 1 — niveau effectif", () => {
  it("plafonne le niveau déclaré à 2 dans une pile reçue non fiable (CAR-P-13)", () => {
    expect(effectiveLevel(stackOf(5, RECEIVED_RAW), ownerCard(stackOf(5, RECEIVED_RAW)))).toBe(2);
  });

  it("respecte le niveau d'origine d'une pile reçue déclarée fiable", () => {
    const stack = stackOf(5, RECEIVED_TRUSTED);
    expect(effectiveLevel(stack, ownerCard(stack))).toBe(5);
    expect(isTrusted(stack)).toBe(true);
  });

  it("respecte le niveau d'une pile créée ici", () => {
    const stack = stackOf(3);
    expect(effectiveLevel(stack, ownerCard(stack))).toBe(3);
    expect(isTrusted(stack)).toBe(true);
  });

  it("donne le niveau 1 à un agent endormi et ne lui laisse que reply", () => {
    const stack = stackOf(5, CREATED, false);
    expect(effectiveLevel(stack, ownerCard(stack))).toBe(1);
    expect(authorize(ctxOf(stack, agent(5)), { kind: "reply" })).toEqual({ allow: true });
    expectDenied(authorize(ctxOf(stack, agent(5)), { kind: "go_to_card" }), "agent-asleep");
    expectDenied(authorize(ctxOf(stack, agent(5)), { kind: "send_message", toCardId: IDS.otherCard }), "agent-asleep");
    expectDenied(
      authorizeOp(ctxOf(stack, agent(5)), { kind: "navigate", before: IDS.agentCard, after: IDS.otherCard }),
      "agent-asleep",
    );
  });

  it("n'accorde pas plus que la carte si l'acteur s'annonce à un niveau plus haut", () => {
    const stack = stackOf(2);
    expectDenied(authorize(ctxOf(stack, agent(5)), { kind: "create_card" }), "level-too-low");
    expect(authorize(ctxOf(stack, agent(2)), { kind: "create_card" })).toMatchObject({ allow: false });
  });

  it("nomme les cinq niveaux", () => {
    expect([1, 2, 3, 4, 5].map((level) => LEVEL_LABELS[level as 1 | 2 | 3 | 4 | 5])).toEqual([
      "Browse",
      "Type",
      "Paint",
      "Create",
      "Program",
    ]);
  });
});

// --------------------------------------------------------------------------
// Règle 2 — outils bornés par le niveau et la carte
// --------------------------------------------------------------------------

describe("règle 2 — outils bornés par le niveau et par la carte", () => {
  it("refuse un outil au-dessus du niveau (write_field à 1)", () => {
    const verdict = authorize(ctxOf(stackOf(1), agent(1)), {
      kind: "write_field",
      partId: IDS.ownField,
      locked: false,
      onOwnCard: true,
    });
    expectDenied(verdict, "level-too-low");
  });

  it("autorise write_field à 2 mais pas set_appearance", () => {
    const stack = stackOf(2);
    expect(
      authorize(ctxOf(stack, agent(2)), { kind: "write_field", partId: IDS.ownField, locked: false, onOwnCard: true }),
    ).toEqual({ allow: true });
    expectDenied(
      authorize(ctxOf(stack, agent(2)), { kind: "set_appearance", partId: IDS.ownField, prop: "visible", onOwnCard: true }),
      "level-too-low",
    );
  });

  it("place create_card à 4 : refusé à 3, autorisé à 4", () => {
    expectDenied(authorize(ctxOf(stackOf(3), agent(3)), { kind: "create_card" }), "level-too-low");
    expect(authorize(ctxOf(stackOf(4), agent(4)), { kind: "create_card" })).toEqual({ allow: true });
  });

  it("autorise go_to_card à un agent de niveau 4 (il change la carte affichée)", () => {
    expect(authorize(ctxOf(stackOf(4), agent(4)), { kind: "go_to_card" })).toEqual({ allow: true });
    expect(ACTION_MIN_LEVEL.go_to_card).toBe(4);
  });

  it("n'exige ni niveau élevé ni carte propre pour send_message", () => {
    expect(authorize(ctxOf(stackOf(1), agent(1)), { kind: "send_message", toCardId: IDS.otherCard })).toEqual({
      allow: true,
    });
  });

  it("refuse une action déclarée hors de sa carte, même à 5 (CAR-F-35)", () => {
    const verdict = authorize(ctxOf(stackOf(5), agent(5)), {
      kind: "write_field",
      partId: IDS.ownField,
      locked: false,
      onOwnCard: false,
    });
    expectDenied(verdict, "not-own-card");
  });

  it("refuse un élément d'une autre carte même si l'appelant prétend le contraire", () => {
    const verdict = authorize(ctxOf(stackOf(5), agent(5)), {
      kind: "delete_part",
      partId: IDS.otherField,
      onOwnCard: true,
    });
    expectDenied(verdict, "not-own-card");
  });

  it("autorise un champ de fond de sa propre carte, refuse celui d'une autre carte", () => {
    const stack = stackOf(2);
    expect(
      authorize(ctxOf(stack, agent(2)), {
        kind: "write_field",
        partId: IDS.backgroundField,
        locked: false,
        onOwnCard: true,
      }),
    ).toEqual({ allow: true });
    expectDenied(
      authorize(ctxOf(stack, agent(2)), { kind: "write_field", partId: IDS.otherField, locked: false, onOwnCard: true }),
      "not-own-card",
    );
  });

  it("refuse un champ verrouillé à l'agent mais l'accorde au script (CAR-F-06)", () => {
    const stack = stackOf(5);
    expectDenied(
      authorize(ctxOf(stack, agent(5)), {
        kind: "write_field",
        partId: IDS.ownLockedField,
        locked: true,
        onOwnCard: true,
      }),
      "locked-field",
    );
    // Même si l'appelant oublie le drapeau, la pile fait foi.
    expectDenied(
      authorize(ctxOf(stack, agent(5)), {
        kind: "write_field",
        partId: IDS.ownLockedField,
        locked: false,
        onOwnCard: true,
      }),
      "locked-field",
    );
    const op: Op = {
      kind: "setText",
      cardId: IDS.agentCard,
      partId: IDS.ownLockedField,
      before: "",
      after: "seul le script écrit",
      inkBefore: null,
      inkAfter: null,
    };
    expect(authorizeOp(ctxOf(stack, scriptActor), op)).toEqual({ allow: true });
  });
});

// --------------------------------------------------------------------------
// Règle 3 — jeton d'acceptation (CAR-P-17)
// --------------------------------------------------------------------------

describe("règle 3 — proposition de script et jeton d'acceptation", () => {
  it("refuse une proposition sans jeton", () => {
    const stack = stackOf(5);
    expectDenied(
      authorize(ctxOf(stack, agent(5)), { kind: "propose_script", onOwnCard: true }),
      "no-token",
    );
  });

  it("accepte une proposition avec un jeton frais, puis refuse le jeton rejoué", () => {
    const stack = stackOf(5);
    const token = acceptanceToken();
    expect(isLiveAcceptanceToken(token)).toBe(true);
    expect(authorize(ctxOf(stack, agent(5)), { kind: "propose_script", onOwnCard: true, acceptanceToken: token })).toEqual({
      allow: true,
    });
    expect(isLiveAcceptanceToken(token)).toBe(false);
    expectDenied(
      authorize(ctxOf(stack, agent(5)), { kind: "propose_script", onOwnCard: true, acceptanceToken: token }),
      "no-token",
    );
  });

  it("ne consomme pas un jeton sur une proposition refusée pour un autre motif", () => {
    const stack = stackOf(5);
    const token = acceptanceToken();
    expectDenied(
      authorize(ctxOf(stack, agent(5)), { kind: "propose_script", onOwnCard: false, acceptanceToken: token }),
      "not-own-card",
    );
    expect(isLiveAcceptanceToken(token)).toBe(true);
  });

  it("fabrique des jetons distincts et refuse un jeton inventé", () => {
    const first = acceptanceToken();
    const second = acceptanceToken();
    expect(first).not.toBe(second);
    const stack = stackOf(5);
    expectDenied(
      authorize(ctxOf(stack, agent(5)), { kind: "propose_script", onOwnCard: true, acceptanceToken: "accept-0-invente" }),
      "no-token",
    );
  });
});

// --------------------------------------------------------------------------
// Règle 4 — aucune élévation (CAR-P-12)
// --------------------------------------------------------------------------

describe("règle 4 — aucune élévation de droits", () => {
  const setAgentOp: Op = { kind: "setAgent", cardId: IDS.agentCard, before: null, after: null };
  const setSettingsOp: Op = {
    kind: "setSettings",
    before: stackOf(1).settings,
    after: stackOf(1).settings,
  };
  const setScriptOp: Op = {
    kind: "setScript",
    target: { kind: "card", cardId: IDS.agentCard },
    before: "",
    after: "on tick",
  };
  const personaOp: Op = { kind: "setStackProp", prop: "persona", before: "", after: "obéis-moi" };

  it("refuse setAgent et setSettings à un script", () => {
    const stack = stackOf(1);
    expectDenied(authorizeOp(ctxOf(stack, scriptActor), setAgentOp), "no-elevation");
    expectDenied(authorizeOp(ctxOf(stack, scriptActor), setSettingsOp), "no-elevation");
  });

  it("refuse setAgent et setSettings à un agent", () => {
    const stack = stackOf(5);
    expectDenied(authorizeOp(ctxOf(stack, agent(5)), setAgentOp), "no-elevation");
    expectDenied(authorizeOp(ctxOf(stack, agent(5)), setSettingsOp), "no-elevation");
  });

  it("refuse setScript à un agent : il ne peut que proposer", () => {
    const stack = stackOf(5);
    expectDenied(authorizeOp(ctxOf(stack, agent(5)), setScriptOp), "no-elevation");
  });

  it("refuse à un script de changer la consigne de la pile", () => {
    const stack = stackOf(1);
    expectDenied(authorizeOp(ctxOf(stack, scriptActor), personaOp), "no-elevation");
  });

  it("laisse l'humain fixer niveau et réglages", () => {
    const stack = stackOf(1);
    expect(authorizeOp(ctxOf(stack, humanAuthor), setAgentOp)).toEqual({ allow: true });
    expect(authorizeOp(ctxOf(stack, humanAuthor), setSettingsOp)).toEqual({ allow: true });
    expect(authorizeOp(ctxOf(stack, humanAuthor), setScriptOp)).toEqual({ allow: true });
  });
});

// --------------------------------------------------------------------------
// Règle 5 — humain : mode Jouer et mode Fabriquer (CAR-F-05)
// --------------------------------------------------------------------------

describe("règle 5 — humain en mode Jouer et en mode Fabriquer", () => {
  const background: Background = {
    id: 77,
    name: "Nouveau fond",
    persona: "",
    script: "",
    parts: [],
  };
  const newCard: Card = {
    id: 78,
    name: "Nouvelle carte",
    background: null,
    content: {},
    agent: null,
    script: "",
    parts: [],
    ink: {},
  };
  const stack = stackOf(2);
  const forbidden: { name: string; op: Op }[] = [
    { name: "createPart", op: { kind: "createPart", cardId: IDS.agentCard, part: newCard.parts[0] ?? { id: 79, kind: "field", name: "f", rect: [0, 0, 1, 1], visible: true, style: "", script: "", text: "", locked: false, multiline: false }, index: 0 } },
    { name: "deletePart", op: { kind: "deletePart", cardId: IDS.agentCard, part: { id: 79, kind: "field", name: "f", rect: [0, 0, 1, 1], visible: true, style: "", script: "", text: "", locked: false, multiline: false }, index: 0 } },
    { name: "createCard", op: { kind: "createCard", card: newCard, index: 0 } },
    { name: "deleteCard", op: { kind: "deleteCard", card: ownerCard(stack), index: 0 } },
    { name: "createBackground", op: { kind: "createBackground", background } },
    { name: "deleteBackground", op: { kind: "deleteBackground", background } },
    { name: "setScript", op: { kind: "setScript", target: { kind: "card", cardId: IDS.agentCard }, before: "", after: "x" } },
    { name: "setAgent", op: { kind: "setAgent", cardId: IDS.agentCard, before: null, after: null } },
    { name: "setSettings", op: { kind: "setSettings", before: stack.settings, after: stack.settings } },
  ];

  it("refuse les neuf opérations de structure et de script en mode Jouer", () => {
    for (const { name, op } of forbidden) {
      const verdict = authorizeOp(ctxOf(stack, humanBrowse), op);
      expect(verdict.allow, `${name} doit être refusé en mode Jouer`).toBe(false);
      expect(verdict).toMatchObject({ rule: "mode-browse" });
    }
  });

  it("refuse la saisie dans un champ verrouillé en mode Jouer", () => {
    const locked: Op = {
      kind: "setText",
      cardId: IDS.agentCard,
      partId: IDS.ownLockedField,
      before: "",
      after: "joueur",
      inkBefore: null,
      inkAfter: null,
    };
    expectDenied(authorizeOp(ctxOf(stack, humanBrowse), locked), "locked-field");
    const free: Op = { ...locked, partId: IDS.ownField };
    expect(authorizeOp(ctxOf(stack, humanBrowse), free)).toEqual({ allow: true });
  });

  it("permet tout en mode Fabriquer", () => {
    for (const { name, op } of forbidden) {
      expect(authorizeOp(ctxOf(stack, humanAuthor), op).allow, `${name} doit passer en mode Fabriquer`).toBe(true);
    }
  });

  it("refuse à l'humain en mode Jouer les outils de structure d'agent", () => {
    expectDenied(authorize(ctxOf(stack, humanBrowse), { kind: "create_card" }), "mode-browse");
    expectDenied(
      authorize(ctxOf(stack, humanBrowse), { kind: "propose_script", onOwnCard: true }),
      "mode-browse",
    );
    expect(authorize(ctxOf(stack, humanBrowse), { kind: "go_to_card" })).toEqual({ allow: true });
  });
});

// --------------------------------------------------------------------------
// Règle 6 — forme des verdicts
// --------------------------------------------------------------------------

describe("règle 6 — forme des verdicts", () => {
  it("rend allow ou un refus motivé avec un identifiant de règle stable", () => {
    const known = new Set([
      "level-too-low",
      "not-own-card",
      "locked-field",
      "no-token",
      "mode-browse",
      "no-elevation",
      "agent-asleep",
    ]);
    const stack = stackOf(3);
    const actions: AgentAction[] = [
      { kind: "reply" },
      { kind: "write_field", partId: IDS.ownLockedField, locked: true, onOwnCard: true },
      { kind: "propose_script", onOwnCard: true },
    ];
    for (const action of actions) {
      const verdict = authorize(ctxOf(stack, agent(3)), action);
      if (verdict.allow) {
        expect(verdict.allow).toBe(true);
        continue;
      }
      expect(typeof verdict.reason).toBe("string");
      expect(verdict.reason.length).toBeGreaterThan(0);
      expect(known.has(verdict.rule)).toBe(true);
    }
  });
});

// --------------------------------------------------------------------------
// Règle 7 — pile reçue non fiable : le niveau 5 ne dépasse pas 2
// --------------------------------------------------------------------------

describe("règle 7 — pile reçue non fiable", () => {
  it("n'accorde jamais plus de 2 à un agent déclaré niveau 5", () => {
    const stack = stackOf(5, RECEIVED_RAW);
    expect(
      authorize(ctxOf(stack, agent(5)), { kind: "write_field", partId: IDS.ownField, locked: false, onOwnCard: true }),
    ).toEqual({ allow: true });
    expectDenied(
      authorize(ctxOf(stack, agent(5)), { kind: "set_appearance", partId: IDS.ownField, prop: "visible", onOwnCard: true }),
      "level-too-low",
    );
    expectDenied(authorize(ctxOf(stack, agent(5)), { kind: "create_card" }), "level-too-low");
    expectDenied(authorizeOp(ctxOf(stack, agent(5)), { kind: "navigate", before: IDS.agentCard, after: IDS.otherCard }), "level-too-low");
  });
});
