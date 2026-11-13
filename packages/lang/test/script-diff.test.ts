/**
 * Propriété du diff de script : chaque ligne qui diffère est montrée, aucune
 * ligne identique n'est présentée comme changée.
 *
 * Le diff est la troisième défense avant l'installation d'un script : s'il
 * escamote une ligne, l'auteur accepte autre chose que ce qu'il croit lire.
 * Quatre invariants, vérifiés sur des couples tirés au hasard :
 *
 * 1. **fusion exacte** : `removed + same` redonne l'ancien script, `same +
 *    added` redonne le nouveau — dans l'ordre, ligne pour ligne ;
 * 2. **alignement maximal** : les lignes `same` forment une plus longue
 *    sous-suite commune (comparée à un calcul indépendant, récursif mémoïsé) ;
 * 3. **aucune identique déguisée** : deux lignes voisines ne portent jamais le
 *    même texte avec l'une retirée et l'autre ajoutée ;
 * 4. **couverture** : toute ligne présente d'un côté et pas de l'autre est
 *    dans le diff, autant de fois qu'elle apparaît.
 *
 * Nombre de tirages : `CARDWAKE_PROP_RUNS`, 100 par défaut.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { diffLines, diffScript, scriptLines } from "../src/diff";
import type { ScriptDiffLine } from "../src/diff";

const RUNS = Number(process.env.CARDWAKE_PROP_RUNS ?? 100);

const arbLine = fc.constantFrom("", "on tick", "  put 1 into x", "end tick", "end mouseUp", "  answer 2");

/** Les textes d'un côté du diff, dans l'ordre. */
function side(lines: ScriptDiffLine[], kinds: ScriptDiffLine["kind"][]): string[] {
  return lines.filter((line) => kinds.includes(line.kind)).map((line) => line.text);
}

/** Longueur de la plus longue sous-suite commune, calculée autrement. */
function lcsLength(before: string[], after: string[]): number {
  const memo = new Map<string, number>();
  const walk = (row: number, column: number): number => {
    if (row >= before.length || column >= after.length) return 0;
    const key = `${row}:${column}`;
    const known = memo.get(key);
    if (known !== undefined) return known;
    const value =
      before[row] === after[column]
        ? 1 + walk(row + 1, column + 1)
        : Math.max(walk(row + 1, column), walk(row, column + 1));
    memo.set(key, value);
    return value;
  };
  return walk(0, 0);
}

/** Multiplicités d'une liste, pour comparer ce qui doit apparaître. */
function counts(lines: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) map.set(line, (map.get(line) ?? 0) + 1);
  return map;
}

describe("diff — la fusion est exacte", () => {
  it("reconstitue les deux scripts, chacun de son côté", () => {
    fc.assert(
      fc.property(fc.array(arbLine, { maxLength: 6 }), fc.array(arbLine, { maxLength: 6 }), (before, after) => {
        const diff = diffLines(before, after);
        expect(side(diff, ["same", "removed"])).toEqual(before);
        expect(side(diff, ["same", "added"])).toEqual(after);
      }),
      { numRuns: RUNS },
    );
  });
});

describe("diff — les lignes identiques restent alignées", () => {
  it("aligne autant de lignes que la plus longue sous-suite commune", () => {
    fc.assert(
      fc.property(fc.array(arbLine, { maxLength: 6 }), fc.array(arbLine, { maxLength: 6 }), (before, after) => {
        expect(side(diffLines(before, after), ["same"]).length).toBe(lcsLength(before, after));
      }),
      { numRuns: RUNS },
    );
  });

  it("ne déguise jamais une ligne identique en couple retiré/ajouté voisin", () => {
    fc.assert(
      fc.property(fc.array(arbLine, { maxLength: 6 }), fc.array(arbLine, { maxLength: 6 }), (before, after) => {
        const diff = diffLines(before, after);
        for (let index = 1; index < diff.length; index += 1) {
          const previous = diff[index - 1];
          const current = diff[index];
          const swapped = previous.kind !== current.kind;
          if (swapped && previous.kind !== "same" && current.kind !== "same") {
            expect(previous.text, `paire ${previous.kind}/${current.kind} identique`).not.toBe(current.text);
          }
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("montre un diff vide quand rien ne change, et un diff vide pour deux scripts vides", () => {
    expect(diffScript("", "")).toEqual([]);
    const same = "on tick\n  put 1 into x\nend tick\n";
    expect(diffScript(same, same).every((line) => line.kind === "same")).toBe(true);
    expect(scriptLines(same)).toEqual(["on tick", "  put 1 into x", "end tick"]);
  });
});

describe("diff — chaque ligne qui diffère est mentionnée", () => {
  it("compte chaque ligne retirée et chaque ligne ajoutée, multiplicités comprises", () => {
    fc.assert(
      fc.property(fc.array(arbLine, { maxLength: 6 }), fc.array(arbLine, { maxLength: 6 }), (before, after) => {
        const diff = diffLines(before, after);
        const beforeCounts = counts(before);
        const afterCounts = counts(after);
        const removed = counts(side(diff, ["removed"]));
        const added = counts(side(diff, ["added"]));
        for (const [text, total] of beforeCounts) {
          // Ce que l'ancien a en plus du nouveau doit être dans `removed`.
          const surplus = total - (afterCounts.get(text) ?? 0);
          if (surplus > 0) expect(removed.get(text) ?? 0).toBeGreaterThanOrEqual(surplus);
        }
        for (const [text, total] of afterCounts) {
          const surplus = total - (beforeCounts.get(text) ?? 0);
          if (surplus > 0) expect(added.get(text) ?? 0).toBeGreaterThanOrEqual(surplus);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("montre le remplacement d'un script, ligne par ligne", () => {
    const before = 'on mouseUp\n  put "bonjour" into field "Notes"\nend mouseUp';
    const after = 'on mouseUp\n  put "bonsoir" into field "Notes"\n  answer "fait"\nend mouseUp';
    const diff = diffScript(before, after);
    expect(diff.map((line) => `${line.kind}:${line.text}`)).toEqual([
      'same:on mouseUp',
      'removed:  put "bonjour" into field "Notes"',
      'added:  put "bonsoir" into field "Notes"',
      'added:  answer "fait"',
      "same:end mouseUp",
    ]);
  });
});
