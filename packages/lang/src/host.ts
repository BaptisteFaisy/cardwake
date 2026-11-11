/**
 * Contrat d'exécution : tout ce que l'interpréteur Murmur est autorisé à
 * toucher passe par l'interface `Host`. Le paquet `lang` reste ainsi **pur**
 * (aucune dépendance au modèle de données, aucun navigateur) et le point de
 * passage unique des droits reste dans `model/authorize` (CAR-N-09, 11.1).
 *
 * L'implémentation de référence vit dans `model/dispatch` : elle traduit
 * chaque demande en opérations réversibles, validées par `authorize`.
 */

import type { Chunk, ChunkType, ObjRef, PropName, ScriptError } from "./ast";

/** Qui exécute : un humain, un script, ou l'agent d'une carte. */
export type Actor =
  | { kind: "human"; mode: "browse" | "author" }
  | { kind: "script"; objectId: number }
  | { kind: "agent"; cardId: number; level: number };

/** Résolution d'une référence d'objet en identifiant interne. */
export type ResolvedRef =
  | { kind: "card"; id: number }
  | { kind: "background"; id: number }
  | { kind: "stack" }
  | { kind: "part"; id: number; partKind: "field" | "button"; cardId: number }
  | { kind: "agent"; cardId: number };

/** Ce que l'interpréteur peut lire sur le monde, sans jamais l'écrire. */
export interface WorldReader {
  resolve(ref: ObjRef): ResolvedRef | ScriptError;
  readText(ref: ResolvedRef): string | ScriptError;
  readProp(ref: ResolvedRef, prop: PropName): string | ScriptError;
  /** Découpage d'un texte en morceaux, partagé lecture/écriture. */
  chunkBounds(text: string, chunk: Chunk): { start: number; end: number } | ScriptError;
  cardName(id: number): string;
  partName(id: number): string;
}

/** Effets demandés par un script. Chacun devient une opération réversible. */
export interface WorldWriter {
  writeText(ref: ResolvedRef, text: string, mode: "replace" | "before" | "after"): void;
  writeChunk(ref: ResolvedRef, chunk: Chunk, text: string, mode: "replace" | "before" | "after"): void;
  writeProp(ref: ResolvedRef, prop: PropName, value: string): void;
  createCard(name?: string, background?: string): number;
  createBackground(name?: string): number;
  createPart(partKind: "field" | "button", name: string | undefined, cardId: number): number;
  delete(ref: ResolvedRef): void;
  setScript(ref: ResolvedRef, script: string): void;
  goToCard(id: number): void;
  sort(ref: ResolvedRef, numeric: boolean, descending: boolean, chunkType?: ChunkType, index?: number): void;
}

/** Effets qui ne modifient pas la pile : affichage, messages, agent. */
export interface SideEffects {
  /** Boîte de dialogue non bloquante dans le périmètre minimal. */
  answer(text: string): void;
  /**
   * `ask` : dans une exécution simulée (essai à blanc, CLI, tests) la réponse
   * vient de la file `answers` ; dans le navigateur, d'une vraie saisie.
   */
  ask(prompt: string): string | Promise<string>;
  /** Dépose un message dans la file de la pile (7.6). */
  sendMessage(name: string, args: string[], to: ResolvedRef): void;
  /** Fait monter le message d'un cran dans la hiérarchie. */
  pass(message: string): void;
  /** Appel synchrone à l'agent : la réponse arrive dans `it`. */
  consult(agent: ResolvedRef, text: string): string | Promise<string>;
  /** Prévenir un agent sans attendre la réponse. */
  tell(agent: ResolvedRef, text: string): void;
  /** Attente bornée par `maxWaitMs` (7.3). */
  wait(ms: number): void | Promise<void>;
  /** Recherche de texte : rend les cartes dont un champ le contient. */
  find(text: string): number[];
}

/** Ce qui varie et doit rester déterministe : graine et horloge (CAR-F-17). */
export interface Determinism {
  /** Tirage dans [0, 1[ depuis un générateur à graine consignée. */
  random(): number;
  /** Date du jour, format texte du langage. */
  now(): { date: string; time: string; longDate: string; epochMs: number };
  seed: number;
}

/** Garde-fous d'exécution (7.3). Tous imposés par l'interpréteur. */
export type Guards = {
  maxSteps: number;
  maxMessageDepth: number;
  maxWaitMs: number;
  maxTextChars: number;
};

/** Journal d'exécution : une ligne par effet, lisible par l'auteur. */
export type TraceEntry = {
  step: number;
  line: number;
  text: string;
};

export interface Host extends WorldReader, WorldWriter, SideEffects {
  readonly actor: Actor;
  readonly guards: Guards;
  readonly determinism: Determinism;
  readonly trace: TraceEntry[];
  /** Compteur d'étapes incrémenté par l'interpréteur à chaque pas. */
  stepsUsed(): number;
}

/** Résultat d'un traitement : tout ou rien (CAR-P-07). */
export type RunOk = {
  ok: true;
  /** Valeur de `it` en fin de traitement. */
  it: string;
  steps: number;
  /** Le message a-t-il été traité, et par quel objet. */
  handledBy?: ResolvedRef;
  returned?: string;
};

export type RunErr = {
  ok: false;
  error: ScriptError;
  steps: number;
};

export type RunResult = RunOk | RunErr;
