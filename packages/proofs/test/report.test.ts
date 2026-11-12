/**
 * Le rapport des preuves : `npm run preuves` le lance, la CI le rejoue.
 *
 * Deux rôles :
 * - imprimer le registre complet (29 preuves, commande, fichier de test) ;
 * - garantir qu'il ne pourrit pas : identifiants uniques et contigus, chaque
 *   fichier de test cité existe dans l'arbre. Un test déplacé ou renommé
 *   doit casser ici, pas sur l'écran du site.
 *
 * Aucun réseau : la seule lecture est le système de fichiers du dépôt.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROOFS } from "../src/registry";

/** Racine du dépôt : `packages/proofs/test` → trois niveaux au-dessus. */
const ROOT = join(import.meta.dirname, "..", "..", "..");

/** Une ligne du rapport, telle qu'elle s'imprime et s'affiche à l'écran. */
function reportLine(id: string, step: string, claim: string, command: string, testFile: string): string {
  return `${id} [${step}] ${claim}\n    command: ${command}\n    test:    ${testFile}`;
}

describe("le registre des 29 preuves", () => {
  it("compte exactement les identifiants P-01 à P-29, sans trou ni doublon", () => {
    expect(PROOFS).toHaveLength(29);
    const expected = Array.from({ length: 29 }, (_unused, index) => `P-${String(index + 1).padStart(2, "0")}`);
    expect(PROOFS.map((proof) => proof.id)).toEqual(expected);
  });

  it("chaque preuve a une étape, une affirmation, une commande et un test existant", () => {
    for (const proof of PROOFS) {
      expect(proof.step.trim().length, proof.id).toBeGreaterThan(0);
      expect(proof.claim.trim().length, proof.id).toBeGreaterThan(0);
      expect(proof.command, proof.id).toContain(proof.testFile);
      expect(existsSync(join(ROOT, proof.testFile)), `${proof.id} → ${proof.testFile}`).toBe(true);
    }
  });

  it("imprime le rapport complet (la sortie de `npm run preuves`)", () => {
    const report = PROOFS.map((proof) =>
      reportLine(proof.id, proof.step, proof.claim, proof.command, proof.testFile),
    );
    console.log(`Cardwake proof registry — ${PROOFS.length} proofs\n\n${report.join("\n")}\n`);
    expect(report).toHaveLength(29);
  });
});
