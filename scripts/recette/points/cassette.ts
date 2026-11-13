/**
 * Point 2 — `cassette verify` ne liste aucun enregistrement périmé.
 *
 * On lance la commande réelle (pas une imitation) : `npx vite-node
 * packages/cli/src/main.ts cassette verify`. Elle rend 0 si aucune empreinte
 * n'est périmée (`stale`) ni manquante (`missing`), 1 sinon, en listant les
 * empreintes fautives.
 */
import * as agent from "@cardwake/agent";
import type { Resultat } from "../types";
import { ko, ok } from "../types";
import { exec, ROOT } from "../outils";

const COMMANDE = "npx vite-node packages/cli/src/main.ts cassette verify";

export async function pointCassette(): Promise<Resultat> {
  const lancement = await exec(["npx", "vite-node", "packages/cli/src/main.ts", "cassette", "verify"], ROOT);
  const preuves = lancement.sortie.split("\n").filter((ligne) => ligne.trim() !== "" && !ligne.startsWith("npm notice")).slice(0, 40);
  const perimees = preuves.filter((ligne) => ligne.includes("stale")).length;
  const manquantes = preuves.filter((ligne) => ligne.includes("missing")).length;
  const diagnostic = diagnosticDesSituations();
  if (diagnostic !== null) preuves.push(`diagnostic : ${diagnostic}`);

  if (lancement.code === 0 && perimees === 0 && manquantes === 0) {
    return ok("aucun enregistrement périmé ni manquant", preuves, COMMANDE);
  }
  return ko(
    `${perimees} enregistrement(s) périmé(s), ${manquantes} manquant(s)`,
    preuves.length > 0 ? preuves : [`sortie brute : ${lancement.sortie}`],
    COMMANDE,
  );
}

/**
 * Pourquoi `verify` voit-elle tout en périmé ? La commande demande à
 * `@cardwake/agent` de lister les situations attendues d'une pile ; sans cet
 * export, la liste est vide et chaque enregistrement devient « périmé ».
 */
function diagnosticDesSituations(): string | null {
  const paquet = agent as unknown as Record<string, unknown>;
  if (typeof paquet.stackSituations === "function") return null;
  return "`stackSituations` n'est pas exporté par @cardwake/agent : la liste des situations attendues est vide, donc tout enregistrement est vu comme périmé";
}