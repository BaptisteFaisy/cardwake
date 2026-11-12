/**
 * La commande des preuves : `npm run preuves` (tout vérifier) et
 * `npm run preuves:rapport` (régénérer le markdown depuis le JSON).
 *
 * Le code de sortie dit la vérité : 0 si les 29 preuves sont vertes, 1 sinon.
 * Une preuve absente (fichier cité manquant) n'est jamais comptée verte.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeReport } from "./report";
import { runAllProofs } from "./runner";

/** La racine du dépôt, déduite de ce fichier et non du répertoire courant. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Le dossier du rapport, dans le dépôt. */
const REPORT_DIR = join(ROOT, "docs", "preuves");

/** Dit une preuve en une ligne : verte, absente ou rouge. */
function lineFor(result: { id: string; ok: boolean; summary: string }): string {
  const mark = result.ok ? "vert" : result.summary.startsWith("absent") ? "absent" : "rouge";
  return `${mark.padEnd(6)} ${result.id} — ${result.summary}`;
}

/** Le rapport régénéré depuis le JSON existant : aucun test relancé. */
async function regenerate(): Promise<number> {
  const paths = await writeReport(REPORT_DIR);
  console.log(`rapport régénéré : ${paths.markdown}`);
  return 0;
}

/** Vérifie les 29 preuves, écrit le rapport, rend le code de sortie. */
async function verifyAll(): Promise<number> {
  console.log("vérification des 29 preuves…");
  const results = await runAllProofs();
  const paths = await writeReport(REPORT_DIR, results);
  for (const result of results) console.log(lineFor(result));
  const green = results.filter((result) => result.ok).length;
  console.log(`${green}/${results.length} preuve(s) verte(s) — rapport : ${paths.markdown}`);
  return green === results.length ? 0 : 1;
}

/** Le point d'entrée : `--rapport` régénère, sinon on vérifie tout. */
export async function runCli(argv: readonly string[]): Promise<number> {
  return argv.includes("--rapport") ? await regenerate() : await verifyAll();
}

/** Rien ne se lance à l'import : seule la variable du script `preuves` lance la commande. */
if (process.env.CARDWAKE_PREUVES === "1") {
  process.exitCode = await runCli(process.argv.slice(2));
}
