#!/usr/bin/env node
/**
 * Le lanceur du jeu d'évaluation : `npx vite-node evals/run.ts [options]`.
 *
 * Options :
 *   --relay <url>    relais local qui détient la clé (défaut : 8787)
 *   --model <nom>    modèle demandé au relais (défaut : combo/cheap)
 *   --family <nom>   une seule famille (calcul, chunks, navigation…)
 *   --limit <n>      ne jouer que les n premières tâches
 *   --out <fichier>  où écrire le rapport JSON (défaut : docs/mesures/eval.json)
 *   --reference <f>  la référence du langage (défaut : docs/language.md)
 *
 * Le jeu ne touche jamais à la clé : le relais la détient, ce script ne
 * connaît qu'une adresse. Il ne fait donc **jamais** partie de la CI.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadTasks } from "./check";
import { relayGateway, runGame } from "./runner";
import type { GameReport } from "./runner";

/** L'horloge du moteur : figée, pour que le jeu soit rejouable. */
const FIXED_CLOCK = () => "1970-01-01T00:00:00.000Z";

/** Les options de la ligne de commande, lues une par une. */
type Options = {
  relay: string;
  model: string;
  family: string | null;
  limit: number | null;
  out: string;
  reference: string;
};

/** Les options par défaut : le relais local, le modèle bon marché. */
function defaults(): Options {
  return {
    relay: "http://127.0.0.1:8787/v1",
    model: "combo/cheap",
    family: null,
    limit: null,
    out: "docs/mesures/eval.json",
    reference: "docs/language.md",
  };
}

/** Lit les options de la ligne de commande. */
export function parseOptions(argv: readonly string[]): Options {
  const options = defaults();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--relay" && value !== undefined) options.relay = value;
    else if (flag === "--model" && value !== undefined) options.model = value;
    else if (flag === "--family" && value !== undefined) options.family = value;
    else if (flag === "--reference" && value !== undefined) options.reference = value;
    else if (flag === "--out" && value !== undefined) options.out = value;
    else if (flag === "--limit" && value !== undefined) {
      const parsed = Number.parseInt(value, 10);
      options.limit = Number.isFinite(parsed) ? parsed : null;
    }
  }
  return options;
}

/** Le tableau du rapport, en markdown : une ligne par famille. */
export function familyTable(report: GameReport): string {
  const lines = [
    "| famille | tâches | premier coup | après réparation | taux (après réparation) |",
    "|---|---|---|---|---|",
  ];
  for (const [family, counts] of Object.entries(report.byFamily)) {
    const rate = counts.total === 0 ? 0 : Math.round((counts.ok / counts.total) * 100);
    lines.push(`| ${family} | ${counts.total} | ${counts.firstTry} | ${counts.ok} | ${rate} % |`);
  }
  return lines.join("\n");
}

/** Le tableau des échecs, en markdown : une ligne par tâche ratée. */
export function failureTable(report: GameReport): string {
  const lines = ["| tâche | statut | pourquoi |", "|---|---|---|"];
  for (const outcome of report.tasks) {
    if (outcome.status === "ok") continue;
    const reason = outcome.failures[0] ?? outcome.errors[0] ?? "unknown";
    lines.push(`| ${outcome.id} | ${outcome.status} | ${reason.replace(/\|/g, "/")} |`);
  }
  return lines.join("\n");
}

/** Écrit le rapport JSON, en créant le dossier si besoin. */
function writeReport(path: string, report: GameReport): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

/** Le point d'entrée : jouer, écrire, résumer. */
async function main(argv: readonly string[]): Promise<number> {
  const options = parseOptions(argv);
  const loaded = loadTasks("evals/compile");
  if (!loaded.ok) {
    for (const error of loaded.errors) console.error(`[eval] ${error}`);
    return 1;
  }
  let tasks = loaded.tasks;
  if (options.family !== null) tasks = tasks.filter((task) => task.family === options.family);
  if (options.limit !== null) tasks = tasks.slice(0, options.limit);
  const languageReference = readFileSync(options.reference, "utf8");
  console.log(`[eval] ${tasks.length} task(s), model ${options.model}, relay ${options.relay}`);
  const report = await runGame(tasks, {
    gateway: relayGateway(options.relay, options.model),
    languageReference,
    seed: 2026,
    clock: FIXED_CLOCK,
    model: options.model,
    onTask: (outcome) => {
      const mark = outcome.status === "ok" ? "ok" : outcome.status;
      console.log(`[eval] ${outcome.id} — ${mark}${outcome.failures[0] ? ` — ${outcome.failures[0]}` : ""}`);
    },
  });
  report.startedAt = new Date().toISOString();
  writeReport(options.out, report);
  const rate = report.total === 0 ? 0 : Math.round((report.ok / report.total) * 100);
  const firstRate = report.total === 0 ? 0 : Math.round((report.okFirstTry / report.total) * 100);
  console.log(`\n${familyTable(report)}\n`);
  console.log(`[eval] premier coup : ${report.okFirstTry}/${report.total} (${firstRate} %)`);
  console.log(`[eval] après une réparation : ${report.ok}/${report.total} (${rate} %) — ${report.repaired} réparation(s)`);
  console.log(`[eval] ${report.calls} appels de modèle`);
  console.log(`[eval] rapport écrit dans ${options.out}`);
  if (report.ok < report.total) console.log(`\n${failureTable(report)}`);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error(`[eval] the game failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
