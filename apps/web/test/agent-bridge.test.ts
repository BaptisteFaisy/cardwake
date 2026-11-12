/**
 * Tests du pont enregistré (7.5, 7.11) : le site joue le manoir **sans clé
 * ni réseau**, et une situation sans enregistrement ne coûte ni tour ni saut
 * (CAR-N-09, CAR-P-15).
 *
 * Tout se joue sur la vraie pile de démonstration et sa vraie cassette : les
 * empreintes sont recalculées à chaque tour, donc un écart entre le moteur et
 * l'enregistrement se voit ici, pas sur l'écran.
 */
import { describe, expect, it } from "vitest";
import { serializeStack } from "@cardwake/model";
import type { Stack } from "@cardwake/model";
import { NO_RECORDING } from "../src/engine/agent-bridge";
import { demoStack, makeEngine, settled, textOf } from "./fixtures";
import type { TestEngine } from "./fixtures";

/** Les identifiants du manoir : les cartes, le bouton et les champs. */
const GUARD = 10;
const COOK = 20;
const AMULET = 11;
const MOOD = 3;
const MEMORY = 4;
const SAYS = 5;

/** Le parcours enregistré : l'humain montre l'amulette au garde. */
async function playAmulet(): Promise<TestEngine> {
  const harness = makeEngine(demoStack());
  harness.engine.navigate(GUARD);
  const done = settled(harness.engine);
  harness.engine.click(AMULET);
  await done;
  return harness;
}

describe("le pont enregistré rejoue la cassette", () => {
  it("le garde répond et écrit dans ses champs", async () => {
    const { engine } = await playAmulet();
    const stack = engine.state() as Stack;
    expect(textOf(stack, GUARD, MOOD)).toBe("alarmed");
    expect(textOf(stack, GUARD, MEMORY)).toContain("A visitor carried a silver amulet.");
    expect(textOf(stack, GUARD, SAYS)).toContain("Put it away before the master sees it.");
  });

  it("le message envoyé réveille le cuisinier, qui se souvient", async () => {
    const { engine } = await playAmulet();
    const stack = engine.state() as Stack;
    expect(textOf(stack, COOK, MEMORY)).toContain("The guard saw the silver amulet tonight.");
  });

  it("le journal garde une transaction par tour d'agent", async () => {
    const { engine } = await playAmulet();
    const agents = engine.journal().entries.filter((tx) => tx.actor.kind === "agent");
    expect(agents).toHaveLength(2);
    expect(agents[0].cause).toContain("agent turn on card");
  });

  it("la jauge compte les appels de modèle et les sauts consommés", async () => {
    const { engine } = await playAmulet();
    const budget = engine.budget();
    expect(budget.turnsUsed).toBe(6);
    expect(budget.hopsLeft).toBe(1);
    expect(budget.exhausted).toBe(false);
  });

  it("le rejouage est déterministe : la pile est la même à l'octet près", async () => {
    const first = await playAmulet();
    const second = await playAmulet();
    expect(serializeStack(second.engine.state() as Stack)).toBe(
      serializeStack(first.engine.state() as Stack),
    );
  });
});

describe("une situation sans enregistrement", () => {
  it("remonte l'avis lisible et ne consomme ni tour ni saut", async () => {
    const { engine } = makeEngine(demoStack());
    engine.navigate(GUARD);
    const done = settled(engine);
    engine.chat("Who goes there?");
    await done;
    expect(engine.lastNotice()).toBe(NO_RECORDING);
    expect(engine.budget().turnsUsed).toBe(0);
    expect(engine.budget().hopsLeft).toBe(3);
  });

  it("une pile qui n'a pas de cassette ne coûte rien non plus", async () => {
    const { engine } = makeEngine({ ...demoStack(), name: "Someone else's house" });
    engine.navigate(GUARD);
    const done = settled(engine);
    engine.chat("Who goes there?");
    await done;
    expect(engine.lastNotice()).toBe(NO_RECORDING);
    expect(engine.budget().turnsUsed).toBe(0);
    expect(engine.budget().hopsLeft).toBe(3);
  });

  it("la pile n'a pas bougé d'un pouce", async () => {
    const before = serializeStack(demoStack());
    const { engine } = makeEngine(demoStack());
    const done = settled(engine);
    engine.chat("Who goes there?");
    await done;
    expect(serializeStack(engine.state() as Stack)).toBe(before);
  });
});
