/**
 * Propriétés du paquet `agent` sur la vue, les outils et les budgets.
 *
 * - CAR-P-16 : pour toute carte générée, le contexte d'un tour respecte les
 *   tailles limites, et ne contient ni clé, ni contenu d'une autre carte, ni
 *   journal, ni historique. Vérifié par recherche de sous-chaînes interdites.
 * - CAR-P-15 : aucun compteur ne dépasse son réglage ; une fois épuisé, plus
 *   aucun appel n'est autorisé et plus aucun compteur ne bouge.
 *
 * Les piles sont fabriquées à la main dans `fixtures.ts` : ces propriétés ne
 * dépendent pas des générateurs du paquet `model`.
 */

import { APP_LIMITS } from "@cardwake/model";
import type { Stack, StackSettings } from "@cardwake/model";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { BudgetVerdict } from "../src/types";
import { ActionBudgetTracker, SessionBudgetTracker } from "../src/budget";
import { equivalentLine, toolSchema, toolsForLevel, validateToolArgs } from "../src/tools";
import { RULES_TEXT, buildAgentContext } from "../src/view";
import { card, field, kitchenStack, settings, stack } from "./fixtures";

/** Nombre de tirages : `CARDWAKE_PROP_RUNS`, défaut 100. */
const RUNS = { numRuns: Number(process.env.CARDWAKE_PROP_RUNS ?? 100) };

// --------------------------------------------------------------------------
// Générateurs
// --------------------------------------------------------------------------

/** Mots qu'aucun contexte ne doit contenir ; retirés des textes générés. */
const FORBIDDEN = ["sk-", "SECRET", "journal", "transaction", "usage", "history", "previous"];

/** Un texte neutre : des lettres, et rien qui ressemble à un secret. */
const plainText = (maxLength: number): fc.Arbitrary<string> =>
  fc
    .stringOf(fc.constantFrom(..."abcdefghij ".split("")), { maxLength })
    .map((text) => FORBIDDEN.reduce((kept, word) => kept.split(word).join(" "), text));

/** Marque d'une carte : placée en tête de ses textes, donc reconnaissable. */
const mark = (index: number): string => `FOREIGN${index}MARK`;

type Case = {
  stack: Stack;
  cardId: number;
  foreignMarks: string[];
  message: { text: string; sender: string; hops: number };
  settings: StackSettings;
};

/** Réglages tirés au sort, volontairement petits pour que les troncatures mordent. */
const settingsArb = fc.record({
  fieldViewChars: fc.integer({ min: 0, max: 60 }),
  cardViewChars: fc.integer({ min: 0, max: 120 }),
});

/** Une pile de référence : une carte cible, puis des voisines marquées. */
function buildCase(spec: {
  neighbours: number;
  texts: string[];
  personas: string[];
  scripts: string[];
  labels: string[];
  messageText: string;
  hops: number;
  fieldViewChars: number;
  cardViewChars: number;
}): Case {
  const cards = [
    card({
      id: 1,
      name: "Card 0",
      agent: { awake: true, level: 2, speed: "fast", persona: "target persona" },
      parts: [field(20, "Own", "own text"), field(21, "Locked", "sealed", true)],
    }),
  ];
  const foreignMarks: string[] = [];
  for (let index = 0; index < spec.neighbours; index += 1) {
    const marker = mark(index + 1);
    foreignMarks.push(marker);
    cards.push(
      card({
        id: 100 + index,
        name: `Card ${index + 1}`,
        agent: { awake: true, level: 4, speed: "fast", persona: `${marker} ${spec.personas[index]}` },
        script: `${marker} ${spec.scripts[index]}`,
        parts: [
          field(30 + index, `${marker}Field`, `${marker} ${spec.texts[index]}`),
          field(60 + index, `${marker}Label`, spec.labels[index]),
        ],
      }),
    );
  }
  return {
    stack: stack({ cards, name: "Prop", persona: "stack persona" }),
    cardId: 1,
    foreignMarks,
    message: { text: spec.messageText, sender: "human", hops: spec.hops },
    settings: settings({ fieldViewChars: spec.fieldViewChars, cardViewChars: spec.cardViewChars }),
  };
}

