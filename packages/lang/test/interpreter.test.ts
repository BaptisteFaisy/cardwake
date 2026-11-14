/**
 * L'interpréteur de bout en bout : les trois scripts du cahier des charges,
 * les garde-fous (CAR-P-06) et le déterminisme (CAR-P-04).
 */

import { describe, expect, it } from "vitest";
import { parseScript } from "../src/parser";
import { runHandler } from "../src/interpreter";
import type { Script } from "../src/ast";
import { FakeHost, fakeWorld, readField } from "./fake-host";

function scriptOf(source: string): Script {
  const parsed = parseScript(source);
  if (!parsed.ok) throw new Error(parsed.errors.map((e) => e.message).join(" | "));
  return parsed.script;
}

async function run(source: string, fields: Record<string, string>, host?: FakeHost) {
  const world = fakeWorld(fields);
  const fake = host ?? new FakeHost(world);
  const result = await runHandler(scriptOf(source), "mouseUp", [], fake);
  return { result, world, host: fake };
}

const TODO = `on mouseUp
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

const AMULET = `on mouseUp
  consult agent with "The visitor shows you a silver amulet."
  put it into field "Says"
end mouseUp`;

describe("les trois scripts du cahier des charges", () => {
  it("la liste de tâches ajoute la ligne et vide la saisie", async () => {
    const { world } = await run(TODO, { New: "buy milk", Tasks: "" });
    expect(readField(world, "One", "Tasks")).toBe("buy milk");
    expect(readField(world, "One", "New")).toBe("");
  });

  it("une saisie vide ne fait rien (exit handler)", async () => {
    const { world, host } = await run(TODO, { New: "", Tasks: "old" });
    expect(readField(world, "One", "Tasks")).toBe("old");
    expect(host.trace.length).toBe(0);
  });

  it("le devis calcule le sous-total, la TVA et le total", async () => {
    const { world } = await run(QUOTE, {
      Lines: "Tap replacement,1,85\nPipe joint,2,32.5",
      Subtotal: "",
      VAT: "",
      Total: "",
    });
    expect(readField(world, "One", "Subtotal")).toBe("150");
    expect(readField(world, "One", "VAT")).toBe("15");
    expect(readField(world, "One", "Total")).toBe("165");
  });

  it("le bouton du manoir consulte l'agent et écrit sa réponse", async () => {
    const { world, host } = await run(AMULET, { Says: "" });
    expect(readField(world, "One", "Says")).toBe("Where did you get that?");
    expect(host.trace.some((line) => line.text.includes("consult agent"))).toBe(true);
  });
});

describe("commandes et conteneurs", () => {
  it("écrit dans un morceau désigné", async () => {
    const { world } = await run('on mouseUp\n  put "payé" into word 2 of field "Notes"\nend mouseUp', {
      Notes: "un deux trois",
    });
    expect(readField(world, "One", "Notes", "word", 1)).toBe("un");
    expect(world.cards[0].parts.find((p) => p.name === "Notes")?.kind === "field" && true).toBe(true);
    expect((world.cards[0].parts.find((p) => p.name === "Notes") as { text: string }).text).toBe("un payé trois");
  });

  it("envoie un message, laisse monter, navigue et attend", async () => {
    const source = `on mouseUp
  send "refresh" with 1 to this card
  pass mouseUp
  go to card "Two"
  wait 200 ms
  answer "done"
end mouseUp`;
    const { host, world } = await run(source, {});
    expect(host.messages[0]).toMatchObject({ name: "refresh", args: ["1"] });
    expect(host.passed).toEqual(["mouseUp"]);
    expect(world.currentCardId).toBe(20);
    expect(host.waits).toEqual([200]);
    expect(host.answers).toEqual(["done"]);
  });

  it("les constantes return, tab et comma valent leur caractère", async () => {
    const { world } = await run('on mouseUp\n  put "a" & return & "b" & tab & comma into field "Note"\nend mouseUp', { Note: "" });
    expect((world.cards[0].parts.find((p) => p.name === "Note") as { text: string }).text).toBe("a\nb\t,");
  });
});

describe("les trois modes du put, sur tout conteneur", () => {
  // La référence l'écrit pour tout conteneur (docs/language.md, « put ») :
  // `into` remplace, `before` et `after` insèrent. Une variable n'est pas une
  // exception — c'est ce que ces tests verrouillent, un seul calcul servant
  // à la variable, à `it` et au champ.
  it("`after` et `before` insèrent dans une variable, `into` remplace", async () => {
    const source = `on mouseUp
  put "a" into acc
  put "b" after acc
  put "c" before acc
  put acc into field "Out"
end mouseUp`;
    const { world } = await run(source, { Out: "" });
    expect(readField(world, "One", "Out")).toBe("cab");
  });

  it("`it` s'ajoute comme une variable", async () => {
    const source = `on mouseUp
  get "a"
  put "b" after it
  put it into field "Out"
end mouseUp`;
    const { world } = await run(source, { Out: "" });
    expect(readField(world, "One", "Out")).toBe("ab");
  });

  it("une variable vide reçoit la valeur, sans texte devant", async () => {
    const source = `on mouseUp
  put empty into acc
  put "seul" after acc
  put acc into field "Out"
end mouseUp`;
    const { world } = await run(source, { Out: "" });
    expect(readField(world, "One", "Out")).toBe("seul");
  });

  it("un morceau de variable se lit mais ne s'écrit pas : l'erreur reste lisible", async () => {
    const source = `on mouseUp
  put "un deux" into acc
  put word 1 of acc into field "Out"
  put "trois" into word 1 of acc
end mouseUp`;
    const { world, result } = await run(source, { Out: "" });
    expect(readField(world, "One", "Out")).toBe("un");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("field");
  });
});

describe("garde-fous et déterminisme", () => {
  it("CAR-P-06 : une boucle sans fin s'arrête sous maxSteps", async () => {
    const world = fakeWorld({});
    const host = new FakeHost(world, { maxSteps: 400 });
    const result = await runHandler(scriptOf("on mouseUp\n  repeat while true\n  end repeat\nend mouseUp"), "mouseUp", [], host);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe("halted");
      expect(result.steps).toBeLessThanOrEqual(401);
    }
  });

  it("l'attente cumulée est bornée", async () => {
    const world = fakeWorld({});
    const host = new FakeHost(world, { maxWaitMs: 500 });
    const result = await runHandler(
      scriptOf("on mouseUp\n  repeat with i = 1 to 10\n    wait 200 ms\n  end repeat\nend mouseUp"),
      "mouseUp",
      [],
      host,
    );
    expect(result.ok).toBe(false);
  });

  it("CAR-P-04 : même graine, exactement la même suite d'effets", async () => {
    const source = `on mouseUp
  put random(6) into field "Note"
  put random(6) after field "Note"
  send "tick" to this card
end mouseUp`;
    const first = await run(source, { Note: "" }, new FakeHost(fakeWorld({ Note: "" }), { seed: 11 }));
    const second = await run(source, { Note: "" }, new FakeHost(fakeWorld({ Note: "" }), { seed: 11 }));
    expect(first.host.trace.map((t) => t.text)).toEqual(second.host.trace.map((t) => t.text));
    expect(readField(first.world, "One", "Note")).toBe(readField(second.world, "One", "Note"));
  });

  it("une division par zéro rend une erreur lisible, pas une exception", async () => {
    const result = await run('on mouseUp\n  put 1 / 0 into field "Note"\nend mouseUp', { Note: "" });
    expect(result.result.ok).toBe(false);
    if (!result.result.ok) expect(result.result.error.message).toContain("Division by zero");
  });
});
