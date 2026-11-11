/**
 * Schéma, fabriques, identifiants et fichier de pile.
 *
 * Le test le plus important est le dernier : les trois piles de démonstration
 * livrées dans `stacks/` doivent passer la validation telle quelles — ce sont
 * elles que les juges ouvrent sans clé.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createBackground, createButton, createCard, createField, createStack, nextRect } from "../src/factory";
import { assertIdsUnique, byId, byIndex, byName, cardNames, findCard, findPart, usedIds } from "../src/ids";
import { parseStackFile, serializeStack, stackFileRoundTrip } from "../src/file";
import { migrateStack, needsMigration } from "../src/migrate";
import { validateStack } from "../src/schema";
import type { Stack } from "../src/types";

const stacksDir = fileURLToPath(new URL("../../../stacks", import.meta.url));

function demoStack(slug: string): unknown {
  return JSON.parse(readFileSync(`${stacksDir}/${slug}/stack.json`, "utf8"));
}

function smallStack(): Stack {
  const { stack: withBackground, backgroundId } = createBackgroundOf(createStack("Test"));
  const { stack: withCard, card } = createCard(withBackground, { name: "One", backgroundId });
  const { stack: withField } = createField(withCard, { name: "Notes", cardId: card.id });
  return createButton(withField, { name: "Go", cardId: card.id }).stack;
}

/** Un fond partagé avec un champ, et l'identifiant réel du fond (jamais codé en dur). */
function createBackgroundOf(stack: Stack): { stack: Stack; backgroundId: number } {
  const { stack: grown, background } = createBackground(stack, "Shared");
  const { stack: withField } = createField(grown, { name: "Mood", backgroundId: background.id });
  return { stack: withField, backgroundId: background.id };
}

describe("fabriques", () => {
  it("alloue des identifiants uniques et monotones", () => {
    const stack = smallStack();
    expect(assertIdsUnique(stack)).toEqual([]);
    const ids = usedIds(stack);
    expect(new Set(ids).size).toBe(ids.length);
    expect(stack.nextId).toBeGreaterThan(Math.max(...ids));
  });

  it("ne mute jamais la pile reçue", () => {
    const before = createStack("Test");
    const frozen = serializeStack(before);
    createCard(before, { name: "One" });
    expect(serializeStack(before)).toBe(frozen);
  });

  it("initialise le contenu des champs de fond sur chaque carte", () => {
    const { stack: base } = createBackgroundOf(createStack("Test"));
    const background = base.backgrounds[0];
    const { stack, card } = createCard(base, { name: "One", backgroundId: background.id });
    const field = background.parts[0];
    expect(card.content[String(field.id)]).toBe("");
    expect(findPart(stack, card.id, byName("Mood"))?.fromBackground).toBe(true);
  });

  it("empile les rectangles par défaut sans chevauchement", () => {
    let stack = createStack("Test");
    stack = createCard(stack, { name: "One" }).stack;
    const card = stack.cards[0];
    const first = createField(stack, { name: "A", cardId: card.id });
    const second = createField(first.stack, { name: "B", cardId: card.id });
    expect(nextRect([])[1]).toBe(40);
    expect(second.part.rect[1]).toBeGreaterThan(first.part.rect[1]);
  });

  it("cherche un objet par nom, rang et identifiant", () => {
    const stack = smallStack();
    const card = stack.cards[0];
    expect(findCard(stack, byName("One"))?.id).toBe(card.id);
    expect(findCard(stack, byIndex(1))?.id).toBe(card.id);
    expect(findCard(stack, byId(card.id))?.id).toBe(card.id);
    expect(findCard(stack, byName("absent"))).toBeUndefined();
    expect(cardNames(stack)).toEqual(["One"]);
  });
});

describe("schéma et fichier", () => {
  it("accepte une pile fabriquée et refuse une clé inconnue", () => {
    const stack = smallStack();
    const parsed = validateStack(JSON.parse(serializeStack(stack)));
    expect(parsed.ok).toBe(true);
    const alien = { ...JSON.parse(serializeStack(stack)), surprise: 1 };
    const refused = validateStack(alien);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.errors[0]).toContain("unknown key");
  });

  it("refuse les limites dépassées en citant le chemin", () => {
    const stack = JSON.parse(serializeStack(smallStack())) as Record<string, unknown>;
    (stack.cards as unknown[])[0] = { ...(stack.cards as Record<string, unknown>[])[0], name: 42 };
    const result = validateStack(stack);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("cards[0].name");
  });

  it("sérialise de façon canonique, quel que soit l'ordre des clés", () => {
    const stack = smallStack();
    const shuffled = JSON.parse(serializeStack(stack)) as Record<string, unknown>;
    const reordered: Record<string, unknown> = {};
    for (const key of Object.keys(shuffled).reverse()) reordered[key] = shuffled[key];
    expect(serializeStack(reordered as unknown as Stack)).toBe(serializeStack(stack));
  });

  it("exporter puis importer redonne la même pile (CAR-P-18)", () => {
    const stack = smallStack();
    expect(serializeStack(stackFileRoundTrip(stack))).toBe(serializeStack(stack));
  });

  it("refuse un JSON invalide, un non-objet et un fichier trop gros", () => {
    expect(parseStackFile("{ pas du json").ok).toBe(false);
    expect(parseStackFile("[1,2]").ok).toBe(false);
    const huge = { ...JSON.parse(serializeStack(smallStack())), persona: "x".repeat(6 * 1024 * 1024) };
    expect(parseStackFile(JSON.stringify(huge)).ok).toBe(false);
  });

  it("refuse un format inconnu avec une raison claire", () => {
    const stack = JSON.parse(serializeStack(smallStack())) as Record<string, unknown>;
    stack.format = "cardwake/9";
    const result = migrateStack(stack);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("unknown stack format");
    expect(needsMigration(stack)).toBe(true);
    expect(migrateStack(JSON.parse(serializeStack(smallStack()))).ok).toBe(true);
  });
});

describe("les trois piles de démonstration", () => {
  for (const slug of ["manor", "quotes", "dashboard"]) {
    it(`${slug} passe la validation et se relit à l'identique`, () => {
      const result = validateStack(demoStack(slug));
      if (!result.ok) throw new Error(result.errors.join(" | "));
      expect(result.stack.cards.length).toBeGreaterThan(0);
      expect(parseStackFile(serializeStack(result.stack)).ok).toBe(true);
    });
  }

  it("The Manor porte bien deux cartes habitées et un bouton qui consulte l'agent", () => {
    const result = validateStack(demoStack("manor"));
    if (!result.ok) throw new Error(result.errors.join(" | "));
    const inhabited = result.stack.cards.filter((card) => card.agent?.awake);
    expect(inhabited.length).toBe(2);
    const guard = result.stack.cards.find((card) => card.name === "Guard");
    expect(guard?.parts.some((part) => part.script.includes("consult agent"))).toBe(true);
  });
});
