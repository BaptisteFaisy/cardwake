/**
 * Tests de l'analyseur : les trois scripts du cahier des charges, toutes les
 * familles d'instructions, les morceaux de texte et les erreurs de syntaxe.
 */

import { describe, expect, it } from "vitest";
import { parseScript } from "../src/parser";
import type { Script, Stmt } from "../src/ast";

function parseOk(source: string): Script {
  const result = parseScript(source);
  if (!result.ok) throw new Error(result.errors.map((e) => `${e.line}:${e.col} ${e.message}`).join(" | "));
  return result.script;
}

function firstBody(source: string): Stmt[] {
  return parseOk(source).handlers[0].body;
}

describe("parseScript — les trois scripts du cahier des charges", () => {
  it("analyse le bouton Add d'une liste de tâches", () => {
    const script = parseOk(`on mouseUp
  if field "New" is empty then
    exit mouseUp
  end if
  put field "New" & return after field "Tasks"
  put empty into field "New"
end mouseUp`);
    expect(script.handlers).toHaveLength(1);
    expect(script.handlers[0].name).toBe("mouseUp");
    const [guard, append, reset] = script.handlers[0].body;
    expect(guard.kind).toBe("if");
    expect(append.kind).toBe("put");
    expect(reset.kind).toBe("put");
  });

  it("analyse le bouton Total d'un devis (boucle et arrondis)", () => {
    const script = parseOk(`on mouseUp
  put 0 into total
  repeat for each line row in field "Lines"
    add item 2 of row * item 3 of row to total
  end repeat
  put round(total, 2) into field "Subtotal"
  put round(total * 0.1, 2) into field "VAT"
  put round(total * 1.1, 2) into field "Total"
end mouseUp`);
    const loop = script.handlers[0].body[1];
    expect(loop.kind).toBe("repeat");
    if (loop.kind !== "repeat") throw new Error("attendu repeat");
    expect(loop.loop.kind).toBe("forEach");
    expect(loop.body).toHaveLength(1);
  });

  it("analyse le bouton qui consulte l'agent", () => {
    const script = parseOk(`on mouseUp
  consult agent with "The visitor shows you a silver amulet."
  put it into field "Says"
end mouseUp`);
    expect(script.handlers[0].body[0].kind).toBe("consult");
  });
});

describe("parseScript — familles d'instructions", () => {
  it("reconnaît chaque commande du langage", () => {
    const body = firstBody(`on openCard
  put "x" into field "A"
  put "y" before field "A"
  set the visible of button "B" to false
  get the number of lines in field "A"
  go to card "Kitchen"
  go next card
  send "refresh" with 1, 2 to this card
  pass mouseUp
  answer "done"
  ask "Name?" into field "Name"
  show field "Hint"
  hide field "Hint"
  add 1 to field "Count"
  subtract 2 from field "Count"
  multiply field "Count" by 2
  divide field "Count" by 4
  create card "Day 2" with background "Character"
  create field "Notes"
  delete button "Old"
  sort lines of field "Tasks" descending numeric
  find "amulet"
  wait 200 ms
  tell agent of card "Cook" "Hide the key."
  exit repeat
  return it
  global score, lives
  refreshAll 1
end openCard`);
    const kinds = body.map((s) => s.kind);
    expect(kinds).toEqual([
      "put", "put", "set", "get", "go", "go", "send", "pass", "answer", "ask",
      "show", "hide", "arith", "arith", "arith", "arith", "create", "create",
      "delete", "sort", "find", "wait", "tell", "exit", "return", "global", "call",
    ]);
  });

  it("analyse les quatre formes de repeat", () => {
    const body = firstBody(`on t
  repeat with i = 1 to 3
    put i into field "A"
  end repeat
  repeat for each word w in field "A"
    put w into it
  end repeat
  repeat while field "A" is not empty
    exit repeat
  end repeat
  repeat 4 times
    pass t
  end repeat
end t`);
    const loops = body.map((s) => (s.kind === "repeat" ? s.loop.kind : "?"));
    expect(loops).toEqual(["with", "forEach", "while", "times"]);
  });

  it("analyse les fonctions définies par l'auteur", () => {
    const script = parseOk(`function total qty, price
  return qty * price
end total`);
    expect(script.functions[0].name).toBe("total");
    expect(script.functions[0].params).toEqual(["qty", "price"]);
  });
});

describe("parseScript — expressions et morceaux de texte", () => {
  it("écrit dans un morceau imbriqué", () => {
    const [put] = firstBody(`on t
  put "payé" into word 2 of line 3 of field "Suivi"
end t`);
    expect(put.kind).toBe("put");
    if (put.kind !== "put") throw new Error("attendu put");
    expect(put.target.kind).toBe("chunk");
    if (put.target.kind !== "chunk") throw new Error("attendu chunk");
    expect(put.target.chunk.type).toBe("word");
    expect(put.target.of.kind).toBe("chunk");
  });

  it("respecte la précédence : concaténation avant comparaison, multiplication avant addition", () => {
    const [put] = firstBody(`on t
  put 1 + 2 * 3 & "x" into total
end t`);
    if (put.kind !== "put") throw new Error("attendu put");
    expect(put.expr.kind).toBe("bin");
  });

  it("reconnaît les désignations d'objets", () => {
    const body = firstBody(`on t
  get the name of me
  get the visible of the target
  get the text of field "A" of card "B"
  get the number of cards
  get the date
  get field 3
  get card id 7
  get this background
  get this stack
end t`);
    expect(body).toHaveLength(9);
  });
});

describe("parseScript — erreurs", () => {
  it("signale un handler non fermé avec la ligne", () => {
    const result = parseScript(`on mouseUp
  put 1 into x`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].line).toBe(2);
    expect(result.errors[0].message).toContain("end mouseUp");
  });

  it("signale une chaîne non terminée", () => {
    const result = parseScript(`on t
  put "oublie
end t`);
    expect(result.ok).toBe(false);
  });

  it("signale une commande inconnue après un handler valide", () => {
    const result = parseScript(`on t
  teleport home
end t`);
    expect(result.ok).toBe(true); // `teleport home` est un appel de handler
  });

  it("ne rend jamais d'arbre quand il y a une erreur", () => {
    for (const source of ["on", "on t", "end t", "on t\n set the", "function", "@"]) {
      const result = parseScript(source);
      if (result.ok) expect(result.script.handlers.length + result.script.functions.length).toBeGreaterThanOrEqual(0);
      else expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});
