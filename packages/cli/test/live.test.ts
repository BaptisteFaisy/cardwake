/**
 * La commande `live` : un vrai modèle, appelé par le relais, sur une vraie
 * pile. Le `fetch` est injecté — le test n'ouvre jamais de connexion.
 */

import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { liveCommand } from "../src/commands/live";

const stackPath = fileURLToPath(new URL("../../../stacks/manor/stack.json", import.meta.url));

/** Une réponse OpenAI-compatible : l'agent répond en une phrase. */
function fakeFetch(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
}

describe("cardwake live", () => {
  it("appelle le relais et rend la réponse de l'agent", async () => {
    const out: string[] = [];
    const result = await liveCommand(
      {
        stackPath,
        card: "Guard",
        say: "A visitor shows you a silver amulet.",
        relayBaseUrl: "http://127.0.0.1:8787/v1",
        fetchImpl: fakeFetch({
          choices: [{ message: { role: "assistant", content: "Where did you get that?" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        clock: () => "2026-12-12T22:00:00.000Z",
      },
      { out: (line) => out.push(line), err: () => undefined },
    );
    expect(result.code).toBe(0);
    expect(result.reply).toContain("Where did you get that?");
    expect(out.join("\n")).toContain("reply:");
  });

  it("explique clairement quand le relais ne répond pas", async () => {
    const out: string[] = [];
    const result = await liveCommand(
      {
        stackPath,
        card: "Guard",
        say: "hello",
        relayBaseUrl: "http://127.0.0.1:8787/v1",
        fetchImpl: (async () => {
          throw new Error("connection refused");
        }) as unknown as typeof fetch,
      },
      { out: (line) => out.push(line), err: () => undefined },
    );
    expect(result.code).toBe(2);
    expect(out.join("\n")).toContain("npm run relay");
  });

  it("refuse une carte inconnue", async () => {
    const result = await liveCommand(
      {
        stackPath,
        card: "Nobody",
        say: "hello",
        relayBaseUrl: "http://127.0.0.1:8787/v1",
        fetchImpl: fakeFetch({}),
      },
      { out: () => undefined, err: () => undefined },
    );
    expect(result.code).toBe(1);
    expect(result.reason).toContain("Nobody");
  });
});
