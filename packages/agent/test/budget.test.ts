/**
 * Budgets (7.5, 7.6, CAR-P-15) : les compteurs sont bornés par les réglages, et
 * une fois épuisés, plus rien n'est autorisé et plus rien ne bouge.
 */

import { describe, expect, it } from "vitest";
import { ActionBudgetTracker, SessionBudgetTracker } from "../src/budget";
import { settings } from "./fixtures";

describe("SessionBudgetTracker", () => {
  it("part avec tout son budget", () => {
    const budget = new SessionBudgetTracker(settings());
    expect(budget.verdict()).toEqual({ ok: true });
    expect(budget.snapshot()).toEqual({
      turnsUsed: 0,
      turnsMax: 60,
      inputTokensUsed: 0,
      inputTokensMax: 400_000,
    });
  });

  it("compte les tours et refuse au-delà du réglage", () => {
    const budget = new SessionBudgetTracker(settings({ agentTurnsPerSession: 2 }));
    expect(budget.consumeTurn()).toEqual({ ok: true });
    expect(budget.consumeTurn()).toEqual({ ok: true });
    expect(budget.consumeTurn()).toEqual({ ok: false, reason: "turns-session" });
    expect(budget.snapshot().turnsUsed).toBe(2);
  });

  it("refuse dès que les jetons d'entrée sont épuisés", () => {
    const budget = new SessionBudgetTracker(settings({ agentInputTokensPerSession: 100 }));
    budget.addInputTokens(100);
    expect(budget.verdict()).toEqual({ ok: false, reason: "tokens-session" });
    expect(budget.consumeTurn()).toEqual({ ok: false, reason: "tokens-session" });
    expect(budget.snapshot().turnsUsed).toBe(0);
  });

  it("plafonne les jetons au réglage, jamais au-delà", () => {
    const budget = new SessionBudgetTracker(settings({ agentInputTokensPerSession: 50 }));
    budget.addInputTokens(120);
    expect(budget.snapshot().inputTokensUsed).toBe(50);
    budget.addInputTokens(10);
    expect(budget.snapshot().inputTokensUsed).toBe(50);
  });

  it("ne bouge plus une fois épuisé", () => {
    const budget = new SessionBudgetTracker(
      settings({ agentTurnsPerSession: 1, agentInputTokensPerSession: 10 }),
    );
    budget.consumeTurn();
    const frozen = budget.snapshot();
    for (let index = 0; index < 5; index += 1) {
      expect(budget.consumeTurn().ok).toBe(false);
    }
    expect(budget.snapshot()).toEqual(frozen);
  });

  it("ignore un nombre de jetons absurde", () => {
    const budget = new SessionBudgetTracker(settings({ agentInputTokensPerSession: 10 }));
    budget.addInputTokens(-5);
    budget.addInputTokens(Number.NaN);
    expect(budget.snapshot().inputTokensUsed).toBe(0);
  });

  it("s'endort avec un réglage à zéro", () => {
    const budget = new SessionBudgetTracker(settings({ agentTurnsPerSession: 0 }));
    expect(budget.verdict()).toEqual({ ok: false, reason: "turns-session" });
    expect(budget.consumeTurn().ok).toBe(false);
  });
});

describe("ActionBudgetTracker", () => {
  it("accorde les sauts et les tours de l'action", () => {
    const budget = new ActionBudgetTracker(settings());
    expect(budget.snapshot()).toEqual({ hopsLeft: 3, turnsLeft: 8 });
    expect(budget.consumeHop()).toEqual({ ok: true });
    expect(budget.snapshot().hopsLeft).toBe(2);
  });

  it("remet le message aux scripts quand les sauts sont épuisés", () => {
    const budget = new ActionBudgetTracker(settings({ hopBudget: 1 }));
    expect(budget.consumeHop()).toEqual({ ok: true });
    expect(budget.consumeHop()).toEqual({ ok: false, reason: "hops" });
    expect(budget.consumeHop()).toEqual({ ok: false, reason: "hops" });
    expect(budget.snapshot().hopsLeft).toBe(0);
  });

  it("borne la largeur d'un tour : huit tours d'agent au plus par action", () => {
    const budget = new ActionBudgetTracker(settings({ agentTurnsPerAction: 2 }));
    expect(budget.consumeTurn()).toEqual({ ok: true });
    expect(budget.consumeTurn()).toEqual({ ok: true });
    expect(budget.consumeTurn()).toEqual({ ok: false, reason: "turns-action" });
    expect(budget.snapshot().turnsLeft).toBe(0);
  });

  it("ne consomme plus rien une fois épuisé", () => {
    const budget = new ActionBudgetTracker(settings({ hopBudget: 1, agentTurnsPerAction: 1 }));
    budget.consumeHop();
    budget.consumeTurn();
    const frozen = budget.snapshot();
    expect(budget.consumeHop().ok).toBe(false);
    expect(budget.consumeTurn().ok).toBe(false);
    expect(budget.snapshot()).toEqual(frozen);
  });

  it("refuse un tour quand les sauts sont déjà épuisés", () => {
    const budget = new ActionBudgetTracker(settings({ hopBudget: 0 }));
    expect(budget.verdict()).toEqual({ ok: false, reason: "hops" });
    expect(budget.consumeTurn()).toEqual({ ok: false, reason: "hops" });
    expect(budget.snapshot().turnsLeft).toBe(8);
  });
});
