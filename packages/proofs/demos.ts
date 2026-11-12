/**
 * Les quatre démonstrations locales des preuves P-20, P-24, P-25 et P-26.
 *
 * Chaque démonstration rejoue la situation **sur le moteur réel** — le
 * `Dispatcher` de `@cardwake/model` et la boucle de cassette de
 * `@cardwake/agent` — mais sans navigateur, sans modèle, sans réseau et
 * sans clé : les réponses d'agent sont écrites à la main. Une démonstration
 * qui échoue lève une erreur ; `runDemo` la convertit en verdict.
 *
 * Les piles chargées sont celles qui sont livrées (les `stack.json` du
 * dossier `stacks`), pas des copies de test : ce que la démonstration
 * prouve est ce que l'application embarque.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_LIMITS, Dispatcher, Journal, clampSettings, parseStackFile, serializeStack } from "@cardwake/model";
import type { AgentTurnRequest, ModelHost, Stack } from "@cardwake/model";
import type { Determinism, Guards } from "@cardwake/lang";
import { recordScenario, replayScenario } from "@cardwake/agent";
import { SCENARIOS } from "../../scripts/cassettes/build";

/** La racine du dépôt, déduite de ce fichier et non du répertoire courant. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Graine et horloge figées : une démonstration rejoue à l'identique. */
const DETERMINISM: Determinism = {
  seed: 7,
  random: () => 0.5,
  now: () => ({ date: "11/12/26", time: "00:00", longDate: "Thursday, November 12, 2026", epochMs: 0 }),
};
const CLOCK = "2026-11-12T00:00:00.000Z";

const GUARDS: Guards = {
  maxSteps: APP_LIMITS.maxSteps,
  maxMessageDepth: 50,
  maxWaitMs: APP_LIMITS.maxWaitMs,
  maxTextChars: APP_LIMITS.maxFieldChars,
};

/** Le produit d'une démonstration : verdict et phrase de compte rendu. */
export type DemoOutcome = { ok: boolean; summary: string };

/** Charge et valide une pile livrée ; erreur bloquante si elle ne passe pas. */
function loadStack(name: string): Stack {
  const parsed = parseStackFile(readFileSync(join(ROOT, "stacks", name, "stack.json"), "utf8"));
  if (!parsed.ok) throw new Error(`stack "${name}" is not valid: ${parsed.errors[0]}`);
  return parsed.stack;
}

/** Une assertion de démonstration : message anglais, échec visible. */
function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/** Lit un champ de fond dans la pile courante (contenu porté par la carte). */
function fieldOf(stack: Stack, cardName: string, fieldName: string): string {
  const card = stack.cards.find((item) => item.name === cardName);
  const part = stack.backgrounds
    .find((item) => item.id === card?.background)
    ?.parts.find((item) => item.name === fieldName);
  return card && part ? (card.content[String(part.id)] ?? "") : "";
}

/** Résout une carte par son nom ; erreur lisible sinon. */
function cardIdOf(stack: Stack, name: string): number {
  const card = stack.cards.find((item) => item.name === name);
  if (!card) throw new Error(`No card "${name}" in stack "${stack.name}".`);
  return card.id;
}

/** Résout un bouton par son nom sur une carte ; erreur lisible sinon. */
function buttonIdOf(stack: Stack, cardName: string, buttonName: string): number {
  const card = stack.cards.find((item) => item.name === cardName);
  const button = card?.parts.find((item) => item.kind === "button" && item.name === buttonName);
  if (!button) throw new Error(`No button "${buttonName}" on card "${cardName}".`);
  return button.id;
}

/** Un dispatcher prêt à jouer : journal neuf, horloges figées. */
function dispatcherFor(stack: Stack, onAgentTurn?: (request: AgentTurnRequest, host: ModelHost) => Promise<string>) {
  return new Dispatcher({
    stack,
    journal: new Journal(),
    guards: GUARDS,
    determinism: DETERMINISM,
    settings: clampSettings(stack.settings),
    clock: () => CLOCK,
    onAgentTurn,
  });
}

