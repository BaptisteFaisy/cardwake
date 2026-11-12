/**
 * Le registre des preuves (P-01 à P-29) : la table de vérité du projet.
 *
 * Chaque preuve est une affirmation vérifiable par un test qui existe dans le
 * dépôt : l'écran « Proofs » du site s'appuie dessus pour dire honnêtement
 * « vérifié par le test — lancez la commande » quand une feature ne peut pas
 * être recalculée dans le navigateur. Les 17 features du produit citent ces
 * identifiants (`apps/web/src/data/features.ts`) : changer la table d'un côté
 * sans l'autre doit se voir.
 *
 * Paquet **pur** : aucune dépendance, aucun réseau — juste des données.
 */

/** Une preuve : identifiant, étape du chantier, affirmation, commande, test. */
export type Proof = {
  /** Identifiant stable : `P-01` à `P-29`. */
  id: string;
  /** Étape du chantier où la preuve vit (Language, Rights, Gateway…). */
  step: string;
  /** Ce que la preuve prouve, en une phrase en anglais. */
  claim: string;
  /** La commande qui rejoue le test, depuis la racine du dépôt. */
  command: string;
  /** Le fichier de test porteur de la preuve, chemin depuis la racine. */
  testFile: string;
};

/** Préfixe commun des commandes : le lanceur de tests du dépôt. */
const RUN = "npx vitest run";

