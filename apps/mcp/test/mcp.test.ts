/**
 * Tests du serveur MCP : le transport (`rpc.ts`) et les outils (`tools.ts`),
 * en injectant des lignes JSON et en capturant la sortie. Aucun réseau :
 * tout tourne sur les piles du dépôt, graine et horloge figées.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { byName, findCard, findPart, parseStackFile } from "@cardwake/model";
import type { Stack } from "@cardwake/model";
import { createRpc, type RpcApi } from "../src/rpc";
import { mcpTools, rpcApi, type McpTool } from "../src/tools";

// ------------------------------------------------------------------ harnais

type Captured = {
  jsonrpc: string;
  id?: unknown;
  result?: { content: Array<{ type: string; text: string }>; tools?: unknown };
  error?: { code: number; message: string };
};

const QUOTES = "stacks/quotes/stack.json";
const MANOR = "stacks/manor/stack.json";

function harness() {
  const out: Captured[] = [];
  const rpc = createRpc(rpcApi(mcpTools()), (text) => out.push(JSON.parse(text) as Captured));
  return {
    out,
    async send(message: unknown): Promise<Captured> {
      const before = out.length;
      await rpc.handleLine(JSON.stringify(message));
      return out[before] as Captured;
    },
    async sendRaw(text: string): Promise<Captured | undefined> {
      await rpc.handleLine(text);
      return out[out.length - 1];
    },
  };
}

function loadStack(path: string): Stack {
  const parsed = parseStackFile(readFileSync(path, "utf8"));
  if (!parsed.ok) throw new Error(`invalid fixture: ${path}`);
  return parsed.stack;
}

/** Le script du bouton « Total » du devis Dupont, avec le contexte des contrôles. */
function totalButton() {
  const stack = loadStack(QUOTES);
  const card = findCard(stack, byName("Dupont"));
  if (!card) throw new Error("invalid fixture: card Dupont");
  const found = findPart(stack, card.id, byName("Total"));
  if (!found || found.part.kind !== "button") throw new Error("invalid fixture: button Total");
  return {
    script: found.part.script,
    context: {
      cardNames: stack.cards.map((item) => item.name),
      partNames: [
        ...stack.backgrounds.flatMap((background) => background.parts.map((part) => part.name)),
        ...card.parts.map((part) => part.name),
      ],
      backgroundNames: stack.backgrounds.map((item) => item.name),
      objectKind: "part" as const,
    },
  };
}

/** Le résultat d'un tools/call : le JSON porté par le contenu texte. */
function callResult(message: Captured): Record<string, unknown> {
  const content = (message.result as { content: Array<{ type: string; text: string }> }).content;
  return JSON.parse(content[0].text) as Record<string, unknown>;
}

/** Une demande tools/call prête à envoyer. */
function call(id: number, name: string, args: Record<string, unknown>): unknown {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } };
}

// ------------------------------------------------------------- transport

describe("rpc", () => {
  it("initialize answers with serverInfo, and the notification never answers", async () => {
    const { out, send } = harness();
    const reply = await send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    const info = (reply.result as Record<string, unknown>).serverInfo as Record<string, unknown>;
    expect(info.name).toBe("cardwake-mcp");
    expect(typeof (reply.result as Record<string, unknown>).protocolVersion).toBe("string");
    await send({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(out).toHaveLength(1);
  });

  it("tools/list exposes at least six tools", async () => {
    const { send } = harness();
    const reply = await send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const names = ((reply.result as { tools: Array<{ name: string }> }).tools).map((tool) => tool.name);
    expect(names.length).toBeGreaterThanOrEqual(6);
    for (const expected of ["validate_script", "validate_stack", "paraphrase", "simulate", "read_stack", "format_script"]) {
      expect(names).toContain(expected);
    }
  });

  it("a line that is not JSON answers -32700", async () => {
    const { sendRaw } = harness();
    const reply = await sendRaw("{not json");
    expect(reply?.error?.code).toBe(-32700);
  });

  it("an unknown tool answers -32602", async () => {
    const { send } = harness();
    const reply = await send(call(3, "nope", {}));
    expect(reply.error?.code).toBe(-32602);
    expect(reply.error?.message).toContain("unknown tool");
  });
});

// ----------------------------------------------------------------- outils

describe("tools", () => {
  it("validate_script reports zero issues on the Total button of the quote stack", async () => {
    const { send } = harness();
    const { script, context } = totalButton();
    const reply = await send(call(4, "validate_script", { script, ...context }));
    expect(callResult(reply)).toEqual({ issues: [] });
  });

  it("paraphrase cites the fields of the Total script, without quotes", async () => {
    const { send } = harness();
    const { script } = totalButton();
    const reply = await send(call(5, "paraphrase", { script }));
    const said = (callResult(reply).lines as string[]).join(" ");
    for (const field of ["Lines", "Subtotal", "VAT", "Total"]) {
      expect(said).toContain(`field ${field}`);
    }
  });

  it("validate_stack accepts the manor stack", async () => {
    const { send } = harness();
    const reply = await send(call(6, "validate_stack", { path: MANOR }));
    const result = callResult(reply);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("simulate moves the current card on a navigation button", async () => {
    const { send } = harness();
    const reply = await send(call(7, "simulate", { stackPath: MANOR, card: "Guard", button: "Go to the kitchen" }));
    const result = callResult(reply);
    expect(result.ok).toBe(true);
    expect((result.stack as { currentCardId: number }).currentCardId).toBe(20); // la carte Cook
    expect(result.handledBy).toContain("Go to the kitchen");
    expect((result.trace as string[]).length).toBeGreaterThan(0);
    expect(result.hopsLeft).toBe(3);
  });

  it("format_script normalizes a script and reports parse failures", async () => {
    const { send } = harness();
    const good = await send(call(8, "format_script", { script: 'ON mouseUp\n  go to card "Cook"\nEND mouseUp' }));
    expect(callResult(good).normalized).toContain('go to card "Cook"');
    const bad = await send(call(9, "format_script", { script: "on mouseUp" }));
    expect(callResult(bad).ok).toBe(false);
    expect(callResult(bad).error).toBeDefined();
  });

  it("read_stack lists the cards and scripts of the manor", async () => {
    const { send } = harness();
    const reply = await send(call(10, "read_stack", { path: MANOR }));
    const result = callResult(reply);
    expect(result.name).toBe("The Manor");
    const cards = result.cards as Array<{ name: string; agent: unknown }>;
    expect(cards.map((card) => card.name)).toContain("Guard");
    expect(cards.find((card) => card.name === "Cook")?.agent).not.toBeNull();
    const scripts = result.scripts as Array<{ at: string; ok: boolean; handlers: string[] }>;
    expect(scripts.some((script) => script.ok && script.handlers.includes("mouseUp"))).toBe(true);
  });
});

// Une petite garde : aucun outil ne doit dépendre du hasard ou de l'heure.
const toolNames: McpTool["name"][] = mcpTools().map((tool) => tool.name);
it("the tool list is stable and complete", () => {
  expect(toolNames).toHaveLength(6);
});