const caseArb: fc.Arbitrary<Case> = fc
  .record({
    neighbours: fc.integer({ min: 1, max: 3 }),
    texts: fc.array(plainText(40), { minLength: 3, maxLength: 3 }),
    personas: fc.array(plainText(30), { minLength: 3, maxLength: 3 }),
    scripts: fc.array(plainText(30), { minLength: 3, maxLength: 3 }),
    labels: fc.array(plainText(20), { minLength: 3, maxLength: 3 }),
    messageText: plainText(100),
    hops: fc.integer({ min: 0, max: 3 }),
    fieldViewChars: fc.integer({ min: 0, max: 60 }),
    cardViewChars: fc.integer({ min: 0, max: 120 }),
  })
  .map(buildCase);

/** Somme des textes qui entrent dans un contexte, hors bloc fixe des règles. */
function payloadLength(context: ReturnType<typeof buildAgentContext>): number {
  const fields = context.view.fields.reduce((sum, item) => sum + item.text.length, 0);
  const personas =
    context.personas.stack.length + context.personas.background.length + context.personas.card.length;
  return fields + personas + context.message.text.length;
}

// --------------------------------------------------------------------------
// CAR-P-16 — contexte d'un tour
// --------------------------------------------------------------------------

describe("CAR-P-16 — le contexte ne contient que ce qu'il doit", () => {
  it("respecte les tailles limites", () => {
    fc.assert(
      fc.property(caseArb, (sample) => {
        const context = buildAgentContext(sample.stack, sample.cardId, sample.message, sample.settings);
        const fieldChars = sample.settings.fieldViewChars;
        for (const item of context.view.fields) {
          expect(item.text.length).toBeLessThanOrEqual(fieldChars);
        }
        const viewTotal = context.view.fields.reduce((sum, item) => sum + item.text.length, 0);
        expect(viewTotal).toBeLessThanOrEqual(sample.settings.cardViewChars);
        const { personas } = context;
        for (const persona of [personas.stack, personas.background, personas.card]) {
          expect(persona.length).toBeLessThanOrEqual(APP_LIMITS.maxPersonaChars);
        }
        expect(context.message.text.length).toBeLessThanOrEqual(2_000);
        const overhead = sample.settings.cardViewChars + 4 * APP_LIMITS.maxPersonaChars;
        expect(payloadLength(context)).toBeLessThanOrEqual(overhead);
      }),
      RUNS,
    );
  });

  it("ne contient ni contenu d'une autre carte, ni journal, ni clé", () => {
    fc.assert(
      fc.property(caseArb, (sample) => {
        const context = buildAgentContext(sample.stack, sample.cardId, sample.message, sample.settings);
        const serialized = JSON.stringify(context);
        for (const marker of sample.foreignMarks) expect(serialized).not.toContain(marker);
        for (const word of FORBIDDEN) expect(serialized).not.toContain(word);
        expect(serialized).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/);
      }),
      RUNS,
    );
  });

  it("n'a que les quatre blocs, et les champs déclarés", () => {
    fc.assert(
      fc.property(caseArb, (sample) => {
        const context = buildAgentContext(sample.stack, sample.cardId, sample.message, sample.settings);
        expect(Object.keys(context).sort()).toEqual(["message", "personas", "rules", "view"]);
        expect(context.rules).toBe(RULES_TEXT);
        expect(Object.keys(context.view).sort()).toEqual([
          "buttons",
          "cardName",
          "fields",
          "level",
          "otherCards",
          "stackName",
        ]);
        expect(Object.keys(context.message).sort()).toEqual(["hops", "sender", "text"]);
        expect(Object.keys(context.personas).sort()).toEqual(["background", "card", "stack"]);
        expect(context.view.stackName).toBe(sample.stack.name);
        expect(context.view.otherCards).toHaveLength(sample.foreignMarks.length);
      }),
      RUNS,
    );
  });

  it("garde le niveau et le nombre de champs de la carte visée", () => {
    fc.assert(
      fc.property(caseArb, (sample) => {
        const context = buildAgentContext(sample.stack, sample.cardId, sample.message, sample.settings);
        const target = sample.stack.cards.find((item) => item.id === sample.cardId);
        expect(context.view.level).toBe(target?.agent?.level ?? 1);
        expect(context.view.fields).toHaveLength(target?.parts.length ?? 0);
        expect(context.view.fields.every((item) => typeof item.locked === "boolean")).toBe(true);
      }),
      RUNS,
    );
  });
});

