/**
 * Tests de l'adaptateur de dispatch : un clic sur un bouton **exécute** son
 * script, au lieu d'afficher « script not wired yet » (lot C5b).
 *
 * Fonctions pures, environnement node — pas de jsdom. Tout se joue sur la vraie
 * pile de démonstration `Quotes` : le bouton « Total » calcule, « Add line »
 * recopie la saisie, « Next client » navigue. Le journal et l'horloge sont ceux
 * que le moteur injecte, donc l'annulation d'un clic se vérifie à l'octet près.
 */
import { describe, expect, it } from "vitest";
import {
  Journal,
  createButton,
  createCard,
  createStack,
  parseStackFile,
  serializeStack,
} from "@cardwake/model";
import type { Stack } from "@cardwake/model";
import quotesRaw from "../src/data/quotes.json";
import { createDispatchAdapter, noticeOf } from "../src/engine/dispatch-adapter";
import type { DispatchAdapter } from "../src/engine/dispatch-adapter";

/** Identifiants de la pile Quotes : carte Dupont et ses boutons. */
const DUPONT = 10;
const NEW_FIELD = 5;
const LINES_FIELD = 4;
const SUBTOTAL = 6;
const VAT = 7;
const TOTAL = 8;
const ADD_LINE = 11;
const TOTAL_BUTTON = 12;
const NEXT_CLIENT = 14;

/** Horloge contrôlée : chaque appel avance d'une seconde fictive. */
function fakeClock(): () => string {
  let ticks = 0;
  return () => `2026-11-12T12:00:${String(ticks++).padStart(2, "0")}Z`;
}

/** La pile Quotes, validée par le schéma comme le fait le site. */
function quotesStack(): Stack {
  const parsed = parseStackFile(JSON.stringify(quotesRaw));
  if (!parsed.ok) throw new Error(`quotes stack refused: ${parsed.errors.join(", ")}`);
  return parsed.stack;
}

/** Écrit le contenu d'un champ d'une carte, sans passer par le journal. */
function withContent(stack: Stack, cardId: number, partId: number, text: string): Stack {
  return {
    ...stack,
    cards: stack.cards.map((card) =>
      card.id === cardId ? { ...card, content: { ...card.content, [String(partId)]: text } } : card,
    ),
  };
}

/** Carte affichée : le moteur clique toujours sur la carte courante. */
function displayed(stack: Stack, cardId: number): Stack {
  return { ...stack, currentCardId: cardId };
}

/** Adaptateur sur une pile, avec le journal que le moteur lui prêterait. */
function adapterFor(stack: Stack, seed = 7): { adapter: DispatchAdapter; journal: Journal } {
  const journal = new Journal();
  const adapter = createDispatchAdapter({ stack, journal, seed, clock: fakeClock() });
  return { adapter, journal };
}

/** Texte d'un champ dans la pile rendue (les champs Quotes vivent sur le fond). */
function fieldOf(stack: Stack, cardId: number, partId: number): string {
  const card = stack.cards.find((item) => item.id === cardId);
  return card?.content[String(partId)] ?? "";
}

