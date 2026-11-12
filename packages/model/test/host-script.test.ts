/**
 * Les trois scripts du cahier des charges, de bout en bout : `parseScript`,
 * `runHandler`, un vrai `ModelHost`, un vrai `Journal`, une vraie pile.
 *
 * Ce fichier prouve le chemin complet : un script écrit par l'auteur devient
 * des opérations réversibles, l'état final de la pile est exact, le journal
 * consigne, et l'annulation ramène à l'état de départ (CAR-P-07, CAR-P-08).
 */

import { describe, expect, it } from "vitest";
import { parseScript, runHandler } from "@cardwake/lang";
import type { Determinism, Guards } from "@cardwake/lang";
import { ModelHost } from "../src/host";
import { Journal } from "../src/journal";
import { createBackground, createButton, createCard, createField, createStack } from "../src/factory";
import { serializeStack } from "../src/file";
import { APP_LIMITS, DEFAULT_SETTINGS } from "../src/limits";
import type { Stack } from "../src/types";

const CLOCK = "2026-11-12T01:20:00.000Z";
const GUARDS: Guards = {
  maxSteps: APP_LIMITS.maxSteps,
  maxMessageDepth: 50,
  maxWaitMs: APP_LIMITS.maxWaitMs,
  maxTextChars: APP_LIMITS.maxFieldChars,
};
const DETERMINISM: Determinism = {
  seed: 7,
  random: () => 0.5,
  now: () => ({ date: "11/12/26", time: "01:20", longDate: "Thursday, November 12, 2026", epochMs: 0 }),
};

const TODO = `on mouseUp
  if field "New" is empty then
    exit mouseUp
  end if
  put field "New" & return after field "Tasks"
  put empty into field "New"
end mouseUp`;

const QUOTE = `on mouseUp
  put 0 into total
  repeat for each line row in field "Lines"
    add item 2 of row * item 3 of row to total
  end repeat
  put round(total, 2) into field "Subtotal"
  put round(total * 0.1, 2) into field "VAT"
  put round(total * 1.1, 2) into field "Total"
end mouseUp`;

const AMULET = `on mouseUp
  consult agent with "The visitor shows you a silver amulet."
  put it into field "Says"
end mouseUp`;

/** Une pile de démonstration : un fond partagé, une carte, ses champs propres. */
function demoStack(): { stack: Stack; cardId: number } {
  const base = createStack("Demo");
  const background = createBackground(base, "Client");
  let stack = background.stack;
  for (const name of ["Says", "Lines", "Subtotal", "VAT", "Total"]) {
    stack = createField(stack, { name, backgroundId: background.background.id }).stack;
  }
  const card = createCard(stack, { name: "Dupont", backgroundId: background.background.id });
  stack = card.stack;
  stack = createField(stack, { name: "New", cardId: card.card.id }).stack;
  stack = createField(stack, { name: "Tasks", cardId: card.card.id }).stack;
  stack = createButton(stack, { name: "Go", cardId: card.card.id }).stack;
  return { stack: seedContent(stack, card.card.id), cardId: card.card.id };
}

/**
 * Amorce les textes de la carte : un champ de fond vit dans `card.content`,
 * un champ propre dans `part.text`.
 */
function seedContent(stack: Stack, cardId: number): Stack {
  const lines = stack.backgrounds[0].parts.find((part) => part.name === "Lines");
  return {
    ...stack,
    cards: stack.cards.map((card) => {
      if (card.id !== cardId) return card;
      const content = lines ? { ...card.content, [String(lines.id)]: "Tap replacement,1,85\nPipe joint,2,32.5" } : card.content;
      const parts = card.parts.map((part) => (part.kind === "field" && part.name === "New" ? { ...part, text: "buy milk" } : part));
      return { ...card, content, parts };
    }),
  };
}

/** Texte d'un champ propre à la carte. */
function ownText(stack: Stack, name: string): string {
  const part = stack.cards[0].parts.find((item) => item.name === name);
  return part && part.kind === "field" ? part.text : "";
}