// --------------------------------------------------------------------------
// CAR-P-15 — budgets
// --------------------------------------------------------------------------

const sessionArb = fc.record({
  turns: fc.integer({ min: 0, max: 5 }),
  tokens: fc.integer({ min: 0, max: 20 }),
  tokenAdds: fc.array(fc.integer({ min: 0, max: 10 }), { minLength: 0, maxLength: 8 }),
  attempts: fc.integer({ min: 0, max: 12 }),
});

const actionArb = fc.record({
  hops: fc.integer({ min: 0, max: 4 }),
  turns: fc.integer({ min: 0, max: 4 }),
  attempts: fc.integer({ min: 0, max: 12 }),
});

/** Index du premier refus, ou `-1` si tout a été accordé. */
function firstRefusal(verdicts: BudgetVerdict[]): number {
  return verdicts.findIndex((verdict) => !verdict.ok);
}

/** Épuise une consommation en comptant : rend le nombre d'appels accordés. */
function drain(consume: () => BudgetVerdict, limit: number): number {
  let granted = 0;
  for (let index = 0; index < limit; index += 1) {
    if (!consume().ok) break;
    granted += 1;
  }
  return granted;
}

/** Une fois le premier refus venu, tous les suivants refusent aussi. */
function refusalsAreFinal(verdicts: BudgetVerdict[]): void {
  const first = firstRefusal(verdicts);
  if (first < 0) return;
  for (const verdict of verdicts.slice(first)) expect(verdict.ok).toBe(false);
}

describe("CAR-P-15 — budgets bornés", () => {
  it("ne dépasse jamais les tours ni les jetons accordés", () => {
    fc.assert(
      fc.property(sessionArb, (sample) => {
        const budget = new SessionBudgetTracker(
          settings({ agentTurnsPerSession: sample.turns, agentInputTokensPerSession: sample.tokens }),
        );
        for (const add of sample.tokenAdds) budget.addInputTokens(add);
        const verdicts: BudgetVerdict[] = [];
        for (let index = 0; index < sample.attempts; index += 1) {
          verdicts.push(budget.consumeTurn());
          const snap = budget.snapshot();
          expect(snap.turnsUsed).toBeLessThanOrEqual(snap.turnsMax);
          expect(snap.inputTokensUsed).toBeLessThanOrEqual(snap.inputTokensMax);
          expect(snap.turnsMax).toBe(sample.turns);
          expect(snap.inputTokensMax).toBe(sample.tokens);
        }
        expect(verdicts.filter((verdict) => verdict.ok).length).toBeLessThanOrEqual(sample.turns);
        refusalsAreFinal(verdicts);
      }),
      RUNS,
    );
  });

  it("gèle les compteurs de session une fois épuisés", () => {
    fc.assert(
      fc.property(sessionArb, (sample) => {
        const budget = new SessionBudgetTracker(
          settings({ agentTurnsPerSession: sample.turns, agentInputTokensPerSession: sample.tokens }),
        );
        for (const add of sample.tokenAdds) budget.addInputTokens(add);
        const verdicts: BudgetVerdict[] = [];
        for (let index = 0; index < sample.attempts; index += 1) verdicts.push(budget.consumeTurn());
        const granted = drain(() => budget.consumeTurn(), sample.turns + 2);
        expect(granted).toBeLessThanOrEqual(sample.turns);
        const frozen = budget.snapshot();
        for (let index = 0; index < 3; index += 1) expect(budget.consumeTurn().ok).toBe(false);
        expect(budget.snapshot()).toEqual(frozen);
      }),
      RUNS,
    );
  });

  it("ne dépasse jamais les sauts ni les tours d'une action", () => {
    fc.assert(
      fc.property(actionArb, (sample) => {
        const budget = new ActionBudgetTracker(
          settings({ hopBudget: sample.hops, agentTurnsPerAction: sample.turns }),
        );
        const hopVerdicts: BudgetVerdict[] = [];
        for (let index = 0; index < sample.attempts; index += 1) {
          hopVerdicts.push(budget.consumeHop());
          const snap = budget.snapshot();
          expect(snap.hopsLeft).toBeGreaterThanOrEqual(0);
          expect(snap.turnsLeft).toBeGreaterThanOrEqual(0);
          expect(snap.hopsLeft).toBeLessThanOrEqual(sample.hops);
          expect(snap.turnsLeft).toBeLessThanOrEqual(sample.turns);
        }
        expect(hopVerdicts.filter((verdict) => verdict.ok).length).toBeLessThanOrEqual(sample.hops);
        refusalsAreFinal(hopVerdicts);
      }),
      RUNS,
    );
  });

  it("gèle les compteurs d'une action une fois épuisés", () => {
    fc.assert(
      fc.property(actionArb, (sample) => {
        const budget = new ActionBudgetTracker(
          settings({ hopBudget: sample.hops, agentTurnsPerAction: sample.turns }),
        );
        const verdicts: BudgetVerdict[] = [];
        for (let index = 0; index < sample.attempts; index += 1) verdicts.push(budget.consumeTurn());
        expect(verdicts.filter((verdict) => verdict.ok).length).toBeLessThanOrEqual(sample.turns);
        const granted = drain(() => budget.consumeTurn(), sample.turns + 2);
        expect(granted).toBeLessThanOrEqual(sample.turns);
        const frozen = budget.snapshot();
        for (let index = 0; index < 3; index += 1) expect(budget.consumeTurn().ok).toBe(false);
        expect(budget.snapshot()).toEqual(frozen);
      }),
      RUNS,
    );
  });
});

