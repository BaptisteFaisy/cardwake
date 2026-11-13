/** `cassette` : list, verify (empreintes périmées) et record (toujours refusée). */

import { describe, expect, it } from "vitest";
import { cassetteCommand, cassettePathFor, loadCassette } from "../src/commands/cassette";
import { capture, cliArgs, fakeEntry, stackPath, tempStack } from "./helpers";

import { copyFileSync, mkdirSync, readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Une pile SANS cassette : les trois piles de démonstration en portent
 * désormais une (`stacks/<pile>/cassette.json`), donc les cas « cassette
 * absente » doivent partir d'une copie isolée dans un dossier temporaire.
 */
function bareStackPath(slug: string): string {
  const dir = mkdtempSync(join(tmpdir(), "cardwake-bare-"));
  const target = join(dir, "stack.json");
  copyFileSync(stackPath(slug), target);
  return target;
}

const FP = "ab".repeat(32);

describe("cassette list", () => {
  it("prints fingerprint, purpose and size of each recording", async () => {
    const file = tempStack(undefined, { mode: "cassette", entries: [fakeEntry(FP)] });
    const captured = capture();
    const code = await cassetteCommand(cliArgs({ command: "cassette", sub: "list", positionals: [file] }), captured.io);
    expect(code).toBe(0);
    const text = captured.out.join("\n");
    expect(text).toContain(FP);
    expect(text).toContain("agent-turn");
    expect(text).toMatch(/\d+ bytes/);
    expect(text).toContain("1 recording(s)");
  });

  it("says when no cassette file sits next to the stack", async () => {
    const captured = capture();
    const code = await cassetteCommand(cliArgs({ command: "cassette", sub: "list", positionals: [bareStackPath("manor")] }), captured.io);
    expect(code).toBe(0);
    expect(captured.out.join("\n")).toContain("no cassette file");
  });

  it("exits 3 without a stack path", async () => {
    const captured = capture();
    expect(await cassetteCommand(cliArgs({ command: "cassette", sub: "list" }), captured.io)).toBe(3);
  });
});

describe("cassette verify", () => {
  it("refuses to certify a stack it has no scenario for", async () => {
    // Une pile hors `stacks/<nom-de-pile>/` n'a pas de parcours connu : rien
    // ne peut être affirmé sur ses enregistrements, et le dire vaut mieux que
    // de les déclarer tous périmés — c'était l'ancien comportement, faux.
    const file = tempStack(undefined, [fakeEntry(FP), fakeEntry("cd".repeat(32))]);
    const captured = capture();
    const code = await cassetteCommand(cliArgs({ command: "cassette", sub: "verify", positionals: [file] }), captured.io);
    expect(code).toBe(0);
    expect(captured.out.join("\n")).toContain("no demo scenario for this stack");
  });

  it("checks the three demo stacks against their own scenarios", async () => {
    const captured = capture();
    const code = await cassetteCommand(cliArgs({ command: "cassette", sub: "verify" }), captured.io);
    expect(code).toBe(0);
    const text = captured.out.join("\n");
    expect(text).toContain("stacks/manor/stack.json");
    expect(text).toContain("all up to date");
    expect(text).not.toContain("stale");
    expect(text).not.toContain("missing");
  });

  it("names a recording the demo flows no longer ask for", async () => {
    // La cassette d'une vraie pile de démonstration, avec un enregistrement
    // que plus personne ne demande : `verify` doit le nommer, et sortir en 1.
    const dir = mkdtempSync(join(tmpdir(), "cardwake-verify-"));
    const pile = join(dir, "manor");
    mkdirSync(pile, { recursive: true });
    copyFileSync(stackPath("manor"), join(pile, "stack.json"));
    const cassette = JSON.parse(readFileSync("stacks/manor/cassette.json", "utf8"));
    cassette.entries.push(fakeEntry("ff".repeat(32)));
    writeFileSync(join(pile, "cassette.json"), JSON.stringify(cassette));
    const captured = capture();
    const code = await cassetteCommand(cliArgs({ command: "cassette", sub: "verify", positionals: [join(pile, "stack.json")] }), captured.io);
    expect(code).toBe(1);
    expect(captured.out.join("\n")).toContain(`stale ${"ff".repeat(32)}`);
  });

  it("accepts several stacks and a missing cassette file", async () => {
    const captured = capture();
    const code = await cassetteCommand(
      cliArgs({ command: "cassette", sub: "verify", positionals: [bareStackPath("manor"), bareStackPath("quotes")] }),
      captured.io,
    );
    expect(code).toBe(0);
    expect(captured.out.join("\n")).toContain("not checked");
  });

  it("reads the cassette file beside the stack", () => {
    const file = tempStack(undefined, []);
    expect(loadCassette(file).found).toBe(true);
    expect(cassettePathFor(file)).toContain("cassette.json");
  });
});

describe("cassette record", () => {
  it("always refuses: recording costs money and stays a human action", async () => {
    const captured = capture();
    const code = await cassetteCommand(cliArgs({ command: "cassette", sub: "record", positionals: [stackPath("manor")] }), captured.io);
    expect(code).toBe(2);
    const text = captured.err.join("\n");
    expect(text).toContain("refused");
    expect(text).toContain("costs real money");
    expect(text).toContain("human");
    expect(text).toContain("never makes a network call");
  });

  it("exits 3 without a sub-command", async () => {
    const captured = capture();
    expect(await cassetteCommand(cliArgs({ command: "cassette" }), captured.io)).toBe(3);
    expect(captured.err.join("\n")).toContain("list, verify or record");
  });
});
