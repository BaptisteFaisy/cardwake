import { describe, expect, it } from "vitest";
import type { Expr, Span } from "../src/ast";
import { APP_LIMITS, clampSettings } from "@cardwake/model";

const span: Span = {
  start: { line: 1, col: 1, offset: 0 },
  end: { line: 1, col: 2, offset: 1 },
};

describe("socle", () => {
  it("exporte le contrat d'arbre syntaxique", () => {
    const expr: Expr = { kind: "str", value: "bored", span };
    expect(expr.kind).toBe("str");
  });
  it("recadre les réglages sous les plafonds de l'application", () => {
    const s = clampSettings({ maxSteps: 10_000_000, hopBudget: 99 });
    expect(s.maxSteps).toBe(APP_LIMITS.maxSteps);
    expect(s.hopBudget).toBeLessThanOrEqual(10);
  });
});
