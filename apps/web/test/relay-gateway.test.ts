/**
 * Tests de la passerelle du relais (7.11) : sans réseau et sans jsdom — le
 * `fetch` est injecté, et rien n'ouvre de connexion.
 *
 * Ce que ces tests verrouillent :
 * - la cause d'échec lue sur le statut du relais (plafond, injoignable,
 *   refus) ;
 * - la passerelle qui retient sa dernière cause d'échec, et l'oublie après
 *   un appel réussi.
 */
import { describe, expect, it } from "vitest";
import { GatewayError } from "@cardwake/agent";
import type { LlmGateway, LlmRequest } from "@cardwake/agent";
import { createRelayGateway, failureOf, relayFailureOf } from "../src/engine/relay-gateway";

/** Une réponse OpenAI minimale, telle que le relais la renvoie. */
const ANSWER = JSON.stringify({
  choices: [{ message: { content: "The relay answers." }, finish_reason: "stop" }],
  usage: { prompt_tokens: 5, completion_tokens: 2 },
});

/** Une requête d'agent minimale, dans le contrat du paquet `agent`. */
const REQUEST: LlmRequest = {
  purpose: "agent-turn",
  speed: "fast",
  system: "You are the guard of the manor.",
  messages: [{ role: "user", blocks: [{ type: "text", text: "Who goes there?" }] }],
  maxOutputTokens: 64,
};

/** Un `fetch` qui répond `200` avec le corps donné. */
function answering(body: string) {
  return async () => ({ ok: true, status: 200, text: async () => body });
}

/** Un `fetch` qui répond avec le statut donné. */
function refusing(status: number) {
  return async () => ({ ok: false, status, text: async () => "nope" });
}

describe("la cause d'échec du relais", () => {
  it("lit 429 comme un plafond atteint", () => {
    expect(failureOf(new GatewayError("limit", 429))).toBe("limit");
  });

  it("lit 502, 503 et 504 comme un relais qui ne répond pas", () => {
    expect(failureOf(new GatewayError("provider down", 502))).toBe("unreachable");
    expect(failureOf(new GatewayError("unavailable", 503))).toBe("unreachable");
    expect(failureOf(new GatewayError("timeout", 504))).toBe("unreachable");
  });

  it("lit les autres statuts comme un refus", () => {
    expect(failureOf(new GatewayError("model denied", 403))).toBe("refused");
    expect(failureOf(new GatewayError("bad request", 400))).toBe("refused");
    expect(failureOf(new GatewayError("server", 500))).toBe("refused");
  });

  it("lit une panne réseau comme un relais qui ne répond pas", () => {
    expect(failureOf(new TypeError("Failed to fetch"))).toBe("unreachable");
  });
});

describe("la passerelle du relais", () => {
  it("retient sa cause d'échec, puis l'oublie après un appel réussi", async () => {
    const gateway = createRelayGateway({
      baseUrl: "http://127.0.0.1:8787",
      fetchImpl: refusing(429),
    });
    await expect(gateway.call(REQUEST, AbortSignal.timeout(1000))).rejects.toThrow();
    expect(gateway.lastFailure).toBe("limit");
    expect(relayFailureOf(gateway)).toBe("limit");

    const working = createRelayGateway({
      baseUrl: "http://127.0.0.1:8787",
      fetchImpl: answering(ANSWER),
    });
    const response = await working.call(REQUEST, AbortSignal.timeout(1000));
    expect(response.blocks).toHaveLength(1);
    expect(working.lastFailure).toBeNull();
    expect(relayFailureOf(working)).toBeNull();
  });

  it("une cassette n'a pas de cause d'échec : le pont ne confond pas", () => {
    const cassette: LlmGateway = {
      mode: "cassette",
      call: async () => ({ stop: "end", blocks: [], usage: { inputTokens: 0, outputTokens: 0 } }),
    };
    expect(relayFailureOf(cassette)).toBeNull();
  });
});
