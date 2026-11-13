/**
 * Tests de l'atelier de script du site (7.7, CAR-F-25) : la phrase → brouillon,
 * les trois défenses, et l'installation qui n'appartient qu'à l'humain.
 *
 * Aucun réseau, aucune clé, aucune dépense : le faux modèle de `@cardwake/agent`
 * joue les réponses, la cassette vide joue l'absence d'enregistrement
 * (CAR-N-09). Le moteur est le vrai : c'est lui qui autorise et qui journalise.
 */
import { describe, expect, it } from "vitest";
import { createButton, createCard, createField, createStack } from "@cardwake/model";
import type { Card, Part, Stack } from "@cardwake/model";
import { CassetteGateway, FakeModel, textResponse } from "@cardwake/agent";
import type { LlmGateway } from "@cardwake/agent";
import { acceptDraft, diffLines, linesOf, proposeScript } from "../src/engine/script-editor";
import { planFor } from "../src/engine/model-access";
import type { ScriptDraft } from "../src/engine/script-editor";
import { demoStack, makeEngine, scriptOf } from "./fixtures";

const SCRIPT = 'on mouseUp\n  put "165" into field "Total"\nend mouseUp\n';
const PHRASE = "When the button is clicked, put 165 into the Total field.";

/** Une carte « Order » avec un champ « Total » vide et un bouton « Compute ». */
type Order = { stack: Stack; cardId: number; fieldId: number; buttonId: number };

function orderStack(): Order {
  let stack = createStack("Orders");
  const card = createCard(stack, { name: "Order" });
  stack = card.stack;
  const field = createField(stack, { name: "Total", cardId: card.card.id });
  stack = field.stack;
  const button = createButton(stack, { name: "Compute", cardId: card.card.id });
  stack = button.stack;
  return { stack, cardId: card.card.id, fieldId: field.part.id, buttonId: button.part.id };
}

/** La carte et l'élément visés, lus dans la pile comme le fait l'écran. */
function targetOf(stack: Stack, cardId: number, partId: number): { card: Card; part: Part } {
  const card = stack.cards.find((item) => item.id === cardId);
  const part = card?.parts.find((item) => item.id === partId);
  if (card === undefined || part === undefined) throw new Error("the stack lost its target");
  return { card, part };
}

/** Un faux modèle qui rend un brouillon en sortie structurée. */
function draftingModel(script = SCRIPT): FakeModel {
  return new FakeModel({
    respond: () =>
      textResponse(
        JSON.stringify({
          script,
          summary: "Puts 165 into the Total field when the button is clicked.",
          assumptions: ["The total is 165."],
          questions: [],
        }),
      ),
  });
}

/** Demande un brouillon pour le bouton de la carte « Order ». */
function askDraft(order: Order, gateway: LlmGateway = draftingModel()): Promise<ScriptDraft> {
  const { card, part } = targetOf(order.stack, order.cardId, order.buttonId);
  return proposeScript({ phrase: PHRASE, stack: order.stack, card, part, gateway });
}

describe("brouillon de script", () => {
  it("rend le script, la relecture en clair, l'essai à blanc et le diff", async () => {
    const order = orderStack();
    const draft = await askDraft(order);
    expect(draft.status).toBe("draft");
    expect(draft.script).toBe(SCRIPT);
    expect(draft.failure).toBe("none");
    // Première défense : la relecture en clair, phrase par phrase.
    expect(draft.readback.length).toBeGreaterThan(0);
    // Seconde défense : le handler mouseUp a tourné sur une copie de la pile.
    expect(draft.dryRun.error).toBeNull();
    expect(draft.dryRun.lines.join("\n")).toContain('field Total: "" -> "165"');
    // Troisième défense : le script en place est vide, tout est donc ajouté.
    expect(draft.diff.every((line) => line.kind === "added")).toBe(true);
    expect(draft.diff.map((line) => line.text)).toEqual(linesOf(SCRIPT));
    expect(draft.assumptions).toEqual(["The total is 165."]);
  });

  it("le modèle a reçu la référence du langage et la carte visée", async () => {
    const order = orderStack();
    const model = draftingModel();
    await askDraft(order, model);
    const system = model.requests[0].system;
    expect(system).toContain("# The Murmur Language — Complete Reference");
    expect(system).toContain('Card "Order", agent level 1');
    expect(system).toContain('The card carries field "Total" (empty)');
    expect(system).toContain('The script will be attached to the button "Compute"');
  });
});

