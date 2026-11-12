/**
 * Le pont langage → modèle, de bout en bout : un vrai script analysé, exécuté
 * sur une vraie pile, à travers `authorize` et le `Journal`.
 *
 * C'est le test qui prouve que cliquer sur un bouton produit des opérations
 * réversibles et que les droits sont opposables — pas un faux `Host`.
 */

import { describe, expect, it } from "vitest";
import { parseScript } from "@cardwake/lang";
import type { Actor, Determinism, Guards } from "@cardwake/lang";
import { runHandler } from "@cardwake/lang";
import { createButton, createCard, createField, createStack, setAgent } from "../src/factory";
import { Journal } from "../src/journal";
import { ModelHost } from "../src/host";
import { serializeStack } from "../src/file";
import { APP_LIMITS, DEFAULT_SETTINGS } from "../src/limits";
import type { Stack, TransactionActor } from "../src/types";

const CLOCK = "2026-11-12T00:30:00.000Z";
const GUARDS: Guards = {
  maxSteps: APP_LIMITS.maxSteps,
  maxMessageDepth: 50,
  maxWaitMs: APP_LIMITS.maxWaitMs,
  maxTextChars: APP_LIMITS.maxFieldChars,
};
const DETERMINISM: Determinism = {
  seed: 7,
  random: () => 0.5,
  now: () => ({ date: "11/12/26", time: "00:30", longDate: "Thursday, November 12, 2026", epochMs: 0 }),
};

const QUOTE = `on mouseUp
  put 0 into total
  repeat for each line row in field "Lines"
    add item 2 of row * item 3 of row to total
  end repeat
  put round(total, 2) into field "Subtotal"
  put round(total * 0.1, 2) into field "VAT"
  put round(total * 1.1, 2) into field "Total"
end mouseUp`;

/**
 * Une pile de devis : un champ de lignes, trois champs de résultat, un bouton,
 * et un agent éveillé au niveau demandé — sans agent éveillé, le point de
 * passage des droits répond « agent-asleep » avant même de regarder le niveau.
 */
function quoteStack(level: 1 | 2 | 3 | 4 | 5 = 2): { stack: Stack; cardId: number; buttonId: number } {
  let stack = createStack("Quotes");
  const created = createCard(stack, { name: "Dupont" });
  stack = created.stack;
  const cardId = created.card.id;
  for (const name of ["Lines", "Subtotal", "VAT", "Total"]) {
    stack = createField(stack, { name, cardId, multiline: name === "Lines" }).stack;
  }
  const button = createButton(stack, { name: "Total", cardId });
  stack = button.stack;
  const lines = stack.cards[0].parts.find((part) => part.name === "Lines");
  if (lines && lines.kind === "field") lines.text = "Tap replacement,1,85\nPipe joint,2,32.5";
  stack = setAgent(stack, cardId, { awake: true, level, speed: "fast", persona: "You write polite follow-ups." });
  return { stack, cardId, buttonId: button.part.id };
}

/** `Actor` (langage) → `TransactionActor` (modèle) : le journal veut la carte. */
function actorOf(actor: Actor, cardId: number): TransactionActor {
  if (actor.kind === "script") return { kind: "script", cardId, objectId: actor.objectId };
  if (actor.kind === "agent") return { kind: "agent", cardId: actor.cardId, level: actor.level as 1 | 2 | 3 | 4 | 5 };
  return actor;
}

function run(stack: Stack, cardId: number, source: string, actor: Actor) {
  const journal = new Journal();
  journal.begin(actorOf(actor, cardId), "click on Total", 7);
  const host = new ModelHost({
    stack,
    journal,
    actor,
    cardId,
    guards: GUARDS,
    determinism: DETERMINISM,
    settings: DEFAULT_SETTINGS,
    txId: 1,
  });
  const parsed = parseScript(source);
  if (!parsed.ok) throw new Error(parsed.errors.map((error) => error.message).join(" | "));
  return { host, journal, parsed };
}

function fieldOf(stack: Stack, name: string): string {
  const part = stack.cards[0].parts.find((item) => item.name === name);
  return part && part.kind === "field" ? part.text : "";
}

