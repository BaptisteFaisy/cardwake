/**
 * Tests des preuves recalculées (`src/proofs`) : les six démonstrations
 * tournent sur le moteur réel du site, sans jsdom — ce sont des fonctions
 * pures qui rendent des données, et ce sont ces données que l'écran affiche.
 */
import { describe, expect, it } from "vitest";
import {
  demoManor,
  demoQuote,
  demoReplay,
  demoRights,
  demoSpy,
  demoUndo,
} from "../src/proofs";
import type { ProofDemo } from "../src/proofs";

/** Toutes les lignes d'une preuve, à plat, pour chercher dedans. */
function joined(demo: ProofDemo): string {
  return demo.lines.join("\n");
}

describe("les six preuves recalculées", () => {
  it("le devis calcule 150, 15 et 165 dans le navigateur", async () => {
    const demo = await demoQuote();
    expect(demo.ok).toBe(true);
    const text = joined(demo);
    expect(text).toContain("150");
    expect(text).toContain("15");
    expect(text).toContain("165");
  });

  it("le manoir : le garde écrit alarmed, le cuisinier nervous", async () => {
    const demo = await demoManor();
    expect(demo.ok).toBe(true);
    const text = joined(demo);
    expect(text).toContain("alarmed");
    expect(text).toContain("nervous");
  });

  it("l'espion montre le chemin du message, son handler et les sauts", async () => {
    const demo = await demoSpy();
    expect(demo.ok).toBe(true);
    const text = joined(demo);
    expect(text).toContain("path: ");
    expect(text).toContain('handled by: agent of card "Guard"');
    expect(text).toContain("hops left: 1");
  });

  it("les droits refusent l'écriture de niveau 1 avec level-too-low", async () => {
    const demo = await demoRights();
    expect(demo.ok).toBe(true);
    const text = joined(demo);
    expect(text).toContain("level-too-low");
    expect(text).toContain("stack unchanged");
  });

  it("le rejeu de la même situation donne le même état final", async () => {
    const demo = await demoReplay();
    expect(demo.ok).toBe(true);
    expect(joined(demo)).toContain("identical: yes");
  });

  it("une écriture puis son annulation rendent la pile identique", async () => {
    const demo = await demoUndo();
    expect(demo.ok).toBe(true);
    expect(joined(demo)).toContain("identical: yes");
  });

  it("chaque preuve rend des étapes intermédiaires lisibles", async () => {
    const demos = await Promise.all([
      demoQuote(),
      demoManor(),
      demoSpy(),
      demoRights(),
      demoReplay(),
      demoUndo(),
    ]);
    for (const demo of demos) {
      expect(demo.lines.length).toBeGreaterThan(1);
      for (const line of demo.lines) expect(line.trim()).not.toBe("");
    }
  });

  it("rejouer une preuve ne change pas son verdict ni ses lignes", async () => {
    const first = await demoQuote();
    const second = await demoQuote();
    expect(second).toEqual(first);
  });
});
