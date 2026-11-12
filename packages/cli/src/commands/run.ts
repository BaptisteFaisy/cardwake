/**
 * `cardwake run <pile> --click "Carte/Bouton" [--seed n]` : simule un
 * événement et imprime les opérations produites (7.9).
 *
 * Le pont langage → modèle (`model/src/host.ts`, lot C4a) est chargé par
 * **import dynamique** : s'il n'est pas encore câblé dans un checkout donné,
 * la commande le dit et sort en code 2 — jamais d'échec de build ni d'import
 * statique cassé. Aucun réseau : `consult agent` sans passerelle répond
 * « The card did not answer. » (comportement de `ModelHost`).
 *
 * Déterminisme (CAR-F-17) : la graine vient de `--seed` (1 par défaut) et
 * l'horloge est figée — ni `Date.now`, ni `Math.random` dans ce module.
 */

import type { Determinism, Guards, Host, RunResult, Script } from "@cardwake/lang";
import { parseScript, runHandler } from "@cardwake/lang";
import { APP_LIMITS, Journal, byName, describeOp, findCard, findPart } from "@cardwake/model";
import type { Stack } from "@cardwake/model";
import { readStack, type CliArgs, type CliIO } from "../args";

/** Ce que la commande attend du pont, sans importer son type (build sauf). */
type HostLike = Host & { stack: Stack; lastRefusals: Array<{ rule?: string; reason?: string }> };
type HostCtor = new (context: unknown) => HostLike;

export type ModelLoader = () => Promise<Record<string, unknown> | null>;

/** Import dynamique du paquet modèle : rend `null` si le chargement échoue. */
export const loadModelModule: ModelLoader = async () => {
  try {
    return (await import("@cardwake/model")) as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
};

/** Le générateur à graine (mulberry32) : reproductible, jamais `Math.random`. */
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

/** Horloge figée : une simulation CLI ne lit jamais l'heure réelle. */
const FROZEN: Determinism["now"] = () => ({
  date: "1/1/70",
  time: "0:00 AM",
  longDate: "Thursday, January 1, 1970",
  epochMs: 0,
});
const CLOCK_TEXT = "1970-01-01T00:00:00.000Z";

function determinismOf(seed: number): Determinism {
  return { seed, random: prng(seed), now: FROZEN };
}

function guardsOf(stack: Stack): Guards {
  return {
    maxSteps: stack.settings.maxSteps,
    maxMessageDepth: stack.settings.maxMessageDepth,
    maxWaitMs: stack.settings.maxWaitMs,
    maxTextChars: APP_LIMITS.maxFieldChars,
  };
}

/** Le premier script de la chaîne bouton → carte → fond → pile qui prend `mouseUp`. */
function handlerSource(stack: Stack, cardId: number, buttonScript: string, backgroundScript: string): string | null {
  const card = stack.cards.find((item) => item.id === cardId);
  for (const source of [buttonScript, card?.script ?? "", backgroundScript, stack.script]) {
    if (source.trim() === "") continue;
    const parsed = parseScript(source);
    if (parsed.ok && parsed.script.handlers.some((handler) => handler.name.toLowerCase() === "mouseup")) return source;
  }
  return null;
}

export async function runCommand(args: CliArgs, io: CliIO, loadModel: ModelLoader = loadModelModule): Promise<number> {
  const path = args.positionals[0];
  if (path === undefined || args.click === null) {
    io.err('run: needs a stack file and --click "Card/Button"');
    return 3;
  }
  const model = await loadModel();
  const candidate = model?.ModelHost;
  if (typeof candidate !== "function") {
    io.out("run: the model host is not wired yet (lot C4a)");
    return 2;
  }
  const ctor = candidate as unknown as HostCtor;
  const read = readStack(path);
  if (!read.ok) {
    io.err(`run: ${read.error}`);
    return 1;
  }
  const [cardName, buttonName] = args.click.split("/");
  if (buttonName === undefined) {
    io.err('run: --click needs the form "Card/Button"');
    return 3;
  }
  const card = findCard(read.stack, byName(cardName));
  const found = card ? findPart(read.stack, card.id, byName(buttonName)) : undefined;
  if (!card || !found || found.part.kind !== "button") {
    io.err(`run: no button "${buttonName}" on card "${cardName}"`);
    return 1;
  }
  const seed = args.seed ?? 1;
  return simulate(read.stack, card.id, found.part.id, found.part.name, card.name, found.part.script, seed, ctor, io);
}

/** Exécute le clic et imprime les opérations : une transaction, un journal. */
async function simulate(
  stack: Stack, cardId: number, buttonId: number, buttonName: string, cardName: string,
  buttonScript: string, seed: number, ctor: HostCtor, io: CliIO,
): Promise<number> {
  const background = stack.backgrounds.find((item) => item.id === stack.cards.find((c) => c.id === cardId)?.background);
  const source = handlerSource(stack, cardId, buttonScript, background?.script ?? "");
  if (source === null) {
    io.out(`run: nothing handles the click on button "${buttonName}" — no operations`);
    return 0;
  }
  const parsed = parseScript(source);
  if (!parsed.ok) {
    io.err(`run: the script does not parse — ${parsed.errors[0]?.message ?? "unknown error"}`);
    return 1;
  }
  const journal = new Journal();
  journal.begin({ kind: "human", mode: "browse" }, `click on button "${buttonName}" of card "${cardName}"`, seed);
  const host = new ctor({
    stack, journal, cardId, settings: stack.settings,
    actor: { kind: "script", objectId: buttonId },
    guards: guardsOf(stack), determinism: determinismOf(seed),
  });
  const result: RunResult = await runHandler(parsed.script, "mouseUp", [], host);
  if (!result.ok) {
    journal.abort();
    io.err(`run: ${result.error.message}${result.error.line ? ` (line ${result.error.line})` : ""}`);
    return 1;
  }
  const transaction = journal.commit(host.stack, CLOCK_TEXT);
  io.out(`click on button "${buttonName}" of card "${cardName}" (seed ${seed}) — ${transaction.ops.length} operation(s)`);
  for (const op of transaction.ops) io.out(`  ${describeOp(op)}`);
  for (const refusal of host.lastRefusals) io.out(`  refused (${refusal.rule ?? "rule"}): ${refusal.reason ?? ""}`);
  return 0;
}
