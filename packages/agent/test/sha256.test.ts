import { describe, expect, it } from "vitest";
import { sha256Bytes, sha256Hex, toHex, utf8Bytes } from "../src/gateway/sha256";

/**
 * Les trois vecteurs publiés par FIPS 180-4 / le RFC 6234 : chaîne vide,
 * "abc" et la phrase pangramme. Ils suffisent à prouver que l'implémentation
 * pure TypeScript coïncide avec celle de Node et du navigateur.
 */
const VECTORS: readonly [string, string][] = [
  ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
  ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
  [
    "The quick brown fox jumps over the lazy dog",
    "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
  ],
];

describe("sha256", () => {
  it.each(VECTORS)("condense %p", (input, expected) => {
    expect(sha256Hex(input)).toBe(expected);
  });

  it("coïncide avec le condensat natif de Node sur les trois vecteurs", async () => {
    const { createHash } = await import("node:crypto");
    for (const [input, expected] of VECTORS) {
      expect(createHash("sha256").update(input).digest("hex")).toBe(expected);
    }
  });

  it("accepte des octets et rend 32 octets", () => {
    const digest = sha256Bytes(utf8Bytes("abc"));
    expect(digest).toHaveLength(32);
    expect(toHex(digest)).toBe(VECTORS[1][1]);
  });

  it("traite un texte multi-octets (UTF-8) comme Node", async () => {
    const { createHash } = await import("node:crypto");
    const text = "éèà — 🦀 pile de démonstration";
    expect(sha256Hex(text)).toBe(createHash("sha256").update(text).digest("hex"));
  });

  it("couvre plusieurs blocs (bourrage et longueur sur 64 bits)", async () => {
    const { createHash } = await import("node:crypto");
    for (const size of [55, 56, 63, 64, 65, 119, 120, 1000]) {
      const text = "a".repeat(size);
      expect(sha256Hex(text)).toBe(createHash("sha256").update(text).digest("hex"));
    }
  });

  it("est déterministe : deux appels rendent la même empreinte", () => {
    expect(sha256Hex("abc")).toBe(sha256Hex("abc"));
    expect(sha256Hex("abc")).not.toBe(sha256Hex("abd"));
  });
});