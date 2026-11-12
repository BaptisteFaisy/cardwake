/**
 * Relecture en clair (CAR-F-26, CAR-P-03) : les trois exemples imposés mot pour
 * mot, les trois scripts du cahier des charges, une phrase par famille
 * d'instructions avec chaque nom d'objet cité, la forme des blocs, et la
 * totalité sur n'importe quel arbre tiré au sort.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { paraphraseBody, paraphraseScript, paraphraseStmt } from "../src/paraphrase";
import { parseStatements } from "../src/parser";
import { arbBody, arbStmt } from "./generators";
import type { Stmt } from "../src/ast";

/** Tirages des propriétés : `CARDWAKE_PROP_RUNS`, défaut 100. */
const RUNS = Number(process.env.CARDWAKE_PROP_RUNS ?? 100);

/** Analyse un texte d'instructions ; échoue nettement si le texte du test est faux. */
function statementsOf(source: string): Stmt[] {
  const parsed = parseStatements(source);
  if (!parsed.ok || !("statements" in parsed)) throw new Error(`texte de test non analysable : ${source}`);
  return parsed.statements;
}

/** Relit un texte d'instructions en phrases. */
function read(source: string): string[] {
  return paraphraseBody(statementsOf(source));
}

describe("les trois exemples imposés", () => {
  it("put … * … into … se dit « Multiply … by … and write the result in … »", () => {
    expect(read('put field "Qty" * field "Price" into field "Total"')).toEqual([
      "Multiply field Qty by field Price and write the result in field Total.",
    ]);
  });

  it("if … is empty then s'ouvre sur des deux points, exit mouseUp dit « stop here. »", () => {
    const lines = read('if field "New" is empty then exit mouseUp');
    expect(lines[0]).toBe("If field New is empty:");
    expect(lines[1]).toBe("  stop here.");
    expect(lines[1].trim()).toBe("stop here.");
    expect(lines[2]).toBe("End of the condition.");
  });

  it("consult agent with … cite l'agent de la carte et le texte entre guillemets", () => {
    expect(read('consult agent with "The visitor shows you a silver amulet."')).toEqual([
      'Ask this card\'s agent: "The visitor shows you a silver amulet.", and wait for its answer.',
    ]);
  });
});

// Les trois scripts de référence (docs/language.md, « Ten complete examples »).

const TASKS = `on mouseUp
  if field "New" is empty then
    exit mouseUp
  end if
  put field "New" & return after field "Tasks"
  put empty into field "New"
end mouseUp`;

const QUOTE = `on mouseUp
  put 0 into total
  repeat for each line row in field "Lines"
    add item 2 of row * item 3 of row to total
  end repeat
  put round(total, 2) into field "Subtotal"
  put round(total * 0.1, 2) into field "VAT"
  put round(total * 1.1, 2) into field "Total"
end mouseUp`;

const AGENT = `on mouseUp
  consult agent with "The visitor shows you a silver amulet."
  put it into field "Says"
end mouseUp`;

describe("les trois scripts du cahier des charges", () => {
  const scripts: [string, string][] = [["liste de tâches", TASKS], ["devis avec TVA", QUOTE], ["agent consulté", AGENT]];

  it.each(scripts)("%s se relit sans exception, en phrases finies", (_label, source) => {
    const lines = paraphraseScript(source);
    expect(lines.length).toBeGreaterThan(3);
    for (const line of lines) expect(/^\s*\S.*[.:]$/.test(line), line).toBe(true);
  });

  it("la liste de tâches dit l'arrêt, l'ajout et le vidage", () => {
    expect(paraphraseScript(TASKS)).toEqual([
      "When the message mouseUp arrives:",
      "  If field New is empty:",
      "    stop here.",
      "  End of the condition.",
      "  Write field New followed by a line break after the content of field Tasks.",
      "  Write nothing in field New.",
      "End of the mouseUp handler.",
    ]);
  });

  it("le devis nomme la boucle, l'addition et les arrondis", () => {
    const text = paraphraseScript(QUOTE).join("\n");
    expect(text).toContain("  Write 0 in total.");
    expect(text).toContain("  Repeat for each line of field Lines, calling it row:");
    expect(text).toContain("    Add item 2 of row times item 3 of row to total.");
    expect(text).toContain("  Write total rounded to 2 decimals in field Subtotal.");
    expect(text).toContain("  Write total times 1.1 rounded to 2 decimals in field Total.");
    expect(text).toContain("  End of the loop.");
  });

  it("le bouton qui consulte l'agent cite l'agent puis le champ qui reçoit", () => {
    expect(paraphraseScript(AGENT)).toEqual([
      "When the message mouseUp arrives:",
      '  Ask this card\'s agent: "The visitor shows you a silver amulet.", and wait for its answer.',
      "  Write the last result in field Says.",
      "End of the mouseUp handler.",
    ]);
  });
});

