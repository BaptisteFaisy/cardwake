/**
 * Point 3 — les trois piles se jouent de bout en bout en mode enregistré, et
 * aucune requête réseau n'est émise.
 *
 * Deux lectures, pour chaque pile livrée :
 * - `cardwake run <pile> --click "Carte/Bouton"` joue le clic et imprime les
 *   opérations produites (la partie script) ;
 * - le rejeu de la cassette rejoue le parcours complet de la pile, réponses
 *   du modèle comprises, sans clé et sans réseau.
 *
 * Le réseau est surveillé, pas supposé : un piège posé sur `fetch` et sur
 * `http(S).request` compte les tentatives pendant toute la recette. En plus,
 * on cherche par lecture les imports réseau dans les paquets du mode
 * enregistré : le résultat est factuel, vide = conforme.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStackFile } from "@cardwake/model";
import type { Stack } from "@cardwake/model";
import { CassetteGateway, DEMO_SCENARIOS, replayScenario } from "@cardwake/agent";
import type { CassetteEntry } from "@cardwake/model";
import type { Resultat } from "../types";
import { ko, ok } from "../types";
import { exec, lireDossier, piegerReseau, ROOT } from "../outils";

/** Les trois piles livrées et le clic que la commande `run` joue sur chacune. */
const PILES: { nom: string; clic: string }[] = [
  { nom: "manor", clic: "Guard/Show the amulet" },
  { nom: "quotes", clic: "Dupont/Total" },
  { nom: "dashboard", clic: "Week/Summarise my week" },
];

/** Ce qui importe le réseau de Node : la marque d'un paquet non pur. */
const IMPORTS_RESEAU = [/from\s+["']node:(?:https?|net|tls|dgram)["']/, /import\s*\(\s*["']node:(?:https?|net|tls|dgram)/];

/** Ce qui peut sortir sur le réseau, sans passer par un import de Node. */
const ACCES_RESEAU = [/\bfetch\s*\(/, /\bglobalThis\.fetch\b/, /\bXMLHttpRequest\b/, /\bWebSocket\b/];

/** Charge la pile livrée et sa cassette. */
function chargerPile(nom: string): { pile: Stack; cassette: CassetteGateway } {
  const brute = readFileSync(join(ROOT, "stacks", nom, "stack.json"), "utf8");
  const lue = parseStackFile(brute);
  if (!lue.ok) throw new Error(`${nom}: pile refusée — ${lue.errors.join(", ")}`);
  const cassette = JSON.parse(readFileSync(join(ROOT, "stacks", nom, "cassette.json"), "utf8")) as {
    entries: CassetteEntry[];
  };
  return { pile: lue.stack, cassette: new CassetteGateway({ entries: cassette.entries }) };
}

/** Joue le clic de la commande `run` et rend ses lignes utiles. */
async function jouerLeClic(nom: string, clic: string): Promise<{ code: number | null; lignes: string[] }> {
  const resultat = await exec(
    ["npx", "vite-node", "packages/cli/src/main.ts", "run", `stacks/${nom}/stack.json`, "--click", clic, "--seed", "1"],
    ROOT,
  );
  const lignes = resultat.sortie
    .split("\n")
    .filter((ligne) => ligne.trim() !== "" && !ligne.startsWith("npm notice"));
  return { code: resultat.code, lignes };
}

/** Rejoue le parcours enregistré de la pile ; rend les réponses obtenues. */
async function rejouerLeParcours(nom: string): Promise<string[]> {
  const { pile, cassette } = chargerPile(nom);
  const etapes = DEMO_SCENARIOS[nom as keyof typeof DEMO_SCENARIOS];
  const actions = etapes.map((etape) => etape.action);
  const rejeu = await replayScenario(pile, actions, cassette);
  return [...rejeu.replies];
}

/** Les lignes des paquets qui correspondent à l'un des motifs. */
function chercher(motifs: readonly RegExp[]): string[] {
  const trouves: string[] = [];
  for (const dossier of ["packages/lang/src", "packages/model/src", "packages/agent/src"]) {
    for (const chemin of lireDossier(dossier)) {
      readFileSync(join(ROOT, chemin), "utf8")
        .split("\n")
        .forEach((ligne, index) => {
          if (motifs.some((motif) => motif.test(ligne))) trouves.push(`${chemin}:${index + 1} — ${ligne.trim().slice(0, 110)}`);
        });
    }
  }
  return trouves;
}

export async function pointPiles(piege: { tentatives: string[] }): Promise<Resultat> {
  const preuves: string[] = [];
  let okTout = true;

  for (const pile of PILES) {
    const clic = await jouerLeClic(pile.nom, pile.clic);
    preuves.push(`cardwake run ${pile.nom} --click "${pile.clic}" → code ${String(clic.code)}`);
    preuves.push(...clic.lignes.map((ligne) => `    ${ligne}`));
    if (clic.code !== 0) okTout = false;
  }

  for (const pile of PILES) {
    try {
      const reponses = await rejouerLeParcours(pile.nom);
      preuves.push(`rejeu enregistré ${pile.nom} → ${reponses.length} réponse(s) : ${reponses.join(" | ").slice(0, 220)}`);
      if (reponses.length === 0) okTout = false;
    } catch (erreur) {
      okTout = false;
      preuves.push(`rejeu enregistré ${pile.nom} → échec : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    }
  }

  const imports = chercher(IMPORTS_RESEAU);
  const acces = chercher(ACCES_RESEAU);
  preuves.push(
    imports.length === 0
      ? "imports réseau (node:http/https/net/tls/dgram) dans packages/lang, packages/model et packages/agent : aucun"
      : `imports réseau trouvés (${imports.length}) :\n    ${imports.join("\n    ")}`,
  );
  preuves.push(
    acces.length === 0
      ? "accès réseau direct (fetch, XMLHttpRequest, WebSocket) : aucun"
      : `accès réseau direct hors mode enregistré (${acces.length}), jamais instanciés au rejeu :\n    ${acces.join("\n    ")}`,
  );
  preuves.push(`tentatives de requête réseau pendant la recette : ${piege.tentatives.length}`);
  for (const tentative of piege.tentatives.slice(0, 10)) preuves.push(`    ${tentative}`);

  if (piege.tentatives.length > 0) okTout = false;
  if (imports.length > 0) okTout = false;
  return okTout
    ? ok("les trois piles se jouent en mode enregistré, sans requête réseau", preuves, "cardwake run + rejeu de cassette")
    : ko("le mode enregistré n'a pas pu jouer les trois piles sans réseau", preuves, "cardwake run + rejeu de cassette");
}
