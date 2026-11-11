/**
 * Propriétés de la passerelle, générées avec fast-check.
 *
 * - CAR-P-19 : l'empreinte ne dépend pas de l'ordre des clés, et change dès que
 *   la consigne, un message ou un schéma d'outil change.
 * - CAR-P-20 : en mode enregistré, une même suite d'actions sur une même pile
 *   donne les mêmes transactions.
 * - CAR-P-22 : aucun fichier exporté ne contient la clé ni les compteurs de
 *   session.
 *
 * Aucun appel réseau réel : le fournisseur est simulé (`fakeProvider`).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalJson, fingerprint } from "../src/gateway/canon";
import { CassetteGateway } from "../src/gateway/cassette";
import { KeyGateway } from "../src/gateway/key";
import { RelayGateway } from "../src/gateway/relay";
import { createRouter, GatewayRouter } from "../src/gateway/router";
import type { LlmBlock, LlmMessage, LlmRequest, ToolName, ToolSchema } from "../src/types";
import {
  FakeModel,
  fakeProvider,
  forbiddenToolsFor,
  isToolAllowed,
  makeRequest,
  openAiReply,
  textResponse,
} from "../src/testing/fake-model";

/** Nombre de tirages : `CARDWAKE_PROP_RUNS`, défaut 100. */
const RUNS = { numRuns: Number(process.env.CARDWAKE_PROP_RUNS ?? 100) };

const live = new AbortController().signal;

// --------------------------------------------------------------------------
// Générateurs
// --------------------------------------------------------------------------

/** Un schéma JSON strict, avec assez de clés pour que l'ordre compte. */
const schemaArb: fc.Arbitrary<Record<string, unknown>> = fc
  .record({
    label: fc.string({ maxLength: 6 }),
    min: fc.integer({ min: 0, max: 99 }),
    strict: fc.boolean(),
  })
  .map(({ label, min, strict }) => ({
    type: "object",
    additionalProperties: false,
    properties: {
      label: { type: "string", description: label },
      min: { type: "integer", minimum: min },
      strict: { type: "boolean", flag: strict },
    },
  }));

const toolArb: fc.Arbitrary<ToolSchema> = fc.record({
  name: fc.constantFrom("reply", "write_field", "go_to_card", "propose_script"),
  description: fc.string({ maxLength: 12 }),
  inputSchema: schemaArb,
});

const textBlockArb: fc.Arbitrary<LlmBlock> = fc
  .string({ maxLength: 12 })
  .map((text): LlmBlock => ({ type: "text", text }));

const messageArb: fc.Arbitrary<LlmMessage> = fc.record({
  role: fc.constantFrom("user" as const, "assistant" as const),
  blocks: fc.array(textBlockArb, { minLength: 1, maxLength: 3 }),
});

const requestArb: fc.Arbitrary<LlmRequest> = fc.record({
  purpose: fc.constantFrom("agent-turn" as const, "write-script" as const, "repair-script" as const),
  speed: fc.constantFrom("fast" as const, "careful" as const),
  system: fc.string({ maxLength: 20 }),
  messages: fc.array(messageArb, { minLength: 0, maxLength: 4 }),
  tools: fc.array(toolArb, { minLength: 0, maxLength: 3 }),
  outputSchema: fc.option(schemaArb, { nil: undefined }),
  maxOutputTokens: fc.integer({ min: 1, max: 8000 }),
});

/** Une clé plausible, assez longue pour ne pas apparaître par hasard. */
const apiKeyArb = fc
  .string({ minLength: 12, maxLength: 24 })
  .map((raw) => `sk-test-${raw.replace(/[^\w-]/g, "x")}`);

/** Même valeur, clés des objets dans l'ordre inverse. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (typeof value !== "object" || value === null) return value;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).reverse()) out[key] = reverseKeys(source[key]);
  return out;
}

/** Change vraiment la consigne, un message ou un schéma d'outil. */
function mutate(
  request: LlmRequest,
  target: "system" | "message" | "tool",
  delta: string,
): LlmRequest {
  if (target === "system") return { ...request, system: `${request.system}${delta}` };
  if (target === "message") {
    const added: LlmMessage = { role: "user", blocks: [{ type: "text", text: delta }] };
    return { ...request, messages: [...request.messages, added] };
  }
  const added: ToolSchema = { name: "reply", description: delta, inputSchema: { type: "object" } };
  return { ...request, tools: [...(request.tools ?? []), added] };
}