describe("ModelHost — un script s'exécute sur une vraie pile", () => {
  it("le devis calcule 150 / 15 / 165 et tout est annulable", async () => {
    const { stack, cardId } = quoteStack();
    const before = serializeStack(stack);
    const { host, journal, parsed } = run(stack, cardId, QUOTE, { kind: "script", objectId: 1 });
    const result = await runHandler(parsed.script, "mouseUp", [], host);
    expect(result.ok).toBe(true);
    expect(fieldOf(host.stack, "Subtotal")).toBe("150");
    expect(fieldOf(host.stack, "VAT")).toBe("15");
    expect(fieldOf(host.stack, "Total")).toBe("165");

    const transaction = journal.commit(host.stack, CLOCK);
    expect(transaction).not.toBeNull();
    expect(journal.entries()).toHaveLength(1);
    const undone = journal.undo(host.stack);
    expect(undone).not.toBeNull();
    expect(serializeStack(undone!.stack)).toBe(before);
  });

  it("une trace lisible par opération, dans la forme du langage", async () => {
    const { stack, cardId } = quoteStack();
    const { host, parsed } = run(stack, cardId, QUOTE, { kind: "script", objectId: 1 });
    await runHandler(parsed.script, "mouseUp", [], host);
    const lines = host.trace.map((entry) => entry.text);
    expect(lines.some((line) => line.includes('field "Subtotal"'))).toBe(true);
    expect(lines.some((line) => line.startsWith("put"))).toBe(true);
  });
});

describe("ModelHost — les droits sont opposables", () => {
  it("un agent de niveau 1 ne peut pas écrire, et le refus est tracé", async () => {
    const { stack, cardId } = quoteStack(1);
    const { host, journal, parsed } = run(stack, cardId, 'on mouseUp\n  put "noted" into field "Total"\nend mouseUp', {
      kind: "agent",
      cardId,
      level: 1,
    });
    const result = await runHandler(parsed.script, "mouseUp", [], host);
    expect(result.ok).toBe(true);
    expect(fieldOf(host.stack, "Total")).toBe("");
    expect(host.lastRefusals.length).toBeGreaterThan(0);
    expect(host.trace.some((entry) => entry.text.startsWith("refused"))).toBe(true);
    expect(host.lastRefusals.some((verdict) => !verdict.allow && verdict.rule === "level-too-low")).toBe(true);
    journal.commit(host.stack, CLOCK);
    expect(journal.entries()).toHaveLength(0);
  });

  it("un agent de niveau 2 écrit sur sa carte, pas sur une autre", async () => {
    const { stack, cardId } = quoteStack();
    const other = createCard(stack, { name: "Martin" });
    const otherField = createField(other.stack, { name: "Total", cardId: other.card.id });
    const { host, parsed } = run(otherField.stack, cardId, 'on mouseUp\n  put "x" into field "Total" of card "Martin"\nend mouseUp', {
      kind: "agent",
      cardId,
      level: 2,
    });
    await runHandler(parsed.script, "mouseUp", [], host);
    expect(host.lastRefusals.some((verdict) => !verdict.allow && verdict.rule === "not-own-card")).toBe(true);
  });

  it("un script écrit dans un champ verrouillé, un agent non (CAR-F-06)", async () => {
    const { stack, cardId } = quoteStack();
    const locked = stack.cards[0].parts.find((part) => part.name === "Total");
    if (locked && locked.kind === "field") locked.locked = true;
    const source = 'on mouseUp\n  put "165" into field "Total"\nend mouseUp';

    const byScript = run(stack, cardId, source, { kind: "script", objectId: 1 });
    await runHandler(byScript.parsed.script, "mouseUp", [], byScript.host);
    expect(fieldOf(byScript.host.stack, "Total")).toBe("165");

    const byAgent = run(stack, cardId, source, { kind: "agent", cardId, level: 2 });
    await runHandler(byAgent.parsed.script, "mouseUp", [], byAgent.host);
    expect(fieldOf(byAgent.host.stack, "Total")).toBe("");
  });
});

describe("ModelHost — robustesse", () => {
  it("une référence introuvable rend une erreur lisible, jamais d'exception", async () => {
    const { stack, cardId } = quoteStack();
    const { host, parsed } = run(stack, cardId, 'on mouseUp\n  put "x" into field "Absent"\nend mouseUp', {
      kind: "human",
      mode: "author",
    });
    const result = await runHandler(parsed.script, "mouseUp", [], host);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message.length).toBeGreaterThan(0);
  });

  it("créer, supprimer et naviguer produisent des opérations annulables", async () => {
    const { stack, cardId } = quoteStack();
    const before = serializeStack(stack);
    const source = 'on mouseUp\n  create field "Extra"\n  go to card "Dupont"\n  delete field "Extra"\nend mouseUp';
    const { host, journal, parsed } = run(stack, cardId, source, { kind: "human", mode: "author" });
    await runHandler(parsed.script, "mouseUp", [], host);
    const transaction = journal.commit(host.stack, CLOCK);
    expect(transaction?.ops.length).toBeGreaterThan(0);
    const undone = journal.undo(host.stack);
    expect(fieldOf(undone!.stack, "Total")).toBe(fieldOf(stack, "Total"));
    expect(undone!.stack.cards.length).toBe(stack.cards.length);
    expect(before.length).toBeGreaterThan(0);
  });
});