// CAR-P-03 : les 24 types d'instructions de l'AST, chaque objet désigné cité.

const KINDS = [
  "put", "set", "get", "go", "send", "pass", "answer", "ask", "show", "hide", "arith", "create",
  "delete", "sort", "find", "wait", "consult", "tell", "if", "repeat", "exit", "return", "global", "call",
];

/** Un texte d'instructions par groupe, avec les objets attendus dans les phrases. */
const FAMILIES: [string, string[]][] = [
  ['put "Done" into field "Status"', ["field Status"]],
  ['put field "Qty" * field "Price" into field "Total"', ["field Qty", "field Price", "field Total"]],
  ['put empty after word 2 of line 3 of field "Follow-up"', ["word 2 of line 3 of field Follow-up"]],
  ['put field "Total" of card "Kitchen" into field "Copy"', ["field Total of card Kitchen", "field Copy"]],
  ['set the visible of button "Next" to false\nget the number of lines in field "Tasks"', ["button Next", "field Tasks"]],
  ['go to card "Kitchen"\ngo next card', ["card Kitchen", "the next card"]],
  ['send "greet" with "Marie" to button "Welcome"', ["button Welcome"]],
  ['pass mouseUp\nanswer "The amulet is warm."\nask "Client name?" into clientName', ["mouseUp"]],
  ['show button "Next"\nhide field "Hint"', ["button Next", "field Hint"]],
  ['add 1 to field "Count"\nsubtract item 3 of row from field "Remaining"', ["field Count", "field Remaining"]],
  ['multiply total by 1.1\ndivide field "Points" by 2', ["field Points"]],
  ['create card "Order" with background "Invoice"', ["card named Order", "background Invoice"]],
  ['create field "Notes"\ncreate button', ["field named Notes", "button"]],
  ['delete field "Old" of card "Kitchen"\ndelete this background', ["field Old of card Kitchen", "this background"]],
  ['sort lines of field "Prices" numeric\nsort field "Tasks" by line 1 descending', ["lines of field Prices", "field Tasks"]],
  ['find "amulet"\nwait 2 seconds\nwait 250', []],
  ['consult agent with "Menu?"', ["this card's agent"]],
  ['consult agent of card "Cook" with "Menu?"\ntell agent of card "Cook" "A guest is waiting."', ["agent of card Cook"]],
  ['if field "Count" > 10 then\n set the hilite of button "Review" to true\nelse\n hide button "Review"\nend if', ["field Count", "button Review"]],
  ['repeat for each line row in field "Lines"\n put row into field "Copy"\nend repeat', ["field Lines", "field Copy"]],
  ['repeat with n = 1 to 10 step 2\n exit repeat\nend repeat', []],
  ["repeat while total < 10\n wait 1\nend repeat", []],
  ['repeat 3 times\n return\nend repeat', []],
  ["exit mouseUp\nreturn round(total, 2)\nglobal visitCount, total", ["visitCount", "total"]],
  ['showTotal\nput withVat(2, 3) into field "Gross"', ["showTotal", "withVat", "field Gross"]],
];

