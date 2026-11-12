/**
 * Les cassettes livrées des trois piles de démonstration (7.11).
 *
 * Quatre contrôles, tous sans réseau ni clé :
 * - chaque pile a une cassette valide, et chaque parcours y laisse au moins
 *   une empreinte (CAR-P-19) ;
 * - rejouer chaque scénario avec la cassette chargée du fichier rend
 *   EXACTEMENT le même état final que l'enregistrement (CAR-P-20) ;
 * - aucune entrée ne contient de clé ni de texte qui y ressemble (CAR-P-22) ;
 * - une situation non enregistrée lève `CassetteMiss`, lisible en anglais.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CassetteEntry } from "@cardwake/model";
import { CassetteGateway, CassetteMiss } from "../src";
import { recordScenario, replayScenario } from "../src/cassette-recorder";
import { makeRequest } from "../src/testing/fake-model";
import { SCENARIOS, STACK_NAMES, cassetteFileFor, loadStack } from "../../../scripts/cassettes/build";
import type { StackName } from "../../../scripts/cassettes/build";

/** La forme d'un fichier cassette tel qu'il est livré. */
type CassetteFile = { mode: string; entries: readonly CassetteEntry[] };

/** Lit et décode une cassette livrée ; une absence ou un JSON faux échoue ici. */
function readCassette(name: StackName): CassetteFile {
  return JSON.parse(readFileSync(cassetteFileFor(name), "utf8")) as CassetteFile;
}

const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /BEGIN [A-Z ]*PRIVATE KEY/,
  /api[_-]?key/i,
  /\bBearer\s+/,
];

describe("les cassettes livrées", () => {
  it("chaque pile a une cassette valide, avec au moins une entrée par parcours", async () => {
    for (const name of STACK_NAMES) {
      const file = readCassette(name);
      expect(file.mode, name).toBe("cassette");
      expect(file.entries.length, name).toBeGreaterThan(0);
      const recording = await recordScenario(loadStack(name), SCENARIOS[name]);
      for (const step of recording.steps) {
        const where = `${name}: ${JSON.stringify(step.action)}`;
        expect(step.fingerprints.length, where).toBeGreaterThan(0);
        for (const fp of step.fingerprints) {
          expect(file.entries.some((entry) => entry.fingerprint === fp), `${where} — ${fp}`).toBe(true);
        }
      }
    }
  });

  it("rejoué depuis le fichier, chaque scénario rend exactement le même état (CAR-P-20)", async () => {
    for (const name of STACK_NAMES) {
      const stack = loadStack(name);
      const actions = SCENARIOS[name].map((step) => step.action);
      const recording = await recordScenario(stack, SCENARIOS[name]);
      const gateway = new CassetteGateway({ entries: readCassette(name).entries });
      const replay = await replayScenario(stack, actions, gateway);
      expect(replay.replies, name).toEqual(recording.steps.map((step) => step.reply));
      expect(JSON.stringify(replay.stack), `${name}: état final`).toBe(JSON.stringify(recording.stack));
    }
  });

  it("aucune entrée ne porte une clé ni un texte qui y ressemble (CAR-P-22)", () => {
    for (const name of STACK_NAMES) {
      const raw = readFileSync(cassetteFileFor(name), "utf8");
      for (const pattern of SECRET_PATTERNS) {
        expect(raw.match(pattern), `${name}: ${String(pattern)}`).toBeNull();
      }
    }
  });

  it("une situation non enregistrée lève CassetteMiss, lisible en anglais", async () => {
    const gateway = new CassetteGateway({ entries: readCassette("manor").entries });
    const unknown = makeRequest({ system: "A conversation the recorder never played." });
    const error: unknown = await gateway.call(unknown, new AbortController().signal).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(CassetteMiss);
    const miss = error as CassetteMiss;
    expect(miss.message).toContain("No recording for this situation");
    expect(miss.message).toContain("Add an API key");
    expect(miss.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});
