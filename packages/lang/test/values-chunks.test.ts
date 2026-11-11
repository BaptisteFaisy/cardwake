/**
 * CAR-P-21 (nombres) et CAR-P-05 (morceaux de texte : écrire puis lire rend ce
 * qui a été écrit, les morceaux situés avant restent inchangés).
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { addExact, concat, formatNumber, isNumberText, requireNumber, round, toNumber, truthy, compareTexts } from "../src/values";
import { countChunks, readChunk, resolveBounds, splitChunk, writeChunk } from "../src/chunks";
import type { ChunkType } from "../src/ast";

const RUNS = Number(process.env.CARDWAKE_PROP_RUNS ?? 100);
const TYPES: ChunkType[] = ["char", "word", "item", "line"];

describe("valeurs — CAR-P-21", () => {
  it("affiche 0.1 + 0.2 comme 0.3", () => {
    expect(formatNumber(addExact(0.1, 0.2))).toBe("0.3");
  });

  it("la somme affichée de deux décimaux à 4 décimales au plus est exacte", () => {
    const decimal = fc.integer({ min: -100000, max: 100000 }).map((n) => n / 10000);
    fc.assert(
      fc.property(decimal, decimal, (a, b) => {
        const expected = (Math.round(a * 10000) + Math.round(b * 10000)) / 10000;
        expect(formatNumber(addExact(a, b))).toBe(formatNumber(expected));
      }),
      { numRuns: RUNS },
    );
  });

  it("reformater un nombre déjà formaté ne le change pas", () => {
    fc.assert(
      fc.property(fc.double({ min: -1e9, max: 1e9, noNaN: true }), (value) => {
        const once = formatNumber(value);
        const again = formatNumber(toNumber(once) ?? 0);
        expect(again).toBe(once);
      }),
      { numRuns: RUNS },
    );
  });

  it("reconnaît les nombres et refuse le reste", () => {
    expect(isNumberText("12")).toBe(true);
    expect(isNumberText("-3.5")).toBe(true);
    expect(isNumberText(" 7 ")).toBe(true);
    expect(isNumberText("12a")).toBe(false);
    expect(isNumberText("")).toBe(false);
    expect(toNumber("abc")).toBeNull();
    expect(() => requireNumber("abc")).toThrow(TypeError);
  });

  it("arrondit, teste la vérité et compare", () => {
    expect(formatNumber(round(2.345, 2))).toBe("2.35");
    expect(truthy("")).toBe(false);
    expect(truthy("false")).toBe(false);
    expect(truthy("0")).toBe(true);
    expect(compareTexts("2", "10")).toBeLessThan(0);
    expect(compareTexts("abc", "abd")).toBeLessThan(0);
    expect(concat("a", "b", false)).toBe("ab");
    expect(concat("a", "b", true)).toBe("a b");
    expect(concat("", "b", true)).toBe("b");
  });
});

describe("morceaux — lecture et écriture", () => {
  const text = "alpha beta\ngamma delta\nepsilon";

  it("compte et lit les quatre morceaux", () => {
    expect(countChunks(text, "line")).toBe(3);
    expect(countChunks(text, "word")).toBe(5);
    expect(countChunks("a,b,c", "item")).toBe(3);
    expect(countChunks("abc", "char")).toBe(3);
    expect(countChunks("", "word")).toBe(0);
    expect(readChunk(text, "line", 2)).toBe("gamma delta");
    expect(readChunk(text, "word", 3)).toBe("gamma");
    expect(readChunk(text, "line", -1)).toBe("epsilon");
    expect(readChunk(text, "line", undefined, 1, 2)).toBe("alpha beta\ngamma delta");
    expect(splitChunk("a,b,c", "item")).toEqual(["a", "b", "c"]);
  });

  it("écrit dans un morceau sans toucher aux autres", () => {
    expect(writeChunk(text, "line", "payé", "replace", 2)).toBe("alpha beta\npayé\nepsilon");
    expect(writeChunk(text, "word", "X", "replace", 3)).toBe("alpha beta\nX delta\nepsilon");
    expect(writeChunk(text, "word", "Y", "before", 3)).toBe("alpha beta\nYgamma delta\nepsilon");
    expect(writeChunk(text, "word", "Z", "after", 3)).toBe("alpha beta\ngammaZ delta\nepsilon");
    expect(writeChunk("a,b,c", "item", "9", "replace", 2)).toBe("a,9,c");
    expect(writeChunk("abc", "char", "Z", "replace", 2)).toBe("aZc");
  });

  it("l'exemple du cahier : word 2 of line 3", () => {
    const source = "ligne une deux\ndeuxième ligne ici\ntrois mots ici";
    const line3 = readChunk(source, "line", 3);
    expect(writeChunk(line3, "word", "payé", "replace", 2)).toBe("trois payé ici");
  });

  it("CAR-P-05 : lire après avoir écrit rend ce qui a été écrit", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TYPES),
        fc.string({ maxLength: 40 }).map((s) => s.replace(/\r/g, "")),
        fc.string({ minLength: 1, maxLength: 8 }).map((s) => s.replace(/[^\w]/g, "x") || "x"),
        fc.integer({ min: 1, max: 6 }),
        (type, base, raw, index) => {
          // Un `char` ne peut recevoir qu'un caractère : c'est la définition du
          // morceau, pas une limite de l'implémentation.
          const value = type === "char" ? raw.slice(0, 1) : raw;
          const written = writeChunk(base, type, value, "replace", index);
          const pieces = base === "" ? 0 : splitChunk(base, type).length;
          if (index > pieces) return; // hors du texte : l'écriture ajoute à la fin
          expect(readChunk(written, type, index)).toBe(value);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("CAR-P-05 : les morceaux situés avant sont inchangés", () => {
    fc.assert(
      fc.property(fc.constantFrom(...TYPES), fc.integer({ min: 2, max: 5 }), (type, index) => {
        const base = ["un", "deux", "trois", "quatre", "cinq"].join(type === "item" ? "," : type === "line" ? "\n" : " ");
        const written = writeChunk(base, type, "X", "replace", index);
        for (let i = 1; i < index; i += 1) {
          expect(readChunk(written, type, i)).toBe(readChunk(base, type, i));
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("bornes : plage inversée vide, hors texte, négatives", () => {
    expect(resolveBounds(3, undefined, 3, 1)).toBeNull();
    expect(resolveBounds(3, 5)).toBeNull();
    expect(resolveBounds(3, -1)).toEqual({ start: 2, end: 2 });
    expect(resolveBounds(0, 1)).toBeNull();
  });
});
