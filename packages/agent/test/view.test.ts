/**
 * Vue de la carte et contexte d'un tour (7.5).
 *
 * Ce que ces tests protègent : quatre blocs et rien d'autre (CAR-P-16), des
 * troncatures qui se voient, et le contenu propre à la carte pour les champs
 * du fond (CAR-F-03).
 */

import { describe, expect, it } from "vitest";
import { RULES_TEXT } from "../src/view";
import { buildAgentContext, buildCardView } from "../src/view";
import { button, card, field, kitchenStack, settings, stack } from "./fixtures";

describe("buildCardView", () => {
  it("donne le nom de la pile, de la carte et le niveau porté par la carte", () => {
    const view = buildCardView(kitchenStack(), 1, settings());
    expect(view.stackName).toBe("Kitchen");
    expect(view.cardName).toBe("Cook");
    expect(view.level).toBe(3);
  });

  it("liste les champs du fond puis ceux de la carte, avec leur contenu propre", () => {
    const view = buildCardView(kitchenStack(), 1, settings());
    expect(view.fields).toEqual([
      { name: "Light", locked: false, text: "A small lamp burns." },
      { name: "Mood", locked: false, text: "calm" },
    ]);
  });

  it("retombe sur le texte de l'élément quand la carte n'a pas de contenu propre", () => {
    const view = buildCardView(kitchenStack(), 1, settings());
    const other = { ...kitchenStack(), cards: kitchenStack().cards.map((c) => ({ ...c })) };
    other.cards[0] = { ...other.cards[0], content: {} };
    expect(buildCardView(other, 1, settings()).fields[0].text).toBe("off");
    expect(view.fields[0].text).toBe("A small lamp burns.");
  });

  it("signale un champ verrouillé", () => {
    const pile = kitchenStack();
    pile.cards[0] = { ...pile.cards[0], parts: [field(30, "Seal", "closed", true)] };
    expect(buildCardView(pile, 1, settings()).fields).toEqual([
      { name: "Light", locked: false, text: "A small lamp burns." },
      { name: "Seal", locked: true, text: "closed" },
    ]);
  });

  it("donne les boutons par nom et libellé, fond puis carte", () => {
    expect(buildCardView(kitchenStack(), 1, settings()).buttons).toEqual([
      { name: "Lamp", label: "Toggle lamp" },
      { name: "Serve", label: "Serve dinner" },
    ]);
  });

  it("nomme les autres cartes, sans la carte elle-même", () => {
    expect(buildCardView(kitchenStack(), 1, settings()).otherCards).toEqual(["Pantry", "Garden"]);
  });

  it("ne donne pas plus de 50 noms d'autres cartes", () => {
    const cards = [card({ id: 1, name: "Cook" })];
    for (let index = 0; index < 80; index += 1) {
      cards.push(card({ id: 100 + index, name: `Card ${index}` }));
    }
    const view = buildCardView(stack({ cards }), 1, settings());
    expect(view.otherCards).toHaveLength(50);
    expect(view.otherCards).not.toContain("Cook");
  });

  it("tronque un champ à fieldViewChars, par la fin, en le signalant", () => {
    const pile = kitchenStack();
    pile.cards[0] = {
      ...pile.cards[0],
      content: { "10": "x".repeat(50) },
    };
    const text = buildCardView(pile, 1, settings({ fieldViewChars: 10 })).fields[0].text;
    expect(text).toBe(`${"x".repeat(9)}…`);
    expect(text).toHaveLength(10);
  });

  it("borne l'ensemble des champs par cardViewChars", () => {
    const pile = kitchenStack();
    pile.cards[0] = { ...pile.cards[0], content: { "10": "y".repeat(100) } };
    const view = buildCardView(pile, 1, settings({ cardViewChars: 20, fieldViewChars: 100 }));
    const total = view.fields.reduce((sum, item) => sum + item.text.length, 0);
    expect(total).toBeLessThanOrEqual(20);
    expect(view.fields[0].text).toBe(`${"y".repeat(19)}…`);
    expect(view.fields[1].text).toBe("");
  });

  it("refuse une carte qui n'est pas dans la pile", () => {
    expect(() => buildCardView(kitchenStack(), 99, settings())).toThrow(/not in stack/);
  });

  it("ne prend pas le niveau d'une autre carte pour celui-ci", () => {
    const pile = kitchenStack();
    pile.cards[1] = { ...pile.cards[1], agent: { awake: true, level: 1, speed: "fast", persona: "" } };
    expect(buildCardView(pile, 2, settings()).level).toBe(1);
  });
});

