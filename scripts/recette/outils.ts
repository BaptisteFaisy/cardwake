/**
 * Les outils de la recette : exécuter une commande, lire un fichier, compter
 * un motif, poser un piège réseau.
 *
 * Aucun réseau pendant la recette, sauf le `HEAD` du point 13 : un piège
 * posé par `piegerReseau()` compte et refuse toute tentative de `fetch` ou de
 * `http(S).request`. Les motifs interdits ne sont **pas recopiés** ici : on
 * lit le garde `scripts/guards/run_all.py`, qui reste la seule source de
 * vérité (une logique, une implémentation).
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

/** La racine du dépôt, déduite de ce fichier et non du répertoire courant. */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** La liste triée de tous les fichiers suivis par git. */
export function fichiersSuivis(): string[] {
  return execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((ligne) => ligne.trim() !== "")
    .sort();
}

/** Un motif lu depuis le garde : un nom lisible et un pattern Python. */
export type Motif = { nom: string; source: string };

/** Extrait une liste de motifs depuis `run_all.py`, sans la recopier. */
function motifsDuGarde(bloc: string): Motif[] {
  const texte = readFileSync(join(ROOT, "scripts", "guards", "run_all.py"), "utf8");
  const corps = texte.split(`${bloc} = [`)[1]?.split("]")[0] ?? "";
  const motifs: Motif[] = [];
  for (const ligne of corps.split("\n")) {
    const trouve = ligne.match(/^\s*\((r)?"([^"]+)",\s*"([^"]+)".*\)/);
    if (trouve) motifs.push({ nom: trouve[3], source: trouve[2] });
  }
  return motifs;
}

/** Les constructions interdites du garde `no-eval`. */
export function motifsInterdits(): Motif[] {
  return motifsDuGarde("DANGEROUS");
}

/** Les marques de tiers du garde `trademarks` (pattern python simple). */
export function marquesTiers(): string[] {
  const texte = readFileSync(join(ROOT, "scripts", "guards", "run_all.py"), "utf8");
  const corps = texte.split("TRADEMARKS = [")[1]?.split("]")[0] ?? "";
  return [...corps.matchAll(/r"([^"]+)"/g)].map((m) => m[1]);
}

/** Les motifs de clé du garde `secrets`. */
export function motifsDeCle(): Motif[] {
  return motifsDuGarde("SECRET_PATTERNS");
}

/** Convertit un pattern `re` Python en expression rationnelle JavaScript. */
export function regexCommun(source: string): RegExp {
  return new RegExp(source, "m");
}

/** Le résultat d'une commande : code de sortie, sortie, plafond atteint. */
export type Exec = { code: number | null; sortie: string; delaiDepasse: boolean };

/** Exécute une commande (sans shell interactif) et rend code + sortie. */
export function exec(
  args: readonly string[],
  cwd = ROOT,
  timeoutMs = 300_000,
  env: Record<string, string> = {},
): Promise<Exec> {
  return new Promise((resolve) => {
    let sortie = "";
    let delaiDepasse = false;
    const enfant = spawn(args[0], args.slice(1), { cwd, env: { ...process.env, ...env } });
    enfant.stdout.on("data", (morceau: Buffer) => {
      sortie += morceau.toString();
    });
    enfant.stderr.on("data", (morceau: Buffer) => {
      sortie += morceau.toString();
    });
    const minuterie = setTimeout(() => {
      delaiDepasse = true;
      enfant.kill("SIGKILL");
    }, timeoutMs);
    enfant.on("error", (erreur) => {
      sortie += `\n${erreur.message}`;
    });
    enfant.on("close", (code) => {
      clearTimeout(minuterie);
      resolve({ code, sortie, delaiDepasse });
    });
  });
}

/** Le piège réseau : il compte les tentatives et les refuse. */
export type Piege = { tentatives: string[]; liberer: () => void };

/**
 * Pose le piège : `fetch`, `http.request`/`get` et `https.request`/`get`
 * comptent puis échouent. Rend la fonction qui remet l'état d'origine.
 */
