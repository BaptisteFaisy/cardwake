/**
 * Modèle de données de Cardwake (cahier des charges 11.4, 11.5).
 *
 * Une pile est un document JSON sérialisable, versionné, sans fonction ni
 * référence circulaire. Tout ce qui n'est pas dans ce type n'est pas dans la
 * pile : pas d'état caché, pas d'historique secret (décision 4 de la section 1).
 */

import type { PropName } from "@cardwake/lang";
import type { StackSettings } from "./limits";

/** Rectangle : x, y, largeur, hauteur, en points de carte. */
export type Rect = [number, number, number, number];

/** Proportions par défaut d'une carte, clin d'œil à 1987 (5.2). */
export const CARD_SIZE: Rect = [0, 0, 512, 342];

export type FieldPart = {
  id: number;
  kind: "field";
  name: string;
  rect: Rect;
  visible: boolean;
  style: string;
  script: string;
  /** Texte propre à la carte ; ignoré pour un champ de fond. */
  text: string;
  locked: boolean;
  multiline: boolean;
};

export type ButtonPart = {
  id: number;
  kind: "button";
  name: string;
  rect: Rect;
  visible: boolean;
  style: string;
  script: string;
  label: string;
  enabled: boolean;
  hilite: boolean;
};

export type Part = FieldPart | ButtonPart;

/** Les quatre réglages d'un agent, et rien d'autre (7.5). */
export type AgentLevel = 1 | 2 | 3 | 4 | 5;

export type Agent = {
  awake: boolean;
  level: AgentLevel;
  speed: "fast" | "careful";
  /** Consigne écrite par un humain, 2 000 caractères au plus. */
  persona: string;
};

export type Background = {
  id: number;
  name: string;
  persona: string;
  script: string;
  parts: Part[];
};

export type Card = {
  id: number;
  name: string;
  /** Identifiant du fond partagé, ou `null` pour une carte sans fond. */
  background: number | null;
  /**
   * Contenu des champs du fond, indexé par identifiant d'élément en chaîne
   * (clé JSON oblige). C'est ce qui fait qu'un champ de fond a un contenu
   * par carte (CAR-F-03).
   */
  content: Record<string, string>;
  agent: Agent | null;
  script: string;
  parts: Part[];
  /**
   * Encre d'agent : identifiant d'élément → identifiant de la transaction qui
   * a écrit ce texte. Présent tant qu'aucune opération humaine n'a modifié le
   * champ (CAR-F-42, CAR-P-23).
   */
  ink: Record<string, number>;
};

/** D'où vient la pile : créée ici, ou reçue d'un fichier (7.10). */
export type Provenance =
  | { kind: "created" }
  | { kind: "received"; trusted: boolean; receivedAt: string };

export type StackFormat = "cardwake/1";

export type Stack = {
  format: StackFormat;
  name: string;
  /** Consigne générale pour les agents de la pile. */
  persona: string;
  settings: StackSettings;
  backgrounds: Background[];
  cards: Card[];
  /** Script de la pile : dernier maillon de la hiérarchie des messages. */
  script: string;
  provenance: Provenance;
  /** Prochain identifiant libre. Jamais décrémenté : aucun id réutilisé. */
  nextId: number;
  /** Carte affichée. Fait partie de l'état, donc de l'annulation. */
  currentCardId: number | null;
};

// --------------------------------------------------------------------------
// Messages
// --------------------------------------------------------------------------

export type MessageTarget =
  | { kind: "part"; cardId: number; partId: number }
  | { kind: "card"; cardId: number }
  | { kind: "background"; backgroundId: number }
  | { kind: "stack" };

export type MessageSender =
  | { kind: "system" }
  | { kind: "human" }
  | { kind: "script"; objectId: number }
  | { kind: "agent"; cardId: number };

export type Message = {
  name: string;
  params: string[];
  target: MessageTarget;
  sender: MessageSender;
  /** Sauts restants avant de ne plus pouvoir réveiller d'agent (7.6). */
  hops: number;
};

