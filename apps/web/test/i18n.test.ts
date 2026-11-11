/**
 * Tests du dictionnaire de textes (12.2) : aucune clé manquante, aucune
 * valeur vide, chaque état du brief a son texte, `t()` retombe sur la clé.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  REQUIRED_KEYS,
  STATE_KEYS,
  missingKeys,
  resetMissingKeys,
  t,
} from "../src/i18n";

beforeEach(() => {
  resetMissingKeys();
});

describe("dictionnaire", () => {
  it("aucune clé du dictionnaire ne manque ni ne rend une valeur vide", () => {
    for (const key of REQUIRED_KEYS) {
      const text = t(key);
      expect(text, `clé « ${key} »`).not.toBe(key);
      expect(text.trim().length, `valeur de « ${key} »`).toBeGreaterThan(0);
    }
    expect(missingKeys()).toEqual([]);
  });

  it("chacun des états du brief 12.2 a son texte", () => {
    expect(STATE_KEYS).toHaveLength(18);
    for (const key of STATE_KEYS) {
      expect(REQUIRED_KEYS).toContain(key);
      expect(t(key).trim().length).toBeGreaterThan(0);
    }
    expect(missingKeys()).toEqual([]);
  });

  it("une clé inconnue retombe sur la clé et se signale", () => {
    expect(t("no.such.key")).toBe("no.such.key");
    expect(missingKeys()).toEqual(["no.such.key"]);
  });
});

describe("interpolation", () => {
  it("remplace les paramètres nommés", () => {
    expect(t("play.cardOf", { index: 2, count: 5 })).toBe("Card 2 of 5");
  });

  it("laisse tel quel un paramètre absent", () => {
    expect(t("play.cardOf", { index: 2 })).toBe("Card 2 of {count}");
  });
});