/** Texte d'un champ partagé, lu dans le contenu de la carte. */
function sharedText(stack: Stack, name: string): string {
  const part = stack.backgrounds[0].parts.find((item) => item.name === name);
  if (!part) return "";
  return stack.cards[0].content[String(part.id)] ?? "";
}

/** Prépare un hôte, ouvre la transaction, rend le script analysé. */
function prepare(stack: Stack, cardId: number, source: string, consult?: (cardId: number, text: string) => string) {
  const parsed = parseScript(source);
  if (!parsed.ok) throw new Error(parsed.errors.map((error) => error.message).join(" | "));
  const journal = new Journal();
  journal.begin({ kind: "script", cardId, objectId: 1 }, "click on Go", 7);
  const host = new ModelHost({
    stack,
    journal,
    actor: { kind: "script", objectId: 1 },
    cardId,
    guards: GUARDS,
    determinism: DETERMINISM,
    settings: DEFAULT_SETTINGS,
    txId: 1,
    ...(consult ? { consult } : {}),
  });
  return { host, journal, script: parsed.script };
}

describe("les trois scripts du cahier des charges", () => {
  it("la liste de tâches ajoute la ligne et vide la saisie", async () => {
    const { stack, cardId } = demoStack();
    const { host, journal, script } = prepare(stack, cardId, TODO);
    const result = await runHandler(script, "mouseUp", [], host);
    expect(result.ok).toBe(true);
    expect(ownText(host.stack, "Tasks")).toBe("buy milk\n");
    expect(ownText(host.stack, "New")).toBe("");
    const transaction = journal.commit(host.stack, CLOCK);
    expect(transaction.ops.length).toBe(2);
  });

  it("le devis calcule le sous-total, la TVA et le total", async () => {
    const { stack, cardId } = demoStack();
    const { host, journal, script } = prepare(stack, cardId, QUOTE);
    const result = await runHandler(script, "mouseUp", [], host);
    expect(result.ok).toBe(true);
    expect(sharedText(host.stack, "Subtotal")).toBe("150");
    expect(sharedText(host.stack, "VAT")).toBe("15");
    expect(sharedText(host.stack, "Total")).toBe("165");
    const transaction = journal.commit(host.stack, CLOCK);
    expect(transaction.ops.map((op) => op.kind)).toEqual(["setText", "setText", "setText"]);
  });

  it("le bouton du manoir écrit la réponse de l'agent dans le champ du fond", async () => {
    const { stack, cardId } = demoStack();
    const asked: string[] = [];
    const { host, journal, script } = prepare(stack, cardId, AMULET, (askedCardId, text) => {
      asked.push(text);
      return "Where did you get that?";
    });
    const result = await runHandler(script, "mouseUp", [], host);
    expect(result.ok).toBe(true);
    expect(asked).toEqual(["The visitor shows you a silver amulet."]);
    expect(sharedText(host.stack, "Says")).toBe("Where did you get that?");
    expect(host.trace.some((entry) => entry.text.includes("consult agent"))).toBe(true);
    journal.commit(host.stack, CLOCK);
  });

  it("l'annulation ramène la pile à l'état de départ", async () => {
    const { stack, cardId } = demoStack();
    const before = serializeStack(stack);
    const { host, journal, script } = prepare(stack, cardId, QUOTE);
    await runHandler(script, "mouseUp", [], host);
    journal.commit(host.stack, CLOCK);
    const undone = journal.undo(host.stack);
    expect(undone).not.toBeNull();
    expect(serializeStack(undone!.stack)).toBe(before);
    expect(sharedText(undone!.stack, "Total")).toBe("");
  });

  it("un champ introuvable arrête le script avec une erreur lisible", async () => {
    const { stack, cardId } = demoStack();
    const { host, script } = prepare(stack, cardId, 'on mouseUp\n  put "x" into field "Absent"\nend mouseUp');
    const result = await runHandler(script, "mouseUp", [], host);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message.length).toBeGreaterThan(0);
      expect(result.error.category).toBe("reference");
    }
  });
});
