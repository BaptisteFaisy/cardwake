/**
 * Les tests du registre de preuves : la table fait foi, et elle est vérifiée.
 *
 * Ce fichier vérifie trois choses : les 29 identifiants de la table sont
 * présents et dans l'ordre, chaque commande cite un fichier qui existe
 * vraiment (le coupable est nommé), et les démonstrations locales calculent
 * ce qu'elles promettent — le devis 150 / 15 / 165, le manoir, l'espion et
 * le rejeu.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PROOFS, proofById } from "./registry";
import { runProof } from "./runner";
import { buildRows, renderMarkdown } from "./report";
import type { ProofResult } from "./runner";

/** La racine du dépôt, déduite de ce fichier et non du répertoire courant. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Les identifiants attendus : la table, de P-01 à P-29. */
const EXPECTED_IDS = Array.from({ length: 29 }, (_, index) => `P-${String(index + 1).padStart(2, "0")}`);

/** Un résultat factice : le rapport se lit sans lancer les 29 preuves. */
function fakeResult(id: string): ProofResult {
  return { id, ok: true, durationMs: 12, summary: "exit 0, ran" };
}

describe("le registre des preuves", () => {
  it("porte les 29 preuves de la table, dans l'ordre", () => {
    expect(PROOFS.map((proof) => proof.id)).toEqual(EXPECTED_IDS);
    expect(PROOFS).toHaveLength(29);
    for (const proof of PROOFS) {
      expect(proof.step.length, `${proof.id} has no step`).toBeGreaterThan(0);
      expect(proof.claim.length, `${proof.id} has no claim`).toBeGreaterThan(0);
      expect(proof.command.startsWith("npx vitest run "), `${proof.id} command: ${proof.command}`).toBe(true);
      expect(["vitest", "property", "demo"]).toContain(proof.kind);
    }
  });

  it("cite un fichier qui existe, et nomme le coupable sinon", () => {
    for (const proof of PROOFS) {
      const file = proof.file ?? "";
      expect(file.length, `${proof.id} cites no file`).toBeGreaterThan(0);
      expect(existsSync(join(ROOT, file)), `${proof.id} cites a missing file: ${file}`).toBe(true);
    }
  });

  it("répartit les genres comme la table le demande", () => {
    const demos = PROOFS.filter((proof) => proof.kind === "demo").map((proof) => proof.id);
    const properties = PROOFS.filter((proof) => proof.kind === "property").map((proof) => proof.id);
    expect(demos).toEqual(["P-20", "P-24", "P-25", "P-26"]);
    expect(properties).toEqual(["P-13", "P-16", "P-17", "P-19", "P-22"]);
  });

  it("refuse un identifiant inconnu", () => {
    expect(() => proofById("P-99")).toThrow(/P-01 to P-29/);
  });
});

describe("les démonstrations locales", () => {
  it("P-24 : le devis calcule 150 / 15 / 165", async () => {
    const result = await runProof(proofById("P-24"));
    expect(result.ok, result.summary).toBe(true);
    expect(result.summary).toContain("150 / 15 / 165");
  });

  it("P-25 : le garde alerte et la cuisinière sait déjà", async () => {
    const result = await runProof(proofById("P-25"));
    expect(result.ok, result.summary).toBe(true);
    expect(result.summary).toContain("alarmed");
    expect(result.summary).toContain("nervous");
  });

  it("P-26 : l'espion montre le chemin et le refus", async () => {
    const result = await runProof(proofById("P-26"));
    expect(result.ok, result.summary).toBe(true);
    expect(result.summary).toContain("locked-field");
  });

  it("P-20 : le rejeu redonne le même état final", async () => {
    const result = await runProof(proofById("P-20"));
    expect(result.ok, result.summary).toBe(true);
    expect(result.summary).toContain("same final state");
  });
});

describe("le coureur de preuves", () => {
  it("exécute la commande et reconnaît le fichier testé", async () => {
    const result = await runProof(proofById("P-05"));
    expect(result.ok, result.summary).toBe(true);
    expect(result.output ?? "").toContain("values-chunks.test.ts");
  });

  it("marque « absent » une preuve dont le fichier manque", async () => {
    const ghost = { ...proofById("P-05"), file: "packages/proofs/ghost.test.ts" };
    const result = await runProof(ghost);
    expect(result.ok).toBe(false);
    expect(result.summary.startsWith("absent")).toBe(true);
  });
});

describe("le rapport", () => {
  it("écrit une ligne par preuve", () => {
    const rows = buildRows(PROOFS.map((proof) => fakeResult(proof.id)));
    const markdown = renderMarkdown(rows);
    const lines = markdown.split("\n").filter((line) => line.startsWith("| P-"));
    expect(lines).toHaveLength(29);
    expect(markdown).toContain("| P-01 |");
    expect(markdown).toContain("| P-29 |");
  });
});