// --------------------------------------------------------------------------
// CAR-P-19 — empreinte
// --------------------------------------------------------------------------

describe("CAR-P-19 — empreinte", () => {
  it("ne dépend pas de l'ordre des clés", () => {
    fc.assert(
      fc.property(requestArb, (request) => {
        const shuffled = reverseKeys(request) as LlmRequest;
        expect(fingerprint(shuffled)).toBe(fingerprint(request));
        expect(canonicalJson(shuffled)).toBe(canonicalJson(request));
      }),
      RUNS,
    );
  });

  it("change dès que la consigne, un message ou un schéma d'outil change", () => {
    fc.assert(
      fc.property(
        requestArb,
        fc.constantFrom("system" as const, "message" as const, "tool" as const),
        fc.string({ minLength: 1, maxLength: 5 }),
        (request, target, delta) => {
          expect(fingerprint(mutate(request, target, delta))).not.toBe(fingerprint(request));
        },
      ),
      RUNS,
    );
  });

  it("change avec la vitesse, puisque la vitesse choisit le modèle", () => {
    fc.assert(
      fc.property(requestArb, (request) => {
        const other: LlmRequest = {
          ...request,
          speed: request.speed === "fast" ? "careful" : "fast",
        };
        expect(fingerprint(other)).not.toBe(fingerprint(request));
      }),
      RUNS,
    );
  });

  it("ignore les identifiants d'outil, générés par le modèle", () => {
    const withId = (id: string): LlmRequest =>
      makeRequest({
        messages: [
          {
            role: "assistant",
            blocks: [{ type: "tool_use", id, name: "reply", input: { text: "hi" } }],
          },
          { role: "user", blocks: [{ type: "tool_result", toolUseId: id, content: "ok" }] },
        ],
      });
    expect(fingerprint(withId("toolu_01AAA"))).toBe(fingerprint(withId("toolu_99ZZZ")));
  });
});

// --------------------------------------------------------------------------
// CAR-P-20 — rejeu
// --------------------------------------------------------------------------

const actionArb = fc.record({
  label: fc.string({ maxLength: 8 }),
  choice: fc.integer({ min: 0, max: 4 }),
});

type Action = { label: string; choice: number };

/** Une pile : chaque bouton donne une requête, donc une situation enregistrée. */
function stackRequests(actions: readonly Action[]): LlmRequest[] {
  return actions.map((action, index) =>
    makeRequest({
      system: `Stack rules, button ${action.choice}`,
      messages: [{ role: "user", blocks: [{ type: "text", text: `${action.label}#${index}` }] }],
    }),
  );
}

describe("CAR-P-20 — rejeu", () => {
  it("une même suite d'actions sur une même pile donne les mêmes transactions", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(actionArb, { minLength: 1, maxLength: 6 }), async (actions) => {
        const requests = stackRequests(actions);
        const cassette = new CassetteGateway();
        const expected = requests.map((request, index) => {
          const response = textResponse(`transaction ${index}`);
          cassette.record(request, response);
          return canonicalJson(response);
        });
        const replay = async (): Promise<string[]> => {
          const router = createRouter({ mode: "cassette" }, cassette.entries());
          const out: string[] = [];
          for (const request of requests) {
            out.push(canonicalJson(await router.call(request, live)));
          }
          return out;
        };
        expect(await replay()).toEqual(expected);
        expect(await replay()).toEqual(await replay());
      }),
      RUNS,
    );
  });

  it("un texte libre hors enregistrement le dit, sans inventer de réponse", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 20 }), async (freeText) => {
        const router = createRouter({ mode: "cassette" }, []);
        const error = await router
          .call(makeRequest({ messages: [{ role: "user", blocks: [{ type: "text", text: freeText }] }] }), live)
          .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("No recording for this situation");
      }),
      RUNS,
    );
  });
});

// --------------------------------------------------------------------------
// CAR-P-22 — rien de secret dans l'export
// --------------------------------------------------------------------------

/** Aucune forme de compteur de session ne doit passer dans un export. */
const SESSION_FIELDS = [
  "sessionTurns",
  "sessionInputTokens",
  "dailyInputTokens",
  "turnsUsed",
  "inputTokensUsed",
];