describe("rien ne s'installe sans acceptation", () => {
  it("un brouillon ne touche ni la pile ni le journal", async () => {
    const order = orderStack();
    const { engine } = makeEngine(order.stack);
    engine.setMode("build");
    const draft = await askDraft(order);
    expect(draft.status).toBe("draft");
    expect(scriptOf(engine.state() as Stack, order.cardId, order.buttonId)).toBe("");
    expect(engine.journal().entries).toHaveLength(0);
  });

  it("accepter installe le script par `setScript`, et le journalise", async () => {
    const order = orderStack();
    const { engine } = makeEngine(order.stack);
    engine.setMode("build");
    const draft = await askDraft(order);
    const installed = acceptDraft(draft, (script) => engine.setScript(order.buttonId, script));
    expect(installed).toBe(true);
    expect(scriptOf(engine.state() as Stack, order.cardId, order.buttonId)).toBe(SCRIPT);
    const tx = engine.journal().entries[0];
    expect(tx.ops[0].kind).toBe("setScript");
    expect(tx.actor).toEqual({ kind: "human", mode: "author" });
  });

  it("refuser, c'est jeter le brouillon : la pile reste telle quelle", async () => {
    const order = orderStack();
    const { engine } = makeEngine(order.stack);
    engine.setMode("build");
    const draft = await askDraft(order);
    expect(draft.status).toBe("draft");
    // Refuser ne passe par aucun installateur : le brouillon meurt à l'écran.
    expect(scriptOf(engine.state() as Stack, order.cardId, order.buttonId)).toBe("");
    expect(engine.journal().entries).toHaveLength(0);
  });

  it("un brouillon en échec ou absent n'installe jamais rien", async () => {
    const order = orderStack();
    const { engine } = makeEngine(order.stack);
    engine.setMode("build");
    let installs = 0;
    const install = (script: string): void => {
      installs += 1;
      engine.setScript(order.buttonId, script);
    };
    const failed = await proposeScript({
      phrase: PHRASE,
      ...targetOf(order.stack, order.cardId, order.buttonId),
      stack: order.stack,
      gateway: new CassetteGateway({ entries: [] }),
    });
    expect(failed.status).toBe("failed");
    expect(acceptDraft(failed, install)).toBe(false);
    expect(acceptDraft(null, install)).toBe(false);
    expect(installs).toBe(0);
    expect(engine.journal().entries).toHaveLength(0);
  });

  it("en mode Jouer, l'acceptation est refusée par le moteur (CAR-F-05)", async () => {
    const order = orderStack();
    const { engine } = makeEngine(order.stack);
    const draft = await askDraft(order);
    acceptDraft(draft, (script) => engine.setScript(order.buttonId, script));
    expect(engine.lastRefusal()?.rule).toBe("mode-browse");
    expect(scriptOf(engine.state() as Stack, order.cardId, order.buttonId)).toBe("");
    expect(engine.journal().entries).toHaveLength(0);
  });
});

describe("échecs honnêtes", () => {
  it("sans passerelle, le brouillon dit qu'aucun modèle n'est joignable", async () => {
    const order = orderStack();
    const { card, part } = targetOf(order.stack, order.cardId, order.buttonId);
    const draft = await proposeScript({ phrase: PHRASE, stack: order.stack, card, part, gateway: null });
    expect(draft.status).toBe("failed");
    expect(draft.failure).toBe("no-gateway");
    expect(draft.script).toBe("");
  });

  it("sans réponse enregistrée, le brouillon dit que rien n'est enregistré", async () => {
    const order = orderStack();
    const draft = await askDraft(order, new CassetteGateway({ entries: [] }));
    expect(draft.status).toBe("failed");
    expect(draft.failure).toBe("no-recording");
    expect(draft.problem.length).toBeGreaterThan(0);
  });

  it("en mode enregistré par défaut, une phrase sans réponse le dit aussi", async () => {
    const stack = demoStack();
    const card = stack.cards.find((item) => item.id === stack.currentCardId);
    const part = card?.parts[0];
    if (card === undefined || part === undefined) throw new Error("the demo stack lost its parts");
    // Le mode par défaut est la cassette : aucune clé, aucun réseau.
    const plan = planFor(stack);
    const draft = await proposeScript({
      phrase: PHRASE,
      stack,
      card,
      part,
      gateway: plan.primary ?? plan.fallback,
    });
    expect(draft.status).toBe("failed");
    expect(draft.failure).toBe("no-recording");
    expect(draft.script).toBe("");
  });

  it("un script refusé par les contrôles ne devient pas un brouillon", async () => {
    const order = orderStack();
    const draft = await askDraft(order, draftingModel('on mouseUp\n  put "1" into field "Nowhere"\nend mouseUp\n'));
    expect(draft.status).toBe("failed");
    expect(draft.failure).toBe("model");
    expect(draft.problem).toContain("Nowhere");
  });
});

describe("diff", () => {
  it("montre ce qui reste, ce qui part et ce qui arrive", () => {
    const before = ["on mouseUp", '  put "1" into field "Total"', "end mouseUp"];
    const after = ["on mouseUp", '  put "165" into field "Total"', "end mouseUp"];
    const lines = diffLines(before, after);
    expect(lines.filter((line) => line.kind === "same").map((line) => line.text)).toEqual([
      "on mouseUp",
      "end mouseUp",
    ]);
    expect(lines.filter((line) => line.kind === "removed").map((line) => line.text)).toEqual([
      '  put "1" into field "Total"',
    ]);
    expect(lines.filter((line) => line.kind === "added").map((line) => line.text)).toEqual([
      '  put "165" into field "Total"',
    ]);
  });

  it("deux scripts identiques ne produisent que des lignes inchangées", () => {
    const lines = diffLines(linesOf(SCRIPT), linesOf(SCRIPT));
    expect(lines.every((line) => line.kind === "same")).toBe(true);
    expect(lines.map((line) => line.text)).toEqual(linesOf(SCRIPT));
  });
});