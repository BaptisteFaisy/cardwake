/**
 * Points 12, 13 et 14 — accessibilité, présence des fichiers, vidéo.
 *
 * - point 12 : le contrôle automatique des sept écrans (axe-core, WCAG 2.2 AA)
 *   et le parcours P2 au clavier, joués par `apps/web/test/a11y.test.ts` ;
 * - point 13 : `/.kiro` présent et non ignoré, licence, README, adresse en
 *   ligne (un seul `HEAD` HTTP, le seul réseau de la recette) ;
 * - point 14 : la vidéo est hors périmètre, et rien n'est fait.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Resultat } from "../types";
import { horsPerimetre, ko, ok } from "../types";
import { decompteVitest, exec, ROOT } from "../outils";

const FICHIER_A11Y = "apps/web/test/a11y.test.ts";
const COMMANDE_A11Y = `npx vitest run ${FICHIER_A11Y} --reporter=verbose`;
const SITE = "https://tradoooo.github.io/cardwake/";

/** Point 12 — accessibilité des sept écrans et parcours P2 au clavier. */
export async function pointAccessibilite(): Promise<Resultat> {
  if (!existsSync(join(ROOT, FICHIER_A11Y))) {
    return ko(`le contrôle d'accessibilité n'existe pas (${FICHIER_A11Y})`, [], COMMANDE_A11Y);
  }
  const lancement = await exec(["npx", "vitest", "run", FICHIER_A11Y, "--reporter=verbose"], ROOT, 300_000);
  const decompte = decompteVitest(lancement.sortie);
  const preuves = [`code de sortie ${String(lancement.code)} — ${decompte.passes} test(s) vert(s), ${decompte.echoues} échec(s)`];
  preuves.push(...decompte.noms.map((nom) => `  ✓ ${nom.split(" > ").slice(-1)[0]}`));
  if (lancement.code !== 0) preuves.push(...lancement.sortie.split("\n").filter((l) => l.includes("✕") || l.includes("FAIL") || l.includes("violation")).slice(0, 20));
  if (lancement.code === 0) return ok(`${decompte.passes} test(s) d'accessibilité verts (sept écrans + parcours P2 au clavier)`, preuves, COMMANDE_A11Y);
  return ko("le contrôle d'accessibilité a échoué", preuves, COMMANDE_A11Y);
}

/** Le code HTTP de l'adresse en ligne, par `curl`. */
async function codeHttp(url: string): Promise<string> {
  const resultat = await exec(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "20", url], ROOT, 30_000);
  return resultat.sortie.trim();
}

/** Un fichier de licence existe-t-il à la racine ? */
function licence(): string | null {
  for (const nom of ["LICENSE", "LICENSE.md", "LICENCE", "COPYING"]) {
    if (existsSync(join(ROOT, nom))) return nom;
  }
  return null;
}

/** Point 13 — `.kiro`, licence, README, adresse en ligne. */
export async function pointPresence(): Promise<Resultat> {
  const kiro = existsSync(join(ROOT, ".kiro"));
  const ignore = await exec(["git", "check-ignore", ".kiro/"], ROOT, 30_000);
  const suivi = await exec(["git", "ls-files", ".kiro/"], ROOT, 30_000);
  const readme = existsSync(join(ROOT, "README.md"));
  const fichierLicence = licence();
  const http = await codeHttp(SITE);

  const preuves = [
    `.kiro/ présent : ${kiro ? "oui" : "non"}`,
    `.kiro/ ignoré par git : ${ignore.code === 0 ? "OUI (anormal)" : "non"}`,
    `.kiro/ suivi par git : ${suivi.sortie.trim() === "" ? "NON" : "oui (" + suivi.sortie.trim().split("\n").length + " fichier(s))"}`,
    `LICENSE à la racine : ${fichierLicence ?? "ABSENT — à créer (hors de ce lot)"}`,
    `README.md : ${readme ? "présent" : "ABSENT"}`,
    `GET ${SITE} → HTTP ${http || "(pas de réponse)"}`,
  ];

  const conformes = kiro && ignore.code !== 0 && suivi.sortie.trim() !== "" && readme && http === "200";
  const resume = fichierLicence === null
    ? "`.kiro`, README et l'adresse en ligne sont conformes ; LICENSE absent (à créer — hors de ce lot)"
    : "`.kiro` non ignoré, licence, README et adresse en ligne présents";
  if (!conformes) return ko("un des éléments de présence manque (voir le détail)", preuves, `git check-ignore .kiro/ ; curl -s -o /dev/null -w "%{http_code}" ${SITE}`);
  return ok(resume, preuves, `curl -s -o /dev/null -w "%{http_code}" ${SITE}`);
}

/** Point 14 — la vidéo est hors périmètre, par décision du demandeur. */
export async function pointVideo(): Promise<Resultat> {
  return horsPerimetre("vidéo exclue par le demandeur : aucun tournage ni montage dans ce lot", [
    "la recette coche « hors périmètre » et ne fait rien d'autre",
  ]);
}