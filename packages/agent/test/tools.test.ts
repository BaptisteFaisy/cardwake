/**
 * Outils d'agent (7.5) : schémas stricts, sélection par niveau, validation des
 * arguments, et la ligne de Murmur affichée dans le journal.
 */

import { describe, expect, it } from "vitest";
import { TOOL_LEVEL } from "../src/types";
import type { ToolName } from "../src/types";
import { equivalentLine, toolSchema, toolsForLevel, validateToolArgs } from "../src/tools";

const ALL: ToolName[] = [
  "reply",
  "send_message",
  "write_field",
  "set_appearance",
  "create_part",
  "delete_part",
  "create_card",
  "go_to_card",
  "propose_script",
];

/** Les propriétés d'un schéma, telles qu'elles sont présentées au modèle. */
function props(name: ToolName): Record<string, Record<string, unknown>> {
  return toolSchema(name).inputSchema.properties as Record<string, Record<string, unknown>>;
}

describe("schémas d'outils", () => {
  it("en décrit neuf, tous nommés", () => {
    expect(ALL).toHaveLength(9);
    for (const name of ALL) expect(toolSchema(name).name).toBe(name);
  });

  it("est strict : aucune clé supplémentaire, tout est requis", () => {
    for (const name of ALL) {
      const schema = toolSchema(name).inputSchema;
      expect(schema.additionalProperties).toBe(false);
      expect(schema.type).toBe("object");
      expect(schema.required).toEqual(Object.keys(schema.properties as object));
      expect(toolSchema(name).description.length).toBeGreaterThan(10);
    }
  });

  it("fixe les valeurs permises de mode et de property", () => {
    expect(props("write_field").mode.enum).toEqual(["replace", "append", "prepend"]);
    expect(props("set_appearance").property.enum).toEqual([
      "visible",
      "enabled",
      "locked",
      "hilite",
      "label",
      "style",
    ]);
    expect(props("create_part").kind.enum).toEqual(["field", "button"]);
  });

  it("décrit rect comme quatre nombres", () => {
    const rect = props("create_part").rect;
    expect(rect.type).toBe("array");
    expect(rect.minItems).toBe(4);
    expect(rect.maxItems).toBe(4);
  });

  it("accepte une valeur d'apparence texte ou booléenne", () => {
    expect(props("set_appearance").value.type).toEqual(["string", "boolean"]);
    expect(props("create_card").background.type).toEqual(["integer", "null"]);
  });
});

describe("toolsForLevel", () => {
  it("ne montre au niveau 1 que répondre et envoyer un message", () => {
    expect(toolsForLevel(1).map((tool) => tool.name)).toEqual(["reply", "send_message"]);
  });

  it("ajoute les outils dans l'ordre des niveaux", () => {
    expect(toolsForLevel(2).map((tool) => tool.name)).toEqual([
      "reply",
      "send_message",
      "write_field",
    ]);
    expect(toolsForLevel(5).map((tool) => tool.name)).toEqual(ALL);
  });

  it("ne présente jamais un outil au-dessus du niveau", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      for (const tool of toolsForLevel(level)) {
        expect(TOOL_LEVEL[tool.name as ToolName]).toBeLessThanOrEqual(level);
      }
    }
    expect(toolsForLevel(4).map((tool) => tool.name)).not.toContain("propose_script");
  });
});

