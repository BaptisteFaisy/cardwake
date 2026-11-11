import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Une seule référence, deux copies (cahier des charges 14.2).
 *
 * `docs/language.md` est le texte injecté dans la consigne du modèle qui
 * écrit les scripts ; `.kiro/steering/language.md` est le même texte donné à
 * l'agent de l'IDE. Si les deux divergent, les deux IA apprennent deux
 * langages : ce test est la seule chose qui empêche cette dérive.
 *
 * La copie de steering porte **une** ligne de commentaire HTML en tête, et
 * rien d'autre ne diffère. Tout le reste doit être identique au caractère
 * près, espaces et fins de ligne compris.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const REFERENCE_PATH = resolve(REPO_ROOT, "docs/language.md");
const STEERING_PATH = resolve(REPO_ROOT, ".kiro/steering/language.md");

/** Une ligne de commentaire HTML : le seul écart autorisé entre les copies. */
const COMMENT_LINE = /^<!--.*-->$/;

type Split = { header: string[]; body: string };

/**
 * Sépare la copie en deux : les lignes de commentaire HTML de tête, et le
 * corps. Le corps est rendu tel quel, sans recoller ni normaliser : une
 * comparaison exacte est le seul contrôle qui attrape une virgule changée.
 */
function splitHeader(text: string): Split {
  const lines = text.split("\n");
  let index = 0;
  while (index < lines.length && COMMENT_LINE.test(lines[index].trim())) index += 1;
  return { header: lines.slice(0, index), body: lines.slice(index).join("\n") };
}

/** Lit un fichier du dépôt et échoue avec son chemin, pas avec une pile. */
function read(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`Cannot read ${path}: ${(error as Error).message}`);
  }
}

/** Première ligne où deux textes diffèrent, pour un message utile. */
function firstDifference(left: string, right: string): string {
  const a = left.split("\n");
  const b = right.split("\n");
  const limit = Math.max(a.length, b.length);
  for (let i = 0; i < limit; i += 1) {
    if (a[i] !== b[i]) {
      return `line ${i + 1}\n  docs:     ${a[i] ?? "<missing>"}\n  steering: ${b[i] ?? "<missing>"}`;
    }
  }
  return "no line differs";
}

const reference = read(REFERENCE_PATH);
const steering = splitHeader(read(STEERING_PATH));

describe("language reference sync", () => {
  it("the reference is a real document, not an empty file", () => {
    expect(reference.trim().length).toBeGreaterThan(2_000);
    expect(reference.startsWith("# ")).toBe(true);
  });

  it("the steering copy carries exactly one HTML comment line", () => {
    expect(steering.header).toHaveLength(1);
    expect(steering.header[0]).toContain("docs/language.md");
  });

  it("the two copies are identical below the header", () => {
    const same = reference === steering.body;
    expect(same, `copies differ at ${firstDifference(reference, steering.body)}`).toBe(true);
  });
});
