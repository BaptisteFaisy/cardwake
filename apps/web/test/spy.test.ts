/**
 * Tests de l'espion de messages (CAR-F-19) : la dernière action humaine,
 * décrite — message, cible, chemin, trace et refus.
 *
 * Les fonctions pures de `engine/spy` sont testées pour elles-mêmes ; le
 * reste passe par le moteur réel, sur la pile du manoir.
 */
import { describe, expect, it } from "vitest";
import { FakeModel, textResponse, toolUseResponse } from "@cardwake/agent";
import type { DispatchResult } from "@cardwake/model";
import { describeRequest, emptySpy, spyView, targetLabel } from "../src/engine/spy";
import type { SpyRequest } from "../src/engine/spy";
import { demoStack, makeEngine, settled } from "./fixtures";

/** Les identifiants du manoir : la carte du garde et son bouton. */
const GUARD = 10;
const AMULET = 11;

/** Un résultat de dispatch minimal, pour tester la vue toute seule. */
function resultOf(overrides: Partial<DispatchResult> = {}): DispatchResult {
  return {
    stack: demoStack(),
    path: ['button "Show the amulet"'],
    handledBy: 'button "Show the amulet"',
    reply: null,
    agentTurns: 0,
    hopsLeft: 2,
    trace: [],
    refusals: [],
    ...overrides,
  };
}

describe("l'espion du moteur", () => {
  it("est vide avant toute action", () => {
    const { engine } = makeEngine(demoStack());
    expect(engine.spy()).toEqual(emptySpy());
  });

  it("décrit le clic : message, cible, chemin et porteur", async () => {
    const { engine } = makeEngine(demoStack());
    engine.navigate(GUARD);
    const done = settled(engine);
    engine.click(AMULET);
    await done;
    const spy = engine.spy();
    expect(spy.message).toBe("mouseUp");
    expect(spy.target).toBe('button "Show the amulet"');
    expect(spy.path[0]).toBe('button "Show the amulet"');
    expect(spy.handledBy).toBe('button "Show the amulet"');
    expect(spy.hopsLeft).toBe(1);
    expect(spy.refusals).toEqual([]);
  });

  it("décrit la discussion comme un message vers la carte", async () => {
    const { engine } = makeEngine(demoStack());
    engine.navigate(GUARD);
    const done = settled(engine);
    engine.chat("Who goes there?");
    await done;
    expect(engine.spy().message).toBe("message");
    expect(engine.spy().target).toBe('card "Guard"');
  });

  it("montre dans la trace ce que le Dispatcher a fait", async () => {
    const { engine } = makeEngine(demoStack());
    engine.navigate(GUARD);
    const done = settled(engine);
    engine.click(AMULET);
    await done;
    const trace = engine.spy().trace.join("\n");
    expect(trace).toContain('button "Show the amulet" handled "mouseUp"');
    expect(trace).toContain("consult agent of card");
  });

  it("recense un refus d'écriture et la règle qui le motive", async () => {
    // Une passerelle scriptée écrit dans un champ verrouillé : le refus doit
    // être visible dans la trace **et** dans la liste des refus.
    const fake = new FakeModel({
      responses: [
        toolUseResponse("write_field", { field: "Says", text: "Let me in.", mode: "replace" }),
        textResponse("I cannot write here."),
      ],
    });
    const { engine } = makeEngine(demoStack(), { gatewayOf: () => fake });
    engine.navigate(GUARD);
    const done = settled(engine);
    engine.chat("Who goes there?");
    await done;
    const spy = engine.spy();
    expect(spy.refusals[0].rule).toBe("locked-field");
    expect(spy.trace.some((line) => line.includes("refused (locked-field)"))).toBe(true);
    expect(engine.lastRefusal()?.rule).toBe("locked-field");
  });
});

describe("les fonctions pures de l'espion", () => {
  it("décrit un clic et une discussion", () => {
    const stack = demoStack();
    expect(describeRequest(stack, { kind: "click", cardId: GUARD, partId: AMULET })).toEqual({
      message: "mouseUp",
      target: 'button "Show the amulet"',
    });
    expect(describeRequest(stack, { kind: "chat", cardId: GUARD, text: "hello" })).toEqual({
      message: "message",
      target: 'card "Guard"',
    });
  });

  it("nomme les cibles comme le Dispatcher les nomme", () => {
    const stack = demoStack();
    expect(targetLabel(stack, { kind: "part", cardId: GUARD, partId: AMULET })).toBe(
      'button "Show the amulet"',
    );
    expect(targetLabel(stack, { kind: "card", cardId: 20 })).toBe('card "Cook"');
    expect(targetLabel(stack, { kind: "background", backgroundId: 2 })).toBe(
      'background "Character"',
    );
    expect(targetLabel(stack, { kind: "stack" })).toBe('stack "The Manor"');
    expect(targetLabel(null, { kind: "stack" })).toBeNull();
  });

  it("la vue garde les refus et les sauts de la jauge", () => {
    const request: SpyRequest = { message: "mouseUp", target: 'button "Show the amulet"' };
    const view = spyView(
      request,
      resultOf({
        trace: ["refused (locked-field): locked"],
        refusals: [{ allow: false, reason: "locked", rule: "locked-field" }],
      }),
      1,
    );
    expect(view.hopsLeft).toBe(1);
    expect(view.refusals).toEqual([{ reason: "locked", rule: "locked-field" }]);
    expect(view.path).toEqual(['button "Show the amulet"']);
  });

  it("l'espion vide ne ment sur rien", () => {
    const view = emptySpy();
    expect(view.message).toBeNull();
    expect(view.target).toBeNull();
    expect(view.handledBy).toBeNull();
    expect(view.path).toEqual([]);
    expect(view.trace).toEqual([]);
    expect(view.refusals).toEqual([]);
  });
});
