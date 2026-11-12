/**
 * La table des features du produit : la vérité côté produit, feature par
 * feature, avec les preuves qui la couvrent.
 *
 * Une feature est dite du **point de vue de l'utilisateur** (une phrase
 * lisible par un visiteur qui ne connaît pas le projet), avec la façon de
 * l'essayer dans l'application. `live` dit si le verdict se recalcule dans le
 * navigateur (`true`) ou s'il ne vient que du registre de preuves (`false`) :
 * une feature non vérifiable localement n'est **jamais** affichée comme
 * prouvée à l'écran, elle est étiquetée « verified by the test ».
 *
 * Textes en anglais : le site est en anglais. Les identifiants de preuve
 * (`P-nn`) doivent exister dans `packages/proofs/src/registry.ts`.
 */

/** Une feature, ses preuves, et la façon de l'essayer dans l'application. */
export type Feature = {
  /** Identifiant : `FR-01` à `FR-17`. */
  id: string;
  /** La feature en une phrase, du point de vue de l'utilisateur. */
  feature: string;
  /** Comment l'essayer dans l'application (bouton, écran, geste). */
  howToTry: string;
  /** Les preuves du registre qui la couvrent. */
  proofIds: string[];
  /** Vrai : le verdict se recalcule dans le navigateur. Faux : test seul. */
  live: boolean;
};

/** Les 17 features, dans l'ordre de la table de vérité du projet. */
export const FEATURES: Feature[] = [
  {
    id: "FR-01",
    feature: "The shelf offers three demo stacks that open with no key and no network.",
    howToTry: "Open the site on the Shelf and click any of the three example stacks.",
    proofIds: ["P-29", "P-28"],
    live: true,
  },
  {
    id: "FR-02",
    feature: "Clicking a button runs its script: the quote card computes 150 / 15 / 165.",
    howToTry: "Open the Quotes stack on the Dupont card and press Total.",
    proofIds: ["P-24"],
    live: true,
  },
  {
    id: "FR-03",
    feature: "Cards talk to each other: the guard alerts, and the cook already knows.",
    howToTry: "Open the Manor stack and press Show the amulet on the Guard card.",
    proofIds: ["P-09", "P-14", "P-25"],
    live: true,
  },
  {
    id: "FR-04",
    feature: "Every human action is written to the journal, with its author and its cause.",
    howToTry: "Do anything in a stack — navigate, type — then open the Journal.",
    proofIds: ["P-07", "P-10"],
    live: true,
  },
  {
    id: "FR-05",
    feature: "Everything undoes and redoes in one gesture, transaction by transaction.",
    howToTry: "In the Journal, press Undo and Redo.",
    proofIds: ["P-08", "P-23"],
    live: true,
  },
  {
    id: "FR-06",
    feature: "An agent can never do more than its level, nor raise itself.",
    howToTry: "Set an agent's level in Build mode: anything above it is refused.",
    proofIds: ["P-11", "P-12", "P-13", "P-17"],
    live: true,
  },
  {
    id: "FR-07",
    feature: "Text written by an agent stays marked; a human write clears the mark.",
    howToTry: "Let an agent answer on its card, then edit the same field yourself.",
    proofIds: ["P-23"],
    live: true,
  },
  {
    id: "FR-08",
    feature: "A plain readback says what the script does, in French as in English.",
    howToTry: "Open a script in Build mode: the readback is generated from the syntax tree.",
    proofIds: ["P-03"],
    live: true,
  },
  {
    id: "FR-09",
    feature: "A phrase becomes a controlled draft: read back, checked, and tried on a copy.",
    howToTry: "Type a phrase on a card and review the draft before accepting it.",
    proofIds: ["P-27"],
    live: false,
  },
  {
    id: "FR-10",
    feature: "Recorded mode replays the same situation identically, without any key.",
    howToTry: "Play the Manor stack in recorded mode, then play it again.",
    proofIds: ["P-20", "P-29"],
    live: true,
  },
  {
    id: "FR-11",
    feature: "The message spy shows the path, the object that handled the message, and the refusals.",
    howToTry: "Click something on a card, then open the Spy screen.",
    proofIds: ["P-26"],
    live: true,
  },
  {
    id: "FR-12",
    feature: "The language is a round trip: analyze, print, re-analyze and get the same tree back.",
    howToTry: "Open a script in Build mode and save it unchanged.",
    proofIds: ["P-01", "P-02"],
    live: true,
  },
  {
    id: "FR-13",
    feature: "Numbers and text pieces behave like the family they come from.",
    howToTry: "Type decimals in a field and add them up in a script.",
    proofIds: ["P-05", "P-21"],
    live: true,
  },
  {
    id: "FR-14",
    feature: "An agent's budget and context are bounded, and freeze when exhausted.",
    howToTry: "Watch the budget gauge on the card screen while an agent answers.",
    proofIds: ["P-15", "P-16"],
    live: true,
  },
  {
    id: "FR-15",
    feature: "A stack is a file: export it, import it, get the same stack back.",
    howToTry: "Export a stack, then open the file again from the shelf.",
    proofIds: ["P-18"],
    live: true,
  },
  {
    id: "FR-16",
    feature: "An exchange's fingerprint is stable, and nothing secret ever leaves your machine.",
    howToTry: "Read the Settings screen: it lists exactly what leaves your machine.",
    proofIds: ["P-19", "P-22"],
    live: true,
  },
  {
    id: "FR-17",
    feature: "The evaluation game holds 40 phrase-to-script tasks, with reachable expectations.",
    howToTry: "Run the evaluation from the repository (it needs a key of your own).",
    proofIds: ["P-28"],
    live: false,
  },
];

/** La première feature couverte par une preuve, ou `undefined`. */
export function featureByProof(proofId: string): Feature | undefined {
  return FEATURES.find((feature) => feature.proofIds.includes(proofId));
}

/** Une feature par identifiant, ou `undefined`. */
export function featureById(id: string): Feature | undefined {
  return FEATURES.find((feature) => feature.id === id);
}