/** Les 29 preuves, dans l'ordre de leurs identifiants. */
export const PROOFS: readonly Proof[] = [
  {
    id: "P-01",
    step: "Language",
    claim: "Analyzing, printing and analyzing again gives back the same tree.",
    command: `${RUN} packages/lang/test/print.test.ts`,
    testFile: "packages/lang/test/print.test.ts",
  },
  {
    id: "P-02",
    step: "Language",
    claim: "Printing is stable: the same tree always prints the same text.",
    command: `${RUN} packages/lang/test/print.test.ts`,
    testFile: "packages/lang/test/print.test.ts",
  },
  {
    id: "P-03",
    step: "Language",
    claim:
      "The plain readback is complete: every instruction gets a sentence, generated from the tree without any model.",
    command: `${RUN} packages/lang/test/paraphrase.test.ts`,
    testFile: "packages/lang/test/paraphrase.test.ts",
  },
  {
    id: "P-04",
    step: "Object model",
    claim: "The clock and the seed are injected: the same run gives the same stack, byte for byte.",
    command: `${RUN} apps/web/test/agent-bridge.test.ts`,
    testFile: "apps/web/test/agent-bridge.test.ts",
  },
  {
    id: "P-05",
    step: "Language",
    claim: "Numbers behave like the family they come from: 0.1 + 0.2 shows as 0.3, sums stay exact.",
    command: `${RUN} packages/lang/test/values-chunks.test.ts`,
    testFile: "packages/lang/test/values-chunks.test.ts",
  },
  {
    id: "P-06",
    step: "Language",
    claim: "Every script stops within maxSteps: an endless loop is halted and its effects rolled back.",
    command: `${RUN} packages/lang/test/interpreter.test.ts`,
    testFile: "packages/lang/test/interpreter.test.ts",
  },
  {
    id: "P-07",
    step: "Journal",
    claim: "An interrupted process leaves no trace: an aborted transaction records nothing.",
    command: `${RUN} packages/model/test/ops-journal.test.ts`,
    testFile: "packages/model/test/ops-journal.test.ts",
  },
  {
    id: "P-08",
    step: "Journal",
    claim: "Any sequence of operations, undone in reverse, restores the exact starting stack.",
    command: `${RUN} packages/model/test/ops-journal.test.ts`,
    testFile: "packages/model/test/ops-journal.test.ts",
  },
  {
    id: "P-09",
    step: "Messages",
    claim: "A message climbs element, card, background, stack and stops at the first handler.",
    command: `${RUN} packages/model/test/dispatch.test.ts`,
    testFile: "packages/model/test/dispatch.test.ts",
  },
  {
    id: "P-10",
    step: "Journal",
    claim: "Identifiers stay unique across a run: an allocated id is never reused.",
    command: `${RUN} packages/model/test/ops-journal.test.ts`,
    testFile: "packages/model/test/ops-journal.test.ts",
  },
  {
    id: "P-11",
    step: "Rights",
    claim: "An adversarial model asking for forbidden tools never gets a single operation through.",
    command: `${RUN} packages/agent/test/loop-adversary.test.ts`,
    testFile: "packages/agent/test/loop-adversary.test.ts",
  },
  {
    id: "P-12",
    step: "Rights",
    claim: "No elevation: only a human sets a level, a persona, an awake state or a budget.",
    command: `${RUN} packages/model/test/authorize.test.ts`,
    testFile: "packages/model/test/authorize.test.ts",
  },
  {
    id: "P-13",
    step: "Rights",
    claim: "A received stack caps its agents at level 2 until a human declares it trusted.",
    command: `${RUN} packages/model/test/authorize.test.ts`,
    testFile: "packages/model/test/authorize.test.ts",
  },
  {
    id: "P-14",
    step: "Messages",
    claim: "Chatter is bounded: hops and agent turns run out and stop the talk.",
    command: `${RUN} packages/model/test/dispatch.test.ts`,
    testFile: "packages/model/test/dispatch.test.ts",
  },
  {
    id: "P-15",
    step: "Budgets",
    claim: "Honest budgets: a turn that produced nothing consumes neither a turn nor a hop.",
    command: `${RUN} apps/web/test/agent-bridge.test.ts`,
    testFile: "apps/web/test/agent-bridge.test.ts",
  },
  {
    id: "P-16",
    step: "Budgets",
    claim: "Budgets freeze when exhausted: nothing more is spent once the ceiling is reached.",
    command: `${RUN} packages/agent/test/budget.test.ts`,
    testFile: "packages/agent/test/budget.test.ts",
  },
  {
    id: "P-17",
    step: "Rights",
    claim: "A script only installs with a human acceptance token, and the token is used once.",
    command: `${RUN} packages/model/test/authorize.test.ts`,
    testFile: "packages/model/test/authorize.test.ts",
  },
  {
    id: "P-18",
    step: "Files",
    claim: "A stack is a file: export then import gives back the same stack, canonically serialized.",
    command: `${RUN} packages/model/test/schema-file.test.ts`,
    testFile: "packages/model/test/schema-file.test.ts",
  },
  {
    id: "P-19",
    step: "Gateway",
    claim: "The fingerprint of an exchange is stable: key order and tool ids never change it.",
    command: `${RUN} packages/agent/test/properties-gateway.test.ts`,
    testFile: "packages/agent/test/properties-gateway.test.ts",
  },
  {
    id: "P-20",
    step: "Cassettes",
    claim: "Recorded replay: the same situation always finds the same recorded answer, with no network.",
    command: `${RUN} packages/agent/test/cassette.test.ts`,
    testFile: "packages/agent/test/cassette.test.ts",
  },
  {
    id: "P-21",
    step: "Language",
    claim: "Text pieces (lines, items, words, characters) split and join without loss.",
    command: `${RUN} packages/lang/test/values-chunks.test.ts`,
    testFile: "packages/lang/test/values-chunks.test.ts",
  },
  {
    id: "P-22",
    step: "Gateway",
    claim: "Nothing secret leaves: no key and no counter is exported, secrets are scrubbed from quotes.",
    command: `${RUN} packages/agent/test/properties-gateway.test.ts`,
    testFile: "packages/agent/test/properties-gateway.test.ts",
  },
  {
    id: "P-23",
    step: "Journal",
    claim: "Agent ink: agent-written text stays marked, a human write clears the mark, undo restores it.",
    command: `${RUN} packages/model/test/ops-journal.test.ts`,
    testFile: "packages/model/test/ops-journal.test.ts",
  },
  {
    id: "P-24",
    step: "Object model",
    claim: "A click runs the button's script: the quote computes subtotal, VAT and total.",
    command: `${RUN} packages/model/test/host-script.test.ts`,
    testFile: "packages/model/test/host-script.test.ts",
  },
  {
    id: "P-25",
    step: "Messages",
    claim: "Cards talk to each other: the guard alerts, the cook already knows — and it all undoes.",
    command: `${RUN} packages/model/test/dispatch.test.ts`,
    testFile: "packages/model/test/dispatch.test.ts",
  },
  {
    id: "P-26",
    step: "Site",
    claim: "The message spy shows the path, the object that handled the message, and every refusal.",
    command: `${RUN} apps/web/test/spy.test.ts`,
    testFile: "apps/web/test/spy.test.ts",
  },
  {
    id: "P-27",
    step: "Agents",
    claim: "A phrase becomes a draft: checked, read back, and tried on a copy before installing.",
    command: `${RUN} packages/agent/test/write-script.test.ts`,
    testFile: "packages/agent/test/write-script.test.ts",
  },
  {
    id: "P-28",
    step: "Evaluation",
    claim: "The evaluation game holds 40 phrase-to-script tasks, and every expectation is reachable.",
    command: `${RUN} evals/evals.test.ts`,
    testFile: "evals/evals.test.ts",
  },
  {
    id: "P-29",
    step: "Site",
    claim: "The three demo stacks open with no key and no network, and replay identically.",
    command: `${RUN} apps/web/test/agent-bridge.test.ts`,
    testFile: "apps/web/test/agent-bridge.test.ts",
  },
];

/** Les identifiants attendus : la garde du registre. */
export const PROOF_IDS: readonly string[] = PROOFS.map((proof) => proof.id);

/** Retrouve une preuve par identifiant, ou `undefined`. */
export function proofById(id: string): Proof | undefined {
  return PROOFS.find((proof) => proof.id === id);
}
