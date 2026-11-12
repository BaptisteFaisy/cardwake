/**
 * Les outils du serveur MCP Cardwake : lecture et simulation du moteur,
 * sans réseau, sans clé, sans modèle. Chaque outil rend un JSON sérialisable
 * et ne lève jamais d'exception : un échec rend `{ ok:false, error }`.
 *
 * Les contrôles, la relecture et l'impression viennent de `@cardwake/lang` ;
 * la lecture de fichier et le dispatch viennent de `@cardwake/model`. Les CLI
 * ne sont pas importées : les rares bribes reprises (`scriptsOf`, graine et
 * horloge figées) sont reproduites à l'identique de `packages/cli`.
 */

import { readFileSync } from "node:fs";
import { checkScript, paraphraseScript, parseScript, printScript } from "@cardwake/lang";
import type { CheckContext, Determinism, Guards, Script } from "@cardwake/lang";
import { APP_LIMITS, Dispatcher, Journal, byName, findCard, findPart, parseStackFile } from "@cardwake/model";
import type { Stack } from "@cardwake/model";
import { ParamError, type RpcApi } from "./rpc";

/** Un outil MCP : son nom, sa fiche, son schéma, son exécution. */
export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(args: unknown): Promise<unknown>;
};

// ------------------------------------------------------------- paramètres

function asRecord(args: unknown): Record<string, unknown> {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    throw new ParamError("arguments must be an object");
  }
  return args as Record<string, unknown>;
}

function readString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string") throw new ParamError(`"${key}" must be a string`);
  return value;
}

function readStringList(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ParamError(`"${key}" must be a list of strings`);
  }
  return value as string[];
}

const OBJECT_KINDS = ["card", "background", "part", "stack"];

function readKind(args: Record<string, unknown>): CheckContext["objectKind"] {
  const value = args.objectKind ?? "card";
  if (typeof value !== "string" || !OBJECT_KINDS.includes(value)) {
    throw new ParamError(`"objectKind" must be one of: ${OBJECT_KINDS.join(", ")}`);
  }
  return value as CheckContext["objectKind"];
}

/** Exécute un handler d'outil : jamais d'exception, un échec rend `{ok:false, error}`. */
async function safeRun(run: (args: unknown) => unknown, args: unknown): Promise<unknown> {
  try {
    return await run(args);
  } catch (cause) {
    if (cause instanceof ParamError) throw cause; // → -32602 côté transport
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}

// ----------------------------------------------------------- piles du dépôt

type LoadedStack = { ok: true; stack: Stack } | { ok: false; errors: string[] };

/** Lit un fichier de pile : refusé en bloc, jamais chargé en partie. */
function loadStack(path: string): LoadedStack {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { ok: false, errors: [`cannot read ${path}`] };
  }
  const parsed = parseStackFile(text);
  return parsed.ok ? { ok: true, stack: parsed.stack } : { ok: false, errors: parsed.errors };
}

// --------------------------------------------------------------- simulation

/** Graine fixe : une simulation MCP est reproductible (CAR-F-17). */
const SEED = 1;

/** Générateur à graine (mulberry32), reproduit de la CLI `run` à l'identique. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Horloge figée : une simulation ne lit jamais l'heure réelle. */
const FROZEN: Determinism["now"] = () => ({
  date: "1/1/70", time: "0:00 AM", longDate: "Thursday, January 1, 1970", epochMs: 0,
});

function guardsOf(stack: Stack): Guards {
  const settings = stack.settings;
  return { maxSteps: settings.maxSteps, maxMessageDepth: settings.maxMessageDepth, maxWaitMs: settings.maxWaitMs, maxTextChars: APP_LIMITS.maxFieldChars };
}

function determinismOf(): Determinism {
  return { seed: SEED, random: prng(SEED), now: FROZEN };
}

/** Le clic exécuté sur une COPIE de la pile : les effets sont calculés, pas joués. */
async function simulateClick(stack: Stack, cardName: string, buttonName: string): Promise<unknown> {
  const copy: Stack = structuredClone(stack);
  const card = findCard(copy, byName(cardName));
  if (!card) return { ok: false, error: `no card named "${cardName}"` };
  const found = findPart(copy, card.id, byName(buttonName));
  if (!found || found.part.kind !== "button") {
    return { ok: false, error: `no button named "${buttonName}" on card "${cardName}"` };
  }
  const dispatcher = new Dispatcher({
    stack: copy,
    journal: new Journal(),
    guards: guardsOf(copy),
    determinism: determinismOf(),
    settings: copy.settings,
  });
  const result = await dispatcher.click(card.id, found.part.id);
  return {
    ok: true,
    stack: result.stack,
    trace: result.trace,
    handledBy: result.handledBy,
    hopsLeft: result.hopsLeft,
    refusals: result.refusals,
  };
}

async function runSimulate(args: unknown): Promise<unknown> {
  const record = asRecord(args);
  const loaded = loadStack(readString(record, "stackPath"));
  if (!loaded.ok) return { ok: false, error: loaded.errors.join("; ") };
  return simulateClick(loaded.stack, readString(record, "card"), readString(record, "button"));
}

// ----------------------------------------------------------------- lecture

/** Tous les scripts d'une pile, avec leur chemin JSON (logique de la CLI `validate`). */
function scriptsOf(stack: Stack): Array<[string, string]> {
  const scripts: Array<[string, string]> = [];
  if (stack.script !== "") scripts.push(["script", stack.script]);
  stack.backgrounds.forEach((background, i) => {
    if (background.script !== "") scripts.push([`backgrounds[${i}].script`, background.script]);
    background.parts.forEach((part, j) => {
      if (part.script !== "") scripts.push([`backgrounds[${i}].parts[${j}].script`, part.script]);
    });
  });
  stack.cards.forEach((card, i) => {
    if (card.script !== "") scripts.push([`cards[${i}].script`, card.script]);
    card.parts.forEach((part, j) => {
      if (part.script !== "") scripts.push([`cards[${i}].parts[${j}].script`, part.script]);
    });
  });
  return scripts;
}

