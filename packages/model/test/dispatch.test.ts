/**
 * La hiérarchie des messages : ordre de parcours, `pass`, file, compteur de
 * sauts — et le scénario du manoir, où le garde alerte et la cuisinière sait
 * déjà (7.13).
 */

import { describe, expect, it } from "vitest";
import type { Determinism, Guards } from "@cardwake/lang";
import { APP_LIMITS, DEFAULT_SETTINGS } from "../src/limits";
import { createBackground, createButton, createCard, createField, createStack, setAgent } from "../src/factory";
import { Dispatcher } from "../src/dispatch";
import type { AgentTurnRequest } from "../src/dispatch";
import { Journal } from "../src/journal";
import type { ModelHost } from "../src/host";
import type { Stack } from "../src/types";

const GUARDS: Guards = {
  maxSteps: APP_LIMITS.maxSteps,
  maxMessageDepth: 50,
  maxWaitMs: APP_LIMITS.maxWaitMs,
  maxTextChars: APP_LIMITS.maxFieldChars,
};
const DETERMINISM: Determinism = {
  seed: 7,
  random: () => 0.5,
  now: () => ({ date: "11/12/26", time: "00:00", longDate: "Thursday, November 12, 2026", epochMs: 0 }),
};

type Manor = {
  stack: Stack;
  guardId: number;
  cookId: number;
  buttonId: number;
};