// --------------------------------------------------------------------------
// Opérations réversibles
// --------------------------------------------------------------------------

/** Ce qu'une opération vise : un élément, une carte, un fond, la pile. */
export type OpTarget =
  | { kind: "part"; cardId: number; partId: number; backgroundId?: number }
  | { kind: "card"; cardId: number }
  | { kind: "background"; backgroundId: number }
  | { kind: "stack" };

export type Op =
  | {
      kind: "setText";
      cardId: number;
      partId: number;
      /** Identifiant du fond quand le champ appartient à un fond. */
      backgroundId?: number;
      before: string;
      after: string;
      inkBefore: number | null;
      inkAfter: number | null;
    }
  | { kind: "setProp"; target: OpTarget; prop: PropName; before: string; after: string }
  | { kind: "setScript"; target: OpTarget; before: string; after: string }
  | { kind: "createPart"; cardId: number; backgroundId?: number; part: Part; index: number }
  | { kind: "deletePart"; cardId: number; backgroundId?: number; part: Part; index: number }
  | { kind: "createCard"; card: Card; index: number }
  | { kind: "deleteCard"; card: Card; index: number }
  | { kind: "moveCard"; cardId: number; from: number; to: number }
  | { kind: "navigate"; before: number | null; after: number | null }
  | { kind: "createBackground"; background: Background }
  | { kind: "deleteBackground"; background: Background }
  | {
      kind: "setAgent";
      cardId: number;
      before: Agent | null;
      after: Agent | null;
    }
  | { kind: "setStackProp"; prop: "name" | "persona"; before: string; after: string }
  | { kind: "setSettings"; before: StackSettings; after: StackSettings };

/** Qui a produit une transaction. */
export type TransactionActor =
  | { kind: "human"; mode: "browse" | "author" }
  | { kind: "script"; cardId: number; objectId: number }
  | { kind: "agent"; cardId: number; level: AgentLevel };

export type TokenUsage = { inputTokens: number; outputTokens: number; calls: number };

export type Transaction = {
  id: number;
  actor: TransactionActor;
  /** Cause lisible : message, clic, tour d'agent… */
  cause: string;
  ops: Op[];
  seed: number;
  /** Horodatage ISO produit par l'horloge remplaçable (CAR-F-17). */
  clock: string;
  usage?: TokenUsage;
};

/** Un tour d'agent, tel qu'il apparaît dans le journal (7.5). */
export type AgentTurn = {
  cardId: number;
  trigger: "consult" | "tell" | "chat" | "message";
  received: string;
  iterations: AgentIteration[];
  stop: "end" | "max_tokens" | "refusal" | "error" | "timeout" | "budget" | "aborted";
  usage: TokenUsage;
  /** Réponse rendue à l'appelant, le cas échéant. */
  reply?: string;
};

export type AgentIteration = {
  calls: { tool: string; args: Record<string, unknown>; line: string; verdict: Verdict }[];
  text?: string;
};

/** Verdict du point de passage unique des droits (11.1). */
export type Verdict =
  | { allow: true; reason?: string }
  | { allow: false; reason: string; rule: string };

/** Un enregistrement du mode enregistré (7.11). */
export type CassetteEntry = {
  fingerprint: string;
  purpose: "agent-turn" | "write-script" | "repair-script";
  response: unknown;
};

/** Brouillon produit par la chaîne phrase → script (7.7, 11.5). */
export type ScriptDraft = {
  script: string;
  summary: string;
  assumptions: string[];
  questions: string[];
  checks: DraftCheck[];
  paraphrase: string[];
  dryRun?: DryRunResult;
};

export type DraftCheck = {
  ok: boolean;
  message: string;
  line?: number;
};

/** Ce que l'essai à blanc montrerait à l'auteur (CAR-F-24). */
export type DryRunResult = {
  ops: { description: string; before: string; after: string }[];
  error?: string;
};
