import { describe, expect, it } from "vitest";
import {
  errorExcerpt,
  fromOpenAiResponse,
  GatewayError,
  scrub,
  toOpenAiBody,
  toOpenAiMessages,
  type FetchLike,
} from "../src/gateway/http";
import { KeyGateway } from "../src/gateway/key";
import {
  RelayGateway,
  RELAY_ALLOWED_MODELS,
  RELAY_LIMITS,
} from "../src/gateway/relay";
import { CassetteMiss } from "../src/types";
import type { LlmRequest } from "../src/types";
import { fakeProvider, makeRequest, openAiReply, openAiToolCall } from "../src/testing/fake-model";

const KEY = "fake-test-key-not-a-real-secret";
const live = new AbortController().signal;

/** Une requête qui exerce tous les blocs et tous les schémas. */
const richRequest: LlmRequest = makeRequest({
  purpose: "write-script",
  speed: "careful",
  system: "Write a script.",
  maxOutputTokens: 1500,
  tools: [
    {
      name: "reply",
      description: "Answer the visitor",
      inputSchema: { type: "object", properties: { text: { type: "string" } } },
    },
  ],
  outputSchema: { type: "object", properties: { script: { type: "string" } } },
  messages: [
    { role: "user", blocks: [{ type: "text", text: "Write it." }] },
    {
      role: "assistant",
      blocks: [
        { type: "text", text: "Calling reply." },
        { type: "tool_use", id: "c1", name: "reply", input: { text: "hi" } },
      ],
    },
    {
      role: "user",
      blocks: [
        { type: "tool_result", toolUseId: "c1", content: "sent" },
        { type: "text", text: "thanks" },
      ],
    },
  ],
});

