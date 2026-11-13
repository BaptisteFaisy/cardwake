/**
 * Le banc de mesure des cibles de performance du cahier des charges
 * (CAR-N-04 et CAR-N-05, partie mesurable sans modèle).
 *
 * Lancement : `npx vite-node scripts/bench/bench.ts`. Le banc :
 * - construit ses jeux d'essai **par programme** (`fixtures.ts`) avec les
 *   fabriques de `@cardwake/model` — aucune pile figée, aucun hasard ;
 * - passe par le vrai moteur du site (`apps/web/src/engine`), sans DOM ;
 * - échauffe puis mesure plusieurs tours, et rapporte médiane et p95 ;
 * - n'appelle aucun réseau, n'utilise aucune clé, et n'a pas d'autre
 *   aléatoire que la graine fixe affichée dans le rapport.
 *
 * Les deux rapports (`docs/mesures/bench.json`, `docs/mesures.md`) sont
 * réécrits à chaque exécution : les chiffres publiés sont ceux de la dernière
 * mesure.
 */

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import type { Determinism, Guards } from "@cardwake/lang";
import { parseScript, runHandler } from "@cardwake/lang";
import { APP_LIMITS, DEFAULT_SETTINGS, Journal, ModelHost, parseStackFile, serializeStack } from "@cardwake/model";
import type { Mesure } from "./report";
import { COMMAND, complete, formatNumber, writeReport } from "./report";
import { collectRounds, measureRounds } from "./mesure";
import { CARD_COUNT, SCRIPT_LINES, SEED, eventFixture, loopScript, scriptOf200Lines, stackOf100 } from "./fixtures";
import { createModelEngine, settled } from "../../apps/web/src/engine/model-engine";
import type { ModelEngineApi } from "../../apps/web/src/engine/model-engine";

/** Horloge figée du banc : aucune mesure ne dépend de l'heure réelle. */
const CLOCK = "2026-11-13T00:00:00.000Z";

const GUARDS: Guards = {
  maxSteps: APP_LIMITS.maxSteps,
  maxMessageDepth: 50,
  maxWaitMs: APP_LIMITS.maxWaitMs,
  maxTextChars: APP_LIMITS.maxFieldChars,
};

const DETERMINISM: Determinism = {
  seed: SEED,
  random: () => 0.5,
  now: () => ({ date: "11/13/26", time: "0:00", longDate: "Friday, November 13, 2026", epochMs: 0 }),
};

/** Combien de tours mesurer, et combien jeter à l'échauffement. */
export type BenchOptions = {
  rounds: { cardChange: number; open: number; parse: number; steps: number; event: number };
  warmup: { cardChange: number; open: number; parse: number; steps: number; event: number };
};

/** Le passage complet : assez de tours pour une médiane stable, en quelques secondes. */
export const FULL: BenchOptions = {
  rounds: { cardChange: 200, open: 30, parse: 300, steps: 12, event: 100 },
  warmup: { cardChange: 20, open: 3, parse: 20, steps: 3, event: 10 },
};

/** Le passage court du test : la structure est vérifiée, pas les durées. */
export const QUICK: BenchOptions = {
  rounds: { cardChange: 2, open: 2, parse: 2, steps: 1, event: 2 },
  warmup: { cardChange: 1, open: 1, parse: 1, steps: 1, event: 1 },
};

/** Un moteur du site, sans passerelle : aucun tour d'agent, aucun réseau. */
function quietEngine(): ModelEngineApi {
  return createModelEngine({
    clock: () => CLOCK,
    seed: SEED,
    gatewayOf: () => null,
    fallbackOf: () => null,
    relayExpected: () => false,
  });
}

/** CAR-N-04 : changement de carte, par le vrai moteur du site. */
async function measureCardChange(options: BenchOptions): Promise<Mesure> {
  const stack = stackOf100();
  const engine = quietEngine();
  engine.openStack(stack);
  const ids = stack.cards.map((card) => card.id);
  const samples = await measureRounds(options.rounds.cardChange, options.warmup.cardChange, (round) => {
    // (round + 1) : on ne vise jamais la carte déjà affichée, sinon le
    // `navigate` sort tout de suite et le tour ne mesurerait rien.
    engine.navigate(ids[(round + 1) % ids.length]);
  });
  engine.dispose();
  return complete(
    {
      id: "changement-carte",
      cible: "CAR-N-04",
      intitule: "Changement de carte",
      unite: "ms",
      comparaison: "<",
      limite: 50,
      methode:
        "chemin réel du site — `ModelEngine.navigate` sur une pile de 100 cartes : autorisation, " +
        "transaction du journal, application de l'opération `navigate`, notification des abonnés ; " +
        "le rendu React n'est pas compris (banc headless).",
    },
    samples,
  );
}

