/**
 * Contrat du moteur du site (11.8, 12.1).
 *
 * Le site n'est qu'une vue : toute la logique vit dans le moteur, qui parle à
 * `@cardwake/model`. Ce fichier ne contient que des types, pour que les écrans
 * puissent être écrits et testés contre un moteur de remplacement (tests,
 * démo enregistrée) sans rien changer à leur code.
 *
 * Deux règles traversent tout le contrat :
 * - chaque action humaine passe par une transaction du journal ;
 * - en mode Jouer, aucune modification de structure n'est possible (CAR-F-05)
 *   et un champ verrouillé refuse la saisie humaine (CAR-F-06).
 */

import type { PropName } from "@cardwake/lang";
import type { Card, Rect, Stack, Transaction } from "@cardwake/model";

/** Mode Jouer (on utilise la pile) ou mode Fabriquer (on la construit). */
export type Mode = "play" | "build";

/** Un refus, avec la raison lisible et la règle qui l'a motivé. */
export type Refusal = { reason: string; rule: string };

/** Ce qu'un abonné reçoit du moteur. */
export type EngineEvent =
  | { type: "opened"; stack: Stack }
  | { type: "changed"; stack: Stack }
  | { type: "navigated"; cardId: number | null }
  | { type: "mode-changed"; mode: Mode }
  | { type: "refused"; reason: string; rule: string }
  | { type: "undone"; stack: Stack }
  | { type: "redone"; stack: Stack }
  | { type: "clicked"; partId: number }
  | { type: "script-not-wired"; partId: number }
  | { type: "disposed" };

/** La jauge de budget de session (CAR-F-43, P8). */
export type BudgetView = {
  turnsUsed: number;
  turnsMax: number;
  inputTokensUsed: number;
  inputTokensMax: number;
  /** Sauts restants pour l'action humaine en cours (7.6). */
  hopsLeft: number;
  /** Budget de session épuisé : les agents dorment, les scripts marchent. */
  exhausted: boolean;
  /** Plus de sauts pour cette action. */
  hopsExhausted: boolean;
};

/**
 * L'espion de messages (CAR-F-19) : la trace du dernier `DispatchResult`,
 * telle que le `Dispatcher` la rend — ce que le message était, où il est
 * passé, qui l'a traité, ce qui restait de sauts, et chaque ligne de trace.
 */
export type SpyView = {
  /** Nom du message envoyé, par exemple `mouseUp`. */
  message: string | null;
  /** Sa cible, en anglais lisible. */
  target: string | null;
  /** Objets traversés, dans l'ordre. */
  path: string[];
  /** Celui qui a traité le message, ou `null` si personne. */
  handledBy: string | null;
  /** Sauts restants à la fin de l'action (7.6). */
  hopsLeft: number;
  /** La trace, ligne à ligne. */
  trace: string[];
  /** Les refus rencontrés pendant l'action, avec la règle qui les motive. */
  refusals: Refusal[];
};

/** Ce que l'écran du journal a besoin de savoir. */
export type JournalView = {
  /** Transactions, de la plus récente à la plus ancienne. */
  entries: Transaction[];
  /** Le journal en texte, prêt à exporter (CAR-F-46). */
  exportText: string;
  canUndo: boolean;
  canRedo: boolean;
};

/** Le moteur du site, tel que les écrans le consomment. */
export interface CardwakeEngine {
  /** Ouvre une pile : le journal repart de zéro (CAR-F-07). */
  openStack(stack: Stack): void;
  /** La pile actuelle, ou `null` quand aucune pile n'est ouverte. */
  state(): Stack | null;
  /** La carte affichée, ou `null`. */
  currentCard(): Card | null;
  /** Le mode courant. */
  mode(): Mode;

  /** Va à une carte : produit une opération `navigate`. */
  navigate(cardId: number | null): void;
  /** Clic humain sur un élément de la carte affichée. */
  click(partId: number): void;
  /**
   * Parle à l'agent de la carte affichée (CAR-F-41). Optionnel : un moteur
   * qui ne sait pas le faire laisse la barre le dire honnêtement.
   */
  chat?(text: string): void;
  /** Saisie humaine dans un champ : produit un `setText` sans encre d'agent. */
  editField(partId: number, text: string): void;
  /** Change de mode ; en mode Jouer, la structure devient intouchable. */
  setMode(mode: Mode): void;

  /** Annule la dernière transaction (CAR-F-45). */
  undo(): void;
  /** Rétablit la dernière transaction annulée. */
  redo(): void;
  /** Vue du journal, pour l'écran et l'export. */
  journal(): JournalView;
  /** Jauge de budget de session. */
  budget(): BudgetView;

  /** Construction, mode Fabriquer seulement (CAR-F-02, CAR-F-05). */
  addCard(name: string): void;
  addPart(kind: "button" | "field", name: string): void;
  addBackground(name: string): void;
  setPartRect(partId: number, rect: Rect): void;
  setPartProp(partId: number, prop: PropName, value: string): void;
  /**
   * Installe le script d'un élément : une opération `setScript` autorisée et
   * journalisée, réversible comme les autres (7.7, CAR-F-25). C'est le seul
   * chemin d'installation d'un brouillon ; en mode Jouer, elle est refusée.
   */
  setScript(partId: number, script: string): void;
  deletePart(partId: number): void;

  /** Les deux gestes distincts de l'écran de réception (7.10, CAR-F-52). */
  wakeAgents(): void;
  trustStack(): void;

  /** Le dernier refus, pour l'afficher à l'écran. */
  lastRefusal(): Refusal | null;
  /** Le dernier état à dire (script non branché, agent muet…). */
  lastNotice(): string | null;
  /** La trace du dernier message : l'espion de messages (CAR-F-19). */
  spy(): SpyView;

  /** S'abonne aux événements ; rend la fonction de désabonnement. */
  subscribe(listener: (event: EngineEvent) => void): () => void;
  /** Libère les abonnés et le journal. */
  dispose(): void;
}

/** Fabrique de moteur : l'horloge et la graine viennent de l'appelant. */
export type EngineFactory = (options: { clock: () => string; seed: number }) => CardwakeEngine;
