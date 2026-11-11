import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/gateway/canon";
import { CassetteCorrupt, CassetteGateway, cassetteFrom } from "../src/gateway/cassette";
import { CassetteMiss } from "../src/types";
import { makeRequest, textResponse, toolUseResponse } from "../src/testing/fake-model";

/** Une cassette vide et un signal jamais coupé, pour aller vite. */
const live = new AbortController().signal;

describe("cassette", () => {
  it("rend l'enregistrement qui correspond à l'empreinte", async () => {
    const cassette = new CassetteGateway();
    const request = makeRequest();
    cassette.record(request, textResponse("Hello there."));
    await expect(cassette.call(request, live)).resolves.toEqual(textResponse("Hello there."));
    expect(cassette.size).toBe(1);
  });

  it("lève CassetteMiss avec un message lisible en anglais quand rien n'est enregistré", async () => {
    const cassette = new CassetteGateway();
    const request = makeRequest({ system: "Nothing was ever recorded here." });
    const error = await cassette.call(request, live).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CassetteMiss);
    expect((error as CassetteMiss).fingerprint).toBe(cassette.fingerprintOf(request));
    expect((error as CassetteMiss).message).toBe(
      "No recording for this situation. Add an API key to go further.",
    );
  });

  it("se déclare en mode cassette", () => {
    expect(new CassetteGateway().mode).toBe("cassette");
  });

  it("retrouve un enregistrement malgré des identifiants d'outil différents", async () => {
    const cassette = new CassetteGateway();
    const recorded = makeRequest({
      messages: [
        {
          role: "assistant",
          blocks: [{ type: "tool_use", id: "toolu_01AAA", name: "reply", input: { text: "hi" } }],
        },
        { role: "user", blocks: [{ type: "tool_result", toolUseId: "toolu_01AAA", content: "ok" }] },
      ],
    });
    cassette.record(recorded, textResponse("done"));
    const replayed = makeRequest({
      messages: [
        {
          role: "assistant",
          blocks: [{ type: "tool_use", id: "toolu_99ZZZ", name: "reply", input: { text: "hi" } }],
        },
        { role: "user", blocks: [{ type: "tool_result", toolUseId: "toolu_99ZZZ", content: "ok" }] },
      ],
    });
    await expect(cassette.call(replayed, live)).resolves.toEqual(textResponse("done"));
  });

  it("exporte des entrées sérialisables en JSON, triées par empreinte", () => {
    const cassette = new CassetteGateway();
    cassette.record(makeRequest({ system: "b" }), textResponse("second"));
    cassette.record(makeRequest({ system: "a" }), textResponse("first"));
    const json = JSON.stringify(cassette.entries());
    const parsed = JSON.parse(json) as { fingerprint: string; purpose: string }[];
    expect(parsed).toHaveLength(2);
    expect(parsed.map((entry) => entry.fingerprint)).toEqual(
      [...parsed.map((entry) => entry.fingerprint)].sort(),
    );
    expect(parsed.every((entry) => entry.purpose === "agent-turn")).toBe(true);
  });

  it("se recharge depuis un export JSON", async () => {
    const first = new CassetteGateway();
    const request = makeRequest();
    first.record(request, toolUseResponse("reply", { text: "hi" }));
    const reloaded = cassetteFrom(JSON.parse(JSON.stringify(first.entries())));
    await expect(reloaded.call(request, live)).resolves.toEqual(
      toolUseResponse("reply", { text: "hi" }),
    );
  });

  it("verify() liste les empreintes périmées et les situations manquantes", () => {
    const cassette = new CassetteGateway();
    const stale = makeRequest({ system: "old rules" });
    const kept = makeRequest({ system: "current rules" });
    const missing = makeRequest({ system: "a button nobody recorded" });
    cassette.record(stale, textResponse("old"));
    cassette.record(kept, textResponse("kept"));
    const verdict = cassette.verify([kept, missing]);
    expect(verdict.stale).toEqual([cassette.fingerprintOf(stale)]);
    expect(verdict.missing).toEqual([cassette.fingerprintOf(missing)]);
    expect(cassette.verify([kept, missing, stale].map((r) => cassette.fingerprintOf(r)))).toEqual({
      stale: [],
      missing: [cassette.fingerprintOf(missing)],
    });
  });

  it("refuse un signal déjà coupé, sans lire la cassette", async () => {
    const controller = new AbortController();
    controller.abort();
    const cassette = new CassetteGateway();
    const request = makeRequest();
    cassette.record(request, textResponse("never"));
    await expect(cassette.call(request, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("signale un enregistrement illisible au lieu de rendre du vide", async () => {
    const request = makeRequest();
    const cassette = cassetteFrom([
      { fingerprint: cassetteFrom([]).fingerprintOf(request), purpose: request.purpose, response: { stop: "end" } },
    ]);
    await expect(cassette.call(request, live)).rejects.toBeInstanceOf(CassetteCorrupt);
  });

  it("isole l'enregistrement de la réponse passée (copie profonde)", async () => {
    const cassette = new CassetteGateway();
    const request = makeRequest();
    const response = textResponse("original");
    cassette.record(request, response);
    response.blocks = [{ type: "text", text: "mutated" }];
    await expect(cassette.call(request, live)).resolves.toEqual(textResponse("original"));
    expect(canonicalJson(await cassette.call(request, live))).toContain("original");
  });
});
