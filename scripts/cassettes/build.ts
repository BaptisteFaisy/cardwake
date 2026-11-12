/**
 * Fabrique des cassettes des trois piles de démonstration (7.11).
 *
 * Pour chaque pile : charge `stacks/<pile>/stack.json`, joue les parcours
 * principaux avec des réponses d'agent écrites à la main (aucun réseau, aucune
 * clé — CAR-N-09), et écrit `stacks/<pile>/cassette.json`. La cassette ne
 * porte que des empreintes et des réponses : ni clé, ni compteur de session
 * (CAR-P-22). Le mode enregistré fonctionne donc sans rien configurer.
 *
 * Lancement : `npx vite-node scripts/cassettes/build.ts -- write` — les
 * imports du dépôt n'ont pas d'extension, donc `node` seul ne résout pas ;
 * `vite-node` est déjà installé avec `vite`. Vérification :
 * `npx vitest run packages/agent`.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStackFile } from "@cardwake/model";
import type { Stack } from "@cardwake/model";
import { textResponse, toolUseResponse } from "@cardwake/agent";
import type { ScenarioStep, ToolName } from "@cardwake/agent";
import { recordScenario } from "@cardwake/agent";

/** Les trois piles livrées, dans l'ordre de la fabrique. */
export const STACK_NAMES = ["manor", "quotes", "dashboard"] as const;
export type StackName = (typeof STACK_NAMES)[number];

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

// --------------------------------------------------------------------------
// Les réponses écrites à la main, dans l'ordre où la boucle les demande
// --------------------------------------------------------------------------

let callId = 0;

/** Un appel d'outil ; l'identifiant n'engage à rien, la canonique le refait. */
const use = (name: ToolName, input: Record<string, unknown>): ReturnType<typeof toolUseResponse> =>
  toolUseResponse(name, input, `call-${(callId += 1)}`);

/** Une réponse finale : le personnage parle en une ou deux phrases. */
const say = (text: string): ReturnType<typeof textResponse> => textResponse(text);

/** Le manoir : l'amulette (le garde alerte la cuisinière), la clé, deux discussions. */
const MANOR: ScenarioStep[] = [
  {
    action: { kind: "click", card: "Guard", button: "Show the amulet" },
    responses: [
      use("write_field", { field: "Mood", text: "alarmed", mode: "replace" }),
      use("write_field", { field: "Memory", text: " A visitor carried a silver amulet.", mode: "append" }),
      use("send_message", { to_card: "Cook", text: "A stranger carries the silver amulet. Watch the key." }),
      say("Where did you get that? Put it away before the master sees it."),
      use("write_field", { field: "Memory", text: " The guard saw the silver amulet tonight.", mode: "append" }),
      say("Let the master see it, then. The key stays where it sleeps."),
    ],
  },
  {
    action: { kind: "click", card: "Cook", button: "Ask about the key" },
    responses: [
      use("write_field", { field: "Memory", text: " A stranger asked about the silver key.", mode: "append" }),
      say("The silver key opens the pantry, and the pantry keeps its own secrets."),
    ],
  },
  {
    action: { kind: "chat", card: "Guard", text: "Good evening. I am expected for dinner." },
    responses: [say("Nobody is expected on a night like this. Give a name the house remembers.")],
  },
  {
    action: { kind: "chat", card: "Cook", text: "What smells so good?" },
    responses: [say("Bread for tomorrow, and nothing for strangers.")],
  },
];

/** Les devis : la relance polie rédigée depuis les lignes de chaque client. */
const QUOTES: ScenarioStep[] = [
  {
    action: { kind: "click", card: "Dupont", button: "Draft" },
    responses: [
      say("Dear Mr Dupont, thank you for your request. I will confirm the tap replacement and pipe joint prices tomorrow morning."),
    ],
  },
  {
    action: { kind: "click", card: "Martin", button: "Draft" },
    responses: [
      say("Dear Mr Martin, thank you for your enquiry. I will confirm the boiler service price tomorrow morning."),
    ],
  },
];

/** Le tableau : le résumé de la semaine, en trois phrases, depuis le journal. */
const DASHBOARD: ScenarioStep[] = [
  {
    action: { kind: "click", card: "Week", button: "Summarise my week" },
    responses: [
      say("On Monday you made two calls and finished one repair. Wednesday brought a late delivery from the supplier. Friday went to paperwork."),
    ],
  },
];

/** Les scénarios des trois piles, prêts à être joués puis rejoués (CAR-P-20). */
export const SCENARIOS: Record<StackName, readonly ScenarioStep[]> = {
  manor: MANOR,
  quotes: QUOTES,
  dashboard: DASHBOARD,
};

// --------------------------------------------------------------------------
// La fabrique
// --------------------------------------------------------------------------

/** Enregistre une pile et écrit sa cassette ; rend une ligne de compte rendu. */
async function buildStack(name: StackName): Promise<string> {
  const recording = await recordScenario(loadStack(name), SCENARIOS[name]);
  const file = cassetteFileFor(name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(recording.cassette.toJSON(), null, 2)}\n`);
  return `${name}: ${recording.cassette.size} entrée(s) pour ${SCENARIOS[name].length} parcours`;
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
