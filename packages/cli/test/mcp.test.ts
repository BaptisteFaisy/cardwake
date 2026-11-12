/** `mcp` : code 2 quand le serveur manque, code 0 quand un module est injecté. */

import { describe, expect, it } from "vitest";
import { mcpCommand, type McpLoader } from "../src/commands/mcp";
import { capture, cliArgs } from "./helpers";

/** Chargeur factice : le serveur n'est pas joignable dans ce checkout. */
const missingServer: McpLoader = async () => null;

/** Un faux module MCP : le vrai serveur n'est jamais importé. */
const fakeServer: McpLoader = async () => ({ started: true });

describe("cardwake mcp", () => {
  it("exits 2 with the launch command when the server is not available", async () => {
    const captured = capture();
    const code = await mcpCommand(cliArgs({ command: "mcp" }), captured.io, missingServer);
    expect(code).toBe(2);
    const text = captured.out.join("\n");
    expect(text).toContain("not available");
    expect(text).toContain("npx vite-node apps/mcp/src/server.ts");
  });

  it("exits 0 with an injected fake module, and prints nothing", async () => {
    const captured = capture();
    const code = await mcpCommand(cliArgs({ command: "mcp" }), captured.io, fakeServer);
    expect(code).toBe(0);
    // Le canal stdout appartient au protocole : une commande réussie n'y écrit rien.
    expect(captured.out).toEqual([]);
    expect(captured.err).toEqual([]);
  });

  it("accepts a module without exports: importing it already launches the loop", async () => {
    const captured = capture();
    const bare = await mcpCommand(cliArgs({ command: "mcp" }), captured.io, async () => ({}));
    expect(bare).toBe(0);
  });
});