/** L'amulette : le garde s'alarme, prévient la cuisinière, qui sait déjà. */
async function manorDemo(): Promise<string> {
  const stack = loadStack("manor");
  const turn = async (request: AgentTurnRequest, host: ModelHost): Promise<string> => {
    if (request.cardId !== cardIdOf(stack, "Guard")) {
      host.writeFieldByName("Mood", "nervous");
      host.writeFieldByName("Memory", "The cook heard about the silver amulet.", "append");
      return "The key is under the floorboards.";
    }
    host.writeFieldByName("Mood", "alarmed");
    host.writeFieldByName("Memory", "A visitor carried a silver amulet.", "append");
    host.tell({ kind: "agent", cardId: cardIdOf(stack, "Cook") }, "A stranger carries the silver amulet. Watch the key.");
    return "Where did you get that? Put it away before the master sees it.";
  };
  const result = await dispatcherFor(stack, turn).click(cardIdOf(stack, "Guard"), buttonIdOf(stack, "Guard", "Show the amulet"));
  check(fieldOf(result.stack, "Guard", "Mood") === "alarmed", `guard mood: expected "alarmed"`);
  check(fieldOf(result.stack, "Cook", "Mood") === "nervous", `cook mood: expected "nervous"`);
  check(fieldOf(result.stack, "Guard", "Memory").includes("silver amulet"), "guard memory lost the amulet");
  check(fieldOf(result.stack, "Cook", "Memory").includes("silver amulet"), "cook memory lost the amulet");
  check(result.agentTurns === 2 && result.hopsLeft === 1, `budgets: expected 2 turns and 1 hop left`);
  return `manor: the guard wrote "alarmed", the cook answered "nervous" without a click (2 agent turns, 1 hop left)`;
}

/** Le devis : le script du bouton Total calcule 150 / 15 / 165 sur la pile livrée. */
async function quoteDemo(): Promise<string> {
  const stack = loadStack("quotes");
  const result = await dispatcherFor(stack).click(cardIdOf(stack, "Dupont"), buttonIdOf(stack, "Dupont", "Total"));
  const actual = [
    fieldOf(result.stack, "Dupont", "Subtotal"),
    fieldOf(result.stack, "Dupont", "VAT"),
    fieldOf(result.stack, "Dupont", "Total"),
  ];
  check(actual.join("/") === "150/15/165", `quote numbers: expected 150/15/165, got ${actual.join("/")}`);
  return `quote: the Total button computed ${actual[0]} / ${actual[1]} / ${actual[2]} on the shipped stack`;
}

/** L'espion : le chemin du message et le refus d'écriture sont visibles. */
async function spyDemo(): Promise<string> {
  const stack = loadStack("manor");
  const turn = async (_request: AgentTurnRequest, host: ModelHost): Promise<string> => {
    host.writeFieldByName("Says", "Let me in."); // Champ verrouillé : refus attendu.
    host.writeFieldByName("Mood", "suspicious");
    return "I cannot write my answer into a locked field.";
  };
  const result = await dispatcherFor(stack, turn).chat(cardIdOf(stack, "Guard"), "Who goes there?");
  check(result.refusals.some((refusal) => !refusal.allow && refusal.rule === "locked-field"), "expected a locked-field refusal");
  check(result.path.includes('card "Guard"'), `path misses the Guard card: ${result.path.join(" > ")}`);
  check(result.trace.some((line) => line.includes("refused (locked-field)")), "the trace hides the refusal");
  return `spy: the path shows card "Guard" and the refusal rule "locked-field" is on record`;
}

/** Le rejeu : la cassette enregistrée rejoue deux fois le même état final. */
async function replayDemo(): Promise<string> {
  const stack = loadStack("manor");
  const steps = SCENARIOS.manor;
  const recording = await recordScenario(stack, steps);
  const actions = steps.map((step) => step.action);
  const first = await replayScenario(stack, actions, recording.cassette);
  const second = await replayScenario(stack, actions, recording.cassette);
  const recorded = serializeStack(recording.stack);
  check(serializeStack(first.stack) === recorded, "first replay drifted from the recording");
  check(serializeStack(second.stack) === recorded, "second replay drifted from the recording");
  return `replay: ${recording.cassette.size} recorded calls, two replays and the recording share the same final state`;
}

/** Les démonstrations par identifiant de preuve. */
const DEMOS: Record<string, () => Promise<string>> = {
  "P-20": replayDemo,
  "P-24": quoteDemo,
  "P-25": manorDemo,
  "P-26": spyDemo,
};

/** Vérifie la démonstration d'une preuve : verdict local, sans réseau. */
export async function runDemo(proofId: string): Promise<DemoOutcome> {
  const demo = DEMOS[proofId];
  if (!demo) throw new Error(`No local demo for "${proofId}": the table cites a command, not a demonstration.`);
  try {
    return { ok: true, summary: await demo() };
  } catch (error) {
    return { ok: false, summary: error instanceof Error ? error.message : String(error) };
  }
}
