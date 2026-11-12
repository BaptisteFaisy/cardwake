/** `run` : code 2 tant que le host manque ; sinon le clic produit des opérations. */

import { describe, expect, it } from "vitest";
import { runCommand, type ModelLoader } from "../src/commands/run";
import { capture, cliArgs, stackPath } from "./helpers";

const MANOR = stackPath("manor");
const NOT_WIRED = "run: the model host is not wired yet (lot C4a)";

/** Chargeur factice sans `ModelHost` : reproduit un checkout sans le lot C4a. */
const emptyModel: ModelLoader = async () => ({});
const failingModel: ModelLoader = async () => null;

describe("run without the model host", () => {
  it("exits 2 with the not-wired message when the module lacks ModelHost", async () => {
    const captured = capture();
    const code = await runCommand(cliArgs({ command: "run", positionals: [MANOR], click: "Guard/Go to the kitchen" }), captured.io, emptyModel);
    expect(code).toBe(2);
    expect(captured.out).toEqual([NOT_WIRED]);
  });

  it("exits 2 as well when the module itself cannot load", async () => {
    const captured = capture();
    const code = await runCommand(cliArgs({ command: "run", positionals: [MANOR], click: "Guard/Go to the kitchen" }), captured.io, failingModel);
    expect(code).toBe(2);
    expect(captured.out).toEqual([NOT_WIRED]);
  });
});

describe("run with the real model host", () => {
  it("prints the operations of a simple click", async () => {
    const captured = capture();
    const code = await runCommand(cliArgs({ command: "run", positionals: [MANOR], click: "Guard/Go to the kitchen" }), captured.io);
    expect(code).toBe(0);
    const text = captured.out.join("\n");
    expect(text).toContain('click on button "Go to the kitchen" of card "Guard" (seed 1)');
    expect(text).toContain("1 operation(s)");
    expect(text).toContain("show card");
  });

  it("runs offline through consult agent: no network, the card does not answer", async () => {
    const captured = capture();
    const code = await runCommand(
      cliArgs({ command: "run", positionals: [MANOR], click: "Guard/Show the amulet", seed: 7 }),
      captured.io,
    );
    expect(code).toBe(0);
    const text = captured.out.join("\n");
    expect(text).toContain("(seed 7)");
    expect(text).toContain("write into part");
  });

  it("is deterministic: the same seed prints the same operations", async () => {
    const first = capture();
    const second = capture();
    const args = cliArgs({ command: "run", positionals: [MANOR], click: "Guard/Show the amulet", seed: 5 });
    await runCommand(args, first.io);
    await runCommand(args, second.io);
    expect(first.out).toEqual(second.out);
  });

  it("exits 3 without --click, 1 on an unknown button", async () => {
    const noClick = capture();
    expect(await runCommand(cliArgs({ command: "run", positionals: [MANOR] }), noClick.io)).toBe(3);
    const unknown = capture();
    const code = await runCommand(cliArgs({ command: "run", positionals: [MANOR], click: "Guard/Nope" }), unknown.io);
    expect(code).toBe(1);
    expect(unknown.err.join("\n")).toContain('no button "Nope" on card "Guard"');
  });
});