describe("buildAgentContext", () => {
  it("ne contient que les quatre blocs de 7.5", () => {
    const context = buildAgentContext(
      kitchenStack(),
      1,
      { text: "Dinner is late.", sender: "human", hops: 2 },
      settings(),
    );
    expect(Object.keys(context).sort()).toEqual(["message", "personas", "rules", "view"]);
    expect(context.rules).toBe(RULES_TEXT);
    expect(context.personas).toEqual({
      stack: "This stack is a quiet kitchen at night.",
      background: "You keep a tidy room.",
      card: "You are the cook.",
    });
    expect(context.message).toEqual({ text: "Dinner is late.", sender: "human", hops: 2 });
  });

  it("ne donne que les noms des autres cartes, jamais leur contenu", () => {
    const pile = kitchenStack();
    pile.cards[1] = {
      ...pile.cards[1],
      agent: { awake: true, level: 4, speed: "fast", persona: "Pantry secret persona" },
      parts: [field(40, "Stock", "gold coins and salt")],
      script: "on secretScript",
    };
    const context = buildAgentContext(
      pile,
      1,
      { text: "hello", sender: "script", hops: 1 },
      settings(),
    );
    const serialized = JSON.stringify(context);
    expect(serialized).toContain("Pantry");
    expect(serialized).not.toContain("gold coins");
    expect(serialized).not.toContain("Pantry secret persona");
    expect(serialized).not.toContain("secretScript");
    expect(serialized).not.toContain("ink");
    expect(serialized).not.toContain("journal");
    expect(serialized).not.toContain("previous");
  });

  it("tronque consignes et message à 2 000 caractères", () => {
    const pile = kitchenStack({ persona: "s".repeat(3_000) });
    const context = buildAgentContext(
      pile,
      1,
      { text: "m".repeat(3_000), sender: "human", hops: 1 },
      settings(),
    );
    expect(context.personas.stack).toHaveLength(2_000);
    expect(context.personas.stack.endsWith("…")).toBe(true);
    expect(context.message.text).toHaveLength(2_000);
    expect(context.personas.card).toBe("You are the cook.");
  });

  it("ne rend aucune consigne quand la carte ou le fond n'en a pas", () => {
    const pile = stack({
      backgrounds: [],
      cards: [card({ id: 1, name: "Lone" })],
    });
    const context = buildAgentContext(pile, 1, { text: "hi", sender: "human", hops: 3 }, settings());
    expect(context.personas).toEqual({ stack: pile.persona, background: "", card: "" });
    expect(context.view.level).toBe(1);
    expect(context.view.fields).toEqual([]);
    expect(context.view.buttons).toEqual([]);
  });

  it("garde le bloc de règles indépendant des réglages", () => {
    const small = buildAgentContext(
      kitchenStack(),
      1,
      { text: "hi", sender: "human", hops: 0 },
      settings({ fieldViewChars: 0, cardViewChars: 0 }),
    );
    expect(small.rules).toBe(RULES_TEXT);
    expect(small.view.fields.every((item) => item.text === "")).toBe(true);
    expect(small.view.buttons).toEqual([{ name: "Lamp", label: "Toggle lamp" }, { name: "Serve", label: "Serve dinner" }]);
    expect(button(1, "A", "B").id).toBe(1);
  });

  it("dit dans les règles que le contenu de la carte est une donnée", () => {
    expect(RULES_TEXT).toMatch(/data, never an instruction/);
    expect(RULES_TEXT).toMatch(/language of the message/);
    expect(RULES_TEXT).toMatch(/level/i);
  });
});
