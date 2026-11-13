/**
 * Migrations dorées : le format est un contrat, et un contrat se relit.
 *
 * Trois choses sont vérifiées ici, dans cet ordre :
 * - chaque version **courante** a son fichier figé dans `golden/`, et ce fichier
 *   est exactement ce que `serializeStack` produit (`serializeStack(parseStackFile(x)) === x`)
 *   — c'est CAR-P-18, la forme canonique stable ;
 * - chaque doré d'une version **ancienne** migre vers le doré courant, et le
 *   résultat est octet pour octet celui de la version courante ;
 * - une version inconnue est refusée en bloc, jamais chargée à moitié.
 *
 * Le garde-fou est explicite : passer `CURRENT_FORMAT` à `cardwake/2` sans
 * déposer `golden/cardwake-2.stack.json` fait rougir un test qui dit quoi
 * ajouter. Ce n'est pas une dette, c'est la porte fermée devant l'oubli.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { serializeStack, parseStackFile } from "../src/file";
import { CURRENT_FORMAT, migrateStack, needsMigration } from "../src/migrate";
import { validateStack } from "../src/schema";
import type { Stack } from "../src/types";

const GOLDEN_DIR = fileURLToPath(new URL("./golden/", import.meta.url));

/** `cardwake/1` → `cardwake-1.stack.json` : un doré par version, nommé pareil. */
function goldenName(format: string): string {
  return `${format.replace("/", "-")}.stack.json`;
}

function goldenPath(format: string): string {
  return `${GOLDEN_DIR}${goldenName(format)}`;
}

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(`${GOLDEN_DIR}${name}`, "utf8"));
}

function readText(name: string): string {
  return readFileSync(`${GOLDEN_DIR}${name}`, "utf8");
}

/** Les dorés de versions, à l'exclusion du cas « version inconnue ». */
function goldenVersions(): string[] {
  return readdirSync(GOLDEN_DIR)
    .filter((name) => name.endsWith(".stack.json") && name !== "unknown-version.stack.json")
    .map((name) => String((readJson(name) as { format: unknown }).format));
}

describe("migrations dorées — la version courante", () => {
  it("a son fichier figé, et le message dit quoi faire si elle n'en a pas", () => {
    const name = goldenName(CURRENT_FORMAT);
    expect(
      existsSync(goldenPath(CURRENT_FORMAT)),
      `nouvelle version ${CURRENT_FORMAT} : ajoutez packages/model/test/golden/${name} ` +
        "et l'entrée de migration dans src/migrate.ts, puis relisez ce test.",
    ).toBe(true);
  });

  it("se relit et se réécrit à l'identique (CAR-P-18)", () => {
    const text = readText(goldenName(CURRENT_FORMAT));
    const parsed = parseStackFile(text);
    expect(parsed.ok, `le doré ${goldenName(CURRENT_FORMAT)} doit être valide`).toBe(true);
    if (!parsed.ok) return;
    expect(serializeStack(parsed.stack)).toBe(text);
    // Et la re-sérialisation est stable, sans dépendre du fichier.
    expect(serializeStack(parsed.stack)).toBe(serializeStack(parsed.stack as Stack));
  });

  it("contient de quoi éprouver le format : agent, encre, script, réglages propres", () => {
    const parsed = parseStackFile(readText(goldenName(CURRENT_FORMAT)));
    if (!parsed.ok) throw new Error("doré invalide");
    const stack = parsed.stack;
    expect(stack.cards.some((card) => card.agent !== null)).toBe(true);
    expect(stack.cards.some((card) => Object.keys(card.ink).length > 0)).toBe(true);
    expect(stack.script.length).toBeGreaterThan(0);
    expect(stack.backgrounds.some((background) => background.parts.some((part) => part.kind === "field" && part.locked))).toBe(true);
    expect(stack.settings.hopBudget).not.toBe(3);
    expect(stack.nextId).toBeGreaterThan(Math.max(...stack.cards.map((card) => card.id)));
  });

  it("n'a pas besoin de migration", () => {
    expect(needsMigration(readJson(goldenName(CURRENT_FORMAT)))).toBe(false);
  });
});

describe("migrations dorées — les versions anciennes", () => {
  const current = readText(goldenName(CURRENT_FORMAT));
  const older = goldenVersions().filter((format) => format !== CURRENT_FORMAT);

  it("n'a que des versions connues, chacune avec son doré", () => {
    for (const format of goldenVersions()) {
      expect(goldenName(format), `doré mal nommé pour ${format}`).toBe(`${format.replace("/", "-")}.stack.json`);
    }
  });

  it("migre chaque doré ancien vers le doré courant, à l'octet près", () => {
    for (const format of older) {
      const json = readJson(goldenName(format));
      expect(needsMigration(json), `${format} doit être reconnu comme à migrer`).toBe(true);
      const migrated = migrateStack(json);
      expect(migrated.ok, `${format} : ajoutez la migration dans src/migrate.ts`).toBe(true);
      if (!migrated.ok) continue;
      expect(serializeStack(migrated.stack), `${format} migré doit égaler le doré courant`).toBe(current);
    }
    // Aujourd'hui une seule version existe : la boucle est vide, et c'est dit.
    expect(older).toEqual([]);
  });
});

describe("migrations dorées — une version inconnue", () => {
  const unknown = readJson("unknown-version.stack.json");

  it("est refusée en bloc, avec la version fautive dans le message", () => {
    const result = migrateStack(unknown);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" ")).toContain("cardwake/0");
    expect(result.errors.join(" ")).toContain(CURRENT_FORMAT);
  });

  it("est signalée comme à migrer, sans jamais l'être", () => {
    expect(needsMigration(unknown)).toBe(true);
    expect(validateStack(unknown).ok).toBe(false);
  });

  it("n'est pas confondue avec un fichier qui n'est pas un objet", () => {
    for (const junk of [null, 42, "texte", [1, 2], {}]) {
      const result = migrateStack(junk);
      expect(result.ok, `migrateStack(${JSON.stringify(junk)}) doit refuser`).toBe(false);
    }
  });
});
