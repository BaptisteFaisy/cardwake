import { describe, expect, it } from "vitest";
import { CassetteGateway } from "../src/gateway/cassette";
import { GatewayError } from "../src/gateway/http";
import { createRouter, GatewayRouter } from "../src/gateway/router";
import { CassetteMiss } from "../src/types";
import type { LlmGateway, LlmRequest, LlmResponse } from "../src/types";
import {
  fakeProvider,
  FakeModel,
  makeRequest,
  openAiReply,
  textResponse,
} from "../src/testing/fake-model";

const KEY = "sk-router-secret-key";
const live = new AbortController().signal;

/** Une passerelle de test qui échoue comme on veut. */
function failingGateway(error: unknown, mode: LlmGateway["mode"] = "relay"): LlmGateway {
  return {
    mode,
    async call(_request: LlmRequest, _signal: AbortSignal): Promise<LlmResponse> {
      throw error;
    },
  };
}

describe("routeur de passerelle", () => {
  it("choisit le mode enregistré par défaut", async () => {
    const router = createRouter();
    expect(router.mode).toBe("cassette");
    expect(router.usesCassetteOnly).toBe(true);
    const request = makeRequest();
    router.cassette.record(request, textResponse("recorded"));
    await expect(router.call(request, live)).resolves.toEqual(textResponse("recorded"));
  });

  it("dit clairement, en anglais, quand un enregistrement manque", async () => {
    const error = await createRouter()
      .call(makeRequest(), live)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CassetteMiss);
    expect((error as CassetteMiss).message).toBe(
      "No recording for this situation. Add an API key to go further.",
    );
  });

  it("revient à la cassette quand aucune clé n'est renseignée", () => {
    const router = createRouter({ mode: "key" });
    expect(router.mode).toBe("key");
    expect(router.usesCassetteOnly).toBe(true);
  });

  it("part du navigateur avec la clé personnelle en mode clé", async () => {
    const provider = fakeProvider({ replies: [{ json: openAiReply({ text: "from the key" }) }] });
    const router = createRouter({ mode: "key", apiKey: KEY, fetchImpl: provider.fetch });
    expect(router.usesCassetteOnly).toBe(false);
    await expect(router.call(makeRequest(), live)).resolves.toEqual(
      expect.objectContaining({ blocks: [{ type: "text", text: "from the key" }] }),
    );
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].headers.authorization).toBe(`Bearer ${KEY}`);
  });

  it("passe par le relais, avec ses plafonds, en mode relais", async () => {
    const provider = fakeProvider();
    const router = createRouter({
      mode: "relay",
      apiKey: KEY,
      baseUrl: "https://relay.test/v1",
      fetchImpl: provider.fetch,
      relayLimits: { maxOutputTokens: 800 },
    });
    await router.call(makeRequest({ maxOutputTokens: 5000 }), live);
    expect(provider.calls[0].url).toBe("https://relay.test/v1/chat/completions");
    expect((provider.calls[0].body as { max_tokens: number }).max_tokens).toBe(800);
  });

  it("replie sur la cassette quand le relais a atteint son plafond", async () => {
    const provider = fakeProvider();
    const cassette = new CassetteGateway();
    const request = makeRequest();
    cassette.record(request, textResponse("recorded"));
    const router = new GatewayRouter(
      { mode: "relay", apiKey: KEY, fetchImpl: provider.fetch, relayLimits: { sessionTurns: 0 } },
      cassette,
    );
    await expect(router.call(request, live)).resolves.toEqual(textResponse("recorded"));
    expect(provider.calls).toHaveLength(0);
  });

  it("laisse remonter CassetteMiss quand la cassette n'a rien non plus", async () => {
    const provider = fakeProvider();
    const router = new GatewayRouter(
      { mode: "relay", apiKey: KEY, fetchImpl: provider.fetch, relayLimits: { sessionTurns: 0 } },
      new CassetteGateway(),
    );
    await expect(router.call(makeRequest(), live)).rejects.toBeInstanceOf(CassetteMiss);
  });

  it("ne masque pas une vraie panne du fournisseur", async () => {
    const router = new GatewayRouter(
      { mode: "key" },
      new CassetteGateway(),
      failingGateway(new GatewayError("The model provider refused the call (status 500).", 500)),
    );
    await expect(router.call(makeRequest(), live)).rejects.toBeInstanceOf(GatewayError);
  });

  it("accepte une passerelle injectée, par exemple le faux modèle", async () => {
    const fake = new FakeModel({ responses: [textResponse("fake")] });
    const router = new GatewayRouter({ mode: "key" }, new CassetteGateway(), fake);
    await expect(router.call(makeRequest(), live)).resolves.toEqual(textResponse("fake"));
    expect(fake.callCount).toBe(1);
  });

  it("n'exporte ni la clé ni les compteurs de session (CAR-P-22)", async () => {
    const provider = fakeProvider();
    const router = createRouter({ mode: "relay", apiKey: KEY, fetchImpl: provider.fetch });
    router.cassette.record(makeRequest(), textResponse("kept"));
    await router.call(makeRequest({ system: "not recorded" }), live).catch(() => undefined);
    const exported = JSON.stringify(router.exportState());
    expect(exported).not.toContain(KEY);
    expect(exported).not.toContain("sessionTurns");
    expect(exported).toContain("kept");
    expect(JSON.parse(exported).mode).toBe("relay");
  });
});