/** CAR-N-04 : ouverture d'une pile de 100 cartes, du fichier à la pile validée. */
async function measureOpen(options: BenchOptions): Promise<Mesure> {
  const file = join(tmpdir(), `cardwake-bench-${process.pid}.json`);
  writeFileSync(file, serializeStack(stackOf100()));
  const samples = await measureRounds(options.rounds.open, options.warmup.open, () => {
    const parsed = parseStackFile(readFileSync(file, "utf8"));
    if (!parsed.ok) throw new Error(`pile refusée : ${parsed.errors[0]}`);
  });
  rmSync(file, { force: true });
  return complete(
    {
      id: "ouverture-pile",
      cible: "CAR-N-04",
      intitule: "Ouverture d'une pile de 100 cartes",
      unite: "ms",
      comparaison: "<",
      limite: 1_000,
      methode:
        "ouverture d'un fichier de pile de 100 cartes : lecture disque, `JSON.parse`, puis " +
        "`validateStack` (le schéma `cardwake/1`) ; un fichier refusé ne rend jamais une pile partielle.",
    },
    samples,
  );
}

/** CAR-N-04 : analyse d'un script Murmur de 200 lignes. */
async function measureParse(options: BenchOptions): Promise<Mesure> {
  const source = scriptOf200Lines();
  const samples = await measureRounds(options.rounds.parse, options.warmup.parse, () => {
    const parsed = parseScript(source);
    if (!parsed.ok) throw new Error(`script refusé : ${parsed.errors[0]?.message ?? "inconnu"}`);
  });
  return complete(
    {
      id: "analyse-script",
      cible: "CAR-N-04",
      intitule: "Analyse d'un script de 200 lignes",
      unite: "ms",
      comparaison: "<",
      limite: 20,
      methode:
        "`parseScript` sur un script de 200 lignes exactement (25 handlers) : lexer et analyseur, " +
        "jusqu'à l'arbre syntaxique.",
    },
    samples,
  );
}

/** CAR-N-04 : débit d'étapes de l'interpréteur, sans effet sur la pile. */
async function measureSteps(options: BenchOptions): Promise<Mesure> {
  const parsed = parseScript(loopScript());
  if (!parsed.ok) throw new Error(`script de boucle refusé : ${parsed.errors[0]?.message ?? "inconnu"}`);
  const fixture = eventFixture();
  const host = new ModelHost({
    stack: fixture.stack,
    journal: new Journal(),
    actor: { kind: "script", objectId: 1 },
    cardId: fixture.cardId,
    guards: GUARDS,
    determinism: DETERMINISM,
    settings: DEFAULT_SETTINGS,
    txId: 1,
  });
  const samples = await collectRounds(options.rounds.steps, options.warmup.steps, async () => {
    const start = performance.now();
    const result = await runHandler(parsed.script, "mouseUp", [], host);
    const elapsed = performance.now() - start;
    if (!result.ok) throw new Error(`exécution arrêtée : ${result.error.message}`);
    return result.steps / (elapsed / 1000);
  });
  return complete(
    {
      id: "etapes-interpreteur",
      cible: "CAR-N-04",
      intitule: "Étapes d'interprétation par seconde",
      unite: "étapes/s",
      comparaison: "≥",
      limite: 200_000,
      methode:
        "étapes comptées par l'interpréteur (`result.steps`) sur un script de boucle sans effet " +
        "sur la pile, divisées par la durée mesurée avec `performance.now()`.",
    },
    samples,
  );
}

