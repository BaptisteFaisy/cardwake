/**
 * Le lanceur du jeu d'évaluation, sans réseau : un faux modèle répond, le
 * vrai moteur joue, le vérificateur juge. Rien n'est simulé — sauf le
 * modèle, qui est le seul endroit où l'argent entre (CAR-N-09).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FakeModel, textResponse } from "@cardwake/agent";
import { validateStack } from "@cardwake/model";
import { loadTasks } from "./check";
import { runTask, stackSummaryOf, targetOf } from "./runner";
import type { RunnerOptions } from "./runner";

const REFERENCE = readFileSync("docs/language.md", "utf8");

/** Le bon script pour `calcul-01` : la somme des lignes. */
const GOOD_SCRIPT = [
  "on mouseUp",
  "  put 0 into total",
  '  repeat for each line row in field "Lines"',
  "    add item 2 of row * item 3 of row to total",
  "  end repeat",
  '  put total into field "Subtotal"',
  "end mouseUp",
].join("\n");

/** Un script qui compile mais calcule faux. */
const WRONG_SCRIPT = ["on mouseUp", '  put "0" into field "Subtotal"', "end mouseUp"].join("\n");

/** Un faux modèle qui répond toujours le même script. */
function modelWith(script: string): FakeModel {
  return new FakeModel({
    respond: () =>
      textResponse(JSON.stringify({ script, summary: "a script", assumptions: [], questions: [] })),
  });
}

/** Les options du lanceur, sans réseau et à l'horloge figée. */
function optionsFor(model: FakeModel): RunnerOptions {
  return {
    gateway: model,
    languageReference: REFERENCE,
    seed: 2026,
    clock: () => "1970-01-01T00:00:00.000Z",
    model: "fake",
  };
}

/** La tâche `calcul-01`, telle que le jeu la lit. */
function taskOf(id: string) {
  const loaded = loadTasks("evals/compile");
  if (!loaded.ok) throw new Error(loaded.errors.join("; "));
  const task = loaded.tasks.find((item) => item.id === id);
  if (!task) throw new Error(`no task named "${id}"`);
  return task;
}

describe("targetOf", () => {
  it("finds the part named by the task", () => {
    const validated = validateStack(taskOf("calcul-01").stack);
    if (!validated.ok) throw new Error(validated.errors.join("; "));
    const target = targetOf(validated.stack, "Invoice/Total");
    expect(typeof target).not.toBe("string");
    if (typeof target === "string") return;
    expect(target.kind).toBe("button");
    expect(target.name).toBe("Total");
  });

  it("says when the card does not exist", () => {
    const validated = validateStack(taskOf("calcul-01").stack);
    if (!validated.ok) throw new Error(validated.errors.join("; "));
    expect(typeof targetOf(validated.stack, "Nope/Total")).toBe("string");
  });
});

describe("stackSummaryOf", () => {
  it("names the stack, the card and the parts", () => {
    const loaded = loadTasks("evals/compile");
    if (!loaded.ok) throw new Error(loaded.errors.join("; "));
    const task = taskOf("calcul-01");
    const summary = stackSummaryOf(task.stack as never, task.object);
    expect(summary).toContain("Invoice");
    expect(summary).toContain('field "Lines"');
    expect(summary).toContain('button "Total"');
  });
});

describe("runTask", () => {
  it("judges a task ok when the script does what the phrase asked", async () => {
    const model = modelWith(GOOD_SCRIPT);
    const outcome = await runTask(taskOf("calcul-01"), optionsFor(model));
    expect(outcome.status).toBe("ok");
    expect(outcome.failures).toEqual([]);
    expect(outcome.calls).toBe(1);
    expect(outcome.paraphrase.length).toBeGreaterThan(0);
  });

  it("fails a task whose script computes the wrong thing", async () => {
    const model = modelWith(WRONG_SCRIPT);
    const outcome = await runTask(taskOf("calcul-01"), optionsFor(model));
    expect(outcome.status).toBe("failed");
    expect(outcome.failures.join(" ")).toContain("Subtotal");
  });

  it("clicks the button even when a field carries the same name", async () => {
    // `calcul-03` porte un champ « Average » ET un bouton « Average » : le
    // premier trouvé gagnerait, un clic sur le champ ne déclencherait rien,
    // et le jeu mesurerait le silence au lieu du modèle.
    const model = modelWith(['on mouseUp', '  put "12" into field "Average"', "end mouseUp"].join("\n"));
    const outcome = await runTask(taskOf("calcul-03"), optionsFor(model));
    expect(outcome.status).toBe("ok");
  });

  it("counts the calls it makes to the model", async () => {
    const model = modelWith(GOOD_SCRIPT);
    const outcome = await runTask(taskOf("calcul-01"), optionsFor(model));
    expect(model.callCount).toBe(1);
    expect(outcome.inputTokens).toBeGreaterThan(0);
  });
});
