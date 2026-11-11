/**
 * Opérations réversibles et journal : CAR-P-07 (tout ou rien), CAR-P-08
 * (l'inverse restaure), CAR-P-10 (identifiants), CAR-P-23 (encre d'agent).
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { applyOp, applyOps, invertOp, invertOps } from "../src/ops";
import { Journal, describeOp } from "../src/journal";
import { createBackground, createButton, createCard, createField, createStack } from "../src/factory";
import { assertIdsUnique } from "../src/ids";
import { serializeStack } from "../src/file";
import type { Op, Stack } from "../src/types";

const RUNS = Number(process.env.CARDWAKE_PROP_RUNS ?? 100);
const CLOCK = "2026-11-11T19:00:00.000Z";

/**
 * Une pile de référence : un fond avec un champ, une carte rattachée au fond,
 * un champ et un bouton propres. Les identifiants sont relus dans la pile
 * finale, jamais dans les objets rendus par les fabriques (ils datent de
 * l'instant de la création).
 */
function fixture(): { stack: Stack; cardId: number; backgroundId: number; bgFieldId: number; fieldId: number; buttonId: number } {
  const base = createStack("Fixture");
  const grown = createBackground(base, "Shared");
  const withBgField = createField(grown.stack, { name: "Mood", backgroundId: grown.background.id });
  const created = createCard(withBgField.stack, { name: "One", backgroundId: grown.background.id });
  const withField = createField(created.stack, { name: "Notes", cardId: created.card.id });
  const stack = createButton(withField.stack, { name: "Go", cardId: created.card.id }).stack;
  const card = stack.cards[0];
  const background = stack.backgrounds[0];
  return {
    stack,
    cardId: card.id,
    backgroundId: background.id,
    bgFieldId: background.parts[0].id,
    fieldId: card.parts.find((part) => part.name === "Notes")!.id,
    buttonId: card.parts.find((part) => part.name === "Go")!.id,
  };
}

function textOps(state: { cardId: number; fieldId: number; bgFieldId: number; backgroundId: number }): Op[] {
  return [
    { kind: "setText", cardId: state.cardId, partId: state.fieldId, before: "", after: "hello", inkBefore: null, inkAfter: null },
    { kind: "setText", cardId: state.cardId, partId: state.bgFieldId, backgroundId: state.backgroundId, before: "", after: "bored", inkBefore: null, inkAfter: 7 },
  ];
}

describe("opérations", () => {
  it("chaque variante s'applique puis s'inverse à l'identique (CAR-P-08)", () => {
    const state = fixture();
    const cases: Op[] = [
      ...textOps(state),
      { kind: "setProp", target: { kind: "part", cardId: state.cardId, partId: state.buttonId }, prop: "visible", before: "true", after: "false" },
      { kind: "setScript", target: { kind: "card", cardId: state.cardId }, before: "", after: "on mouseUp\nend mouseUp\n" },
      { kind: "navigate", before: state.cardId, after: null },
      { kind: "setStackProp", prop: "name", before: "Fixture", after: "Renamed" },
      { kind: "setAgent", cardId: state.cardId, before: null, after: { awake: true, level: 2, speed: "fast", persona: "You wait." } },
    ];
    for (const op of cases) {
      const applied = applyOp(state.stack, op);
      const back = applyOp(applied, invertOp(applied, invertOp(state.stack, op)));
      expect(serializeStack(back)).toBe(serializeStack(applied));
      expect(serializeStack(applyOp(applied, invertOp(state.stack, op)))).toBe(serializeStack(state.stack));
    }
  });

  it("une suite d'opérations puis ses inverses en ordre inverse restaure la pile", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom("a", "b", "c"), { minLength: 1, maxLength: 6 }), (values) => {
        const state = fixture();
        const ops: Op[] = values.map((value) => ({
          kind: "setText",
          cardId: state.cardId,
          partId: state.fieldId,
          before: "",
          after: value,
          inkBefore: null,
          inkAfter: null,
        }));
        const forward = applyOps(state.stack, ops);
        const backward = applyOps(forward, invertOps(state.stack, ops));
        expect(serializeStack(backward)).toBe(serializeStack(state.stack));
      }),
      { numRuns: RUNS },
    );
  });

  it("n'écrit jamais dans la pile reçue", () => {
    const state = fixture();
    const before = serializeStack(state.stack);
    applyOps(state.stack, textOps(state));
    expect(serializeStack(state.stack)).toBe(before);
  });

  it("un champ de fond s'écrit dans le contenu de la carte, pas dans le fond", () => {
    const state = fixture();
    const written = applyOp(state.stack, textOps(state)[1]);
    expect(written.backgrounds[0].parts[0].kind === "field" && written.backgrounds[0].parts[0].text).toBe("");
    expect(written.cards[0].content[String(state.bgFieldId)]).toBe("bored");
  });

  it("les identifiants restent uniques après une suite d'opérations (CAR-P-10)", () => {
    const state = fixture();
    const grown = applyOps(state.stack, textOps(state));
    expect(assertIdsUnique(grown)).toEqual([]);
  });
});

