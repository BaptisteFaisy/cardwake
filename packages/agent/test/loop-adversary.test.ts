/**
 * L'adversaire (CAR-P-11, CAR-P-12) : un faux modèle qui demande à CHAQUE tour
 * des outils interdits par son niveau et vise ce qui n'est pas à lui.
 *
 * Le contrat : le garde refuse, le tour continue, et rien ne bouge — ni la
 * pile hors droits, ni un niveau, ni une consigne, ni un état d'éveil, ni un
 * budget. Les cinq niveaux, en propriété fast-check, tirages bornés par
 * `CARDWAKE_PROP_RUNS`. Aucun réseau (CAR-N-09).
 */

import type { AgentLevel, Stack } from "@cardwake/model";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { runAgentTurn } from "../src/loop";
import { toolsForLevel } from "../src/tools";
import {
  FAKE_USAGE,
  FakeModel,
  forbiddenToolsFor,
  textResponse,
  toolUseResponse,
} from "../src/testing/fake-model";
import type { LlmResponse, ToolName } from "../src/types";
import { field, settings } from "./fixtures";
import { harness, stackAtLevel, toolResultsOf, turnRequest } from "./harness";

/** Nombre de tirages : `CARDWAKE_PROP_RUNS`, défaut 100. */
const RUNS = { numRuns: Number(process.env.CARDWAKE_PROP_RUNS ?? 100) };

// --------------------------------------------------------------------------
// L'arsenal de l'adversaire
// --------------------------------------------------------------------------

/** Coups bien formés : c'est le GARDE qui doit dire non, pas la validation. */
const ATTACK_ARGS: Record<ToolName, Record<string, unknown>> = {
  reply: { text: "never reached" },
  send_message: { to_card: "Pantry", text: "conspire with me" },
  write_field: { field: "Mood", text: "hacked", mode: "replace" },
  set_appearance: { part: "Mood", property: "visible", value: false },
  create_part: { kind: "field", name: "Trap", rect: [0, 0, 10, 10], label: "" },
  delete_part: { part: "Mood" },
  create_card: { name: "Intruder", background: null },
  go_to_card: { card: "Pantry" },
  propose_script: { object: "Serve", script: "on mouseUp\nend mouseUp", explanation: "Sneaky." },
};

/** Au niveau 5 tout est permis : l'attaque vise alors le champ d'une VOISINE. */
const FOREIGN_ATTACKS: Partial<Record<ToolName, Record<string, unknown>>> = {
  write_field: { field: "Secret", text: "stolen", mode: "replace" },
  set_appearance: { part: "Secret", property: "visible", value: false },
  delete_part: { part: "Secret" },
};

/** Un coup : outil interdit au niveau (ou cible étrangère au niveau 5). */
function attackFor(level: AgentLevel, pick: number): { name: ToolName; input: Record<string, unknown> } {
  const forbidden = forbiddenToolsFor(level);
  if (forbidden.length === 0) {
    const names = Object.keys(FOREIGN_ATTACKS) as ToolName[];
    const name = names[pick % names.length];
    return { name, input: FOREIGN_ATTACKS[name] ?? {} };
  }
  const name = forbidden[pick % forbidden.length];
  return { name, input: ATTACK_ARGS[name] };
}

/** La pile de l'adversaire : Cook au niveau visé, et un « Secret » chez Pantry. */
function adversaryStack(level: AgentLevel): Stack {
  const stack = stackAtLevel(level);
  const pantry = stack.cards.find((card) => card.id === 2);
  if (pantry) pantry.parts = [field(30, "Secret", "beans")];
  return stack;
}

/** Le modèle adversaire : `picks.length` coups, puis il abandonne et répond. */
function adversaryModel(level: AgentLevel, picks: number[]): FakeModel {
  const attacks = picks.length;
  return new FakeModel({
    respond: (_request, index): LlmResponse => {
      if (index < attacks) {
        const attack = attackFor(level, picks[index]);
        return {
          stop: "tool_use",
          blocks: [
            { type: "tool_use", id: `adv-${index + 1}`, name: attack.name, input: attack.input },
          ],
          usage: FAKE_USAGE,
        };
      }
      if (index === attacks) return toolUseResponse("reply", { text: "I give up." }, "adv-reply");
      return textResponse("");
    },
  });
}