describe("CAR-P-22 — rien de secret dans l'export", () => {
  it("ni la clé, ni les compteurs de session", async () => {
    await fc.assert(
      fc.asyncProperty(apiKeyArb, fc.integer({ min: 1, max: 3 }), async (apiKey, turns) => {
        const provider = fakeProvider({ replies: [{ json: openAiReply({ promptTokens: 77 }) }] });
        const relay = new RelayGateway({ apiKey, fetchImpl: provider.fetch, now: () => 0 });
        const key = new KeyGateway({ apiKey, fetchImpl: provider.fetch });
        const cassette = new CassetteGateway();
        const router = new GatewayRouter({ mode: "relay" }, cassette, relay);
        for (let index = 0; index < turns; index += 1) {
          await router.call(makeRequest({ system: `turn ${index}` }), live);
        }
        // Les compteurs existent bien : c'est eux que l'export doit taire.
        expect(relay.counters().sessionTurns).toBe(turns);
        expect(relay.counters().sessionInputTokens).toBe(77 * turns);
        cassette.record(makeRequest(), textResponse("kept"));
        const exported = JSON.stringify({
          router: router.exportState(),
          relay: relay.exportState(),
          key: key.exportState(),
          cassette: cassette.entries(),
        });
        expect(exported).not.toContain(apiKey);
        for (const field of SESSION_FIELDS) expect(exported).not.toContain(field);
      }),
      RUNS,
    );
  });

  it("un export de cassette se recharge sans secret et rejoue à l'identique", async () => {
    await fc.assert(
      fc.asyncProperty(requestArb, async (request) => {
        const cassette = new CassetteGateway();
        cassette.record(request, textResponse("kept"));
        const exported = JSON.stringify(cassette.entries());
        const reloaded = new CassetteGateway({ entries: JSON.parse(exported) });
        const router = createRouter({ mode: "cassette" }, reloaded.entries());
        await expect(router.call(request, live)).resolves.toEqual(textResponse("kept"));
        expect(exported).toContain(cassette.fingerprintOf(request));
      }),
      RUNS,
    );
  });
});

// --------------------------------------------------------------------------
// Le faux adversaire, prêt pour CAR-P-11 et CAR-P-12
// --------------------------------------------------------------------------

describe("faux modèle adversaire (outils pour CAR-P-11/12)", () => {
  it("connaît les outils interdits à un niveau", () => {
    expect(forbiddenToolsFor(1)).toContain("delete_part");
    expect(forbiddenToolsFor(1)).not.toContain("reply");
    expect(forbiddenToolsFor(5)).toEqual([]);
    expect(isToolAllowed("propose_script", 4)).toBe(false);
  });

  it("appelle un outil interdit et vise une carte d'un autre agent", async () => {
    const fake = new FakeModel({
      adversary: { level: 1, foreignCards: ["carte-de-marie"] },
    });
    const response = await fake.call(makeRequest(), live);
    expect(response.stop).toBe("tool_use");
    const block = response.blocks[0] as { type: string; name: string; input: Record<string, unknown> };
    expect(block.type).toBe("tool_use");
    expect(isToolAllowed(block.name as ToolName, 1)).toBe(false);
    expect(block.input.card).toBe("carte-de-marie");
    expect(fake.callCount).toBe(1);
  });

  it("joue une liste de réponses dans l'ordre, puis la réponse par défaut", async () => {
    const fake = new FakeModel({ responses: [textResponse("one"), textResponse("two")] });
    expect((await fake.call(makeRequest(), live)).blocks[0]).toEqual({ type: "text", text: "one" });
    expect((await fake.call(makeRequest(), live)).blocks[0]).toEqual({ type: "text", text: "two" });
    expect((await fake.call(makeRequest(), live)).blocks[0]).toEqual({ type: "text", text: "" });
    expect(fake.callCount).toBe(3);
    fake.reset();
    expect(fake.callCount).toBe(0);
  });

  it("répond par une fonction, de façon déterministe", async () => {
    const fake = new FakeModel({
      respond: (request, index) => textResponse(`${index}:${request.system}`),
    });
    const response = await fake.call(makeRequest({ system: "rules" }), live);
    expect(response).toEqual(textResponse("0:rules"));
  });
});
