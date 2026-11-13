/**
 * `cardwake cassette …` : les enregistrements du mode joué d'avance (7.11).
 *
 * - `list <pile>`   : empreinte, but et taille de chaque enregistrement.
 * - `verify [piles]`: les enregistrements dont l'empreinte ne correspond plus
 *   (via `CassetteGateway.verify` et l'empreinte canonique SHA-256).
 * - `record`        : REFUSÉE — enregistrer appelle un vrai modèle, ce qui
 *   coûte de l'argent et reste un geste humain (hook `no-live-model-guard`).
 *
 * Aucun appel réseau, jamais : ce module ne lit que des fichiers locaux.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { cassetteFrom, stackSituations } from "@cardwake/agent";
import type { CassetteEntry } from "@cardwake/model";
import { readStack, type CliArgs, type CliIO } from "../args";

/** La cassette d'une pile vit à côté de son fichier : `<dir>/cassette.json`. */
export function cassettePathFor(stackPath: string): string {
  return join(dirname(stackPath), "cassette.json");
}

function isEntry(value: unknown): value is CassetteEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.fingerprint === "string" && typeof entry.purpose === "string";
}

export type CassetteRead = { found: boolean; entries: CassetteEntry[] } | { found: boolean; error: string };

/** Lit la cassette : fichier absent = cassette vide, fichier illisible = erreur. */
export function loadCassette(stackPath: string): CassetteRead {
  const path = cassettePathFor(stackPath);
  if (!existsSync(path)) return { found: false, entries: [] };
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { found: true, error: `${path}: not valid JSON` };
  }
  const raw = Array.isArray(json) ? json : (json as { entries?: unknown })?.entries;
  if (!Array.isArray(raw) || !raw.every(isEntry)) return { found: true, error: `${path}: expected a list of recordings` };
  return { found: true, entries: raw };
}

/** Taille affichée d'un enregistrement : les octets de sa réponse. */
function entrySize(entry: CassetteEntry): number {
  return new TextEncoder().encode(JSON.stringify(entry.response)).length;
}

/** Ce que la vérification sait des situations attendues d'une pile. */
type Situations =
  | { kind: "known"; fingerprints: string[] }
  | { kind: "none" }
  | { kind: "broken"; reason: string };

/**
 * Les situations attendues d'une pile : on rejoue ses parcours de démonstration
 * et on relève les requêtes que la boucle d'agent demande. Les empreintes
 * demandées doivent être celles que la cassette porte.
 *
 * Trois issues, trois réponses honnêtes : une pile de démonstration se vérifie ;
 * une pile qui n'a pas de parcours connu ne se vérifie pas, et le dit ;
 * une pile dont les parcours ne se rejouent plus ne peut plus être certifiée,
 * et le dit aussi (c'est le signal le plus fort qu'une cassette est périmée).
 */
async function expectedSituations(stackPath: string): Promise<Situations> {
  const read = readStack(stackPath);
  if (!read.ok) return { kind: "none" };
  try {
    const fingerprints = await stackSituations(basename(dirname(stackPath)), read.stack);
    if (fingerprints === null) return { kind: "none" };
    return { kind: "known", fingerprints };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { kind: "broken", reason };
  }
}

/** Piles à vérifier : celles passées en argument, sinon `stacks/*` d'ici. */
function pilesOf(args: CliArgs, io: CliIO): string[] | null {
  if (args.positionals.length > 0) return args.positionals;
  try {
    return readdirSync("stacks", { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join("stacks", entry.name, "stack.json")))
      .map((entry) => join("stacks", entry.name, "stack.json"));
  } catch {
    io.err("cassette verify: no stack given and no ./stacks directory here");
    return null;
  }
}

export function cassetteList(args: CliArgs, io: CliIO): number {
  const path = args.positionals[0];
  if (path === undefined) {
    io.err("cassette list: needs the path of a stack file");
    return 3;
  }
  const read = loadCassette(path);
  if ("error" in read) {
    io.err(`cassette list: ${read.error}`);
    return 1;
  }
  if (!read.found) {
    io.out(`${cassettePathFor(path)}: no cassette file, nothing recorded yet`);
    return 0;
  }
  for (const entry of read.entries) io.out(`${entry.fingerprint}  ${entry.purpose}  ${entrySize(entry)} bytes`);
  io.out(`${read.entries.length} recording(s)`);
  return 0;
}

export async function cassetteVerify(args: CliArgs, io: CliIO): Promise<number> {
  const piles = pilesOf(args, io);
  if (piles === null) return 3;
  let problems = 0;
  for (const pile of piles) {
    const read = loadCassette(pile);
    if ("error" in read) {
      io.err(`cassette verify: ${read.error}`);
      problems += 1;
      continue;
    }
    const situations = await expectedSituations(pile);
    if (situations.kind === "none") {
      io.out(`${pile}: no demo scenario for this stack — ${read.entries.length} recording(s), not checked`);
      continue;
    }
    if (situations.kind === "broken") {
      io.out(`${pile}: the demo flows no longer replay (${situations.reason}) — the recordings cannot be certified`);
      problems += 1;
      continue;
    }
    const verdict = cassetteFrom(read.entries).verify(situations.fingerprints);
    for (const fingerprint of verdict.stale) io.out(`${pile}: stale ${fingerprint}`);
    for (const fingerprint of verdict.missing) io.out(`${pile}: missing ${fingerprint}`);
    problems += verdict.stale.length + verdict.missing.length;
    if (verdict.stale.length + verdict.missing.length === 0) {
      io.out(`${pile}: ${read.entries.length} recording(s), all up to date`);
    }
  }
  return problems === 0 ? 0 : 1;
}

/** Refus assumé : la CLI n'a pas de clé, ne fait aucun appel réseau (7.11). */
export function cassetteRecord(io: CliIO): number {
  io.err("cassette record: refused.");
  io.err("Recording calls a live model: it costs real money and stays a human action.");
  io.err("This CLI never reads an API key and never makes a network call (no-live-model-guard).");
  return 2;
}

export async function cassetteCommand(args: CliArgs, io: CliIO): Promise<number> {
  if (args.sub === "list") return cassetteList(args, io);
  if (args.sub === "verify") return await cassetteVerify(args, io);
  if (args.sub === "record") return cassetteRecord(io);
  io.err("cassette: needs a sub-command — list, verify or record");
  return 3;
}