describe("encre d'agent (CAR-P-23)", () => {
  const state = fixture();
  const byAgent: Op = { kind: "setText", cardId: state.cardId, partId: state.fieldId, before: "", after: "alarmed", inkBefore: null, inkAfter: 3 };
  const byHuman: Op = { kind: "setText", cardId: state.cardId, partId: state.fieldId, before: "alarmed", after: "calm", inkBefore: 3, inkAfter: null };

  it("marque le texte écrit par un agent, l'efface sur écriture humaine, et l'annulation restaure la marque", () => {
    const marked = applyOp(state.stack, byAgent);
    expect(marked.cards[0].ink[String(state.fieldId)]).toBe(3);
    const cleaned = applyOp(marked, byHuman);
    expect(cleaned.cards[0].ink[String(state.fieldId)]).toBeUndefined();
    const restored = applyOp(cleaned, invertOp(marked, byHuman));
    expect(restored.cards[0].ink[String(state.fieldId)]).toBe(3);
  });
});

describe("journal", () => {
  it("annule et rétablit transaction par transaction", () => {
    const state = fixture();
    const journal = new Journal();
    journal.begin({ kind: "human", mode: "author" }, "click on Go", 42);
    for (const op of textOps(state)) journal.record(op);
    const first = journal.commit(state.stack, CLOCK);
    const afterFirst = applyOps(state.stack, first.ops);

    journal.begin({ kind: "agent", cardId: state.cardId, level: 2 }, "agent turn", 43);
    journal.record({ kind: "setText", cardId: state.cardId, partId: state.fieldId, before: "hello", after: "noted", inkBefore: null, inkAfter: 9 });
    journal.commit(afterFirst, CLOCK, { inputTokens: 100, outputTokens: 20, calls: 1 });

    const undo1 = journal.undo(applyOps(afterFirst, []));
    expect(undo1).not.toBeNull();
    const undo2 = journal.undo(undo1!.stack);
    expect(serializeStack(undo2!.stack)).toBe(serializeStack(state.stack));
    const redone = journal.redo(undo2!.stack);
    expect(serializeStack(redone!.stack)).toBe(serializeStack(undo1!.stack));
  });

  it("une transaction avortée ne laisse aucune trace (CAR-P-07)", () => {
    const state = fixture();
    const journal = new Journal();
    journal.begin({ kind: "human", mode: "author" }, "guarded run", 1);
    journal.record(textOps(state)[0]);
    journal.abort();
    expect(journal.length).toBe(0);
    expect(journal.entries()).toEqual([]);
    expect(journal.undo(state.stack)).toBeNull();
  });

  it("une transaction vide n'entre pas dans l'historique", () => {
    const journal = new Journal();
    journal.begin({ kind: "human", mode: "browse" }, "a click that changes nothing", 1);
    journal.commit(fixture().stack, CLOCK);
    expect(journal.length).toBe(0);
  });

  it("filtre par acteur, exporte en texte et fond l'historique au-delà de 200", () => {
    const state = fixture();
    const journal = new Journal({ historyLength: 5 });
    for (let i = 0; i < 8; i += 1) {
      journal.begin(i % 2 === 0 ? { kind: "human", mode: "author" } : { kind: "agent", cardId: state.cardId, level: 2 }, `step ${i}`, i);
      journal.record(textOps(state)[0]);
      journal.commit(state.stack, CLOCK);
    }
    expect(journal.length).toBe(5);
    expect(journal.byActor("agent").length).toBeLessThanOrEqual(5);
    expect(journal.currentSnapshot()?.uptoTransactionId).toBe(3);
    expect(journal.exportText()).toContain("write into part");
    expect(describeOp(textOps(state)[0])).toContain("becomes");
  });
});
