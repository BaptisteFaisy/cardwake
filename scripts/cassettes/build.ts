/**
 * Fabrique des cassettes des trois piles de démonstration (7.11).
 *
 * Pour chaque pile : charge `stacks/<pile>/stack.json`, joue les parcours de
 * `demo-scenarios` (les mêmes que `cardwake cassette verify`) avec des
 * réponses écrites à la main — aucun réseau, aucune clé (CAR-N-09) — et écrit
 * `stacks/<pile>/cassette.json`. La cassette ne porte que des empreintes et
 * des réponses : ni clé, ni compteur de session (CAR-P-22).
 *
 * Lancement : `npx vite-node scripts/cassettes/build.ts -- write` — les
 * imports du dépôt n'ont pas d'extension, donc `node` seul ne résout pas ;
 * `vite-node` est déjà installé avec `vite`.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStackFile } from "@cardwake/model";
import type { Stack } from "@cardwake/model";
import { STACK_NAMES, recordScenario, scenariosFor } from "@cardwake/agent";
import type { StackName } from "@cardwake/agent";

/** La racine du dépôt, déduite de ce fichier et non du répertoire courant. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const stackFileFor = (name: StackName): string => join(ROOT, "stacks", name, "stack.json");
export const cassetteFileFor = (name: StackName): string => join(ROOT, "stacks", name, "cassette.json");

/** Charge et valide une pile de démonstration ; refuse en bloc sinon. */
export function loadStack(name: StackName): Stack {
  const parsed = parseStackFile(readFileSync(stackFileFor(name), "utf8"));
  if (!parsed.ok) throw new Error(`stack "${name}" is not valid: ${parsed.errors[0]}`);
  return parsed.stack;
}

/** Les réponses d'une pile, écrites à la main. */
function stepsOf(name: StackName) {
  const steps = scenariosFor(name);
  if (steps === null) throw new Error(`no demo scenario for "${name}"`);
  return steps;
}

/** Enregistre une pile et écrit sa cassette ; rend une ligne de compte rendu. */
async function buildStack(name: StackName): Promise<string> {
  const steps = stepsOf(name);
  const recording = await recordScenario(loadStack(name), steps);
  const file = cassetteFileFor(name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(recording.cassette.toJSON(), null, 2)}\n`);
  return `${name}: ${recording.cassette.size} entrée(s) pour ${steps.length} parcours`;
}

/** La fabrique complète : les trois piles, l'une après l'autre. */
export async function buildAll(): Promise<string[]> {
  const lines: string[] = [];
  for (const name of STACK_NAMES) lines.push(await buildStack(name));
  return lines;
}

async function main(): Promise<void> {
  for (const line of await buildAll()) console.log(line);
}

/** Rien ne s'écrit à l'import : seule la commande `-- write` lance la fabrique. */
if (process.argv.includes("write")) await main();
