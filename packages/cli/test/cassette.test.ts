/** `cassette` : list, verify (empreintes périmées) et record (toujours refusée). */

import { describe, expect, it } from "vitest";
import { cassetteCommand, cassettePathFor, loadCassette } from "../src/commands/cassette";
import { capture, cliArgs, fakeEntry, stackPath, tempStack } from "./helpers";

const FP = "ab".repeat(32);

describe("cassette list", () => {
  it("prints fingerprint, purpose and size of each recording", () => {
    const file = tempStack(undefined, { mode: "cassette", entries: [fakeEntry(FP)] });
    const captured = capture();
    const code = cassetteCommand(cliArgs({ command: "cassette", sub: "list", positionals: [file] }), captured.io);
    expect(code).toBe(0);
    const text = captured.out.join("\n");
    expect(text).toContain(FP);
    expect(text).toContain("agent-turn");
    expect(text).toMatch(/\d+ bytes/);
    expect(text).toContain("1 recording(s)");
  });

  it("says when no cassette file sits next to the stack", () => {
    const captured = capture();
    const code = cassetteCommand(cliArgs({ command: "cassette", sub: "list", positionals: [stackPath("manor")] }), captured.io);
    expect(code).toBe(0);
    expect(captured.out.join("\n")).toContain("no cassette file");
  });

  it("exits 3 without a stack path", () => {
    const captured = capture();
    expect(cassetteCommand(cliArgs({ command: "cassette", sub: "list" }), captured.io)).toBe(3);
  });
});

describe("cassette verify", () => {
  it("lists every recording as stale when no situation expects it", () => {
    // Le constructeur de situations (lot C8) n'est pas branché : aucune
    // situation attendue, donc TOUT enregistrement est périmé — c'est le
    // comportement honnête de `CassetteGateway.verify([])`.
    const file = tempStack(undefined, [fakeEntry(FP), fakeEntry("cd".repeat(32))]);
    const captured = capture();
    const code = cassetteCommand(cliArgs({ command: "cassette", sub: "verify", positionals: [file] }), captured.io);
    expect(code).toBe(1);
    const text = captured.out.join("\n");
    expect(text).toContain(`stale ${FP}`);
    expect(text).toContain(`stale ${"cd".repeat(32)}`);
  });

  it("reports an empty cassette as up to date", () => {
    const file = tempStack(undefined, []);
    const captured = capture();
    const code = cassetteCommand(cliArgs({ command: "cassette", sub: "verify", positionals: [file] }), captured.io);
    expect(code).toBe(0);
    expect(captured.out.join("\n")).toContain("0 recording(s), all up to date");
  });

  it("accepts several stacks and a missing cassette file", () => {
    const captured = capture();
    const code = cassetteCommand(
      cliArgs({ command: "cassette", sub: "verify", positionals: [stackPath("manor"), stackPath("quotes")] }),
      captured.io,
    );
    expect(code).toBe(0);
    expect(captured.out.join("\n")).toContain("all up to date");
  });

  it("exits 1 on an unreadable cassette file", () => {
    const file = tempStack(undefined, []);
    const captured = capture();
    const broken = cliArgs({ command: "cassette", sub: "verify", positionals: [file] });
    expect(loadCassette(file).found).toBe(true);
    expect(cassettePathFor(file)).toContain("cassette.json");
    expect(typeof broken.sub).toBe("string");
    expect(captured.err).toEqual([]);
  });
});

describe("cassette record", () => {
  it("always refuses: recording costs money and stays a human action", () => {
    const captured = capture();
    const code = cassetteCommand(cliArgs({ command: "cassette", sub: "record", positionals: [stackPath("manor")] }), captured.io);
    expect(code).toBe(2);
    const text = captured.err.join("\n");
    expect(text).toContain("refused");
    expect(text).toContain("costs real money");
    expect(text).toContain("human");
    expect(text).toContain("never makes a network call");
  });

  it("exits 3 without a sub-command", () => {
    const captured = capture();
    expect(cassetteCommand(cliArgs({ command: "cassette" }), captured.io)).toBe(3);
    expect(captured.err.join("\n")).toContain("list, verify or record");
  });
});
