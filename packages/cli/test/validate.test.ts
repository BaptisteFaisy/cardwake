/** `validate` : les trois piles passent, une pile cassée est refusée avec son chemin. */

import { describe, expect, it } from "vitest";
import { scriptIssues, validateCommand } from "../src/commands/validate";
import { readStack } from "../src/args";
import { capture, cliArgs, stackPath, tempStack } from "./helpers";

describe("validate on the demo stacks", () => {
  it.each(["manor", "quotes", "dashboard"])("stacks/%s/stack.json passes without error", (name) => {
    const captured = capture();
    const code = validateCommand(cliArgs({ command: "validate", positionals: [stackPath(name)] }), captured.io);
    expect(captured.err).toEqual([]);
    expect(code).toBe(0);
    expect(captured.out[0]).toContain("ok");
  });

  it("finds no script issue in the manor stack", () => {
    const read = readStack(stackPath("manor"));
    expect(read.ok).toBe(true);
    if (read.ok) expect(scriptIssues(read.stack)).toEqual([]);
  });
});

describe("validate on broken stacks", () => {
  it("refuses an unknown key and quotes its path", () => {
    const file = tempStack((json) => {
      const cards = json.cards as Array<Record<string, unknown>>;
      cards[0].surprise = true;
    });
    const captured = capture();
    const code = validateCommand(cliArgs({ command: "validate", positionals: [file] }), captured.io);
    expect(code).toBe(1);
    const text = captured.err.join("\n");
    expect(text).toContain("cards[0].surprise");
    expect(text).toContain("unknown key");
  });

  it("refuses an invalid script with the path and the line", () => {
    const file = tempStack((json) => {
      const cards = json.cards as Array<{ parts: Array<{ script: string }> }>;
      cards[0].parts[0].script = 'on mouseUp\n  put "x" into\nend mouseUp\n';
    });
    const captured = capture();
    const code = validateCommand(cliArgs({ command: "validate", positionals: [file] }), captured.io);
    expect(code).toBe(1);
    expect(captured.err[0]).toMatch(/^.*cards\[0\]\.parts\[0\]\.script: line \d+ — /);
  });

  it("prints JSON with --json", () => {
    const file = tempStack((json) => {
      const cards = json.cards as Array<Record<string, unknown>>;
      cards[1].oops = 1;
    });
    const captured = capture();
    const code = validateCommand(cliArgs({ command: "validate", positionals: [file], json: true }), captured.io);
    expect(code).toBe(1);
    const report = JSON.parse(captured.out.join("\n")) as { ok: boolean; errors: string[] };
    expect(report.ok).toBe(false);
    expect(report.errors.join("\n")).toContain("cards[1].oops");
  });

  it("exits 3 without a stack path and 1 on a missing file", () => {
    const noPath = capture();
    expect(validateCommand(cliArgs({ command: "validate" }), noPath.io)).toBe(3);
    const missing = capture();
    expect(validateCommand(cliArgs({ command: "validate", positionals: ["/nope/stack.json"] }), missing.io)).toBe(1);
    expect(missing.err.join("\n")).toContain("cannot read");
  });
});
