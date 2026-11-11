/**
 * Tests du moteur réel (fonctions pures, environnement node — pas de jsdom).
 *
 * Tout se joue sur les vraies piles de démonstration et sur `@cardwake/model` :
 * ouverture, navigation, saisie, annulation, refus en mode Jouer, journal,
 * abonnés, horloge injectée et graine déterministe.
 */
import { describe, expect, it } from "vitest";
import {
  createButton,
  createCard,
  createStack,
  parseStackFile,
} from "@cardwake/model";
import type { Stack } from "@cardwake/model";
import manorRaw from "../../../stacks/manor/stack.json";
import { createModelEngine } from "../src/engine/model-engine";
import type { CardwakeEngine, EngineEvent } from "../src/engine/types";

/** Une pile de démo, validée par le schéma comme le fait le site. */
function demoStack(): Stack {
  const parsed = parseStackFile(JSON.stringify(manorRaw));
  if (!parsed.ok) throw new Error(`manor stack refused: ${parsed.errors.join(", ")}`);
  return parsed.stack;
}

/** Horloge contrôlée : chaque appel avance d'une seconde fictive. */
function fakeClock(): { clock: () => string; now: () => string } {
  let ticks = 0;
  return {
    clock: () => `2026-11-11T12:00:${String(ticks++).padStart(2, "0")}Z`,
    now: () => `2026-11-11T12:00:${String(Math.max(0, ticks - 1)).padStart(2, "0")}Z`,
  };
}

function makeEngine(stack?: Stack): { engine: CardwakeEngine; events: EngineEvent[]; clock: () => string; now: () => string } {
  const { clock, now } = fakeClock();
  const engine = createModelEngine({ clock, seed: 42 });
  const events: EngineEvent[] = [];
  engine.subscribe((event) => events.push(event));
  if (stack) engine.openStack(stack);
  return { engine, events, clock, now };
}

/** Le texte courant d'un champ, lu dans la pile (fond ou carte). */
function textOf(stack: Stack, cardId: number, partId: number): string {
  const card = stack.cards.find((item) => item.id === cardId);
  if (!card) throw new Error("no such card");
  const own = card.parts.find((part) => part.id === partId);
  if (own && own.kind === "field") return own.text;
  return card.content[String(partId)] ?? "";
}

describe("ouverture et navigation", () => {
  it("ouvre une pile de démo et affiche sa carte courante", () => {
    const stack = demoStack();
    const { engine } = makeEngine(stack);
    expect(engine.state()).toBe(stack);
    expect(engine.currentCard()?.id).toBe(stack.currentCardId);
  });

  it("naviguer produit une transaction `navigate` horodatée par l'horloge injectée", () => {
    const { engine, now } = makeEngine(demoStack());
    engine.navigate(10);
    expect(engine.state()?.currentCardId).toBe(10);
    const entries = engine.journal().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].ops[0].kind).toBe("navigate");
    expect(entries[0].cause).toBe("human navigation to card 10");
    expect(entries[0].clock).toBe(now());
    expect(entries[0].actor).toEqual({ kind: "human", mode: "browse" });
  });
});

describe("saisie humaine", () => {
  it("saisir produit une transaction setText, encre nulle (c'est un humain)", () => {
    const { engine } = makeEngine(demoStack());
    engine.navigate(10); // carte Guard, fond Character
    engine.editField(3, "Suspicious");
    const stack = engine.state();
    expect(stack).not.toBeNull();
    expect(textOf(stack as Stack, 10, 3)).toBe("Suspicious");
    const tx = engine.journal().entries[0];
    const op = tx.ops[0];
    expect(op.kind).toBe("setText");
    if (op.kind !== "setText") throw new Error("unreachable");
    expect(op.inkAfter).toBeNull();
    expect(op.before).toBe("bored"); // le champ « Mood » de la carte Guard
    expect(op.after).toBe("Suspicious");
    expect(tx.actor).toEqual({ kind: "human", mode: "browse" });
  });

  it("une saisie identique n'ouvre aucune transaction", () => {
    const { engine } = makeEngine(demoStack());
    engine.navigate(10);
    engine.editField(3, "bored"); // le texte actuel : rien ne change
    expect(engine.journal().entries).toHaveLength(1); // la navigation seule
  });

  it("un champ verrouillé refuse la saisie humaine en mode Jouer (CAR-F-06)", () => {
    const { engine, events } = makeEngine(demoStack());
    engine.navigate(10);
    engine.editField(5, "Go away"); // champ « Says », verrouillé
    const refusal = engine.lastRefusal();
    expect(refusal?.rule).toBe("locked-field");
    expect(refusal?.reason.length).toBeGreaterThan(0);
    expect(textOf(engine.state() as Stack, 10, 5)).toBe("");
    expect(events.some((event) => event.type === "refused")).toBe(true);
    expect(engine.journal().entries).toHaveLength(1); // la navigation seule
  });

  it("en mode Fabriquer, l'auteur écrit même dans un champ verrouillé", () => {
    const { engine } = makeEngine(demoStack());
    engine.setMode("build");
    engine.navigate(10);
    engine.editField(5, "Who goes there?");
    expect(engine.lastRefusal()).toBeNull();
    expect(textOf(engine.state() as Stack, 10, 5)).toBe("Who goes there?");
  });
});

