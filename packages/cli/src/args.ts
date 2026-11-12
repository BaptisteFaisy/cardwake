/**
 * Analyse des arguments de la ligne de commande `cardwake` (11.7).
 *
 * Analyse minimale, sans dépendance : une sous-commande, des options à valeur,
 * des positionnels. Une erreur d'usage est rendue (code de sortie 3), jamais
 * levée : la ligne de commande ne plante pas. Textes utilisateur en anglais.
 */

import { readFileSync } from "node:fs";
import { parseStackFile } from "@cardwake/model";
import type { Stack } from "@cardwake/model";

export const COMMANDS = ["validate", "paraphrase", "cassette", "run"] as const;

export type CliArgs = {
  command: string;
  /** Sous-commande de `cassette` : `verify`, `list` ou `record`. */
  sub: string | null;
  positionals: string[];
  click: string | null;
  object: string | null;
  seed: number | null;
  json: boolean;
  help: boolean;
};

export type ParseResult = { ok: true; args: CliArgs } | { ok: false; error: string };

/** Où la commande écrit : injectable pour que les tests lisent la sortie. */
export type CliIO = { out: (line: string) => void; err: (line: string) => void };

/** Aide en anglais : elle est imprimée à la personne qui tape. */
export function usage(): string {
  return [
    "cardwake — work with card stacks from the command line.",
    "",
    "Usage:",
    "  cardwake validate <stack>           check a stack file and every script it holds",
    "  cardwake paraphrase <stack> --object <Card/Part>   read a script in plain words",
    "  cardwake cassette list <stack>      show the recorded answers of a stack",
    "  cardwake cassette verify [stack...] list the recordings that no longer match",
    "  cardwake cassette record <stack>    refused: recording costs money, it stays human",
    "  cardwake run <stack> --click <Card/Button> [--seed n]   play one click",
    "",
    "Options: --click <Card/Button>  --object <Card/Part>  --seed <n>  --json  -h|--help",
    "Exit codes: 0 success, 1 invalid stack, 2 not available, 3 wrong usage.",
  ].join("\n");
}

/** La graine est un entier : une graine fractionnaire ne serait pas reproductible. */
function parseSeed(raw: string): number | null {
  const seed = Number(raw);
  return Number.isInteger(seed) && seed >= 0 ? seed : null;
}

/** Lit argv : le premier mot libre est la commande, le suivant la sous-commande. */
export function parseArgs(argv: readonly string[]): ParseResult {
  const args: CliArgs = {
    command: "", sub: null, positionals: [],
    click: null, object: null, seed: null, json: false, help: false,
  };
  const rest = [...argv];
  while (rest.length > 0) {
    const token = rest.shift() as string;
    if (!token.startsWith("-")) {
      if (args.command === "") args.command = token;
      else if (args.command === "cassette" && args.sub === null) args.sub = token;
      else args.positionals.push(token);
      continue;
    }
    const split = token.indexOf("=");
    const name = split >= 0 ? token.slice(0, split) : token;
    const inline = split >= 0 ? token.slice(split + 1) : null;
    if (name === "--help" || name === "-h") args.help = true;
    else if (name === "--json") args.json = true;
    else if (name === "--click" || name === "--object" || name === "--seed") {
      const value = inline ?? rest.shift();
      if (value === undefined) return { ok: false, error: `option ${name} needs a value` };
      if (name === "--click") args.click = value;
      else if (name === "--object") args.object = value;
      else {
        const seed = parseSeed(value);
        if (seed === null) return { ok: false, error: "seed must be a whole number" };
        args.seed = seed;
      }
    } else return { ok: false, error: `unknown option: ${name}` };
  }
  return { ok: true, args };
}

export type StackRead = { ok: true; stack: Stack } | { ok: false; error: string };

/** Lit un fichier de pile : refusé en bloc, jamais chargé en partie (CAR-P-18). */
export function readStack(path: string): StackRead {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { ok: false, error: `cannot read ${path}` };
  }
  const parsed = parseStackFile(text);
  return parsed.ok ? { ok: true, stack: parsed.stack } : { ok: false, error: parsed.errors.join("\n") };
}