// --------------------------------------------------------------------------
// Outils — la forme est complète pour tout niveau
// --------------------------------------------------------------------------

describe("outils — schémas et lignes", () => {
  it("ne présente que des schémas stricts, dans l'ordre des niveaux", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), (level) => {
        const tools = toolsForLevel(level as 1 | 2 | 3 | 4 | 5);
        expect(tools.length).toBeGreaterThan(0);
        for (const tool of tools) {
          expect(tool).toEqual(toolSchema(tool.name as Parameters<typeof toolSchema>[0]));
          expect(tool.inputSchema.additionalProperties).toBe(false);
          expect(tool.inputSchema.required).toEqual(Object.keys(tool.inputSchema.properties as object));
        }
      }),
      RUNS,
    );
  });

  it("refuse toute clé inconnue, quel que soit l'outil", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), fc.lorem({ maxCount: 2 }), (level, extra) => {
        for (const tool of toolsForLevel(level as 1 | 2 | 3 | 4 | 5)) {
          const name = tool.name as Parameters<typeof validateToolArgs>[0];
          expect(validateToolArgs(name, { [extra]: 1 }).ok).toBe(false);
        }
      }),
      RUNS,
    );
  });

  it("rend une ligne non vide pour chaque outil", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), (text) => {
        expect(equivalentLine("go_to_card", { card: text })).toContain('go to card "');
        expect(equivalentLine("go_to_card", { card: text })).not.toBe("");
        expect(equivalentLine("reply", { text })).toContain("reply ");
      }),
      RUNS,
    );
  });
});

// --------------------------------------------------------------------------
// Non-régression des fixtures : elles restent utilisables telles quelles
// --------------------------------------------------------------------------

describe("fixtures", () => {
  it("donne une pile de référence lisible", () => {
    const pile = kitchenStack();
    expect(pile.cards.map((item) => item.name)).toEqual(["Cook", "Pantry", "Garden"]);
    expect(pile.backgrounds[0].parts.map((part) => part.name)).toEqual(["Light", "Lamp"]);
    expect(settings().cardViewChars).toBe(8_000);
  });
});
