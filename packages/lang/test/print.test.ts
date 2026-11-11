/**
 * CAR-P-01 (aller-retour impression/analyse) et CAR-P-02 (robustesse de
 * l'analyse sur n'importe quel texte), plus les tests unitaires d'impression.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { printScript } from "../src/print";
import { parseScript } from "../src/parser";
import { arbScript } from "./generators";

const RUNS = Number(process.env.CARDWAKE_PROP_RUNS ?? 100);

/** Retire récursivement les empans : l'aller-retour ne conserve pas les positions. */
function stripSpans(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSpans);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === "span") continue;
      out[key] = stripSpans(item);
    }
    return out;
  }
  return value;
}

describe("CAR-P-01 — aller-retour du langage", () => {
  it("imprimer puis analyser redonne le même arbre", () => {
    fc.assert(
      fc.property(arbScript(), (script) => {
        const text = printScript(script);
        const parsed = parseScript(text);
        if (!parsed.ok) {
          throw new Error(`texte imprimé non analysable : ${parsed.errors[0].message}\n---\n${text}`);
        }
        expect(stripSpans(parsed.script)).toEqual(stripSpans(script));
      }),
      { numRuns: RUNS },
    );
  });

  it("l'impression est stable : imprimer deux fois donne le même texte", () => {
    fc.assert(
      fc.property(arbScript(), (script) => {
        const once = printScript(script);
        const parsed = parseScript(once);
        if (!parsed.ok) throw new Error("texte imprimé non analysable");
        expect(printScript(parsed.script)).toBe(once);
      }),
      { numRuns: RUNS },
    );
  });
});

describe("CAR-P-02 — robustesse de l'analyse", () => {
  it("tout texte rend un arbre ou des erreurs positionnées dans le texte", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), (source) => {
        const result = parseScript(source);
        if (result.ok) return;
        expect(result.errors.length).toBeGreaterThan(0);
        const lines = source.split("\n").length;
        for (const error of result.errors) {
          expect(error.line).toBeGreaterThanOrEqual(1);
          expect(error.line!).toBeLessThanOrEqual(lines + 1);
          expect(error.message.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("du bruit autour d'un script valide ne fait jamais planter l'analyse", () => {
    const valid = 'on mouseUp\n  put "x" into field "A"\nend mouseUp\n';
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), fc.string({ maxLength: 40 }), (before, after) => {
        const result = parseScript(before + valid + after);
        expect(result.ok === true || result.errors.length > 0).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });
});

describe("printScript — forme canonique", () => {
  it("imprime le script de la liste de tâches", () => {
    const source = 'on mouseUp\nif field "New" is empty then\nexit mouseUp\nend if\nput field "New" & return after field "Tasks"\nput empty into field "New"\nend mouseUp\n';
    const parsed = parseScript(source);
    if (!parsed.ok) throw new Error("script d'exemple non analysable");
    expect(printScript(parsed.script)).toBe(
      [
        "on mouseUp",
        '  if field "New" is empty then',
        "    exit mouseUp",
        "  end if",
        '  put field "New" & return after field "Tasks"',
        '  put empty into field "New"',
        "end mouseUp",
        "",
      ].join("\n"),
    );
  });

  it("échappe les guillemets et les sauts de ligne dans les chaînes", () => {
    const parsed = parseScript('on t\n  put "a\\"b" into field "A"\nend t');
    if (!parsed.ok) throw new Error("analyse échouée");
    const text = printScript(parsed.script);
    expect(text).toContain('\\"');
    const again = parseScript(text);
    expect(again.ok).toBe(true);
  });

  it("imprime un script vide comme une chaîne vide", () => {
    expect(printScript({ handlers: [], functions: [] })).toBe("");
  });
});
