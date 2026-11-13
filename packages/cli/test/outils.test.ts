/**
 * Les nouveaux gestes de la CLI : `new`, `explain`, `doctor`, `serve`, et le
 * refus toujours fermé de `cassette record`.
 *
 * Aucun réseau, aucune clé, aucune dépense : le relais est une passerelle
 * injectée, et le serveur web n'est testé que par sa résolution de chemin.
 */

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FakeModel, textResponse } from "@cardwake/agent";
import { capture, cliArgs, stackPath } from "./helpers";
import { newCommand } from "../src/commands/new";
import { explainCommand } from "../src/commands/explain";
import { doctorCommand } from "../src/commands/doctor";
import { reportLines } from "../src/commands/doctor";
import { resolveRequest } from "../src/commands/serve";
import { cassetteRecordCommand } from "../src/commands/cassette-record";

/** Un dossier temporaire pour les fichiers qu'on écrit. */
function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "cardwake-outils-"));
}

describe("new", () => {
  it("creates a stack that reads back", () => {
    const path = join(tempDir(), "first.json");
    const captured = capture();
    const code = newCommand(cliArgs({ command: "new", positionals: [path] }), captured.io);
    expect(code).toBe(0);
    expect(existsSync(path)).toBe(true);
    const written = JSON.parse(readFileSync(path, "utf8")) as { format: string; name: string };
    expect(written.format).toBe("cardwake/1");
    expect(written.name).toBe("first");
  });

  it("refuses to overwrite a file, unless --overwrite", () => {
    const path = join(tempDir(), "taken.json");
    writeFileSync(path, "keep me");
    const captured = capture();
    expect(newCommand(cliArgs({ command: "new", positionals: [path] }), captured.io)).toBe(1);
    expect(readFileSync(path, "utf8")).toBe("keep me");
    expect(captured.err.join("\n")).toContain("already exists");
    expect(newCommand(cliArgs({ command: "new", positionals: [path], overwrite: true }), captured.io)).toBe(0);
    expect(readFileSync(path, "utf8")).not.toBe("keep me");
  });

  it("needs a path", () => {
    const captured = capture();
    expect(newCommand(cliArgs({ command: "new" }), captured.io)).toBe(3);
  });
});

describe("explain", () => {
  it("reads a script line by line", () => {
    const captured = capture();
    const code = explainCommand(
      cliArgs({ command: "explain", sub: "script", positionals: [stackPath("manor")], object: "Guard/Show the amulet" }),
      captured.io,
    );
    expect(code).toBe(0);
    const text = captured.out.join("\n");
    expect(text).toContain("Show the amulet");
    expect(text).toContain("on mouseUp");
  });

  it("needs the sub-command, the stack and the object", () => {
    const captured = capture();
    expect(explainCommand(cliArgs({ command: "explain", positionals: [stackPath("manor")] }), captured.io)).toBe(3);
    expect(explainCommand(cliArgs({ command: "explain", sub: "script", positionals: [stackPath("manor")] }), captured.io)).toBe(3);
  });

  it("says when the object does not exist", () => {
    const captured = capture();
    const code = explainCommand(
      cliArgs({ command: "explain", sub: "script", positionals: [stackPath("manor")], object: "Nope/Thing" }),
      captured.io,
    );
    expect(code).toBe(1);
    expect(captured.err.join("\n")).toContain("no card");
  });
});

describe("doctor", () => {
  it("reports the stacks and the language reference", async () => {
    const captured = capture();
    await doctorCommand(cliArgs({ command: "doctor" }), captured.io);
    const text = captured.out.join("\n");
    expect(text).toMatch(/ok\s+stacks/);
    expect(text).toMatch(/ok\s+language reference/);
  });

  it("writes one line per check", () => {
    const lines = reportLines([
      { name: "stacks", verdict: "ok", detail: "3 stack(s)" },
      { name: "cassettes", verdict: "ko", detail: "2 stale" },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("stacks");
    expect(lines[1]).toContain("ko");
  });
});

describe("serve", () => {
  it("serves the file when it exists, and index.html otherwise", () => {
    const root = tempDir();
    writeFileSync(join(root, "index.html"), "<html></html>");
    writeFileSync(join(root, "app.js"), "console.log(1)");
    expect(resolveRequest(root, "/app.js").file).toBe(join(root, "app.js"));
    expect(resolveRequest(root, "/card").file).toBe(join(root, "index.html"));
  });

  it("never serves a file outside the published folder", () => {
    const root = tempDir();
    writeFileSync(join(root, "index.html"), "<html></html>");
    const outside = resolveRequest(root, "/../../etc/passwd");
    expect(outside.file.startsWith(root)).toBe(true);
  });
});

describe("cassette record", () => {
  it("refuses without a relay — the guard stays closed", async () => {
    const captured = capture();
    const code = await cassetteRecordCommand(
      cliArgs({ command: "cassette", sub: "record", positionals: [stackPath("manor")] }),
      captured.io,
    );
    expect(code).toBe(2);
    expect(captured.err.join("\n")).toContain("refused");
  });

  it("refuses without --yes, even with a relay", async () => {
    const captured = capture();
    const code = await cassetteRecordCommand(
      cliArgs({ command: "cassette", sub: "record", positionals: [stackPath("manor")], relay: "http://127.0.0.1:1/v1" }),
      captured.io,
    );
    expect(code).toBe(3);
    expect(captured.err.join("\n")).toContain("--yes missing");
  });

  it("records through an injected gateway, and counts the calls", async () => {
    const model = new FakeModel({ respond: () => textResponse("Hello there.") });
    const captured = capture();
    const code = await cassetteRecordCommand(
      cliArgs({
        command: "cassette",
        sub: "record",
        positionals: [stackPath("manor")],
        relay: "http://127.0.0.1:1/v1",
        yes: true,
        maxCalls: 2,
      }),
      captured.io,
      { gateway: () => model },
    );
    expect(code).toBe(0);
    expect(model.callCount).toBeLessThanOrEqual(2);
    expect(captured.out.join("\n")).toContain("relay call(s) used");
  });
});