describe("CAR-P-03 — chaque famille a une phrase et cite ses objets", () => {
  it("le tableau couvre les 24 types d'instructions de l'AST", () => {
    const seen = new Set<string>();
    for (const [source] of FAMILIES) for (const stmt of statementsOf(source)) seen.add(stmt.kind);
    expect([...seen].sort()).toEqual([...KINDS].sort());
  });

  it("chaque nom d'objet désigné est cité dans une sortie sans guillemets", () => {
    for (const [source, objects] of FAMILIES) {
      const lines = read(source);
      expect(lines.length, source).toBeGreaterThan(0);
      const text = lines.join("\n");
      for (const object of objects) expect(text, source).toContain(object);
      for (const prefix of ['field "', 'button "', 'card "']) expect(text.includes(prefix), source).toBe(false);
    }
  });
});

describe("la forme des blocs", () => {
  it("un `if` avec `else` : ouverture, corps indenté, sinon, clôture", () => {
    const source = 'if total > 100 then\n set the hilite of button "Discount" to true\nelse\n set the hilite of button "Discount" to false\nend if';
    expect(read(source)).toEqual([
      "If total is greater than 100:",
      "  Set the hilite of button Discount to true.",
      "Otherwise:",
      "  Set the hilite of button Discount to false.",
      "End of the condition.",
    ]);
  });

  it("un `repeat` dans un `if` indente de deux espaces à chaque niveau", () => {
    expect(read("if total > 3 then\n repeat 2 times\n  wait 10\n end repeat\nend if")).toEqual([
      "If total is greater than 3:",
      "  Repeat 2 times:",
      "    Wait 10 milliseconds.",
      "  End of the loop.",
      "End of the condition.",
    ]);
  });

  it("les quatre formes de `repeat` s'ouvrent sur des deux points", () => {
    const heads = ["repeat with n = 1 to 10 step 2", 'repeat for each line row in field "Lines"', "repeat while total < 10", "repeat 3 times"];
    expect(heads.map((head) => read(`${head}\n wait 1\nend repeat`)[0])).toEqual([
      "Repeat with n going from 1 to 10, by steps of 2:",
      "Repeat for each line of field Lines, calling it row:",
      "Repeat as long as total is less than 10:",
      "Repeat 3 times:",
    ]);
  });
});

describe("paraphraseScript", () => {
  it("relit un handler puis une fonction, séparés par une ligne vide", () => {
    const source = "function withVat amount\n return round(amount * 1.1, 2)\nend withVat\n\non mouseUp\n showTotal\nend mouseUp";
    expect(paraphraseScript(source)).toEqual([
      "When the message mouseUp arrives:",
      "  Call the function showTotal.",
      "End of the mouseUp handler.",
      "",
      "The function withVat, which takes amount:",
      "  Stop the function here and return amount times 1.1 rounded to 2 decimals.",
      "End of the function withVat.",
    ]);
  });

  it("un texte qui ne s'analyse pas rend une phrase lisible, un script vide rien", () => {
    const lines = paraphraseScript("this is not a script at all");
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain("This text cannot be read (line 1):");
    expect(paraphraseScript("")).toEqual([]);
  });
});

describe("propriété — la relecture est totale", () => {
  it("tout arbre tiré au sort rend au moins une phrase par instruction, sans exception", () => {
    fc.assert(
      fc.property(arbStmt(2), (stmt) => {
        const lines = paraphraseStmt(stmt);
        expect(lines.length).toBeGreaterThan(0);
        // Une phrase tient sur une ligne, n'est pas vide et finit par « . » ou « : ».
        for (const line of lines) expect(/^\s*\S.*[.:]$/.test(line), line).toBe(true);
      }),
      { numRuns: RUNS },
    );
    fc.assert(
      fc.property(arbBody(2), (body) => {
        expect(paraphraseBody(body).length).toBeGreaterThanOrEqual(body.length);
      }),
      { numRuns: RUNS },
    );
  });
});
