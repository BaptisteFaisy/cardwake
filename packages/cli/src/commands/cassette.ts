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
import { dirname, join } from "node:path";
import * as agent from "@cardwake/agent";
import { cassetteFrom } from "@cardwake/agent";
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

/**
 * Situations attendues d'une pile. Le constructeur officiel arrive avec la
 * boucle d'agent (lot C8) : le branchement final tient à l'export de
 * `stackSituations` dans `@cardwake/agent`, déjà détecté ici.
 */
function expectedSituations(stackPath: string): string[] {
  const builder = (agent as unknown as Record<string, unknown>).stackSituations;
  const read = readStack(stackPath);
  if (typeof builder !== "function" || !read.ok) return [];
  const built = (builder as (stack: unknown) => unknown)(read.stack);
  return Array.isArray(built) ? (built as string[]) : [];
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

export function cassetteVerify(args: CliArgs, io: CliIO): number {
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
    const verdict = cassetteFrom(read.entries).verify(expectedSituations(pile));
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

export function cassetteCommand(args: CliArgs, io: CliIO): number {
  if (args.sub === "list") return cassetteList(args, io);
  if (args.sub === "verify") return cassetteVerify(args, io);
  if (args.sub === "record") return cassetteRecord(io);
  io.err("cassette: needs a sub-command — list, verify or record");
  return 3;
}
