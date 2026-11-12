/**
 * Les 29 preuves de la campagne, une par étape du projet : identifiant,
 * étape, ce qu'elle prouve, la commande qui la rejoue, et son verdict.
 * Contenu en anglais, comme tout ce que le site affiche ; les commandes
 * restent telles quelles, prêtes à être copiées.
 *
 * Ces preuves sont déjà jouées (verdict `verified`) : l'écran les montre à
 * côté des six preuves qui, elles, se recalculent dans le navigateur.
 */

/** Une preuve de la campagne : rejouable par sa commande. */
export type CampaignProof = {
  id: string;
  step: string;
  proves: string;
  command: string;
  verdict: "verified";
};

/** La table des preuves, dans l'ordre du projet (P-01 à P-29). */
export const CAMPAIGN_PROOFS: CampaignProof[] = [
  {
    id: "P-01",
    step: "Language round-trip",
    proves: "printing then parsing gives back the same tree",
    command: "npx vitest run packages/lang/test/print.test.ts",
    verdict: "verified",
  },
  {
    id: "P-02",
    step: "Parsing robustness",
    proves: "any text yields a tree or positioned errors",
    command: "npx vitest run packages/lang/test/print.test.ts",
    verdict: "verified",
  },
  {
    id: "P-03",
    step: "Plain-language reading",
    proves: "at least one sentence per instruction, every object named",
    command: "npx vitest run packages/lang/test/paraphrase.test.ts",
    verdict: "verified",
  },
  {
    id: "P-04",
    step: "Determinism",
    proves: "same seed, exactly the same effects",
    command: "npx vitest run packages/lang/test/interpreter.test.ts",
    verdict: "verified",
  },
  {
    id: "P-05",
    step: "Text chunks",
    proves: "writing then reading gives back what was written",
    command: "npx vitest run packages/lang/test/values-chunks.test.ts",
    verdict: "verified",
  },
  {
    id: "P-06",
    step: "Guardrails",
    proves: "an endless loop stops under maxSteps",
    command: "npx vitest run packages/lang/test/interpreter.test.ts",
    verdict: "verified",
  },
  {
    id: "P-07",
    step: "All or nothing",
    proves: "an aborted transaction leaves no trace",
    command: "npx vitest run packages/model/test/ops-journal.test.ts",
    verdict: "verified",
  },
  {
    id: "P-08",
    step: "Inverse",
    proves: "operations then their inverses give the stack back",
    command: "npx vitest run packages/model/test/ops-journal.test.ts",
    verdict: "verified",
  },
  {
    id: "P-09",
    step: "Message hierarchy",
    proves: "the path travelled is visible",
    command: "npx vitest run packages/model/test/dispatch.test.ts",
    verdict: "verified",
  },
  {
    id: "P-10",
    step: "Identifiers",
    proves: "unique, never reallocated",
    command: "npx vitest run packages/model/test/ops-journal.test.ts",
    verdict: "verified",
  },
  {
    id: "P-11",
    step: "No overflow",
    proves: "the adversary fake model gets nothing through",
    command: "npx vitest run packages/agent/test/loop-adversary.test.ts",
    verdict: "verified",
  },
  {
    id: "P-12",
    step: "No elevation",
    proves: "no level, instruction or budget moves",
    command: "npx vitest run packages/agent/test/loop-adversary.test.ts",
    verdict: "verified",
  },
  {
    id: "P-13",
    step: "Received stack",
    proves: "level capped at 2 without trust",
    command: "npx vitest run packages/model/test/properties-authorize.test.ts",
    verdict: "verified",
  },
  {
    id: "P-14",
    step: "End of chatter",
    proves: "the hop counter bounds the turns",
    command: "npx vitest run packages/model/test/dispatch.test.ts",
    verdict: "verified",
  },
  {
    id: "P-15",
    step: "Budgets",
    proves: "once spent, no more gateway calls",
    command: "npx vitest run packages/agent/test/loop.test.ts",
    verdict: "verified",
  },
  {
    id: "P-16",
    step: "Bounded context",
    proves: "no key, no other card, no journal",
    command: "npx vitest run packages/agent/test/properties-agent.test.ts",
    verdict: "verified",
  },
  {
    id: "P-17",
    step: "Scripts under agreement",
    proves: "no agent script without a human token",
    command: "npx vitest run packages/model/test/properties-authorize.test.ts",
    verdict: "verified",
  },
  {
    id: "P-18",
    step: "File",
    proves: "export then import gives back the same stack",
    command: "npx vitest run packages/model/test/schema-file.test.ts",
    verdict: "verified",
  },
  {
    id: "P-19",
    step: "Fingerprint",
    proves: "independent of key order",
    command: "npx vitest run packages/agent/test/properties-gateway.test.ts",
    verdict: "verified",
  },
  {
    id: "P-20",
    step: "Replay",
    proves: "recorded mode gives the same final state",
    command: "npx vitest run packages/agent/test/cassette-record.test.ts",
    verdict: "verified",
  },
  {
    id: "P-21",
    step: "Numbers",
    proves: "0.1 + 0.2 shows 0.3",
    command: "npx vitest run packages/lang/test/values-chunks.test.ts",
    verdict: "verified",
  },
  {
    id: "P-22",
    step: "Nothing secret",
    proves: "no key and no counter in an export",
    command: "npx vitest run packages/agent/test/properties-gateway.test.ts",
    verdict: "verified",
  },
  {
    id: "P-23",
    step: "Ink",
    proves: "agent text stays marked, human writing clears it",
    command: "npx vitest run packages/model/test/ops-journal.test.ts",
    verdict: "verified",
  },
  {
    id: "P-24",
    step: "The quote",
    proves: "150 / 15 / 165 in the browser",
    command: "npx vitest run apps/web/test/dispatch-adapter.test.ts",
    verdict: "verified",
  },
  {
    id: "P-25",
    step: "The manor",
    proves: "the guard raises the alarm, the cook already knows",
    command: "npx vitest run apps/web/test/agent-bridge.test.ts",
    verdict: "verified",
  },
  {
    id: "P-26",
    step: "The spy",
    proves: "the path and the refusals are visible",
    command: "npx vitest run apps/web/test/spy.test.ts",
    verdict: "verified",
  },
  {
    id: "P-27",
    step: "Sentence to script",
    proves: "checked draft, read back, dry run",
    command: "npx vitest run packages/agent/test/write-script.test.ts",
    verdict: "verified",
  },
  {
    id: "P-28",
    step: "The 40 tasks",
    proves: "six families, reachable expectations",
    command: "npx vitest run evals",
    verdict: "verified",
  },
  {
    id: "P-29",
    step: "No key",
    proves: "the demo plays with no network and no key",
    command: "npx vitest run apps/web/test/agent-bridge.test.ts",
    verdict: "verified",
  },
];
