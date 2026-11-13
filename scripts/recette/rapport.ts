/**
 * Le rapport de recette : `docs/recette.md`, en français.
 *
 * Le rapport ne juge rien : il recopie les verdicts et les preuves que chaque
 * point a rendus. La date, le commit et la branche disent sur quoi il porte.
 */
import { writeFileSync } from "node:fs";
import type { Point, Resultat } from "./types";

/** Un point joué et son résultat. */
export type LigneDeRecette = { point: Point; resultat: Resultat };

/** Ce sur quoi la recette porte : la date, le commit, la branche. */
export type Meta = { date: string; commit: string; branche: string };

/** Le libellé d'un verdict, dans le tableau. */
function libelle(verdict: Resultat["verdict"]): string {
  if (verdict === "OK") return "**OK**";
  if (verdict === "KO") return "**KO**";
  return "hors périmètre";
}

/** Une cellule de tableau : jamais de barre verticale dans le texte. */
function cellule(texte: string): string {
  return texte.replace(/\|/g, "/").replace(/\n/g, " ");
}

/** Le tableau récapitulatif : un point par ligne. */
function tableau(lignes: readonly LigneDeRecette[]): string[] {
  const entete = ["| # | Point | Verdict | Résumé |", "|---|---|---|---|"];
  const corps = lignes.map(
    ({ point, resultat }) => `| ${point.numero} | ${cellule(point.titre)} | ${libelle(resultat.verdict)} | ${cellule(resultat.resume)} |`,
  );
  return [...entete, ...corps];
}

/** Le détail d'un point : verdict, commande, preuves. */
function detail({ point, resultat }: LigneDeRecette): string[] {
  const lignes = [`### ${point.numero}. ${point.titre}`, "", `**Verdict : ${resultat.verdict}** — ${resultat.resume}`, ""];
  if (resultat.commande !== null) lignes.push(`Commande : \`${resultat.commande}\``, "");
  if (resultat.preuves.length > 0) {
    lignes.push("```text", ...resultat.preuves, "```", "");
  }
  return lignes;
}

/** Le compte des verdicts, en une phrase. */
function bilan(lignes: readonly LigneDeRecette[]): string {
  const verts = lignes.filter(({ resultat }) => resultat.verdict === "OK").length;
  const rouges = lignes.filter(({ resultat }) => resultat.verdict === "KO").length;
  const hors = lignes.filter(({ resultat }) => resultat.verdict === "HORS PERIMETRE").length;
  return `${verts} point(s) vert(s), ${rouges} rouge(s), ${hors} hors périmètre — sur ${lignes.length} point(s).`;
}

/** Écrit `docs/recette.md` et rend le chemin. */
export function ecrireRapport(chemin: string, lignes: readonly LigneDeRecette[], meta: Meta): string {
  const contenu = [
    "# Recette — verdict point par point",
    "",
    `Rejouée le **${meta.date}** sur le commit \`${meta.commit.slice(0, 12)}\` (branche \`${meta.branche}\`).`,
    "",
    `Chaque point est **exécuté**, pas relu : le tableau recopie ce que la commande a constaté. ${bilan(lignes)}`,
    "",
    "## Tableau des points",
    "",
    ...tableau(lignes),
    "",
    "## Détail par point",
    "",
    ...lignes.flatMap((ligne) => [...detail(ligne), ""]),
    "## Comment la relancer",
    "",
    "```bash",
    "npx vite-node scripts/recette/recette.ts",
    "```",
    "",
    "Le script est idempotent et sans réseau (sauf le `HEAD` du point 13). Il rend un",
    "code de sortie non nul dès qu'un point obligatoire est rouge.",
    "",
    "## Ce que le rapport ne prouve pas",
    "",
    "- Le taux du jeu d'évaluation (cahier 7.7) : hors de ce lot, à mesurer avec une clé réelle.",
    "- Les mesures de performance de CAR-N-04 et CAR-N-05 : hors de ce lot.",
    "- La vidéo de moins de trois minutes : hors périmètre par décision du demandeur.",
    "",
  ].join("\n");
  writeFileSync(chemin, contenu, "utf8");
  return chemin;
}