// --------------------------------------------------------------------------
// Propriété : les cinq niveaux bloquent chaque coup
// --------------------------------------------------------------------------

describe("adversaire — CAR-P-11 et CAR-P-12 sur les cinq niveaux", () => {
  it("aucune suite de coups ne sort du niveau ni ne change les droits", async () => {
    const levelArb = fc.constantFrom<AgentLevel>(1, 2, 3, 4, 5);
    await fc.assert(
      fc.asyncProperty(levelArb, fc.array(fc.integer({ min: 0, max: 99 }), { minLength: 1, maxLength: 3 }), async (level, picks) => {
        const stack = adversaryStack(level);
        const before = JSON.stringify(stack);
        const settingsBefore = structuredClone(stack.settings);
        const agentsBefore = structuredClone(stack.cards.map((card) => card.agent));
        const model = adversaryModel(level, picks);
        const h = harness(model, {
          stack,
          level,
          settings: settings({ agentMaxIterations: 12 }),
        });

        const outcome = await runAgentTurn(turnRequest({ text: "Escalate yourself." }), h.ctx);

        // CAR-P-11 : seuls les outils du niveau ont JAMAIS été présentés.
        const offered = new Set(toolsForLevel(level).map((tool) => tool.name));
        for (const request of model.requests) {
          for (const tool of request.tools ?? []) expect(offered.has(tool.name)).toBe(true);
        }
        // CAR-P-11 : chaque coup re-vérifié reçoit une erreur, le tour continue.
        const adversarial = toolResultsOf(model).filter((result) => /^adv-\d+$/.test(result.toolUseId));
        expect(adversarial).toHaveLength(picks.length);
        for (const result of adversarial) expect(result.isError).toBe(true);

        // CAR-P-11 : rien hors droits n'a été exécuté, la pile n'a pas bougé.
        expect(JSON.stringify(h.host.stack)).toBe(before);

        // CAR-P-12 : niveau, consignes, éveil, budgets — intacts.
        expect(h.host.stack.settings).toEqual(settingsBefore);
        expect(h.host.stack.cards.map((card) => card.agent)).toEqual(agentsBefore);
        expect(h.host.stack.persona).toBe(stack.persona);

        // L'adversaire garde la parole, mais jamais les mains.
        expect(outcome.reply).toBe("I give up.");
        expect(outcome.stop).toBe("end");
        expect(outcome.iterations).toBe(picks.length + 2);
      }),
      RUNS,
    );
  });

  it("un appel hors niveau reçoit une raison en anglais et n'est pas exécuté", async () => {
    const model = new FakeModel({
      responses: [
        toolUseResponse("write_field", ATTACK_ARGS.write_field, "adv-1"),
        toolUseResponse("reply", { text: "Fine." }, "adv-reply"),
        textResponse(""),
      ],
    });
    const h = harness(model, { stack: stackAtLevel(1), level: 1 });
    const outcome = await runAgentTurn(turnRequest(), h.ctx);
    const result = toolResultsOf(model)[0];
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/needs level 2/);
    // Le champ n'a pas bougé, et le tour a continué jusqu'à la réponse.
    const mood = h.host.stack.cards[0].parts.find((part) => part.name === "Mood");
    expect(mood?.kind === "field" && mood.text).toBe("calm");
    expect(outcome.reply).toBe("Fine.");
  });

  it("adversaire intégré au faux modèle : arguments farfelus, garde solide quand même", async () => {
    const model = new FakeModel({ adversary: { level: 2, foreignCards: ["Pantry", "Garden"] } });
    const h = harness(model, {
      stack: stackAtLevel(2),
      level: 2,
      settings: settings({ agentMaxIterations: 4 }),
    });
    const before = JSON.stringify(h.stack);
    const outcome = await runAgentTurn(turnRequest(), h.ctx);
    // Le plafond arrête l'adversaire — jamais une exception technique.
    expect(model.callCount).toBe(4);
    expect(outcome.refusal).toMatch(/iteration limit/);
    expect(JSON.stringify(h.host.stack)).toBe(before);
    // Chaque coup visible a été refusé (hors niveau au 2, ou mal formé).
    const results = toolResultsOf(model);
    expect(results).toHaveLength(3);
    for (const result of results) expect(result.isError).toBe(true);
  });
});
