/**
 * La recette rejouable du cahier des charges — section 18.
 *
 * Lancement : `npx vite-node scripts/recette/recette.ts`. Chaque point est
 * **exécuté** (tests, commandes CLI, rejeu de cassette, gardes, contrôle
 * d'accessibilité), puis le rapport `docs/recette.md` est réécrit. Code de
 * sortie : 0 si tous les points obligatoires sont verts, 1 sinon.
 *
 * Sans réseau, sauf le `HEAD` du point 13 : un piège posé sur `fetch` et sur
 * `http(S).request` compte les tentatives pendant toute la recette, et le
 * point 3 refuse la moindre requête.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { LigneDeRecette } from "./rapport";
import { ecrireRapport } from "./rapport";
import type { Point, Resultat } from "./types";
import { ko } from "./types";
import { piegerReseau, ROOT } from "./outils";
import { bilanManoir } from "./exemples/manoir-713";
import { pointProprietes } from "./points/proprietes";
import { pointCassette } from "./points/cassette";
import { pointPiles } from "./points/piles";
import { pointExemple } from "./points/exemple";
import { pointAdversaire, pointBudget, pointExportImport, pointPilePiegee } from "./points/modele";
import { pointCles, pointMarques, pointSiteSansEvaluation } from "./points/site";
import { pointAccessibilite, pointPresence, pointVideo } from "./points/presence";

/** La sortie d'une commande git, sans le saut de ligne final. */
function git(args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd: ROOT, encoding: "utf8" }).trim();
}

/** Exécute un point ; une exception devient un verdict rouge, jamais un arrêt. */
async function jouer(point: Point): Promise<Resultat> {
  try {
    return await point.execute();
  } catch (erreur) {
    return ko(`le point a levé une erreur : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
}

/** Le journal de l'exemple 7.13, pour le point 9 ; vide si l'exemple échoue. */
async function journalDuManoir(): Promise<string> {
  try {
    return (await bilanManoir()).journalTexte;
  } catch {
    return "";
  }
}

/** Les quatorze points, dans l'ordre du cahier. */
async function lesPoints(piege: { tentatives: string[] }): Promise<Point[]> {
  const journal = await journalDuManoir();
  return [
    { numero: 1, titre: "Les 23 propriétés passent, graines consignées", obligatoire: true, execute: pointProprietes },
    { numero: 2, titre: "`cassette verify` : aucun enregistrement périmé", obligatoire: true, execute: pointCassette },
    { numero: 3, titre: "Les trois piles en mode enregistré, sans requête réseau", obligatoire: true, execute: () => pointPiles(piege) },
    { numero: 4, titre: "L'exemple 7.13 : transactions, appels, Mood, annulations", obligatoire: true, execute: pointExemple },
    { numero: 5, titre: "Faux modèle adversaire : 10 000 séquences, zéro dépassement", obligatoire: true, execute: pointAdversaire },
    { numero: 6, titre: "Pile piégée : pas d'écriture hors carte, boucle bornée", obligatoire: true, execute: pointPilePiegee },
    { numero: 7, titre: "Recherche d'`eval`, de `new Function` et d'`innerHTML` dans le site construit", obligatoire: true, execute: pointSiteSansEvaluation },
    { numero: 8, titre: "Marques de tiers dans le site construit et les piles", obligatoire: true, execute: pointMarques },
    { numero: 9, titre: "Motif de clé dans le dépôt, les exports et le journal", obligatoire: true, execute: () => pointCles(journal) },
    { numero: 10, titre: "Budget épuisé : la passerelle ne reçoit plus d'appel", obligatoire: true, execute: pointBudget },
    { numero: 11, titre: "Export puis import : mêmes fichiers canoniques", obligatoire: true, execute: pointExportImport },
    { numero: 12, titre: "Accessibilité des sept écrans et parcours P2 au clavier", obligatoire: true, execute: pointAccessibilite },
    { numero: 13, titre: "`/.kiro`, licence, README, adresse en ligne", obligatoire: true, execute: pointPresence },
    { numero: 14, titre: "Vidéo de moins de trois minutes", obligatoire: false, execute: pointVideo },
  ];
}

/** Joue les quatorze points, écrit le rapport, rend le code de sortie. */
async function main(): Promise<number> {
  const piege = piegerReseau();
  const lignes: LigneDeRecette[] = [];
  try {
    for (const point of await lesPoints(piege)) {
      const resultat = await jouer(point);
      lignes.push({ point, resultat });
      console.log(`${String(point.numero).padStart(2, "0")}  ${resultat.verdict.padEnd(14)} ${point.titre}`);
      if (resultat.verdict !== "OK") console.log(`     → ${resultat.resume.split("\n")[0]}`);
    }
  } finally {
    piege.liberer();
  }

  const chemin = ecrireRapport(
    join(ROOT, "docs", "recette.md"),
    lignes,
    { date: new Date().toISOString().slice(0, 10), commit: git(["rev-parse", "HEAD"]), branche: git(["rev-parse", "--abbrev-ref", "HEAD"]) },
  );
  const rouges = lignes.filter(({ point, resultat }) => point.obligatoire && resultat.verdict === "KO");
  const verts = lignes.filter(({ resultat }) => resultat.verdict === "OK").length;
  console.log(`\nrapport : ${chemin}`);
  console.log(`${verts}/${lignes.length} point(s) vert(s) — ${rouges.length} point(s) obligatoire(s) rouge(s)`);
  console.log(`tentatives de requête réseau : ${piege.tentatives.length}`);
  return rouges.length === 0 ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (erreur: unknown) => {
    console.error(`recette: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    process.exitCode = 1;
  },
);