describe("traduction OpenAI-compatible", () => {
  it("construit un corps complet : modèle résolu, messages, outils, schéma", () => {
    const body = toOpenAiBody(richRequest);
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.max_tokens).toBe(1500);
    expect(body.messages[0]).toEqual({ role: "system", content: "Write a script." });
    expect(body.messages[1]).toEqual({
      role: "user",
      content: [{ type: "text", text: "Write it." }],
    });
    expect(body.messages[2]).toEqual({
      role: "assistant",
      content: "Calling reply.",
      tool_calls: [
        { id: "c1", type: "function", function: { name: "reply", arguments: '{"text":"hi"}' } },
      ],
    });
    expect(body.messages[3]).toEqual({ role: "tool", tool_call_id: "c1", content: "sent" });
    expect(body.messages[4]).toEqual({
      role: "user",
      content: [{ type: "text", text: "thanks" }],
    });
    expect(body.tools?.[0]).toEqual({
      type: "function",
      function: {
        name: "reply",
        description: "Answer the visitor",
        parameters: { type: "object", properties: { text: { type: "string" } } },
      },
    });
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: "write-script-output",
        strict: true,
        schema: { type: "object", properties: { script: { type: "string" } } },
      },
    });
  });

  it("marque un résultat d'outil en erreur et traduit la vitesse rapide", () => {
    const body = toOpenAiBody(
      makeRequest({
        messages: [
          { role: "user", blocks: [{ type: "tool_result", toolUseId: "c9", content: "boom", isError: true }] },
        ],
      }),
      { maxTokens: 900 },
    );
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.max_tokens).toBe(900);
    expect(body.messages[1]).toEqual({ role: "tool", tool_call_id: "c9", content: "Error: boom" });
    expect(toOpenAiMessages([])).toEqual([]);
  });

  it("lit texte, appels d'outils et usage d'une réponse", () => {
    const response = fromOpenAiResponse(
      openAiReply({
        text: "Here you go.",
        toolCalls: [openAiToolCall("reply", { text: "hi" }, "c2")],
        promptTokens: 42,
        completionTokens: 7,
      }),
    );
    expect(response).toEqual({
      stop: "tool_use",
      blocks: [
        { type: "text", text: "Here you go." },
        { type: "tool_use", id: "c2", name: "reply", input: { text: "hi" } },
      ],
      usage: { inputTokens: 42, outputTokens: 7 },
    });
  });

  it.each([
    ["stop", "end"],
    ["tool_calls", "tool_use"],
    ["length", "max_tokens"],
    ["content_filter", "refusal"],
  ])("traduit la raison d'arrêt %p en %p", (finish, stop) => {
    expect(fromOpenAiResponse(openAiReply({ finishReason: finish })).stop).toBe(stop);
  });

  it("traite un refus avant de lire le contenu", () => {
    const response = fromOpenAiResponse({
      stop_reason: "refusal",
      choices: [{ message: { role: "assistant", content: "I will not." } }],
      usage: { prompt_tokens: 3, completion_tokens: 2 },
    });
    expect(response.stop).toBe("refusal");
    expect(response.blocks).toEqual([]);
    expect(response.usage).toEqual({ inputTokens: 3, outputTokens: 2 });
  });

  it("refuse des arguments d'outil qui ne sont pas du JSON", () => {
    expect(() =>
      fromOpenAiResponse({
        choices: [
          { finish_reason: "tool_calls", message: { tool_calls: [{ id: "x", function: { name: "reply", arguments: "{oops" } }] } },
        ],
      }),
    ).toThrow(GatewayError);
  });

  it("rend un usage nul quand le fournisseur n'en donne pas", () => {
    expect(fromOpenAiResponse({ choices: [] }).usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});

describe("passerelle par clé personnelle", () => {
  it("se déclare en mode clé et poste vers /chat/completions", async () => {
    const provider = fakeProvider();
    const gateway = new KeyGateway({ apiKey: KEY, fetchImpl: provider.fetch });
    expect(gateway.mode).toBe("key");
    await gateway.call(makeRequest(), live);
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect(provider.calls[0].headers.authorization).toBe(`Bearer ${KEY}`);
    expect(provider.calls[0].headers["content-type"]).toBe("application/json");
  });

  it("transmet AbortSignal au transport", async () => {
    let seen: AbortSignal | undefined;
    const provider = fakeProvider();
    const fetchImpl: FetchLike = async (url, init) => {
      seen = init.signal;
      return provider.fetch(url, init);
    };
    const controller = new AbortController();
    await new KeyGateway({ apiKey: KEY, fetchImpl }).call(makeRequest(), controller.signal);
    expect(seen).toBe(controller.signal);
  });

  it("n'appelle rien quand le signal est déjà coupé", async () => {
    const provider = fakeProvider();
    const controller = new AbortController();
    controller.abort();
    const gateway = new KeyGateway({ apiKey: KEY, fetchImpl: provider.fetch });
    await expect(gateway.call(makeRequest(), controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(provider.calls).toHaveLength(0);
  });

  it("cite un refus du fournisseur sans jamais citer la clé", async () => {
    const provider = fakeProvider({
      replies: [{ status: 401, text: `Unauthorized for ${KEY}, invalid api_key ${KEY}` }],
    });
    const gateway = new KeyGateway({ apiKey: KEY, fetchImpl: provider.fetch });
    const error = await gateway.call(makeRequest(), live).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GatewayError);
    expect((error as GatewayError).status).toBe(401);
    expect((error as GatewayError).message).toContain("status 401");
    expect((error as GatewayError).message).toContain("Check the API key");
    expect((error as GatewayError).message).not.toContain(KEY);
    expect(JSON.stringify(gateway.exportState())).not.toContain(KEY);
  });

  it("rend une panne réseau lisible, sans la clé", async () => {
    const provider = fakeProvider({ replies: [{ fail: `socket hang up for ${KEY}` }] });
    const gateway = new KeyGateway({ apiKey: KEY, fetchImpl: provider.fetch });
    await expect(gateway.call(makeRequest(), live)).rejects.toThrow(/could not be reached/);
    const error = await gateway.call(makeRequest(), live).catch((caught: unknown) => caught);
    expect((error as Error).message).not.toContain(KEY);
  });

  it("signale une réponse qui n'est pas du JSON", async () => {
    const provider = fakeProvider({ replies: [{ text: "<html>gateway</html>" }] });
    const gateway = new KeyGateway({ apiKey: KEY, fetchImpl: provider.fetch });
    await expect(gateway.call(makeRequest(), live)).rejects.toThrow(/not JSON/);
  });

  it("nettoie les secrets des textes cités", () => {
    expect(scrub(`key ${KEY} here`, [KEY])).toBe("key *** here");
    expect(errorExcerpt(`a\n\n${KEY}`, [KEY])).toBe("a ***");
  });
});

describe("passerelle par relais", () => {
  it("applique le plafond de longueur et la liste fermée de modèles", async () => {
    const provider = fakeProvider();
    const relay = new RelayGateway({
      apiKey: KEY,
      baseUrl: "https://relay.test/v1",
      fetchImpl: provider.fetch,
    });
    expect(relay.mode).toBe("relay");
    expect(RELAY_ALLOWED_MODELS).toContain("claude-haiku-5-5");
    await relay.call(makeRequest({ maxOutputTokens: 5000 }), live);
    expect(provider.calls[0].url).toBe("https://relay.test/v1/chat/completions");
    expect((provider.calls[0].body as { max_tokens: number }).max_tokens).toBe(
      RELAY_LIMITS.maxOutputTokens,
    );
    await relay.call(makeRequest({ maxOutputTokens: 300 }), live);
    expect((provider.calls[1].body as { max_tokens: number }).max_tokens).toBe(300);
  });

  it("replie en CassetteMiss sur un modèle hors liste, sans appel", async () => {
    const provider = fakeProvider();
    const relay = new RelayGateway({
      apiKey: KEY,
      fetchImpl: provider.fetch,
      allowedModels: ["claude-opus-5-5"],
    });
    await expect(relay.call(makeRequest(), live)).rejects.toBeInstanceOf(CassetteMiss);
    expect(provider.calls).toHaveLength(0);
  });

  it("replie en CassetteMiss une fois le budget de session atteint", async () => {
    const provider = fakeProvider({ replies: [{ json: openAiReply({ promptTokens: 50 }) }] });
    const relay = new RelayGateway({
      apiKey: KEY,
      fetchImpl: provider.fetch,
      limits: { sessionInputTokens: 100 },
    });
    await relay.call(makeRequest(), live);
    await relay.call(makeRequest(), live);
    await expect(relay.call(makeRequest(), live)).rejects.toBeInstanceOf(CassetteMiss);
    expect(relay.counters().sessionInputTokens).toBe(100);
    expect(relay.counters().sessionTurns).toBe(2);
    relay.resetSession();
    await expect(relay.call(makeRequest(), live)).resolves.toBeTruthy();
  });

  it("compte les tours de la session", async () => {
    const provider = fakeProvider();
    const relay = new RelayGateway({
      apiKey: KEY,
      fetchImpl: provider.fetch,
      limits: { sessionTurns: 1 },
    });
    await relay.call(makeRequest(), live);
    await expect(relay.call(makeRequest(), live)).rejects.toBeInstanceOf(CassetteMiss);
  });

  it("replie en CassetteMiss au plafond journalier, puis repart le lendemain", async () => {
    let nowMs = 1_700_000_000_000;
    const provider = fakeProvider({ replies: [{ json: openAiReply({ promptTokens: 50 }) }] });
    const relay = new RelayGateway({
      apiKey: KEY,
      fetchImpl: provider.fetch,
      limits: { dailyInputTokens: 100 },
      now: () => nowMs,
    });
    await relay.call(makeRequest(), live);
    await relay.call(makeRequest(), live);
    await expect(relay.call(makeRequest(), live)).rejects.toBeInstanceOf(CassetteMiss);
    nowMs += 86_400_000;
    await expect(relay.call(makeRequest(), live)).resolves.toBeTruthy();
    expect(relay.counters().dailyInputTokens).toBe(50);
  });

  it("n'exporte ni la clé ni les compteurs de session (CAR-P-22)", async () => {
    const provider = fakeProvider();
    const relay = new RelayGateway({ apiKey: KEY, fetchImpl: provider.fetch, now: () => 0 });
    await relay.call(makeRequest(), live);
    expect(relay.counters().sessionTurns).toBe(1);
    const exported = JSON.stringify(relay.exportState());
    expect(exported).not.toContain(KEY);
    expect(exported).not.toContain("sessionTurns");
    expect(exported).not.toContain("dailyInputTokens");
    expect(exported).toContain("relay");
  });
});
