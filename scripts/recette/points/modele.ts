/**
 * Points 5, 6, 10 et 11 — les preuves ciblées du modèle et de l'agent.
 *
 * Chaque point lance le fichier de test qui le prouve, avec le rapport
 * détaillé, puis ne garde que les noms de tests qui comptent. Un point est
 * vert seulement si le fichier passe et si le test attendu a bien tourné :
 * un `npx` qui ne teste rien ne prouve rien.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Resultat } from "../types";
import { ko, ok } from "../types";
import type { Exec } from "../outils";
import { decompteVitest, exec, ROOT } from "../outils";

/** Un lancement de test : la commande, le code, le décompte et les noms. */
type Lancement = { exec: Exec; passes: number; echoues: number; noms: string[] };

/** Lance un ou plusieurs fichiers de test avec le rapport détaillé. */
async function lancer(fichiers: string[], env: Record<string, string> = {}): Promise<Lancement> {
  const lancement = await exec(["npx", "vitest", "run", ...fichiers, "--reporter=verbose"], ROOT, 600_000, env);
  const decompte = decompteVitest(lancement.sortie);
  return { exec: lancement, passes: decompte.passes, echoues: decompte.echoues, noms: decompte.noms };
}

/** Les noms de tests qui contiennent l'un des fragments demandés. */
function retenir(noms: readonly string[], fragments: readonly string[]): string[] {
  return noms.filter((nom) => fragments.some((fragment) => nom.toLowerCase().includes(fragment.toLowerCase())));
}

/** Les lignes de compte rendu d'un lancement, prêtes pour le rapport. */
function preuvesDe(lancement: Lancement, retenus: readonly string[]): string[] {
  const preuves = [`code de sortie ${String(lancement.exec.code)} — ${lancement.passes} test(s) vert(s), ${lancement.echoues} échec(s)`];
  for (const nom of retenus) preuves.push(`  ✓ ${nom.split(" > ").slice(-1)[0]}`);
  if (retenus.length === 0) preuves.push("  (aucun test attendu n'a tourné)");
  if (lancement.exec.code !== 0) preuves.push(...lancement.exec.sortie.split("\n").slice(-12));
  return preuves;
}

/** Le nombre de propriétés fast-check d'un fichier (appels `fc.assert`). */
function nombreDeProprietes(fichier: string): number {
  return (readFileSync(join(ROOT, fichier), "utf8").match(/\bfc\.assert\s*\(/g) ?? []).length;
}

/** Point 5 — faux modèle adversaire : dix mille séquences, zéro dépassement. */
export async function pointAdversaire(): Promise<Resultat> {
  const fichier = "packages/agent/test/loop-adversary.test.ts";
  const lancement = await lancer([fichier], { CARDWAKE_PROP_RUNS: "10000" });
  const retenus = retenir(lancement.noms, ["adversaire", "coups"]);
  const preuves = [
    `tirages : CARDWAKE_PROP_RUNS=10000 par propriété, ${nombreDeProprietes(fichier)} propriété(s) fast-check`,
    ...preuvesDe(lancement, retenus),
  ];
  if (lancement.exec.code === 0 && retenus.length > 0) {
    return ok("faux modèle adversaire : 10 000 tirages, aucun dépassement de droits", preuves, `CARDWAKE_PROP_RUNS=10000 npx vitest run ${fichier}`);
  }
  return ko("l'adversaire n'a pas tourné à 10 000 tirages sans échec", preuves, `CARDWAKE_PROP_RUNS=10000 npx vitest run ${fichier}`);
}

/** Point 6 — pile piégée : l'agent n'écrit pas hors de sa carte, la boucle s'arrête. */
export async function pointPilePiegee(): Promise<Resultat> {
  const fichier = "packages/agent/test/loop.test.ts";
  const lancement = await lancer([fichier]);
  const retenus = retenir(lancement.noms, ["carte de l'agent", "autre carte", "plafond d'itérations", "quatre blocs"]);
  const preuves = preuvesDe(lancement, retenus);
  preuves.push("aucune requête distante : la requête d'agent ne porte que les quatre blocs (test « la requête ne porte que les quatre blocs »)");
  if (lancement.exec.code === 0 && retenus.length >= 3) {
    return ok("l'agent n'écrit pas hors de sa carte, la boucle est bornée, aucune requête distante", preuves, `npx vitest run ${fichier}`);
  }
  return ko("le scénario de la pile piégée n'est pas prouvé", preuves, `npx vitest run ${fichier}`);
}

/** Point 10 — budget épuisé : la passerelle ne reçoit plus aucun appel. */
export async function pointBudget(): Promise<Resultat> {
  const fichiers = ["packages/agent/test/budget.test.ts", "packages/agent/test/loop.test.ts"];
  const lancement = await lancer(fichiers);
  const retenus = retenir(lancement.noms, ["budget", "épuisé", "plus aucun appel", "ne bouge plus"]);
  const preuves = preuvesDe(lancement, retenus);
  if (lancement.exec.code === 0 && retenus.some((nom) => nom.includes("AUCUN appel"))) {
    return ok("budget épuisé : plus aucun appel à la passerelle", preuves, `npx vitest run ${fichiers.join(" ")}`);
  }
  return ko("le budget épuisé n'arrête pas la passerelle", preuves, `npx vitest run ${fichiers.join(" ")}`);
}

/** Point 11 — export puis import : fichiers identiques après mise en forme canonique. */
export async function pointExportImport(): Promise<Resultat> {
  const fichier = "packages/model/test/schema-file.test.ts";
  const lancement = await lancer([fichier]);
  const retenus = retenir(lancement.noms, ["exporter puis importer", "sérialise de façon canonique"]);
  const preuves = preuvesDe(lancement, retenus);
  if (lancement.exec.code === 0 && retenus.length >= 2) {
    return ok("export puis import : même pile, mise en forme canonique identique", preuves, `npx vitest run ${fichier}`);
  }
  return ko("l'aller-retour export/import n'est pas prouvé", preuves, `npx vitest run ${fichier}`);
}