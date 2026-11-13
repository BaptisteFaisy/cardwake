/**
 * Point 1 — les 23 propriétés CAR-P-01 à CAR-P-23 passent.
 *
 * Deux preuves : les tests de propriétés (fast-check) sont exécutés pour de
 * vrai, puis on vérifie — par recherche dans les fichiers de test — que
 * chacun des 23 identifiants est cité quelque part. Un identifiant absent
 * des tests est une propriété non couverte, donc un point rouge.
 */
import { join } from "node:path";
import type { Resultat } from "../types";
import { ko, ok } from "../types";
import { exec, fichiersSuivis, lire, ROOT } from "../outils";

/** La commande de preuve, telle que le cahier la demande. */
const COMMANDE = "CARDWAKE_PROP_RUNS=2000 npx vitest run packages --reporter=basic";

/** Les 23 identifiants, de CAR-P-01 à CAR-P-23. */
function identifiants(): string[] {
  return Array.from({ length: 23 }, (_valeur, index) => `CAR-P-${String(index + 1).padStart(2, "0")}`);
}

/** Les fichiers de test du monorepo, hors node_modules. */
function fichiersDeTest(): string[] {
  return fichiersSuivis().filter((chemin) => chemin.includes("/test/") && chemin.endsWith(".test.ts"));
}

/** Recense, pour chaque identifiant, les fichiers de test qui le citent. */
function couverture(): Record<string, string[]> {
  const fichiers = fichiersDeTest();
  const couverture: Record<string, string[]> = {};
  for (const identifiant of identifiants()) {
    const trouves: string[] = [];
    for (const fichier of fichiers) {
      if (lire(join(ROOT, fichier)).includes(identifiant)) trouves.push(fichier);
    }
    couverture[identifiant] = trouves;
  }
  return couverture;
}

/** Les identifiants absents de tous les fichiers de test. */
function manquants(couverture: Record<string, string[]>): string[] {
  return Object.entries(couverture).filter(([, fichiers]) => fichiers.length === 0).map(([identifiant]) => identifiant);
}

export async function pointProprietes(): Promise<Resultat> {
  const lancement = await exec(["npx", "vitest", "run", "packages", "--reporter=basic"], ROOT, 600_000, {
    CARDWAKE_PROP_RUNS: "2000",
  });
  const couverture_ = couverture();
  const absents = manquants(couverture_);

  const preuves: string[] = [];
  preuves.push(
    `tests de propriétés : ${lancement.code === 0 ? "verts" : "échec (code " + String(lancement.code) + ")"}`,
  );
  preuves.push(
    "identifiants couverts : " +
      Object.entries(couverture_).filter(([, fichiers]) => fichiers.length > 0).map(([id]) => id).join(", "),
  );
  if (absents.length > 0) preuves.push("identifiants absents des tests : " + absents.join(", "));
  for (const identifiant of absents) preuves.push(`  ${identifiant} : aucune occurrence dans un fichier *.test.ts`);
  if (couverture_["CAR-P-09"]?.length === 0) {
    preuves.push("  CAR-P-09 est pourtant approchée par packages/model/test/dispatch.test.ts (« hiérarchie des messages ») : le parcours cible→carte→fond→pile y est joué, mais ni `pass` ni une propriété fast-check sur le placement des handlers n'y figurent.");
  }

  if (lancement.code === 0 && absents.length === 0) {
    return ok(
      `les 23 propriétés passent (${lancement.code === 0 ? "0 échec" : ""}) et les 23 identifiants sont couverts`,
      preuves,
      COMMANDE,
    );
  }
  return ko(
    absents.length === 0
      ? `tests de propriétés : échec (code de sortie ${String(lancement.code)})`
      : `${absents.length} propriété(s) sans identifiant dans les tests (${absents.join(", ")})`,
    preuves,
    COMMANDE,
  );
}