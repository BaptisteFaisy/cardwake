/**
 * La boucle d'un tour, de bout en bout : faux modèle programmable, VRAI hôte
 * (donc vrais droits, vrai journal). Aucun appel réseau (CAR-N-09).
 *
 * Couvert : réponse simple, écriture dans un champ, message à une autre carte,
 * max_tokens et refusal, erreur / délai / annulation, plafond d'itérations,
 * budgets épuisés, proposition de script et cassette manquante.
 */

import { describe, expect, it } from "vitest";
import type { LlmGateway, LlmResponse } from "../src/types";
import { CassetteGateway } from "../src/gateway/cassette";
import { runAgentTurn } from "../src/loop";
import {
  FAKE_USAGE,
  FakeModel,
  textResponse,
  toolUseResponse,
} from "../src/testing/fake-model";
import { settings } from "./fixtures";
import { harness, stackAtLevel, toolResultsOf, turnRequest } from "./harness";

const REPLY = toolUseResponse("reply", { text: "Hello back." }, "c1");

describe("runAgentTurn — tours normaux", () => {
  it("un tour simple répond, avec seulement les outils du niveau", async () => {
    const model = new FakeModel({ responses: [REPLY, textResponse("")] });
    const h = harness(model, { level: 3 });
    const outcome = await runAgentTurn(turnRequest(), h.ctx);
    expect(outcome.reply).toBe("Hello back.");
    expect(outcome.stop).toBe("end");
    expect(outcome.refusal).toBeUndefined();
    expect(outcome.iterations).toBe(2);
    expect(outcome.usage).toEqual({ inputTokens: 2, outputTokens: 2, calls: 2 });
    // Niveau 3 : reply, send_message, write_field, set_appearance — et rien d'autre.
    expect(model.requests[0].tools?.map((tool) => tool.name)).toEqual([
      "reply",
      "send_message",
      "write_field",
      "set_appearance",
    ]);
    expect(model.requests[0].maxOutputTokens).toBe(settings().agentMaxOutputTokens);
  });

  it("écrit dans un champ de sa carte puis répond", async () => {
    const model = new FakeModel({
      responses: [
        toolUseResponse("write_field", { field: "Mood", text: "hungry", mode: "replace" }, "c1"),
        toolUseResponse("reply", { text: "Noted." }, "c2"),
        textResponse(""),
      ],
    });
    const h = harness(model);
    const outcome = await runAgentTurn(turnRequest(), h.ctx);
    const mood = h.host.stack.cards[0].parts.find((part) => part.name === "Mood");
    expect(mood?.kind === "field" && mood.text).toBe("hungry");
    expect(outcome.reply).toBe("Noted.");
    // La ligne de Murmur équivalente est tracée dans le résultat renvoyé.
    const results = toolResultsOf(model);
    expect(results[0]).toMatchObject({
      content: 'put "hungry" into field "Mood"',
      isError: false,
    });
  });

  it("envoie un message à une autre carte via host.tell", async () => {
    const model = new FakeModel({
      responses: [
        toolUseResponse("send_message", { to_card: "Pantry", text: "Need beans." }, "c1"),
        toolUseResponse("reply", { text: "Asked Pantry." }, "c2"),
        textResponse(""),
      ],
    });
    const h = harness(model);
    const outcome = await runAgentTurn(turnRequest(), h.ctx);
    expect(h.sent).toEqual([
      { name: "message", args: ["Need beans."], target: { kind: "card", cardId: 2 } },
    ]);
    expect(outcome.reply).toBe("Asked Pantry.");
    expect(toolResultsOf(model)[0].content).toBe(
      'tell agent of card "Pantry" "Need beans."',
    );
  });
});

