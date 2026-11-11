/**
 * Tests de propriétés du point de passage unique des droits.
 *
 * CAR-P-11, CAR-P-12, CAR-P-13 et CAR-P-17, avec un **faux modèle adversaire**
 * (les générateurs tirent aussi les actions interdites au niveau courant, vers
 * des cartes qui ne sont pas celle de l'agent). Nombre de tirages :
 * `CARDWAKE_PROP_RUNS`, 100 par défaut.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ACTION_MIN_LEVEL,
  acceptanceToken,
  authorize,
  authorizeOp,
  effectiveLevel,
  isLiveAcceptanceToken,
  type ActorContext,
} from "../src/authorize";
import type { Card, Op, Stack } from "../src/types";
import {
  IDS,
  actionListArb,
  buildStack,
  levelArb,
  opListArb,
  partOnAgentCard,
  provenanceArb,
} from "./generators-auth";

const RUNS = Number(process.env.CARDWAKE_PROP_RUNS ?? 100);

function agentContext(stack: Stack, level: 1 | 2 | 3 | 4 | 5): ActorContext {
  return { stack, actor: { kind: "agent", cardId: IDS.agentCard, level }, cardId: IDS.agentCard };
}

function ownCard(stack: Stack): Card {
  const card = stack.cards.find((candidate) => candidate.id === IDS.agentCard);
  if (card === undefined) throw new Error("carte de l'agent absente");
  return card;
}

/** Photographie de tout ce que seul un humain a le droit de changer. */
function rightsSnapshot(stack: Stack): string {
  return JSON.stringify({
    agents: stack.cards.map((card) => ({ id: card.id, agent: card.agent })),
    stackPersona: stack.persona,
    budgets: {
      hopBudget: stack.settings.hopBudget,
      turns: stack.settings.agentTurnsPerSession,
      inputTokens: stack.settings.agentInputTokensPerSession,
    },
  });
}

/**
 * Applique les seules opérations qui touchent aux droits. Les autres relèvent
 * du module `apply` (autre lot) : ici, seul l'effet sur les droits compte.
 */
function applyRights(stack: Stack, op: Op): Stack {
  switch (op.kind) {
    case "setAgent":
      return {
        ...stack,
        cards: stack.cards.map((card) => (card.id === op.cardId ? { ...card, agent: op.after } : card)),
      };
    case "setSettings":
      return { ...stack, settings: op.after };
    case "setStackProp":
      return op.prop === "persona" ? { ...stack, persona: op.after } : stack;
    default:
      return stack;
  }
}

describe("CAR-P-11 — toute action validée est permise au niveau et vise la carte de l'agent", () => {
  it("résiste à un faux modèle adversaire", () => {
    fc.assert(
      fc.property(levelArb, provenanceArb, fc.boolean(), actionListArb, (level, provenance, awake, actions) => {
        const stack = buildStack({ level, awake, provenance });
        const ctx = agentContext(stack, level);
        const granted = effectiveLevel(stack, ownCard(stack));
        for (const action of actions) {
          const verdict = authorize(ctx, action);
          if (!verdict.allow) continue;
          expect(ACTION_MIN_LEVEL[action.kind]).toBeLessThanOrEqual(granted);
          if ("onOwnCard" in action) expect(action.onOwnCard).toBe(true);
          if ("partId" in action) expect(partOnAgentCard(stack, action.partId)).toBe(true);
        }
      }),
      { numRuns: RUNS },
    );
  });
});

describe("CAR-P-12 — aucune suite ne change niveau, consigne, éveil ni budget", () => {
  const actors: { name: string; actor: ActorContext["actor"] }[] = [
    { name: "agent", actor: { kind: "agent", cardId: IDS.agentCard, level: 5 } },
    { name: "script", actor: { kind: "script", objectId: IDS.ownField } },
    { name: "humain en Jouer", actor: { kind: "human", mode: "browse" } },
  ];

  it("fige les droits pour tout acteur non-humain (et l'humain en Jouer)", () => {
    fc.assert(
      fc.property(levelArb, opListArb, fc.constantFrom(...actors.map((entry) => entry.name)), (level, ops, name) => {
        const chosen = actors.find((entry) => entry.name === name);
        if (chosen === undefined) throw new Error("acteur inconnu");
        const stack = buildStack({ level, awake: true, provenance: { kind: "created" } });
        const ctx: ActorContext = { stack, actor: chosen.actor, cardId: IDS.agentCard };
        const before = rightsSnapshot(stack);
        let after = stack;
        for (const op of ops) {
          if (authorizeOp(ctx, op).allow) after = applyRights(after, op);
        }
        expect(rightsSnapshot(after)).toBe(before);
      }),
      { numRuns: RUNS },
    );
  });
});

describe("CAR-P-13 — pile reçue non fiable : rien au-dessus du niveau 2", () => {
  it("plafonne toute action d'agent, quel que soit le niveau déclaré", () => {
    fc.assert(
      fc.property(levelArb, fc.boolean(), actionListArb, (level, awake, actions) => {
        const stack = buildStack({
          level,
          awake,
          provenance: { kind: "received", trusted: false, receivedAt: "2026-01-01T00:00:00Z" },
        });
        const ctx = agentContext(stack, level);
        expect(effectiveLevel(stack, ownCard(stack))).toBeLessThanOrEqual(2);
        for (const action of actions) {
          if (!authorize(ctx, action).allow) continue;
          expect(ACTION_MIN_LEVEL[action.kind]).toBeLessThanOrEqual(2);
        }
      }),
      { numRuns: RUNS },
    );
  });
});

describe("CAR-P-17 — aucun script d'origine agent sans jeton d'acceptation", () => {
  it("refuse toute proposition dont le jeton n'a pas été émis", () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 12 }), (tokens) => {
        const stack = buildStack({ level: 5, awake: true, provenance: { kind: "created" } });
        const ctx = agentContext(stack, 5);
        for (const token of tokens) {
          const live = isLiveAcceptanceToken(token);
          const verdict = authorize(ctx, { kind: "propose_script", onOwnCard: true, acceptanceToken: token });
          expect(verdict.allow).toBe(live);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("n'accepte pas plus de propositions que de jetons émis", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 6 }), (issued) => {
        const stack = buildStack({ level: 5, awake: true, provenance: { kind: "created" } });
        const ctx = agentContext(stack, 5);
        const tokens = Array.from({ length: issued }, () => acceptanceToken());
        const proposals = [...tokens, ...tokens];
        const allowed = proposals.filter((token) =>
          authorize(ctx, { kind: "propose_script", onOwnCard: true, acceptanceToken: token }).allow,
        );
        expect(allowed.length).toBe(issued);
      }),
      { numRuns: RUNS },
    );
  });

  it("n'autorise jamais un agent à installer lui-même un script", () => {
    fc.assert(
      fc.property(fc.constantFrom<1 | 2 | 3 | 4 | 5>(1, 2, 3, 4, 5), (level) => {
        const stack = buildStack({ level, awake: true, provenance: { kind: "created" } });
        const ctx = agentContext(stack, level);
        const setScript: Op = {
          kind: "setScript",
          target: { kind: "card", cardId: IDS.agentCard },
          before: "",
          after: "on mouseUp\n  put 1 into field \"Notes\"\nend mouseUp",
        };
        const verdict = authorizeOp(ctx, setScript);
        expect(verdict.allow).toBe(false);
        if (!verdict.allow) expect(verdict.rule).toBe("no-elevation");
      }),
      { numRuns: RUNS },
    );
  });
});
