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

export const COMMANDS = ["live", "validate", "paraphrase", "cassette", "run", "mcp", "doctor", "new", "explain", "serve"] as const;

/**
 * Les commandes qui prennent un mot de sous-commande : le deuxième mot libre
 * de `argv` leur appartient, les suivants sont des positionnels. Ailleurs, ce
 * deuxième mot est un positionnel comme un autre (`new <fichier>`).
 */
export const SUBCOMMANDS: Record<string, readonly string[]> = {
  cassette: ["list", "verify", "record"],
  explain: ["script"],
};

export type CliArgs = {
  command: string;
  /** Sous-commande de `cassette` : `verify`, `list` ou `record`. */
  sub: string | null;
  positionals: string[];
  click: string | null;
  object: string | null;
  /** Carte à qui parler (commande `live`). */
  card?: string | null;
  /** Ce qu'on dit à la carte (commande `live`). */
  say?: string | null;
  /** Adresse du relais local (commandes `live`, `doctor`, `cassette record`). */
  relay?: string | null;
  seed: number | null;
  json: boolean;
  help: boolean;
  /** Écrase un fichier existant (`new`). */
  force: boolean;
  /** Confirme un geste qui coûte de l'argent (`cassette record`). */
  yes: boolean;
  /** Ouvre le navigateur (`serve`). */
  open: boolean;
  /** Port d'écoute de `serve`. */
  port: number | null;
  /** Plafond d'appels au relais (`cassette record`). */
  maxCalls: number | null;
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
    "  cardwake explain script <stack> --object <Card/Part>   read a script line by line",
    "  cardwake new <file> [--force]       create an empty stack (one card, one field, one button)",
    "  cardwake cassette list <stack>      show the recorded answers of a stack",
    "  cardwake cassette verify [stack...] list the recordings that no longer match",
    "  cardwake cassette record <stack> --relay <url> --yes [--max-calls n]   record the missing answers through the relay",
    "  cardwake run <stack> --click <Card/Button> [--seed n]   play one click",
    "  cardwake live <stack> --card <Name> --say <text>      ask a REAL model through the local relay",
    "  cardwake serve [--port n] [--open]  serve the built site from apps/web/dist",
    "  cardwake doctor [--relay <url>]     check stacks, cassettes, docs and guards (offline)",
    "  cardwake mcp                             start the project's MCP server (developer tool)",
    "",
    "Options: --click <Card/Button>  --object <Card/Part>  --card <Name>  --say <text>  --relay <url>  --seed <n>  --port <n>  --max-calls <n>  --force  --yes  --open  --json  -h|--help",
    "Exit codes: 0 success, 1 invalid stack, 2 not available, 3 wrong usage.",
  ].join("\n");
}

/** La graine est un entier : une graine fractionnaire ne serait pas reproductible. */
function parseSeed(raw: string): number | null {
  const seed = Number(raw);
  return Number.isInteger(seed) && seed >= 0 ? seed : null;
}

/** Un entier borné : le port d'écoute et le plafond d'appels refusent le reste. */
function parseBounded(raw: string, min: number, max: number): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

/** Les options qui prennent une valeur, et comment la lire. */
const VALUED_OPTIONS = ["--click", "--object", "--seed", "--card", "--say", "--relay", "--port", "--max-calls"];

/** Les options qui n'ont pas de valeur : leur présence suffit. */
const FLAGS: Record<string, "help" | "json" | "force" | "yes" | "open"> = {
  "--help": "help", "-h": "help", "--json": "json",
  "--force": "force", "--yes": "yes", "--open": "open",
};


/** Un mot libre : la commande, puis sa sous-commande, puis les positionnels. */
function placeWord(args: CliArgs, word: string): void {
  if (args.command === "") {
    args.command = word;
    return;
  }
  const subs = SUBCOMMANDS[args.command] ?? [];
  if (args.sub === null && subs.length > 0) {
    args.sub = word;
    return;
  }
  args.positionals.push(word);
}

/** `--object=X` et `--object X` désignent la même option. */
function splitOption(token: string): [string, string | null] {
  const at = token.indexOf("=");
  return at >= 0 ? [token.slice(0, at), token.slice(at + 1)] : [token, null];
}

/** Range la valeur d'une option à valeur ; rend un message d'usage, ou `null`. */
function assign(args: CliArgs, name: string, value: string): string | null {
  if (name === "--seed") {
    const seed = parseSeed(value);
    if (seed === null) return "seed must be a whole number";
    args.seed = seed;
    return null;
  }
  if (name === "--port") {
    const port = parseBounded(value, 1, 65535);
    if (port === null) return "port must be a whole number from 1 to 65535";
    args.port = port;
    return null;
  }
  if (name === "--max-calls") {
    const maxCalls = parseBounded(value, 1, 1_000);
    if (maxCalls === null) return "max-calls must be a whole number from 1 to 1000";
    args.maxCalls = maxCalls;
    return null;
  }
  if (name === "--click") args.click = value;
  else if (name === "--object") args.object = value;
  else if (name === "--card") args.card = value;
  else if (name === "--say") args.say = value;
  else args.relay = value;
  return null;
}

/** Lit argv : le premier mot libre est la commande, le suivant la sous-commande. */
export function parseArgs(argv: readonly string[]): ParseResult {
  const args: CliArgs = {
    command: "", sub: null, positionals: [],
    click: null, object: null, card: null, say: null, relay: null, seed: null,
    json: false, help: false, force: false, yes: false, open: false, port: null, maxCalls: null,
  };
  const rest = [...argv];
  while (rest.length > 0) {
    const token = rest.shift() as string;
    if (!token.startsWith("-")) {
      placeWord(args, token);
      continue;
    }
    const [name, inline] = splitOption(token);
    const flag = FLAGS[name];
    if (flag !== undefined) {
      args[flag] = true;
      continue;
    }
    if (!VALUED_OPTIONS.includes(name)) return { ok: false, error: `unknown option: ${name}` };
    const value = inline ?? rest.shift();
    if (value === undefined) return { ok: false, error: `option ${name} needs a value` };
    const problem = assign(args, name, value);
    if (problem !== null) return { ok: false, error: problem };
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
