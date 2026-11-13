/**
 * Les scénarios des trois piles de démonstration (7.11, CAR-P-20), et les
 * situations qu'ils attendent.
 *
 * Un enregistrement de démonstration est un jeu de réponses écrites à la main,
 * joué sans réseau ni clé : la cassette ne garde que des empreintes de requête
 * et des réponses. Ce module porte les scénarios eux-mêmes, pour que la
 * fabrique des cassettes (`scripts/cassettes/build.ts`) et la vérification
 * (`cardwake cassette verify`) jouent **exactement** les mêmes parcours. C'est
 * la seule façon de dire qu'un enregistrement est périmé : le rejouer sur la
 * pile d'aujourd'hui et comparer les empreintes demandées à celles enregistrées.
 */

import { recordScenario } from "./cassette-recorder";
import type { ScenarioStep } from "./cassette-recorder";
import { textResponse, toolUseResponse } from "./testing/fake-model";
import type { ToolName } from "./types";
import type { Stack } from "@cardwake/model";

/** Les trois piles livrées, dans l'ordre de la fabrique. */
export const STACK_NAMES = ["manor", "quotes", "dashboard"] as const;
export type StackName = (typeof STACK_NAMES)[number];

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
export const DEMO_SCENARIOS: Record<StackName, readonly ScenarioStep[]> = {
  manor: MANOR,
  quotes: QUOTES,
  dashboard: DASHBOARD,
};

/** Le parcours d'une pile, ou `null` si le nom n'est pas un nom de pile connue. */
export function scenariosFor(name: string): readonly ScenarioStep[] | null {
  return (DEMO_SCENARIOS as Record<string, readonly ScenarioStep[]>)[name] ?? null;
}

/**
 * Les empreintes qu'une pile de démonstration attend aujourd'hui.
 *
 * On rejoue ses parcours avec les réponses écrites à la main : chaque requête
 * que la boucle d'agent demande est captée, et son empreinte est celle que la
 * cassette doit porter. Un enregistrement absent de cette liste est périmé ;
 * une empreinte manquante est une situation jamais enregistrée.
 *
 * Une pile inconnue rend `null` (on ne peut rien affirmer), et un parcours qui
 * ne se rejoue plus lève : c'est le signal le plus fort qu'un enregistrement
 * est périmé, et la vérification doit le dire plutôt que de le taire.
 */
export async function stackSituations(name: string, stack: Stack): Promise<string[] | null> {
  const steps = scenariosFor(name);
  if (steps === null) return null;
  const recording = await recordScenario(stack, steps);
  return recording.steps.flatMap((step) => [...step.fingerprints]);
}
