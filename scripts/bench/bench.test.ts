/**
 * Le banc se vérifie lui-même : les jeux d'essai sont bien ceux annoncés, et
 * toutes les mesures rendent des nombres cohérents.
 *
 * Aucune durée n'est comparée à une valeur précise : la CI est lente et
 * variable, une borne serrée rendrait ce test instable. On vérifie la forme —
 * une mesure par cible, des valeurs finies et positives, un p95 au-dessus de
 * la médiane — et le verdict, jamais le temps.
 */

import { describe, expect, it } from "vitest";
import { QUICK, checkFixtures, runBench } from "./bench";
import { CARD_COUNT, SCRIPT_LINES, scriptOf200Lines, stackOf100 } from "./fixtures";
import { median, p95 } from "./mesure";
import { parseScript } from "@cardwake/lang";

describe("jeux d'essai", () => {
  it("la pile compte 100 cartes et se relit sans perte", () => {
    expect(stackOf100().cards).toHaveLength(CARD_COUNT);
    expect(() => checkFixtures()).not.toThrow();
  });

  it("le script fait exactement 200 lignes et s'analyse", () => {
    const source = scriptOf200Lines();
    expect(source.split("\n")).toHaveLength(SCRIPT_LINES);
    expect(parseScript(source).ok).toBe(true);
  });
});

describe("mesures", () => {
  it("rend une mesure par cible, avec médiane et p95 cohérents", async () => {
    const mesures = await runBench(QUICK);
    expect(mesures.map((mesure) => mesure.id)).toEqual([
      "changement-carte",
      "ouverture-pile",
      "analyse-script",
      "etapes-interpreteur",
      "evenement-indication",
      "tour-agent",
    ]);
    for (const mesure of mesures) {
      if (mesure.verdict === "mesuré ailleurs") {
        expect(mesure.mediane).toBeNull();
        expect(mesure.tours).toBe(0);
        continue;
      }
      expect(mesure.mediane).not.toBeNull();
      expect(mesure.p95).not.toBeNull();
      expect(Number.isFinite(mesure.mediane)).toBe(true);
      expect(mesure.mediane ?? -1).toBeGreaterThanOrEqual(0);
      expect(mesure.p95 ?? -1).toBeGreaterThanOrEqual(mesure.mediane ?? 0);
      expect(mesure.tours).toBeGreaterThan(0);
      expect(["atteint", "non atteint"]).toContain(mesure.verdict);
    }
  });
});

describe("primitives de mesure", () => {
  it("médiane et p95 sur des listes connues", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(p95(Array.from({ length: 100 }, (_, index) => index))).toBe(94);
  });
});