describe("validateToolArgs", () => {
  it("accepte les appels bien formés", () => {
    expect(validateToolArgs("reply", { text: "hello" })).toEqual({ ok: true });
    expect(validateToolArgs("send_message", { to_card: "Cook", text: "hi" })).toEqual({ ok: true });
    expect(validateToolArgs("write_field", { field: "Mood", text: "x", mode: "append" })).toEqual({
      ok: true,
    });
    expect(
      validateToolArgs("set_appearance", { part: "Hint", property: "visible", value: false }),
    ).toEqual({ ok: true });
    expect(
      validateToolArgs("create_part", { kind: "button", name: "Go", rect: [1, 2, 3, 4], label: "Go" }),
    ).toEqual({ ok: true });
    expect(validateToolArgs("create_card", { name: "Day 2", background: null })).toEqual({ ok: true });
    expect(validateToolArgs("create_card", { name: "Day 2", background: 3 })).toEqual({ ok: true });
    expect(
      validateToolArgs("propose_script", { object: "Serve", script: "on click", explanation: "serves" }),
    ).toEqual({ ok: true });
  });

  it("refuse une clé inconnue", () => {
    const verdict = validateToolArgs("reply", { text: "hi", cardId: 2 });
    expect(verdict).toEqual({ ok: false, reason: 'Unknown argument "cardId".' });
  });

  it("refuse un argument manquant", () => {
    expect(validateToolArgs("send_message", { to_card: "Cook" })).toEqual({
      ok: false,
      reason: 'Missing argument "text".',
    });
  });

  it("refuse un mauvais type", () => {
    expect(validateToolArgs("reply", { text: 42 }).ok).toBe(false);
    expect(validateToolArgs("set_appearance", { part: "Hint", property: "visible", value: 1 }).ok).toBe(
      false,
    );
    expect(validateToolArgs("create_card", { name: "X", background: 1.5 }).ok).toBe(false);
  });

  it("refuse une valeur de mode ou de propriété hors liste", () => {
    expect(validateToolArgs("write_field", { field: "M", text: "x", mode: "set" }).ok).toBe(false);
    expect(validateToolArgs("set_appearance", { part: "H", property: "rect", value: 1 }).ok).toBe(
      false,
    );
  });

  it("refuse un rect qui n'a pas quatre nombres", () => {
    const bad = [
      [1, 2, 3],
      [1, 2, 3, 4, 5],
      [1, 2, 3, "4"],
      "1,2,3,4",
    ];
    for (const rect of bad) {
      expect(validateToolArgs("create_part", { kind: "field", name: "F", rect, label: "" }).ok).toBe(
        false,
      );
    }
  });

  it("rend une raison lisible, jamais une exception", () => {
    const verdict = validateToolArgs("reply", { text: "hi", extra: true });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("extra");
  });
});

describe("equivalentLine — ligne de Murmur du journal", () => {
  it("écrit une écriture de champ dans les trois modes", () => {
    expect(equivalentLine("write_field", { field: "Mood", text: "alarmed", mode: "replace" })).toBe(
      'put "alarmed" into field "Mood"',
    );
    expect(equivalentLine("write_field", { field: "Mood", text: "alarmed", mode: "append" })).toBe(
      'put "alarmed" after field "Mood"',
    );
    expect(equivalentLine("write_field", { field: "Mood", text: "alarmed", mode: "prepend" })).toBe(
      'put "alarmed" before field "Mood"',
    );
  });

  it("écrit un message à une autre carte", () => {
    expect(equivalentLine("send_message", { to_card: "Cook", text: "Hide the key." })).toBe(
      'tell agent of card "Cook" "Hide the key."',
    );
  });

  it("écrit une apparence, champ ou bouton", () => {
    expect(equivalentLine("set_appearance", { part: "Hint", property: "visible", value: false })).toBe(
      'set the visible of field "Hint" to false',
    );
    expect(equivalentLine("set_appearance", { part: "Next", property: "enabled", value: "true" })).toBe(
      'set the enabled of button "Next" to true',
    );
    expect(equivalentLine("set_appearance", { part: "Next", property: "style", value: "bold" })).toBe(
      'set the style of field "Next" to bold',
    );
  });

  it("écrit une proposition en attente d'acceptation", () => {
    expect(
      equivalentLine("propose_script", {
        object: "X",
        script: 'on click\n  put "hi" into field "Y"',
        explanation: "greets",
      }),
    ).toBe('Proposed script for button "X" (awaiting acceptance)');
  });

  it("écrit structure, navigation et réponse", () => {
    expect(equivalentLine("reply", { text: "Dinner is late." })).toBe('reply "Dinner is late."');
    expect(equivalentLine("create_part", { kind: "field", name: "Mood", rect: [1, 2, 3, 4], label: "" })).toBe(
      'create field "Mood"',
    );
    expect(equivalentLine("delete_part", { part: "Mood" })).toBe('delete "Mood"');
    expect(equivalentLine("create_card", { name: "Day 2", background: null })).toBe(
      'create card "Day 2"',
    );
    expect(equivalentLine("go_to_card", { card: "Kitchen" })).toBe('go to card "Kitchen"');
  });

  it("échappe les guillemets comme le langage", () => {
    expect(equivalentLine("reply", { text: 'say "hi"' })).toBe('reply "say \\"hi\\""');
  });
});
