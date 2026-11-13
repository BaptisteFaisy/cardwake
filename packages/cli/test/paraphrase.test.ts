/** `paraphrase` : retrouve l'objet par "Carte/Bouton" et imprime sa relecture. */

import { describe, expect, it } from "vitest";
import { paraphraseCommand, resolveObject } from "../src/commands/paraphrase";
import { readStack } from "../src/args";
import { capture, cliArgs, stackPath } from "./helpers";

const MANOR = stackPath("manor");

describe("resolveObject", () => {
  const read = readStack(MANOR);
  const stack = read.ok ? read.stack : null;

  it("finds a button by Card/Button", () => {
    expect(stack).not.toBeNull();
    if (!stack) return;
    const target = resolveObject(stack, "Guard/Show the amulet");
    expect(typeof target).toBe("object");
    if (typeof target === "string") return;
    expect(target.label).toContain("Show the amulet");
    expect(target.script).toContain("consult agent");
  });

  it("finds a card alone and a background part", () => {
    if (!stack) return;
    const card = resolveObject(stack, "Guard");
    expect(typeof card === "object" && card.label).toBe('card "Guard"');
    const mood = resolveObject(stack, "Character/Mood");
    expect(typeof mood === "object" && mood.label).toContain("Mood");
  });

  it("reports missing objects in English", () => {
    if (!stack) return;
    expect(resolveObject(stack, "Nobody")).toContain('no card or background named "Nobody"');
    expect(resolveObject(stack, "Guard/Nope")).toContain('no part "Nope"');
  });
});

describe("paraphraseCommand", () => {
  it("prints the reading of Guard/Show the amulet", () => {
    const captured = capture();
    const code = paraphraseCommand(cliArgs({ command: "paraphrase", positionals: [MANOR], object: "Guard/Show the amulet" }), captured.io);
    expect(code).toBe(0);
    const text = captured.out.join("\n");
    // Le module de relecture est livré : la CLI rend la lecture en clair, pas
    // le script normalisé.
    expect(text).not.toContain("paraphrase unavailable");
    expect(text).toContain("Ask this card's agent");
    expect(text).toContain("The visitor shows you a silver amulet.");
    expect(text).toContain("field Says");
  });

  it("says when the script is empty", () => {
    const captured = capture();
    const code = paraphraseCommand(cliArgs({ command: "paraphrase", positionals: [MANOR], object: "Guard" }), captured.io);
    expect(code).toBe(0);
    expect(captured.out.join("\n")).toContain("is empty");
  });

  it("exits 1 on an unknown object and 3 without --object", () => {
    const unknown = capture();
    expect(paraphraseCommand(cliArgs({ command: "paraphrase", positionals: [MANOR], object: "Nope/Nope" }), unknown.io)).toBe(1);
    expect(unknown.err.join("\n")).toContain("paraphrase:");
    const noObject = capture();
    expect(paraphraseCommand(cliArgs({ command: "paraphrase", positionals: [MANOR] }), noObject.io)).toBe(3);
  });
});
