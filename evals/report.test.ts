/**
 * Le rapport se relit sans lancer le jeu : les fonctions pures de
 * `evals/report.ts` disent, pour chaque famille, ce qui a échoué et pourquoi.
 * C'est la colonne qui guide la correction — elle doit être juste.
 */

import { describe, expect, it } from "vitest";
import { causeOf, causesOf, familyTable, topCause } from "./report";
import type { GameReport, TaskOutcome } from "./runner";

/** Une tâche, avec le verdict qu'on veut raconter. */
function outcome(overrides: Partial<TaskOutcome>): TaskOutcome {
  return {
    id: "t-1",
    family: "loops",
    status: "failed",
    script: null,
    paraphrase: [],
    failures: [],
    errors: [],
    calls: 1,
    inputTokens: 0,
    outputTokens: 0,
    firstTry: false,
    repaired: false,
    attempts: 1,
    ...overrides,
  };
}

/** Un rapport, avec les tâches qu'on veut raconter. */
function report(tasks: TaskOutcome[]): GameReport {
  return {
    startedAt: "1970-01-01T00:00:00.000Z",
    model: "fake",
    total: tasks.length,
    ok: tasks.filter((task) => task.status === "ok").length,
    okFirstTry: tasks.filter((task) => task.firstTry).length,
    repaired: tasks.filter((task) => task.repaired).length,
    byFamily: {
      loops: {
        total: tasks.length,
        ok: tasks.filter((task) => task.status === "ok").length,
        firstTry: tasks.filter((task) => task.firstTry).length,
      },
    },
    tasks,
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
}

describe("la cause d'un échec", () => {
  it("distingue une panne du modèle d'un script qui rend faux", () => {
    const panne = outcome({ errors: ["The model gateway failed: The model provider refused the call (status 502)"] });
    const faux = outcome({ failures: ['field "Doubled" is "\\n60", expected "20\\n40\\n60"'] });
    expect(causeOf(panne)).toBe("panne du modèle");
    expect(causeOf(faux)).toBe("pile fausse");
  });

  it("compte les causes par famille, de la plus fréquente à la moins", () => {
    const tasks = [
      outcome({ id: "a", family: "loops", failures: ["reste faux"] }),
      outcome({ id: "b", family: "loops", failures: ["reste faux aussi"] }),
      outcome({ id: "c", family: "loops", errors: ["The model call failed: 429"] }),
    ];
    const built = report(tasks);
    expect(causesOf(built, "loops")).toEqual(["pile fausse (2)", "panne du modèle (1)"]);
    expect(topCause(built, "loops")).toBe("pile fausse (2), panne du modèle (1)");
  });

  it("n'invente pas de cause quand la famille a réussi", () => {
    const built = report([outcome({ status: "ok", firstTry: true })]);
    expect(topCause(built, "loops")).toBe("—");
  });

  it("met la première cause d'échec dans le tableau des familles", () => {
    const built = report([outcome({ failures: ["reste faux"] })]);
    const table = familyTable(built);
    expect(table).toContain("première cause d'échec");
    expect(table).toContain("pile fausse (1)");
  });
});
