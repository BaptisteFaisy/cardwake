/**
 * La carte d'une page ne doit pas devenir une seconde consigne (7.7).
 *
 * `docs/language-card.md` est lue AVANT la référence complète : elle donne les
 * formes, les recettes et les pièges. Le risque, en ajoutant un raccourci, est
 * d'y écrire une forme que le langage n'a pas — le modèle l'apprend, le
 * contrôle la refuse, et la carte coûte plus qu'elle ne rapporte.
 *
 * Deux gardes suffisent, et aucune ne fige le texte : la carte reste courte,
 * et chaque ligne de ses blocs de code existe telle quelle dans la référence.
 * La référence reste donc la source unique.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LANGUAGE_CARD, LANGUAGE_REFERENCE } from "../src/language-reference";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Une carte, pas un document : au-delà, elle ne tient plus sa promesse. */
const MAX_LINES = 110;

/** Les lignes de code des blocs ```text d'un markdown, dans l'ordre. */
function codeLines(markdown: string): string[] {
  const lines: string[] = [];
  let inside = false;
  for (const line of markdown.split("\n")) {
    if (line.trim() === "```text") {
      inside = true;
      continue;
    }
    if (inside && line.trim() === "```") {
      inside = false;
      continue;
    }
    if (!inside) continue;
    const trimmed = line.trim();
    // Les trous d'un squelette (`<statements>`) sont expliqués en prose.
    if (trimmed === "" || trimmed.startsWith("<")) continue;
    lines.push(trimmed);
  }
  return lines;
}

describe("the one-page card", () => {
  it("is the file the prompt prints, not a stale copy", () => {
    const onDisk = readFileSync(resolve(REPO_ROOT, "docs/language-card.md"), "utf8");
    expect(LANGUAGE_CARD).toBe(onDisk);
  });

  it("stays one page", () => {
    expect(LANGUAGE_CARD.split("\n").length).toBeLessThanOrEqual(MAX_LINES);
  });

  it("carries the two recipes that the weak families missed", () => {
    const code = codeLines(LANGUAGE_CARD).join("\n");
    expect(code).toContain("repeat for each line");
    expect(code).toContain("consult agent with");
  });

  it("adds no form the reference does not already teach", () => {
    const reference = new Set(codeLines(LANGUAGE_REFERENCE));
    const invented = codeLines(LANGUAGE_CARD).filter((line) => !reference.has(line));
    expect(invented, `card lines absent from docs/language.md: ${invented.join(" | ")}`).toEqual([]);
  });
});
