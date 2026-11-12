/** `args.ts` : chaque forme d'argv annoncée par le brief s'analyse correctement. */

import { describe, expect, it } from "vitest";
import { COMMANDS, parseArgs, usage } from "../src/args";
import { main } from "../src/main";
import { capture } from "./helpers";

describe("parseArgs", () => {
  it("reads a command and its positionals", () => {
    const parsed = parseArgs(["validate", "stacks/manor/stack.json"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.args.command).toBe("validate");
    expect(parsed.args.positionals).toEqual(["stacks/manor/stack.json"]);
  });

  it('reads --click "Card/Button", --seed and --json', () => {
    const parsed = parseArgs(["run", "pile.json", "--click", "Guard/Show the amulet", "--seed", "42", "--json"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.args.command).toBe("run");
    expect(parsed.args.click).toBe("Guard/Show the amulet");
    expect(parsed.args.seed).toBe(42);
    expect(parsed.args.json).toBe(true);
    expect(parsed.args.positionals).toEqual(["pile.json"]);
  });

  it("reads --object in the = form and a cassette sub-command", () => {
    const parsed = parseArgs(["cassette", "verify", "a.json", "b.json"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.args.command).toBe("cassette");
    expect(parsed.args.sub).toBe("verify");
    expect(parsed.args.positionals).toEqual(["a.json", "b.json"]);
    const other = parseArgs(["paraphrase", "pile.json", "--object=Guard/Mood"]);
    expect(other.ok && other.args.object).toBe("Guard/Mood");
  });

  it("flags --help and -h", () => {
    expect(parseArgs(["--help"]).ok && parseArgs(["-h"]).ok).toBe(true);
    const parsed = parseArgs(["--help"]);
    expect(parsed.ok && parsed.args.help).toBe(true);
  });

  it("refuses unknown options, missing values and fractional seeds", () => {
    expect(parseArgs(["validate", "--nope"])).toEqual({ ok: false, error: "unknown option: --nope" });
    expect(parseArgs(["run", "--click"])).toEqual({ ok: false, error: "option --click needs a value" });
    expect(parseArgs(["run", "--seed", "1.5"]).ok).toBe(false);
    expect(parseArgs(["run", "--seed", "abc"]).ok).toBe(false);
    expect(parseArgs(["run", "--seed", "-3"]).ok).toBe(false);
  });

  it("lists every command of the lot", () => {
    expect(COMMANDS).toEqual(["live", "validate", "paraphrase", "cassette", "run"]);
  });
});

describe("usage", () => {
  it("is in English and names every command and exit code", () => {
    const text = usage();
    for (const word of ["cardwake", "live", "validate", "paraphrase", "cassette", "run", "--click", "--seed", "--object", "--card", "--say", "--relay", "--json"]) {
      expect(text).toContain(word);
    }
    expect(text).toContain("Exit codes: 0 success, 1 invalid stack, 2 not available, 3 wrong usage.");
  });
});

describe("main", () => {
  it("prints the usage and exits 3 without a command, 0 with --help", async () => {
    const bare = capture();
    expect(await main([], bare.io)).toBe(3);
    expect(bare.out.join("\n")).toContain("cardwake");
    const helped = capture();
    expect(await main(["--help"], helped.io)).toBe(0);
    expect(helped.out.join("\n")).toContain("Usage:");
  });

  it("refuses an unknown command with exit code 3", async () => {
    const captured = capture();
    expect(await main(["frobnicate"], captured.io)).toBe(3);
    expect(captured.err.join("\n")).toContain('unknown command "frobnicate"');
  });
});
