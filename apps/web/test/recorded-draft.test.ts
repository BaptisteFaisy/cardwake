/**
 * La démonstration **sans clé** : la phrase enregistrée trouve son brouillon.
 *
 * Le cahier des charges veut que les jugeurs puissent essayer le produit sans
 * clé et sans réseau. Le mode enregistré du site rejoue les cassettes des trois
 * piles de démonstration ; depuis l'écran de script, une phrase de
 * démonstration doit donc rendre **un vrai brouillon** — relecture en clair,
 * essai à blanc, diff — et rien ne s'installe sans Accept.
 *
 * Ce test ne simule rien : il prend la cassette livrée du manoir, la pile
 * livrée, et la phrase du scénario, et il demande le brouillon par le même
 * chemin que l'écran. L'empreinte doit tomber sur l'enregistrement.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_SCENARIOS, cassetteFrom } from "@cardwake/agent";
import type { CassetteEntry } from "@cardwake/model";
import { proposeScript } from "../src/engine/script-editor";
import { loadStack } from "../../../scripts/cassettes/build";

/** Les entrées de la cassette livrée du manoir. */
function manorEntries(): CassetteEntry[] {
  const file = JSON.parse(readFileSync("stacks/manor/cassette.json", "utf8")) as { entries: CassetteEntry[] };
  return file.entries;
}

/** L'étape de brouillon du scénario du manoir. */
function manorDraft() {
  const step = DEMO_SCENARIOS.manor.find((item) => item.action.kind === "draft");
  if (step === undefined || step.action.kind !== "draft") throw new Error("no draft step in the manor scenario");
  return step.action;
}

describe("la phrase de démonstration, sans clé", () => {
  it("rend le brouillon enregistré, avec ses trois défenses", async () => {
    const stack = loadStack("manor");
    const action = manorDraft();
    const card = stack.cards.find((item) => item.name === action.card);
    if (card === undefined) throw new Error(`the manor has no card "${action.card}"`);
    const part = card.parts.find((item) => item.name === action.part);
    if (part === undefined) throw new Error(`the card has no part "${action.part}"`);
    const draft = await proposeScript({
      phrase: action.phrase,
      stack,
      card,
      part,
      gateway: cassetteFrom(manorEntries()),
    });
    expect(draft.status).toBe("draft");
    expect(draft.script).toBe(action.response.script);
    expect(draft.readback.length).toBeGreaterThan(0);
    expect(draft.failure).toBe("none");
  });

  it("refuse une phrase qui n'a pas d'enregistrement", async () => {
    const stack = loadStack("manor");
    const action = manorDraft();
    const card = stack.cards.find((item) => item.name === action.card);
    if (card === undefined) throw new Error(`the manor has no card "${action.card}"`);
    const part = card.parts.find((item) => item.name === action.part);
    if (part === undefined) throw new Error(`the card has no part "${action.part}"`);
    const draft = await proposeScript({
      phrase: "Make it do something else entirely.",
      stack,
      card,
      part,
      gateway: cassetteFrom(manorEntries()),
    });
    expect(draft.status).toBe("failed");
    expect(draft.script).toBe("");
  });
});