/** CAR-N-05 (partie mesurable) : du clic à l'indication visible dans la carte. */
async function measureEventLatency(options: BenchOptions): Promise<Mesure> {
  const fixture = eventFixture();
  const engine = quietEngine();
  engine.openStack(fixture.stack);
  const samples = await collectRounds(options.rounds.event, options.warmup.event, async () => {
    // Abonnement posé avant le clic : la mesure démarre exactement au
    // déclenchement et s'arrête quand l'indication visible est publiée.
    const visible = settled(engine);
    const start = performance.now();
    engine.click(fixture.buttonId);
    await visible;
    return performance.now() - start;
  });
  engine.dispose();
  return complete(
    {
      id: "evenement-indication",
      cible: "CAR-N-05",
      intitule: "Délai entre un événement et l'indication visible",
      unite: "ms",
      comparaison: "<",
      limite: 100,
      methode:
        "clic sur un bouton du vrai moteur jusqu'à l'événement `changed` qui porte l'indication " +
        "visible (le champ réécrit) : analyse du script, `Dispatcher`, `authorize`, transaction ; " +
        "le rendu React n'est pas compris (banc headless).",
    },
    samples,
  );
}

/** CAR-N-05 : le tour d'agent demande une vraie clé — hors de ce banc. */
const AGENT_TURN: Mesure = {
  id: "tour-agent",
  cible: "CAR-N-05",
  intitule: "Tour d'agent médian",
  unite: "ms",
  comparaison: "<",
  limite: 4_000,
  mediane: null,
  p95: null,
  tours: 0,
  verdict: "mesuré ailleurs",
  verdictP95: null,
  methode: "un tour d'agent appelle un vrai modèle : il sort de ce banc, qui n'a ni clé ni réseau",
  note: "mesuré avec une vraie clé : voir le rapport d'évaluation (evals/)",
};

/** Vérifie les jeux d'essai avant de mesurer : un jeu faux fausserait tout. */
export function checkFixtures(): void {
  const stack = stackOf100();
  if (stack.cards.length !== CARD_COUNT) {
    throw new Error(`pile de ${stack.cards.length} cartes au lieu de ${CARD_COUNT}`);
  }
  const reopened = parseStackFile(serializeStack(stack));
  if (!reopened.ok) throw new Error(`la pile de 100 cartes ne se relit pas : ${reopened.errors[0]}`);
  const source = scriptOf200Lines();
  if (source.split("\n").length !== SCRIPT_LINES) {
    throw new Error(`script de ${source.split("\n").length} lignes au lieu de ${SCRIPT_LINES}`);
  }
  if (!parseScript(source).ok) throw new Error("le script de 200 lignes ne s'analyse pas");
}

/** Toutes les mesures, dans l'ordre du cahier des charges. */
export async function runBench(options: BenchOptions): Promise<Mesure[]> {
  checkFixtures();
  return [
    await measureCardChange(options),
    await measureOpen(options),
    await measureParse(options),
    await measureSteps(options),
    await measureEventLatency(options),
    AGENT_TURN,
  ];
}

/** Une ligne de console par mesure : la même vérité que le rapport. */
function lineOf(mesure: Mesure): string {
  if (mesure.mediane === null) return `${mesure.cible} ${mesure.intitule} — ${mesure.note ?? "non mesuré"}`;
  const mediane = `${formatNumber(mesure.mediane, mesure.unite)} ${mesure.unite}`;
  const spread = mesure.p95 === null ? "" : ` (p95 ${formatNumber(mesure.p95, mesure.unite)} ${mesure.unite})`;
  return `${mesure.cible} ${mesure.intitule} : ${mediane}${spread} — ${mesure.verdict}`;
}

/** Le vrai lancement : mesure, écrit les deux rapports, rend le code de sortie. */
async function main(): Promise<number> {
  const date = new Date().toISOString();
  const mesures = await runBench(FULL);
  const paths = writeReport(mesures, { date, seed: SEED });
  for (const mesure of mesures) console.log(lineOf(mesure));
  const judged = mesures.filter((mesure) => mesure.verdict !== "mesuré ailleurs");
  const attained = judged.filter((mesure) => mesure.verdict === "atteint").length;
  console.log(`${attained}/${judged.length} cible(s) atteinte(s) par ce banc — ${paths.markdown} et ${paths.json}`);
  console.log(`rejouer : ${COMMAND}`);
  return 0;
}

/**
 * Vrai quand ce fichier est le point d'entrée : sous `vite-node`, `argv[1]`
 * vaut le binaire du lanceur ; sous Vitest (qui importe aussi ce module pour
 * le test), il vaut `vitest`. L'égalité stricte sur le nom évite toute
 * exécution parasite — même garde que `packages/cli/src/main.ts`.
 */
function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  const name = entry.split("/").pop() ?? "";
  return name === "vite-node" || pathToFileURL(entry).href === import.meta.url;
}

if (invokedDirectly()) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(`banc : ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    },
  );
}