describe("structure et modes (CAR-F-05)", () => {
  it("en mode Jouer, créer un élément est refusé avec la raison affichée", () => {
    const { engine, events } = makeEngine(demoStack());
    engine.navigate(10);
    const before = engine.state() as Stack;
    engine.addPart("button", "Sneak");
    const refusal = engine.lastRefusal();
    expect(refusal?.rule).toBe("mode-browse");
    expect(refusal?.reason).toContain("play mode");
    expect((engine.state() as Stack).cards.find((c) => c.id === 10)?.parts).toHaveLength(
      before.cards.find((c) => c.id === 10)?.parts.length ?? 0,
    );
    expect(events.some((event) => event.type === "refused")).toBe(true);
  });

  it("en mode Jouer, créer une carte ou un fond est refusé aussi", () => {
    const { engine } = makeEngine(demoStack());
    const cards = (engine.state() as Stack).cards.length;
    engine.addCard("Cellar");
    engine.addBackground("Ghost");
    expect(engine.lastRefusal()?.rule).toBe("mode-browse");
    expect((engine.state() as Stack).cards).toHaveLength(cards);
    expect((engine.state() as Stack).backgrounds).toHaveLength(1);
  });

  it("en mode Fabriquer, créer un champ l'ajoute à la carte courante", () => {
    const { engine } = makeEngine(demoStack());
    engine.setMode("build");
    engine.navigate(10);
    engine.addPart("field", "Hat");
    const card = (engine.state() as Stack).cards.find((item) => item.id === 10);
    expect(card?.parts.map((part) => part.name)).toContain("Hat");
    expect(engine.journal().entries[0].cause).toContain('creation of field "Hat"');
  });
});

describe("annulation (CAR-F-45)", () => {
  it("undo restaure le texte, redo le rétablit", () => {
    const { engine } = makeEngine(demoStack());
    engine.navigate(10);
    engine.editField(3, "Wary");
    expect(textOf(engine.state() as Stack, 10, 3)).toBe("Wary");
    engine.undo();
    expect(textOf(engine.state() as Stack, 10, 3)).toBe("bored");
    expect(engine.journal().canRedo).toBe(true);
    engine.redo();
    expect(textOf(engine.state() as Stack, 10, 3)).toBe("Wary");
    expect(engine.journal().canRedo).toBe(false);
  });

  it("undo annule aussi la navigation", () => {
    const { engine } = makeEngine(demoStack());
    engine.navigate(10);
    expect(engine.currentCard()?.id).toBe(10);
    engine.undo();
    expect(engine.currentCard()?.id).toBe(30);
  });

  it("undo sans historique ne casse rien", () => {
    const { engine } = makeEngine(demoStack());
    engine.undo();
    expect(engine.journal().entries).toHaveLength(0);
    expect(engine.lastNotice()).toBe("Nothing left to undo.");
  });
});

describe("journal (CAR-F-44, CAR-F-46)", () => {
  it("exporte le journal en texte, de la plus récente à la plus ancienne", () => {
    const { engine } = makeEngine(demoStack());
    engine.navigate(10);
    engine.editField(3, "Curious");
    const entries = engine.journal().entries;
    expect(entries.map((tx) => tx.id)).toEqual([2, 1]);
    const text = engine.journal().exportText;
    expect(text).toContain("#2");
    expect(text).toContain("human edit of field");
    expect(text).toContain("you (playing)");
  });

  it("la graine injectée rend les transactions déterministes", () => {
    const run = (): number[] => {
      const { engine } = makeEngine(demoStack());
      engine.navigate(10);
      engine.editField(3, "Quiet");
      return engine.journal().entries.map((tx) => tx.seed);
    };
    expect(run()).toEqual(run());
  });
});

describe("clics et scripts non branchés", () => {
  it("un bouton à script affiche « script not wired yet » sans transaction", () => {
    const { engine, events } = makeEngine(demoStack());
    engine.navigate(10);
    engine.click(11); // « Show the amulet », possède un script
    expect(engine.lastNotice()).toBe("script not wired yet");
    expect(events.some((event) => event.type === "script-not-wired")).toBe(true);
    expect(engine.journal().entries).toHaveLength(1); // la navigation seule
  });

  it("un bouton sans script ne produit ni transaction ni état", () => {
    let stack = createStack("Quiet");
    const built = createCard(stack, { name: "Room" });
    stack = built.stack; // `createCard` fait de la première carte la carte courante
    const button = createButton(stack, { name: "Lamp", cardId: built.card.id });
    stack = button.stack;
    const { engine, events } = makeEngine(stack);
    engine.click(button.part.id);
    expect(events.some((event) => event.type === "clicked")).toBe(true);
    expect(engine.journal().entries).toHaveLength(0);
    expect(engine.lastNotice()).toBeNull();
  });
});

describe("abonnés et budget", () => {
  it("les abonnés sont notifiés, et le désabonnement coupe le flux", () => {
    const { engine } = makeEngine();
    const seen: EngineEvent[] = [];
    const off = engine.subscribe((event) => seen.push(event));
    engine.openStack(demoStack());
    engine.navigate(10);
    off();
    const count = seen.length;
    engine.navigate(20);
    expect(seen).toHaveLength(count);
    expect(seen.some((event) => event.type === "opened")).toBe(true);
    expect(seen.some((event) => event.type === "navigated")).toBe(true);
  });

  it("la jauge de budget reflète les réglages de la pile", () => {
    const { engine } = makeEngine(demoStack());
    const budget = engine.budget();
    expect(budget.turnsMax).toBe((engine.state() as Stack).settings.agentTurnsPerSession);
    expect(budget.turnsUsed).toBe(0);
    expect(budget.exhausted).toBe(false);
    expect(budget.hopsLeft).toBe((engine.state() as Stack).settings.hopBudget);
  });
});