/** Un script résumé : handlers et fonctions s'il s'analyse, erreurs sinon. */
function scriptSummary(source: string): Record<string, unknown> {
  const parsed = parseScript(source);
  if (!parsed.ok) return { ok: false, errors: parsed.errors.map((error) => error.message) };
  return {
    ok: true,
    handlers: parsed.script.handlers.map((handler) => handler.name),
    functions: parsed.script.functions.map((fn) => fn.name),
  };
}

function runReadStack(args: unknown): unknown {
  const loaded = loadStack(readString(asRecord(args), "path"));
  if (!loaded.ok) return { ok: false, error: loaded.errors.join("; ") };
  const stack = loaded.stack;
  return {
    ok: true,
    name: stack.name,
    persona: stack.persona,
    currentCardId: stack.currentCardId,
    cards: stack.cards.map((card) => ({ id: card.id, name: card.name, agent: card.agent })),
    backgrounds: stack.backgrounds.map((background) => ({
      id: background.id,
      name: background.name,
      parts: background.parts.map((part) => ({ id: part.id, kind: part.kind, name: part.name })),
    })),
    scripts: scriptsOf(stack).map(([at, source]) => ({ at, ...scriptSummary(source) })),
  };
}

// ------------------------------------------------------------ autres outils

function runValidateStack(args: unknown): unknown {
  const path = readString(asRecord(args), "path");
  const loaded = loadStack(path);
  return loaded.ok
    ? { ok: true, path, errors: [] }
    : { ok: false, path, errors: loaded.errors };
}

function runValidateScript(args: unknown): unknown {
  const record = asRecord(args);
  const context: CheckContext = {
    cardNames: readStringList(record, "cardNames"),
    partNames: readStringList(record, "partNames"),
    backgroundNames: readStringList(record, "backgroundNames"),
    objectKind: readKind(record),
  };
  return { issues: checkScript(readString(record, "script"), context) };
}

function runParaphrase(args: unknown): unknown {
  return { lines: paraphraseScript(readString(asRecord(args), "script")) };
}

function runFormatScript(args: unknown): unknown {
  const source = readString(asRecord(args), "script");
  const parsed: ReturnType<typeof parseScript> = parseScript(source);
  if (!parsed.ok) return { ok: false, error: parsed.errors[0]?.message ?? "cannot parse this script" };
  const script: Script = parsed.script;
  return { normalized: printScript(script) };
}

// ------------------------------------------------------------ fiches d'outils

function schemaOf(properties: Record<string, unknown>, required: string[]): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false };
}

const SCRIPT_PROP = { type: "string", description: "Murmur script source text" };
const PATH_PROP = { type: "string", description: "Path of a stack.json file, relative to the current directory" };
const STRING_LIST = { type: "array", items: { type: "string" }, description: "Names the script may mention" };

/** Une fiche d'outil : sa description, son schéma, et son exécution sûre. */
function toolOf(name: string, description: string, properties: Record<string, unknown>, required: string[], run: (args: unknown) => Promise<unknown>): McpTool {
  return { name, description, inputSchema: schemaOf(properties, required), run };
}

/** Les six outils du serveur, dans l'ordre de la documentation. */
export function mcpTools(): McpTool[] {
  return [
    toolOf("validate_script",
      "Check a Murmur script without running it: parse errors and static issues (unknown names, forbidden calls).",
      {
        script: SCRIPT_PROP,
        cardNames: STRING_LIST,
        partNames: STRING_LIST,
        backgroundNames: STRING_LIST,
        objectKind: { type: "string", enum: [...OBJECT_KINDS], description: "Kind of object carrying the script" },
      },
      ["script"], (args) => safeRun(runValidateScript, args)),
    toolOf("validate_stack",
      "Validate a stack file of this repository against the cardwake/1 schema.",
      { path: PATH_PROP }, ["path"], (args) => safeRun(runValidateStack, args)),
    toolOf("paraphrase",
      "Read a Murmur script back in plain English sentences, one per line.",
      { script: SCRIPT_PROP }, ["script"], (args) => safeRun(runParaphrase, args)),
    toolOf("simulate",
      "Simulate a click on a button of a stack file: computes the effects on a copy, without playing them.",
      {
        stackPath: PATH_PROP,
        card: { type: "string", description: "Name of the card holding the button" },
        button: { type: "string", description: "Name of the button to click" },
      },
      ["stackPath", "card", "button"], (args) => safeRun(runSimulate, args)),
    toolOf("read_stack",
      "Read a stack file: name, cards (with agents), backgrounds, and every script parsed to handler names.",
      { path: PATH_PROP }, ["path"], (args) => safeRun(runReadStack, args)),
    toolOf("format_script",
      "Print a Murmur script in its canonical normalized form.",
      { script: SCRIPT_PROP }, ["script"], (args) => safeRun(runFormatScript, args)),
  ];
}

/** L'API attendue par le transport : lister et exécuter les outils fournis. */
export function rpcApi(list: McpTool[]): RpcApi {
  return {
    listTools: () => list.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    async callTool(name: string, args: unknown) {
      const tool = list.find((item) => item.name === name);
      if (!tool) throw new ParamError(`unknown tool "${name}"`);
      return tool.run(args);
    },
  };
}
