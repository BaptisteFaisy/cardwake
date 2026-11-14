/**
 * Aucune clé du dictionnaire ne meurt en silence (12.2).
 *
 * `i18n.test.ts` vérifie qu'aucune clé ne **manque** ; ce test vérifie
 * l'inverse, et il n'existait pas. Un écran réécrit laisse son texte dans le
 * dictionnaire : sept clés vivaient ainsi sans qu'aucun appel ne les nomme,
 * dont les trois libellés de l'onglet Agent — l'onglet rendait « No agent on
 * this card. » quel que soit le contenu de la carte, et rien ne le voyait.
 *
 * Une clé est vivante quand son texte apparaît littéralement dans le code du
 * site (appel `t(…)`, `line(…)`, ou une table de libellés), ou quand un appel
 * dynamique la couvre par son préfixe (`t(`journal.filter${…}`)`). Les dix-huit
 * états du brief 12.2 sont exemptés : ils existent pour que l'interface sache
 * les dire même quand le moteur ne les produit pas encore.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REQUIRED_KEYS, STATE_KEYS } from "../src/i18n";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

/** Un texte de clé : minuscule, puis mots séparés par des points. */
const LITERAL = /"([a-z][A-Za-z0-9.]*)"/g;
/** Un appel dynamique : `t(`journal.filter${…}`)`. Un `className` n'est pas une clé. */
const DYNAMIC = /\bt\(\s*`([a-z][A-Za-z0-9.]*)\$\{/g;

/** Tout le code du site, hors le dictionnaire lui-même. */
function sourceCode(): string {
  const entries = readdirFiles(SRC);
  return entries
    .filter((path) => path.endsWith(".ts") || path.endsWith(".tsx"))
    .filter((path) => !path.endsWith("/i18n.ts"))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

/** Tous les fichiers d'un arbre, profonds compris. */
function readdirFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...readdirFiles(path));
    else out.push(path);
  }
  return out;
}

/** Les clés couvertes par un appel dynamique, préfixe par préfixe. */
function aliveByPrefix(key: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => prefix.length > 0 && key.startsWith(prefix));
}

describe("dictionnaire sans clé morte", () => {
  const code = sourceCode();
  const literals = new Set([...code.matchAll(LITERAL)].map((m) => m[1]));
  const prefixes = [...code.matchAll(DYNAMIC)].map((m) => m[1]);

  it("chaque clé du dictionnaire est nommée quelque part dans le site", () => {
    const dead = REQUIRED_KEYS.filter(
      (key) => !literals.has(key) && !STATE_KEYS.includes(key) && !aliveByPrefix(key, prefixes),
    );
    expect(dead, `clés mortes : ${dead.join(", ")}`).toEqual([]);
  });

  it("les appels dynamiques couvrent au moins une clé chacun", () => {
    // Un préfixe qui ne couvre rien est une clé morte déguisée en raccourci.
    const useless = prefixes.filter(
      (prefix) => !REQUIRED_KEYS.some((key) => key.startsWith(prefix)),
    );
    expect(useless).toEqual([]);
  });

  it("les états du brief 12.2 restent exemptés, et sont bien dix-huit", () => {
    expect(STATE_KEYS).toHaveLength(18);
    for (const key of STATE_KEYS) expect(REQUIRED_KEYS).toContain(key);
  });
});