/** Le manoir : un fond « Character », un garde et une cuisinière. */
function manor(): Manor {
  let stack = createStack("The Manor");
  const background = createBackground(stack, "Character");
  stack = background.stack;
  for (const name of ["Mood", "Memory", "Says"]) {
    stack = createField(stack, { name, backgroundId: background.background.id, multiline: name !== "Mood" }).stack;
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
  stack = setAgent(stack, guard.card.id, { awake: true, level: 2, speed: "fast", persona: "You guard the door." });
  stack = setAgent(stack, cook.card.id, { awake: true, level: 2, speed: "fast", persona: "You cook for the house." });
  return { stack, guardId: guard.card.id, cookId: cook.card.id, buttonId: button.part.id };
}

/** Lit un champ de fond dans la pile **courante** (celle du dispatcher). */
function fieldOf(stack: Stack, cardId: number, name: string): string {
  const card = stack.cards.find((item) => item.id === cardId);
  const part = stack.backgrounds
    .find((item) => item.id === card?.background)
    ?.parts.find((item) => item.name === name);
  if (!part) return "";
  return card?.content[String(part.id)] ?? "";
}

/** Un faux agent : il écrit dans sa carte et prévient l'autre carte. */
function fakeAgents(manor: Manor) {
  return async (request: AgentTurnRequest, host: ModelHost): Promise<string> => {
    if (request.cardId === manor.guardId) {
      host.writeFieldByName("Mood", "alarmed");
      host.writeFieldByName("Memory", "A visitor showed a silver amulet.", "append");
      host.tell({ kind: "agent", cardId: manor.cookId }, "A stranger carries the silver amulet. Hide the key.");
      return "Where did you get that? Put it away, quickly.";
    }
    host.writeFieldByName("Mood", "nervous");
    host.writeFieldByName("Memory", "A stranger carries the silver amulet.", "append");
    return "The key is under the floorboards.";
  };
}

function dispatcherFor(manor: Manor, onAgentTurn?: (request: AgentTurnRequest, host: ModelHost) => string | Promise<string>) {
  const journal = new Journal();
  const dispatcher = new Dispatcher({
    stack: manor.stack,
    journal,
    guards: GUARDS,
    determinism: DETERMINISM,
    settings: DEFAULT_SETTINGS,
    clock: () => "2026-11-12T00:00:00.000Z",
    onAgentTurn,
  });
  return { dispatcher, journal };
}

describe("hiérarchie des messages", () => {
  it("le clic est traité par l'élément, et le chemin est visible", async () => {
    const world = manor();
    const { dispatcher } = dispatcherFor(world, fakeAgents(world));
    const result = await dispatcher.click(world.guardId, world.buttonId);
    expect(result.handledBy).toContain("Show the amulet");
    // Le bouton traite le message tout de suite : la carte du garde n'est pas
    // remontée. En revanche le message de l'agent, lui, monte sur la cuisine.
    expect(result.path[0]).toContain("Show the amulet");
    expect(result.path).toContain('card "Cook"');
  });

  it("un message sans handler est ignoré, sans erreur", async () => {
    const world = manor();
    const { dispatcher } = dispatcherFor(world, fakeAgents(world));
    const result = await dispatcher.emit({
      name: "refresh",
      params: [],
      target: { kind: "card", cardId: world.cookId },
      sender: { kind: "human" },
      hops: 3,
    });
    expect(result.handledBy).toBeNull();
    expect(result.trace.some((line) => line.includes("ignored"))).toBe(true);
  });
});

describe("le manoir : les cartes se parlent", () => {
  it("le garde s'alarme, la cuisinière sait déjà, et le tout est annulable", async () => {
    const world = manor();
    const { dispatcher, journal } = dispatcherFor(world, fakeAgents(world));
    const result = await dispatcher.click(world.guardId, world.buttonId);

    // Le garde a répondu, et l'a écrit dans le champ verrouillé de sa carte.
    expect(fieldOf(dispatcher.current, world.guardId, "Says")).toBe("Where did you get that? Put it away, quickly.");
    if (fieldOf(dispatcher.current, world.guardId, "Mood") !== "alarmed") {
      console.log("TRACE", JSON.stringify(result.trace));
      console.log("CARTES", JSON.stringify(dispatcher.current.cards.map((c) => ({ n: c.name, bg: c.background, id: c.id, c: c.content }))));
      console.log("FOND", JSON.stringify(dispatcher.current.backgrounds.map((b) => ({ id: b.id, n: b.name, p: b.parts.map((x) => [x.id, x.name]) }))));
    }
    expect(fieldOf(dispatcher.current, world.guardId, "Mood")).toBe("alarmed");
    expect(fieldOf(dispatcher.current, world.guardId, "Memory")).toContain("silver amulet");

    // La cuisinière s'est réveillée sans clic : le message de l'agent suffit.
    expect(fieldOf(dispatcher.current, world.cookId, "Mood")).toBe("nervous");
    expect(fieldOf(dispatcher.current, world.cookId, "Memory")).toContain("silver amulet");

    // Deux sauts consommés : il en reste un (le budget est de trois).
    expect(result.hopsLeft).toBe(1);
    expect(result.agentTurns).toBe(2);

    // Chaque tour d'agent est sa propre transaction : on annule d'un geste.
    expect(journal.entries().length).toBeGreaterThanOrEqual(3);
    const undone = journal.undo(dispatcher.current);
    expect(undone).not.toBeNull();
    // Le tour de la cuisinière s'annule d'un geste : son humeur redevient vide.
    expect(fieldOf(undone!.stack, world.cookId, "Mood")).toBe("");
  });

  it("sans agent, le message ne réveille personne et le script continue", async () => {
    const world = manor();
    const { dispatcher } = dispatcherFor(world);
    const result = await dispatcher.chat(world.guardId, "Hello?");
    expect(result.agentTurns).toBe(0);
    expect(result.reply).toBeNull();
    expect(result.hopsLeft).toBe(DEFAULT_SETTINGS.hopBudget);
    expect(result.trace.some((line) => line.includes("no recording"))).toBe(true);
  });

  it("CAR-P-14 : les bavardages s'arrêtent, le compteur de sauts est respecté", async () => {
    const world = manor();
    let turns = 0;
    const chattering = async (request: AgentTurnRequest, host: ModelHost): Promise<string> => {
      turns += 1;
      // L'agent se répond à lui-même : sans plafond, ça ne finirait jamais.
      host.tell({ kind: "agent", cardId: request.cardId }, "again");
      return "again";
    };
    const { dispatcher } = dispatcherFor(world, chattering);
    const result = await dispatcher.chat(world.guardId, "Hello?");
    expect(result.hopsLeft).toBe(0);
    expect(turns).toBe(DEFAULT_SETTINGS.hopBudget);
    expect(result.trace.some((line) => line.includes("hops exhausted"))).toBe(true);
  });

  it("la file est servie dans l'ordre d'arrivée", async () => {
    const world = manor();
    const twoMessages = async (request: AgentTurnRequest, host: ModelHost): Promise<string> => {
      if (request.cardId !== world.guardId) return "noted";
      host.tell({ kind: "agent", cardId: world.cookId }, "first");
      host.tell({ kind: "agent", cardId: world.guardId }, "second");
      return "sent";
    };
    const { dispatcher } = dispatcherFor(world, twoMessages);
    const result = await dispatcher.chat(world.guardId, "Hello?");
    const queued = result.trace.filter((line) => line.startsWith("queued"));
    expect(queued.length).toBeGreaterThanOrEqual(2);
    expect(queued[0]).toContain(`card ${world.cookId}`);
    expect(queued[1]).toContain(`card ${world.guardId}`);
    expect(result.agentTurns).toBeGreaterThanOrEqual(2);
  });
});