export function piegerReseau(): Piege {
  const tentatives: string[] = [];
  const requete = createRequire(import.meta.url);
  const http = requete("node:http") as typeof import("node:http");
  const https = requete("node:https") as typeof import("node:https");

  const vraiFetch = globalThis.fetch;
  const vraiHttpRequest = http.request;
  const vraiHttpGet = http.get;
  const vraiHttpsRequest = https.request;
  const vraiHttpsGet = https.get;

  globalThis.fetch = ((entree: unknown) => {
    tentatives.push(`fetch ${String(entree)}`);
    return Promise.reject(new Error("network forbidden by the recipe"));
  }) as typeof globalThis.fetch;

  http.request = ((...args: unknown[]) => {
    tentatives.push(`http.request ${String(args[0])}`);
    throw new Error("network forbidden by the recipe");
  }) as typeof http.request;
  http.get = ((...args: unknown[]) => {
    tentatives.push(`http.get ${String(args[0])}`);
    throw new Error("network forbidden by the recipe");
  }) as typeof http.get;
  https.request = ((...args: unknown[]) => {
    tentatives.push(`https.request ${String(args[0])}`);
    throw new Error("network forbidden by the recipe");
  }) as typeof https.request;
  https.get = ((...args: unknown[]) => {
    tentatives.push(`https.get ${String(args[0])}`);
    throw new Error("network forbidden by the recipe");
  }) as typeof https.get;

  return {
    tentatives,
    liberer: () => {
      globalThis.fetch = vraiFetch;
      http.request = vraiHttpRequest;
      http.get = vraiHttpGet;
      https.request = vraiHttpsRequest;
      https.get = vraiHttpsGet;
    },
  };
}

/** Compter les occurrences d'un motif dans un texte. */
export function compterImpression(texte: string, expression: RegExp): number {
  return texte.split("\n").filter((ligne) => expression.test(ligne)).length;
}

/** Lire tous les fichiers d'un dossier (récursif, via `find`). */
export function lireDossier(dossier: string, filtre?: (chemin: string) => boolean): string[] {
  if (!existsSync(join(ROOT, dossier))) return [];
  const entrees = execFileSync("find", [dossier, "-type", "f"], { cwd: ROOT, encoding: "utf8" });
  return entrees.split("\n").filter((chemin) => chemin.trim() !== "" && (!filtre || filtre(chemin)));
}

/** Lire un fichier ; chaîne vide si le fichier n'existe pas. */
export function lire(chemin: string): string {
  try {
    return readFileSync(isAbsolute(chemin) ? chemin : join(ROOT, chemin), "utf8");
  } catch {
    return "";
  }
}

/** Compter les occurrences d'un motif dans un texte (toutes, pas par ligne). */
export function compterOccurrences(texte: string, expression: RegExp): number {
  const globale = new RegExp(expression.source, expression.flags.includes("g") ? expression.flags : `${expression.flags}g`);
  return texte.match(globale)?.length ?? 0;
}

/** Le nombre de tests verts et rouges dans une sortie `vitest --reporter=verbose`. */
export function decompteVitest(sortie: string): { passes: number; echoues: number; noms: string[] } {
  const noms: string[] = [];
  const vus = new Set<string>();
  let passes = 0;
  let echoues = 0;
  for (const ligne of sortie.split("\n")) {
    if (!ligne.startsWith(" ✓ ")) {
      if (ligne.startsWith(" × ") || ligne.includes(" FAIL ")) echoues += 1;
      continue;
    }
    // La ligne de résumé d'un fichier (`(17 tests)`) n'est pas un test, et le
    // rapport détaillé réimprime un test lent avec sa durée : on dédoublonne.
    if (/\(\d+ tests?\)/.test(ligne)) continue;
    const nom = ligne.slice(3).trim().replace(/\s+\d+ms$/, "");
    if (vus.has(nom)) continue;
    vus.add(nom);
    passes += 1;
    noms.push(nom);
  }
  return { passes, echoues, noms };
}