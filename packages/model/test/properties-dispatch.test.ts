/**
 * Propriété CAR-P-09 : la hiérarchie des messages.
 *
 * « Pour tout arbre d'objets et tout placement de handlers, le handler exécuté
 * est le premier sur le chemin cible, carte, fond, pile ; `pass` atteint le
 * suivant. »
 *
 * Le générateur tire deux masques de quatre bits : quels niveaux portent un
 * handler `mouseUp`, et lesquels d'entre eux appellent `pass`. Le test lit la
 * trace écrite dans un champ par le handler qui s'exécute — il ne devine pas
 * le résultat d'après la configuration, il le compare à la théorie.
 *
 * Nombre de tirages : `CARDWAKE_PROP_RUNS`, 100 par défaut.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Determinism, Guards } from "@cardwake/lang";
import { APP_LIMITS, DEFAULT_SETTINGS } from "../src/limits";
import { createBackground, createButton, createCard, createField, createStack } from "../src/factory";
import { Dispatcher } from "../src/dispatch";
import { Journal } from "../src/journal";
import type { Message } from "../src/types";
import type { Stack } from "../src/types";

const RUNS = Number(process.env.CARDWAKE_PROP_RUNS ?? 100);

/** Les quatre niveaux du chemin, dans l'ordre du cahier des charges. */
const LEVELS = ["part", "card", "background", "stack"] as const;

const GUARDS: Guards = {
  maxSteps: APP_LIMITS.maxSteps,
  maxMessageDepth: 50,
  maxWaitMs: APP_LIMITS.maxWaitMs,
  maxTextChars: APP_LIMITS.maxFieldChars,
};

const DETERMINISM: Determinism = {
  seed: 11,
  random: () => 0.5,
  now: () => ({ date: "11/13/26", time: "00:00", longDate: "Friday, November 13, 2026", epochMs: 0 }),
};

/** Le handler qui écrit son niveau dans la trace. */
function writingHandler(level: string): string {
  return `on mouseUp\n  put "${level}" after field "Trail"\nend mouseUp\n`;
}

/** Le handler qui passe la main au niveau suivant. */
const PASSING_HANDLER = "on mouseUp\n  pass mouseUp\nend mouseUp\n";

type Bench = { stack: Stack; cardId: number; partId: number; labels: string[] };

/** La pile d'essai : un fond, une carte, un bouton, un champ de trace. */
function bench(): Bench {
  let stack = createStack("Hierarchy");
  const background = createBackground(stack, "Shared");
  stack = background.stack;
  const field = createField(stack, { name: "Trail", backgroundId: background.background.id, multiline: true });
  stack = field.stack;
  const card = createCard(stack, { name: "Board", backgroundId: background.background.id });
  stack = card.stack;
  const button = createButton(stack, { name: "Go", cardId: card.card.id, script: "" });
  stack = button.stack;
  return {
    stack,
    cardId: card.card.id,
    partId: button.part.id,
    labels: [`button "Go"`, `card "Board"`, `background "Shared"`, `stack "Hierarchy"`],
  };
}

/** Pose les quatre scripts (chaîne vide = pas de handler à ce niveau). */
function withScripts(bench: Bench, scripts: readonly string[]): Stack {
  const [part, card, background, stack] = scripts;
  return {
    ...bench.stack,
    script: stack ?? "",
    cards: bench.stack.cards.map((item) => ({
      ...item,
      script: card ?? "",
      parts: item.parts.map((piece) => (piece.id === bench.partId ? { ...piece, script: part ?? "" } : piece)),
    })),
    backgrounds: bench.stack.backgrounds.map((item) => ({ ...item, script: background ?? "" })),
  };
}

/** La trace laissée par le handler exécuté, lue dans la pile courante. */
function trailOf(stack: Stack, bench: Bench): string {
  const card = stack.cards.find((item) => item.id === bench.cardId);
  const field = stack.backgrounds
    .find((item) => item.id === card?.background)
    ?.parts.find((item) => item.name === "Trail");
  return field === undefined ? "" : (card?.content[String(field.id)] ?? "");
}

/** Le message de test : un clic sur le bouton. */
function mouseUp(bench: Bench): Message {
  return {
    name: "mouseUp",
    params: [],
    target: { kind: "part", cardId: bench.cardId, partId: bench.partId },
    sender: { kind: "human" },
    hops: DEFAULT_SETTINGS.hopBudget,
  };
}

/** Le premier niveau qui porte un handler et ne le passe pas ; -1 sinon. */
function expectedLevel(handlers: number, passes: number): number {
  for (let index = 0; index < LEVELS.length; index += 1) {
    const has = ((handlers >> index) & 1) === 1;
    const passesOn = ((passes >> index) & 1) === 1;
    if (has && !passesOn) return index;
  }
  return -1;
}

/** Les scripts des quatre niveaux, d'après les deux masques. */
function scriptsFor(handlers: number, passes: number): string[] {
  return LEVELS.map((level, index) => {
    if (((handlers >> index) & 1) === 0) return "";
    return ((passes >> index) & 1) === 1 ? PASSING_HANDLER : writingHandler(level);
  });
}

describe("CAR-P-09 — la hiérarchie des messages", () => {
  it("le handler exécuté est le premier du chemin qui ne passe pas", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 15 }), fc.integer({ min: 0, max: 15 }), async (handlers, passes) => {
        const setup = bench();
        const dispatcher = new Dispatcher({
          stack: withScripts(setup, scriptsFor(handlers, passes)),
          journal: new Journal(),
          guards: GUARDS,
          determinism: DETERMINISM,
          settings: DEFAULT_SETTINGS,
          onAgentTurn: async () => "an agent answer",
        });
        const result = await dispatcher.emit(mouseUp(setup));
        const expected = expectedLevel(handlers, passes);
        expect(trailOf(dispatcher.current, setup)).toBe(expected === -1 ? "" : LEVELS[expected]);
        // Le chemin visite les niveaux dans l'ordre, et s'arrête au premier
        // qui traite le message (ou les visite tous si personne ne le prend).
        expect(result.path).toEqual(setup.labels.slice(0, expected === -1 ? LEVELS.length : expected + 1));
        return true;
      }),
      { numRuns: RUNS },
    );
  });
});