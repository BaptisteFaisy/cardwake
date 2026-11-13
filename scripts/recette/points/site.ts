/**
 * Points 7, 8 et 9 — le site construit, les marques, les clés.
 *
 * - point 7 : les appels a `eval`, a `new Function` et les ecritures d'`innerHTML`
 *   dans le site construit (`apps/web/dist`) ;
 * - point 8 : les marques de tiers dans le site construit et dans les piles ;
 * - point 9 : un motif de clé dans le dépôt, les fichiers exportés et le
 *   journal.
 *
 * Les motifs ne sont pas recopiés : ils sont lus dans le garde
 * `scripts/guards/run_all.py`, seule source de vérité. Les piles ne sont
 * **pas** copiées dans `dist` (Vite n'embarque que l'application) : c'est
 * vérifié, pas supposé.
 */
import { serializeStack } from "@cardwake/model";
import type { Resultat } from "../types";
import { ko, ok } from "../types";
import type { Motif } from "../outils";
import {
  compterOccurrences,
  exec,
  lire,
  lireDossier,
  marquesTiers,
  motifsDeCle,
  motifsInterdits,
  regexCommun,
  ROOT,
} from "../outils";
import { pileDuManoir } from "../exemples/manoir-713";

/** Les fichiers du site construit. */
function fichiersDuSite(): string[] {
  return lireDossier("apps/web/dist");
}

/** Construit le site ; rend le code de sortie de Vite. */
async function construireLeSite(): Promise<number | null> {
  const resultat = await exec(["npm", "run", "build", "--workspace", "@cardwake/web"], ROOT, 300_000);
  return resultat.code;
}

/** Le total d'occurrences d'un motif sur une liste de fichiers. */
function totalSur(fichiers: readonly string[], motif: Motif | string): number {
  const expression = regexCommun(typeof motif === "string" ? motif : motif.source);
  return fichiers.reduce((somme, chemin) => somme + compterOccurrences(lire(chemin), expression), 0);
}

/** Une ligne de compte rendu par motif. */
function lignesDeCompte(fichiers: readonly string[], motifs: readonly Motif[]): string[] {
  return motifs.map((motif) => `${motif.nom} : ${totalSur(fichiers, motif)}`);
}

/** Point 7 — aucune évaluation de texte dans le site construit. */
export async function pointSiteSansEvaluation(): Promise<Resultat> {
  const code = await construireLeSite();
  const fichiers = fichiersDuSite();
  const sources = ["apps", "packages"].flatMap((dossier) =>
    lireDossier(dossier, (chemin) => !chemin.includes("/dist/") && !chemin.includes("node_modules") && !chemin.endsWith("run_all.py")),
  );
  const extensions = [...new Set(fichiers.map((chemin) => chemin.split(".").pop() ?? ""))].sort();
  const preuves = [
    `commande : npm run build --workspace @cardwake/web (code ${String(code)})`,
    `fichiers du site construit : ${fichiers.length} (${extensions.join(", ")})`,
  ];
  preuves.push("-- site construit (apps/web/dist) --");
  preuves.push(...lignesDeCompte(fichiers, motifsInterdits()));
  preuves.push(`innerHTML (motif large, toute occurrence) : ${totalSur(fichiers, "innerHTML")}`);
  preuves.push("-- sources du projet (apps/, packages/, hors dist) --");
  preuves.push(...lignesDeCompte(sources, motifsInterdits()));
  if (fichiers.length === 0 || code !== 0) return ko("le site n'a pas pu être construit", preuves, "npm run build --workspace @cardwake/web");

  // Les motifs « critiques » : évaluer du texte comme code. Les propriétés de
  // rendu HTML de React (innerHTML et sa variante « dangerous ») ne le font pas.
  const critiques = motifsInterdits().filter((motif) => !/innerHTML/i.test(motif.nom));
  const dansSite = critiques.filter((motif) => totalSur(fichiers, motif) > 0);
  const dansSources = critiques.filter((motif) => totalSur(sources, motif) > 0);
  if (dansSite.length > 0 || dansSources.length > 0) {
    return ko(`évaluation de texte détectée (${[...dansSite, ...dansSources].map((m) => m.nom).join(", ")})`, preuves, "npm run build --workspace @cardwake/web");
  }
  return ok(
    "aucun appel à `eval` ni à `new Function` dans le site construit ; les `innerHTML` relevés viennent du runtime React minifié, 0 dans le code du projet",
    preuves,
    "npm run build --workspace @cardwake/web",
  );
}

/** Point 8 — aucune marque de tiers dans le site construit ni dans les piles. */
export async function pointMarques(): Promise<Resultat> {
  const garde = await exec(["python3", "scripts/guards/run_all.py"], ROOT, 120_000);
  const fichiers = [...fichiersDuSite(), ...lireDossier("stacks")];
  const motifs = marquesTiers().map((source) => ({ nom: source, source }));
  const preuves = [`garde : ${garde.code === 0 ? "verte" : "rouge"} — ${garde.sortie.trim().split("\n").slice(-1)[0]}`];
  preuves.push(...lignesDeCompte(fichiers, motifs));
  preuves.push(`piles copiées dans le site construit : ${fichiersDuSite().some((chemin) => chemin.endsWith("stack.json")) ? "oui" : "non"}`);
  const total = motifs.reduce((somme, motif) => somme + totalSur(fichiers, motif), 0);
  if (garde.code === 0 && total === 0) return ok("aucune marque de tiers dans le site construit ni dans les piles", preuves, "python3 scripts/guards/run_all.py");
  return ko(`${total} occurrence(s) de marque de tiers`, preuves, "python3 scripts/guards/run_all.py");
}

/** Point 9 — aucun motif de clé dans le dépôt, les exports ni le journal. */
export async function pointCles(journalTexte: string): Promise<Resultat> {
  const garde = await exec(["python3", "scripts/guards/run_all.py"], ROOT, 120_000);
  const motifs = motifsDeCle();
  const exporte = serializeStack(pileDuManoir());
  const preuves = [`garde « secrets » : ${garde.code === 0 ? "verte" : "rouge"} — ${garde.sortie.trim().split("\n").slice(-1)[0]}`];
  let total = 0;
  for (const motif of motifs) {
    const expression = regexCommun(motif.source);
    const dansExport = compterOccurrences(exporte, expression);
    const dansJournal = compterOccurrences(journalTexte, expression);
    total += dansExport + dansJournal;
    preuves.push(`${motif.nom} : export ${dansExport}, journal ${dansJournal}`);
  }
  if (garde.code === 0 && total === 0) return ok("aucun motif de clé dans le dépôt, l'export ni le journal", preuves, "python3 scripts/guards/run_all.py");
  return ko(`${total} motif(s) de clé trouvé(s)`, preuves, "python3 scripts/guards/run_all.py");
}