describe("runAgentTurn — arrêts anormaux, toujours lisibles", () => {
  it("max_tokens : le tour s'arrête et le dit", async () => {
    const model = new FakeModel({
      responses: [
        { stop: "max_tokens", blocks: [{ type: "text", text: "I was sayi" }], usage: FAKE_USAGE },
      ],
    });
    const h = harness(model);
    const outcome = await runAgentTurn(turnRequest(), h.ctx);
    expect(outcome.stop).toBe("max_tokens");
    expect(outcome.reply).toBe("I was sayi");
    expect(outcome.refusal).toMatch(/ran out of output tokens/);
    expect(model.callCount).toBe(1);
  });

  it("refusal : la raison du modèle remonte", async () => {
    const model = new FakeModel({
      responses: [
        { stop: "refusal", blocks: [{ type: "text", text: "I will not." }], usage: FAKE_USAGE },
      ],
    });
    const h = harness(model);
    const outcome = await runAgentTurn(turnRequest(), h.ctx);
    expect(outcome.stop).toBe("refusal");
    expect(outcome.refusal).toBe("I will not.");
    expect(model.callCount).toBe(1);
  });

  it("erreur de passerelle : le tour s'arrête, sans exception technique", async () => {
    const model = new FakeModel({
      respond: () => {
        throw new Error("boom");
      },
    });
    const h = harness(model);
    const outcome = await runAgentTurn(turnRequest(), h.ctx);
    expect(outcome.refusal).toBe("The model call failed: boom");
    expect(outcome.iterations).toBe(0);
    expect(outcome.reply).toBe("");
  });

  it("délai dépassé : le tour s'arrête et le dit", async () => {
    const inner = new FakeModel();
    // Enveloppe le faux modèle d'un délai plus long que le délai du tour.
    const slow: LlmGateway = {
      mode: inner.mode,
      async call(request, signal): Promise<LlmResponse> {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return inner.call(request, signal);
      },
    };
    const h = harness(slow, { settings: settings({ agentTimeoutMs: 10 }) });
    const outcome = await runAgentTurn(turnRequest(), h.ctx);
    expect(outcome.refusal).toMatch(/ran out of time/);
    expect(outcome.iterations).toBe(0);
  });

  it("annulation par l'appelant : le tour s'arrête et le dit", async () => {
    const model = new FakeModel({ responses: [textResponse("never")] });
    const h = harness(model, { signal: AbortSignal.abort() });
    const outcome = await runAgentTurn(turnRequest(), h.ctx);
    expect(outcome.refusal).toMatch(/aborted/);
    expect(model.callCount).toBe(0);
  });

  it("cassette manquante : résultat lisible en anglais, pas d'exception", async () => {
    const h = harness(new CassetteGateway());
    const outcome = await runAgentTurn(turnRequest(), h.ctx);
    expect(outcome.refusal).toBe(
      "No recording for this situation. Add an API key to go further.",
    );
    expect(outcome.iterations).toBe(0);
  });
});

describe("runAgentTurn — plafonds et budgets", () => {
  it("le plafond d'itérations est respecté", async () => {
    const model = new FakeModel({
      respond: (_request, index) =>
        toolUseResponse(
          "write_field",
          { field: "Mood", text: `tick ${index}`, mode: "replace" },
          `c-${index}`,
        ),
    });
    const h = harness(model, { settings: settings({ agentMaxIterations: 3 }) });
    const outcome = await runAgentTurn(turnRequest(), h.ctx);
    expect(model.callCount).toBe(3);
    expect(outcome.iterations).toBe(3);
    expect(outcome.refusal).toMatch(/iteration limit/);
  });

  it("budget de session épuisé : plus AUCUN appel à la passerelle", async () => {
    const model = new FakeModel({ responses: [textResponse("never sent")] });
    const h = harness(model, { settings: settings({ agentTurnsPerSession: 0 }) });
    const outcome = await runAgentTurn(turnRequest(), h.ctx);
    expect(model.callCount).toBe(0);
    expect(outcome.iterations).toBe(0);
    expect(outcome.usage.calls).toBe(0);
    expect(outcome.refusal).toMatch(/Session budget exhausted/);
  });

  it("budget de session en cours de tour : la passerelle n'est plus rappelée", async () => {
    const model = new FakeModel({
      respond: (_request, index) =>
        toolUseResponse("reply", { text: `again ${index}` }, `c-${index}`),
    });
    const h = harness(model, { settings: settings({ agentTurnsPerSession: 2 }) });
    const outcome = await runAgentTurn(turnRequest(), h.ctx);
    expect(model.callCount).toBe(2);
    expect(outcome.refusal).toMatch(/Session budget exhausted/);
  });
});

describe("runAgentTurn — propose_script ne modifie rien", () => {
  it("rend une proposition en attente d'acceptation humaine", async () => {
    const script = 'on mouseUp\n  put "served" into field "Mood"\nend mouseUp';
    const model = new FakeModel({
      responses: [
        toolUseResponse(
          "propose_script",
          { object: "Serve", script, explanation: "Marks dinner as served." },
          "c1",
        ),
        toolUseResponse("reply", { text: "Proposed." }, "c2"),
        textResponse(""),
      ],
    });
    const h = harness(model, { stack: stackAtLevel(5), level: 5 });
    const before = JSON.stringify(h.stack);
    const outcome = await runAgentTurn(turnRequest(), h.ctx);
    expect(outcome.proposal).toEqual({
      object: "Serve",
      script,
      explanation: "Marks dinner as served.",
    });
    // Rien n'a bougé : la pile est intacte et aucun refus n'a été nécessaire.
    expect(JSON.stringify(h.host.stack)).toBe(before);
    expect(h.host.lastRefusals).toHaveLength(0);
    expect(toolResultsOf(model)[0].content).toBe(
      'Proposed script for button "Serve" (awaiting acceptance)',
    );
  });
});
