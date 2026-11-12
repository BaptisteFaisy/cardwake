/**
 * Les scénarios des preuves : ce que l'écran « Proofs » rejoue devant le
 * visiteur. Tout est **pur et déterministe** — horloge fixe, graine fixe,
 * aucune clé, aucun réseau, aucun `Date.now` ni `Math.random` : deux
 * exécutions donnent les mêmes lignes.
 *
 * Deux scénarios :
 * - le **devis** : la vraie pile de démonstration `quotes`, bouton « Total » ;
 * - le **manoir** : deux cartes à agents (garde, cuisinière), comme le
 *   scénario de `packages/model/test/dispatch.test.ts` — le garde s'alarme,
 *   prévient la cuisinière par message, et la cuisinière sait déjà. Un champ
 *   verrouillé (« Vault ») sert aussi à montrer un refus dans l'espion.
 */

import type { Determinism, Guards } from "@cardwake/lang";
import {
  APP_LIMITS,
  DEFAULT_SETTINGS,
  Dispatcher,
  Journal,
  createBackground,
  createButton,
  createCard,
  createField,
  createStack,
  setAgent,
} from "@cardwake/model";
import type { AgentTurnRequest, DispatchResult, ModelHost, Stack, StackSettings } from "@cardwake/model";
import { DEMO_STACKS } from "./data/index";

/** Horloge fixe des scénarios : jamais `Date.now()` (CAR-F-17). */
export const SCENE_CLOCK = "2026-11-12T09:00:00.000Z";

/** Graine fixe des scénarios : jamais `Math.random()` (CAR-F-17). */
export const SCENE_SEED = 20261112;

/** Les garde-fous des scénarios : les plafonds de l'application. */
export const SCENE_GUARDS: Guards = {
  maxSteps: APP_LIMITS.maxSteps,
  maxMessageDepth: 50,
  maxWaitMs: APP_LIMITS.maxWaitMs,
  maxTextChars: APP_LIMITS.maxFieldChars,
};

/** Déterminisme des scénarios : graine fixe, tirages neutres, horloge fixe. */
export const SCENE_DETERMINISM: Determinism = {
  seed: SCENE_SEED,
  random: () => 0.5,
  now: () => ({ date: "11/12/26", time: "09:00 AM", longDate: "Thursday, November 12, 2026", epochMs: 0 }),
};

/** Les réglages des scénarios : les défauts de l'application. */
export function sceneSettings(extra?: Partial<StackSettings>): StackSettings {
  return { ...DEFAULT_SETTINGS, ...extra };
}

/** Une pile de démonstration livrée avec le site, par son nom. */
export function demoStackOf(slug: string): Stack {
  const demo = DEMO_STACKS.find((item) => item.slug === slug);
  if (demo === undefined) throw new Error(`no demo stack "${slug}"`);
  return demo.stack;
}

/** Le texte d'un champ (de fond ou de carte) dans une pile. */
export function readField(stack: Stack, cardId: number, partId: number): string {
  const card = stack.cards.find((item) => item.id === cardId);
  if (card === undefined) return "";
  const own = card.parts.find((part) => part.id === partId);
  if (own !== undefined && own.kind === "field") return own.text;
  return card.content[String(partId)] ?? "";
}

/** Le manoir de démonstration : ses identifiants et sa pile. */
export type ManorWorld = {
  stack: Stack;
  guardId: number;
  cookId: number;
  buttonId: number;
  /** Les quatre champs du fond « Character », par leur rôle. */
  fields: { mood: number; memory: number; says: number; vault: number };
};

/** Construit le manoir : fond « Character », garde, cuisinière, bouton, coffre. */
export function manorWorld(): ManorWorld {
  let stack = createStack("The Manor");
  const background = createBackground(stack, "Character");
  stack = background.stack;
  const fields: ManorWorld["fields"] = { mood: 0, memory: 0, says: 0, vault: 0 };
  const names: Array<[keyof ManorWorld["fields"], string]> = [
    ["mood", "Mood"],
    ["memory", "Memory"],
    ["says", "Says"],
    ["vault", "Vault"],
  ];
  for (const [role, name] of names) {
    const built = createField(stack, {
      name,
      backgroundId: background.background.id,
      multiline: name !== "Mood",
      locked: name === "Vault",
    });
    stack = built.stack;
    fields[role] = built.part.id;
  }
  const guard = createCard(stack, { name: "Guard", backgroundId: background.background.id });
  stack = guard.stack;
  const cook = createCard(stack, { name: "Cook", backgroundId: background.background.id });
  stack = cook.stack;
  const button = createButton(stack, {
    name: "Show the amulet",
    cardId: guard.card.id,
    script:
      'on mouseUp\n  consult agent with "The visitor shows you a silver amulet."\n  put it into field "Says"\nend mouseUp\n',
  });
  stack = button.stack;
  stack = setAgent(stack, guard.card.id, {
    persona: "You guard the door.",
    level: 2,
    awake: true,
    speed: "fast",
  });
  stack = setAgent(stack, cook.card.id, {
    persona: "You cook for the house.",
    level: 2,
    awake: true,
    speed: "fast",
  });
  return { stack, guardId: guard.card.id, cookId: cook.card.id, buttonId: button.part.id, fields };
}

/**
 * Le tour de chaque agent du manoir, écrit à la main comme un modèle le
 * ferait : il écrit **par l'hôte** (donc par `authorize` et le journal). La
 * cuisinière tente aussi d'ouvrir le coffre verrouillé : le refus se voit
 * dans l'espion, la pile ne bouge pas.
 */
export function manorAgent(world: ManorWorld) {
  return (request: AgentTurnRequest, host: ModelHost): string => {
    if (request.cardId === world.guardId) {
      host.writeFieldByName("Mood", "alarmed");
      host.writeFieldByName("Memory", " A visitor carried a silver amulet.", "append");
      host.tell({ kind: "agent", cardId: world.cookId }, "A stranger carries the silver amulet. Hide the key.");
      return "Where did you get that? Put it away before the master sees it.";
    }
    host.writeFieldByName("Mood", "nervous");
    host.writeFieldByName("Memory", " The guard saw the silver amulet tonight.", "append");
    host.writeFieldByName("Vault", "trespassing");
    return "The key is under the floorboards.";
  };
}

/** Une exécution du manoir : la pile, la trace, les refus, le journal. */
export type ManorRun = {
  stack: Stack;
  result: DispatchResult;
  journal: Journal;
  world: ManorWorld;
};

/** Rejoue « le visiteur montre l'amulette au garde », du début à la fin. */
export async function runManor(): Promise<ManorRun> {
  const world = manorWorld();
  const journal = new Journal();
  const dispatcher = new Dispatcher({
    stack: world.stack,
    journal,
    guards: SCENE_GUARDS,
    determinism: SCENE_DETERMINISM,
    settings: sceneSettings(),
    clock: () => SCENE_CLOCK,
    onAgentTurn: manorAgent(world),
  });
  const result = await dispatcher.click(world.guardId, world.buttonId);
  return { stack: dispatcher.current, result, journal, world };
}

/** Une exécution du devis : le bouton « Total » de la carte Dupont. */
export async function runQuote(): Promise<{ stack: Stack; journal: Journal }> {
  const stack = demoStackOf("quotes");
  const journal = new Journal();
  const dispatcher = new Dispatcher({
    stack,
    journal,
    guards: SCENE_GUARDS,
    determinism: SCENE_DETERMINISM,
    settings: sceneSettings(stack.settings),
    clock: () => SCENE_CLOCK,
  });
  await dispatcher.click(10, 12);
  return { stack: dispatcher.current, journal };
}