describe("le clic exécute le script du bouton", () => {
  it("« Total » écrit 150 / 15 / 165 dans Subtotal, VAT et Total", async () => {
    const stack = quotesStack();
    const { adapter, journal } = adapterFor(stack);
    const result = await adapter.click(DUPONT, TOTAL_BUTTON);
    // 1 × 85 + 2 × 32,5 = 150 ; la TVA est de 10 %.
    expect(fieldOf(result.stack, DUPONT, SUBTOTAL)).toBe("150");
    expect(fieldOf(result.stack, DUPONT, VAT)).toBe("15");
    expect(fieldOf(result.stack, DUPONT, TOTAL)).toBe("165");
    // Le script a bien ouvert une transaction, sous son propre acteur.
    const entries = journal.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0].actor).toEqual({ kind: "script", cardId: DUPONT, objectId: 0 });
    expect(entries[0].cause).toContain("mouseUp");
  });

  it("« Add line » ajoute la ligne saisie et vide la saisie", async () => {
    const stack = withContent(quotesStack(), DUPONT, NEW_FIELD, "Doorknob,1,12");
    const { adapter } = adapterFor(stack);
    const result = await adapter.click(DUPONT, ADD_LINE);
    const lines = fieldOf(result.stack, DUPONT, LINES_FIELD);
    // `put … after` insère à la fin, suivi du `return` du script.
    expect(lines.endsWith("Doorknob,1,12\n")).toBe(true);
    expect(lines).toContain("Tap replacement,1,85"); // la ligne d'avant reste
    expect(fieldOf(result.stack, DUPONT, NEW_FIELD)).toBe("");
  });

  it("un bouton de navigation change la carte affichée", async () => {
    // Le moteur clique sur la carte affichée : « next card » part d'elle.
    const { adapter } = adapterFor(displayed(quotesStack(), DUPONT));
    const result = await adapter.click(DUPONT, NEXT_CLIENT);
    expect(result.stack.currentCardId).toBe(20); // carte « Martin »
    expect(result.handledBy).toBe('button "Next client"');
  });

  it("un bouton sans script ne produit aucune transaction", async () => {
    let stack = createStack("Quiet");
    const card = createCard(stack, { name: "Room" });
    stack = card.stack;
    const button = createButton(stack, { name: "Lamp", cardId: card.card.id });
    stack = button.stack;
    const { adapter, journal } = adapterFor(stack);
    const result = await adapter.click(card.card.id, button.part.id);
    expect(journal.entries()).toHaveLength(0);
    expect(result.handledBy).toBeNull();
    expect(serializeStack(result.stack)).toBe(serializeStack(stack));
  });
});

describe("le résultat d'un dispatch", () => {
  it("expose path, handledBy, hopsLeft et trace", async () => {
    const { adapter } = adapterFor(quotesStack());
    const result = await adapter.click(DUPONT, TOTAL_BUTTON);
    expect(result.path[0]).toBe('button "Total"');
    expect(result.handledBy).toBe('button "Total"');
    expect(result.hopsLeft).toBe(quotesStack().settings.hopBudget);
    expect(result.trace.length).toBeGreaterThan(0);
    expect(result.trace.every((line) => typeof line === "string")).toBe(true);
  });

  it("l'annulation du clic restaure la pile à l'octet près", async () => {
    const stack = quotesStack();
    const before = serializeStack(stack);
    const { adapter, journal } = adapterFor(stack);
    const result = await adapter.click(DUPONT, TOTAL_BUTTON);
    expect(serializeStack(result.stack)).not.toBe(before); // le script a écrit
    const undone = journal.undo(result.stack);
    expect(undone).not.toBeNull();
    expect(serializeStack(undone!.stack)).toBe(before);
  });
});

describe("la discussion sans enregistrement", () => {
  it("ne consomme aucun saut et remonte un avis lisible en anglais", async () => {
    const stack = quotesStack();
    const { adapter, journal } = adapterFor(stack);
    const result = await adapter.chat(DUPONT, "Can you draft a follow-up?");
    // La carte est habitée et éveillée, mais aucun enregistrement n'est branché.
    expect(stack.cards.find((card) => card.id === DUPONT)?.agent?.awake).toBe(true);
    expect(result.agentTurns).toBe(0);
    expect(result.reply).toBeNull();
    expect(result.hopsLeft).toBe(stack.settings.hopBudget);
    expect(journal.entries()).toHaveLength(0);
    const notice = noticeOf(result);
    expect(notice).not.toBeNull();
    expect(notice).toMatch(/no recording/);
    expect(notice).toMatch(/^[\x20-\x7e]+$/); // de l'anglais ASCII, lisible à l'écran
  });
});
