/**
 * Contrôles statiques (`check.ts`) : un test par règle, sur des scripts aussi
 * petits que possible. Aucun test n'exécute de script — tout est statique.
 */

import { describe, expect, it } from "vitest";
import { checkScript } from "../src/check";
import type { CheckContext, CheckIssue } from "../src/check";

/** Contexte minimal : deux cartes, deux éléments, un fond. */
const CTX: CheckContext = {
  cardNames: ["Kitchen", "Pantry"],
  partNames: ["Status", "Tasks"],
  backgroundNames: ["Invoice"],
  objectKind: "card",
};

function check(source: string, context: CheckContext = CTX): CheckIssue[] {
  return checkScript(source, context);
}

function rulesOf(issues: CheckIssue[]): string[] {
  return issues.map((issue) => issue.rule);
}

const VALID = `on mouseUp
  put "Done" into field "Status"
  go to card "Kitchen"
  send "refresh" to this card
end mouseUp

on refresh
  put round(2.5) into field "Tasks"
  exit mouseUp
end refresh`;

describe("script valide", () => {
  it("ne rend aucun problème", () => {
    expect(check(VALID)).toEqual([]);
  });
});

describe("noms inconnus", () => {
  it('field "Ghost" -> unknown-part, avec sa ligne et sa colonne', () => {
    const issues = check(`on mouseUp
  put "x" into field "Ghost"
end mouseUp`);
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe("unknown-part");
    expect(issues[0].level).toBe("error");
    expect(issues[0].line).toBe(2);
    expect(issues[0].col).toBeGreaterThan(0);
  });

  it("un champ créé par le script devient connu pour la suite", () => {
    const issues = check(`on mouseUp
  create field "Notes"
  put "x" into field "Notes"
end mouseUp`);
    expect(issues).toEqual([]);
  });

  it('card "Attic" dans go to -> unknown-card', () => {
    const issues = check(`on mouseUp
  go to card "Attic"
end mouseUp`);
    expect(rulesOf(issues)).toEqual(["unknown-card"]);
    expect(issues[0].line).toBe(2);
  });

  it('create card with background "Cellar" -> unknown-background', () => {
    const issues = check(`on mouseUp
  create card "Day 2" with background "Cellar"
end mouseUp`);
    expect(rulesOf(issues)).toEqual(["unknown-background"]);
  });
});

describe("messages et handlers", () => {
  it("exit vers un handler inexistant -> unknown-handler", () => {
    const issues = check(`on mouseUp
  exit zap
end mouseUp`);
    expect(rulesOf(issues)).toEqual(["unknown-handler"]);
    expect(issues[0].level).toBe("error");
    expect(issues[0].line).toBe(2);
  });

  it("send vers un message inconnu -> unknown-message", () => {
    const issues = check(`on mouseUp
  send "teleport" to this card
end mouseUp`);
    expect(rulesOf(issues)).toEqual(["unknown-message"]);
  });

  it("messages système et handlers du script passent sans erreur", () => {
    const issues = check(`on mouseUp
  send "closeCard" to this card
  pass mouseUp
end mouseUp`);
    expect(issues).toEqual([]);
  });

  it("deux handlers du même nom -> avertissement duplicate-handler", () => {
    const issues = check(`on mouseUp
  answer "a"
end mouseUp

on mouseUp
  answer "b"
end mouseUp`);
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe("duplicate-handler");
    expect(issues[0].level).toBe("warning");
    expect(issues[0].line).toBe(5);
  });
});

describe("taille et syntaxe", () => {
  it("20 001 caractères -> script-too-long", () => {
    const issues = check("x".repeat(20_001));
    expect(rulesOf(issues)).toEqual(["script-too-long"]);
    expect(issues[0].level).toBe("error");
  });

  it("20 000 caractères ne déclenchent pas script-too-long", () => {
    expect(rulesOf(check("x".repeat(20_000)))).not.toContain("script-too-long");
  });

  it("syntaxe cassée -> l'erreur d'analyse est reprise avec sa ligne", () => {
    const issues = check(`on mouseUp
  put into field "Status"
end mouseUp`);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].rule).toBe("parse-error");
    expect(issues[0].level).toBe("error");
    expect(issues[0].line).toBe(2);
  });
});

describe("fonctions appelées", () => {
  const CALLING = `on mouseUp
  put myTotal(2, 3) into field "Status"
end mouseUp`;

  it("fonction inconnue -> avertissement unknown-function", () => {
    const issues = check(CALLING);
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe("unknown-function");
    expect(issues[0].level).toBe("warning");
    expect(issues[0].line).toBe(2);
  });

  it("une fonction listée dans knownFunctions passe", () => {
    expect(check(CALLING, { ...CTX, knownFunctions: ["myTotal"] })).toEqual([]);
  });

  it("une fonction définie dans le script passe", () => {
    const issues = check(`${CALLING}

function myTotal a, b
  return a + b
end myTotal`);
    expect(issues).toEqual([]);
  });
});

describe("accès interdits", () => {
  it('fetch("http://x") -> forbidden-call, sans doublon unknown-function', () => {
    const issues = check(`on mouseUp
  put fetch("http://x") into field "Status"
end mouseUp`);
    expect(rulesOf(issues)).toEqual(["forbidden-call"]);
    expect(issues[0].level).toBe("error");
    expect(issues[0].line).toBe(2);
  });

  it("un appel interdit au niveau instruction est attrapé aussi", () => {
    const issues = check(`on mouseUp
  requireFile "secrets"
end mouseUp`);
    expect(rulesOf(issues)).toEqual(["forbidden-call"]);
  });
});
