/**
 * Contrôles du jeu d'évaluation, sans aucun appel réseau ni modèle :
 * - les 40 fichiers de `evals/compile` se chargent et sont valides ;
 * - les comptes par famille sont exactement 8/8/6/6/6/6 ;
 * - chaque id est unique, chaque phrase fait au moins 20 caractères ;
 * - chaque `object` désigne un objet qui existe dans la pile de la tâche ;
 * - chaque tâche porte au moins une attente ;
 * - preuve de cohérence : pour une tâche par famille, on applique réellement
 *   les opérations correspondantes avec `applyOps`, puis `checkTask` doit
 *   rendre ok — les attentes sont atteignables et le vérificateur fonctionne.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyOps, byName, findCard, findPart, type Op, type Stack } from "@cardwake/model";
import { checkTask, loadTasks } from "./check";
import { validateTask, type EvalTask } from "./schema";

const DIR = join(import.meta.dirname, "compile");
const PER_FAMILY: Record<EvalTask["family"], number> = {
  calcul: 8, chunks: 8, navigation: 6, conditions: 6, loops: 6, agents: 6,
};

const loaded = loadTasks(DIR);
const tasks = loaded.ok ? loaded.tasks : [];
const fileCount = readdirSync(DIR).filter((name) => name.endsWith(".json")).length;

/** La pile a déjà été validée par loadTasks : le cast est sûr ici. */
function asStack(task: EvalTask): Stack {
  return task.stack as Stack;
}

/** Carte et élément nommés d'une tâche, pour écrire les preuves sans ids en dur. */
function partId(stack: Stack, cardName: string, partName: string): { cardId: number; id: number } {
  const card = findCard(stack, byName(cardName));
  const found = card ? findPart(stack, card.id, byName(partName)) : undefined;
  if (!card || !found) throw new Error(`proof names a missing object: ${cardName}/${partName}`);
  return { cardId: card.id, id: found.part.id };
}

function setText(stack: Stack, cardName: string, partName: string, after: string): Op {
  const target = partId(stack, cardName, partName);
  return { kind: "setText", cardId: target.cardId, partId: target.id, before: "", after, inkBefore: null, inkAfter: null };
}

function navigateTo(stack: Stack, cardName: string): Op {
  const card = findCard(stack, byName(cardName));
  if (!card) throw new Error(`proof names a missing card: ${cardName}`);
  return { kind: "navigate", before: stack.currentCardId, after: card.id };
}

describe("the corpus of 40 tasks", () => {
  it("loads every file as a valid task", () => {
    expect(loaded.ok, loaded.ok ? "" : loaded.errors.join("\n")).toBe(true);
    expect(fileCount).toBe(40);
    expect(tasks).toHaveLength(40);
  });

  it("counts exactly 8/8/6/6/6/6 per family", () => {
    for (const family of Object.keys(PER_FAMILY) as EvalTask["family"][]) {
      expect(tasks.filter((task) => task.family === family), family).toHaveLength(PER_FAMILY[family]);
    }
  });

  it("gives every task a unique id", () => {
    expect(new Set(tasks.map((task) => task.id)).size).toBe(tasks.length);
  });

  it("writes every phrase in at least 20 characters", () => {
    for (const task of tasks) expect(task.phrase.length, task.id).toBeGreaterThanOrEqual(20);
  });

  it("targets an object that exists in the task's stack", () => {
    for (const task of tasks) {
      const stack = asStack(task);
      const slash = task.object.indexOf("/");
      expect(slash, task.object).toBeGreaterThan(0);
      const card = findCard(stack, byName(task.object.slice(0, slash)));
      expect(card, task.object).toBeDefined();
      const found = card ? findPart(stack, card.id, byName(task.object.slice(slash + 1))) : undefined;
      expect(found, task.object).toBeDefined();
    }
  });

  it("gives every task at least one expectation", () => {
    for (const task of tasks) expect(task.expect.length, task.id).toBeGreaterThan(0);
  });

  it("rejects a broken task and names the path of each problem", () => {
    const sample = tasks[0];
    expect(sample).toBeDefined();
    const broken = { ...sample, phrase: "too short", expect: [{ kind: "nope" }] };
    const result = validateTask(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("task.phrase"))).toBe(true);
      expect(result.errors.some((error) => error.includes("task.expect[0].kind"))).toBe(true);
    }
  });
});

/**
 * Une preuve par famille : les opérations qu'un script correct produirait,
 * résolues par nom dans la pile de départ (aucun identifiant en dur).
 */
const PROOFS: { id: string; ops: (stack: Stack) => Op[] }[] = [
  {
    id: "calcul-01",
    ops: (stack) => [setText(stack, "Invoice", "Subtotal", "15")],
  },
  {
    id: "chunks-06",
    ops: (stack) => [setText(stack, "Prices", "Sorted", "5\n12\n30")],
  },
  {
    id: "navigation-05",
    ops: (stack) => [navigateTo(stack, "End")],
  },
  {
    id: "conditions-02",
    ops: (stack) => [setText(stack, "Tasks", "List", "water the plants\nrepot the fern")],
  },
  {
    id: "loops-02",
    ops: (stack) => [
      setText(stack, "Chalkboard", "Table", "1 x 5 = 5\n2 x 5 = 10\n3 x 5 = 15\n4 x 5 = 20\n5 x 5 = 25"),
    ],
  },
  {
    id: "agents-06",
    ops: (stack) => [setText(stack, "Oracle", "Heard", "HEARD: amber")],
  },
];

describe("consistency: the expectations are really reachable", () => {
  for (const proof of PROOFS) {
    it(`${proof.id}: checkTask fails on the starting stack and passes after applyOps`, () => {
      const task = tasks.find((item) => item.id === proof.id);
      expect(task, proof.id).toBeDefined();
      if (!task) return;
      const start = asStack(task);
      // Rien n'a encore été fait : au moins une attente doit manquer.
      expect(checkTask(task, start).ok, proof.id).toBe(false);
      const final = applyOps(start, proof.ops(start));
      expect(checkTask(task, final)).toEqual({ ok: true, failures: [] });
    });
  }

  it("covers the six families with at least one proof each", () => {
    const proven = PROOFS.map((proof) => tasks.find((task) => task.id === proof.id)?.family);
    expect(new Set(proven).size).toBe(6);
  });
});
