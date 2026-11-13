/**
 * La table des droits : **le document**, et la seule source des verdicts
 * attendus par `rights-matrix.test.ts`.
 *
 * Elle se lit comme « ce qu'un acteur peut faire », et non comme une copie du
 * code : d'un côté les régimes (`RIGHTS`), de l'autre ce que chaque opération
 * et chaque outil exigent (`OP_RULES`, `ACTION_RULES`, `LEVEL_CAPABILITY`).
 * Le test recompose les deux et compare au verdict réel d'`authorizeOp` /
 * `authorize`. Une divergence entre cette table et le code doit donc rougir —
 * et si c'est la table qui a raison, c'est le code qu'on corrige.
 *
 * Ce que la table porte, exigence par exigence :
 * - CAR-F-05 : deux modes, Jouer et Fabriquer (`BROWSE_DENIED_*`).
 * - CAR-F-06 : un champ verrouillé refuse l'agent et l'humain en Jouer, jamais
 *   le script (`lockedFields`).
 * - CAR-F-35 : un agent ne modifie que sa propre carte (`ownCardOnly`).
 * - CAR-P-12 : aucune élévation — niveau, consigne, éveil, budget, script
 *   installé restent à l'humain (`rights`, `installScript`).
 * - CAR-P-13 : pile reçue non fiable → niveau opposable plafonné à 2.
 * - CAR-P-17 : un script d'origine agent ne s'installe qu'avec un jeton.
 *
 * Le niveau opposable d'un agent est le **plus petit** de trois nombres : le
 * niveau de la carte, le niveau que l'acteur s'annonce, et le plafond de 2
 * d'une pile reçue non fiable (`authorize.effectiveLevel`). La table porte le
 * résultat (`level`), le niveau annoncé (`claims`) sert à construire l'acteur.
 */

import type { Provenance } from "../src/types";
import type { AgentLevel, Op } from "../src/types";
import type { AgentAction } from "../src/authorize";
import { IDS } from "./generators-auth";

/** Le régime de l'acteur : c'est lui qui choisit la branche de `authorize`. */
export type Regime = "browse" | "author" | "script" | "agent";

/** Une ligne de la table : ce qu'un acteur peut faire, et rien de plus. */
export type Rights = {
  /** Nom lisible, repris tel quel dans les messages d'échec du test. */
  id: string;
  /** Ce que la table veut dire de cet acteur, en une phrase. */
  note: string;
  regime: Regime;
  /** Niveau opposable d'un agent ; `null` hors des agents. */
  level: AgentLevel | null;
  /** Niveau écrit sur la carte de l'acteur, dans la pile d'essai. */
  declared: AgentLevel | null;
  /** Niveau que l'acteur s'annonce (peut dépasser le niveau opposable). */
  claims: AgentLevel | null;
  awake: boolean;
  provenance: Provenance;
  /** La carte que l'acteur prétend être la sienne. */
  cardId: number;
  /** Écrit dans un champ : niveau Type. */
  type: boolean;
  /** Change l'apparence d'un objet : niveau Paint. */
  paint: boolean;
  /** Cartes, éléments, navigation, déplacement : niveau Create. */
  create: boolean;
  /** Propose un script, jeton à l'appui : niveau Program (CAR-P-17). */
  program: boolean;
  /** Installe un script sans jeton : humain en Fabriquer, et script. */
  installScript: boolean;
  /** Fixe niveau, consigne, éveil, budget (CAR-P-12). */
  rights: boolean;
  /** Écrit dans un champ verrouillé (CAR-F-06). */
  lockedFields: boolean;
  /** Ne touche qu'à sa propre carte (CAR-F-35). */
  ownCardOnly: boolean;
  /** Le test fournit un jeton d'acceptation vivant (CAR-P-17). */
  token: boolean;
};

const CREATED: Provenance = { kind: "created" };

/** Ce que chaque niveau accorde (7.4) : une ligne par niveau, lisible d'un trait. */
export const LEVEL_CAPABILITY: Record<
  AgentLevel,
  { type: boolean; paint: boolean; create: boolean; program: boolean }
> = {
  1: { type: false, paint: false, create: false, program: false }, // Browse : répond, parle
  2: { type: true, paint: false, create: false, program: false }, // Type : écrit du texte
  3: { type: true, paint: true, create: false, program: false }, // Paint : change l'apparence
  4: { type: true, paint: true, create: true, program: false }, // Create : cartes et éléments
  5: { type: true, paint: true, create: true, program: true }, // Program : propose un script
};

/**
 * Un agent : capacités de son niveau écrit, portée stricte, aucun réglage.
 *
 * Le niveau **opposable** n'est pas le niveau écrit : un agent endormi n'a que
 * le niveau 1, une pile reçue non fiable plafonne à 2 (CAR-P-13), et le niveau
 * annoncé par l'appelant ne peut pas dépasser celui de la carte.
 */
export function agentRights(
  id: string,
  declared: AgentLevel,
  opts: { effective?: AgentLevel; awake?: boolean; claims?: AgentLevel; cardId?: number; note?: string } = {},
): Rights {
  const capability = LEVEL_CAPABILITY[declared];
  const awake = opts.awake ?? true;
  return {
    id,
    note: opts.note ?? "",
    regime: "agent",
    level: awake ? (opts.effective ?? declared) : 1,
    declared,
    claims: opts.claims ?? declared,
    awake,
    provenance: CREATED,
    cardId: opts.cardId ?? IDS.agentCard,
    type: capability.type,
    paint: capability.paint,
    create: capability.create,
    program: capability.program,
    installScript: false,
    rights: false,
    lockedFields: false,
    ownCardOnly: true,
    token: capability.program,
  };
}

/** Un humain : les deux modes, et rien d'autre ne change. */
export function humanRights(id: string, mode: "browse" | "author", note: string): Rights {
  const author = mode === "author";
  return {
    id,
    note,
    regime: mode,
    level: null,
    declared: null,
    claims: null,
    awake: true,
    provenance: CREATED,
    cardId: IDS.agentCard,
    type: true,
    paint: true,
    create: author,
    program: author,
    installScript: author,
    rights: true,
    lockedFields: author,
    ownCardOnly: false,
    token: author,
  };
}

/**
 * Un script : il exécute ce que l'auteur a installé, donc il écrit et
 * structure partout — mais il ne s'élève pas (CAR-P-12). Il n'a pas de carte,
 * donc pas de niveau, et aucune proposition à faire (voir D4 plus bas).
 */
export function scriptRights(): Rights {
  return {
    id: "script",
    note: "exécute, écrit partout, ne s'élève jamais",
    regime: "script",
    level: null,
    declared: null,
    claims: null,
    awake: true,
    provenance: CREATED,
    cardId: IDS.agentCard,
    type: true,
    paint: true,
    create: true,
    program: false,
    installScript: true,
    rights: false,
    lockedFields: true,
    ownCardOnly: false,
    token: false,
  };
}

/** Les vingt acteurs de référence : humains, script, agents par état. */
export function rightsTable(): Rights[] {
  const levels: AgentLevel[] = [1, 2, 3, 4, 5];
  const received = (level: AgentLevel): Rights => {
    const rights = agentRights(`agent ${level} dans une pile reçue non fiable`, level, {
      effective: Math.min(level, 2) as AgentLevel,
      note: "pile reçue non fiable : plafond de 2 (CAR-P-13)",
    });
    return { ...rights, provenance: { kind: "received", trusted: false, receivedAt: "2026-11-02T09:00:00Z" } };
  };
  return [
    humanRights("humain en Jouer", "browse", "joue : texte et apparence, jamais la structure (CAR-F-05)"),
    humanRights("humain en Fabriquer", "author", "l'auteur : tout, y compris les droits (CAR-P-12)"),
    scriptRights(),
    ...levels.map((level) => agentRights(`agent ${level} éveillé`, level)),
    ...levels.map((level) => agentRights(`agent ${level} endormi`, level, { awake: false })),
    ...levels.map(received),
    agentRights("agent qui s'annonce 5 sur une carte de niveau 1", 1, {
      claims: 5,
      note: "aucune élévation par incohérence : le niveau annoncé ne dépasse pas celui de la carte",
    }),
    agentRights("agent dont la carte n'existe pas", 5, {
      awake: false,
      claims: 5,
      cardId: IDS.unknownPart,
      note: "carte inconnue : le code le traite comme endormi, niveau 1, reply seul",
    }),
  ];
}

/** Opérations que le mode Jouer refuse : structure, script, droits (CAR-F-05). */
export const BROWSE_DENIED_OPS: ReadonlySet<Op["kind"]> = new Set<Op["kind"]>([
  "createPart",
  "deletePart",
  "createCard",
  "deleteCard",
  "createBackground",
  "deleteBackground",
  "setScript",
  "setAgent",
  "setSettings",
]);

/** Outils que le mode Jouer refuse : structure et script (CAR-F-05). */
export const BROWSE_DENIED_ACTIONS: ReadonlySet<AgentAction["kind"]> = new Set<AgentAction["kind"]>([
  "create_part",
  "delete_part",
  "create_card",
  "propose_script",
]);

/** Portée d'une opération pour un agent : où elle atterrit. */
export type Scope = "element" | "target" | "own" | "shared" | "rights";

/** Ce que chaque variante d'`Op` exige d'un agent, en une ligne. */
export const OP_RULES: Record<Op["kind"], { min: AgentLevel; scope: Scope; note: string }> = {
  setText: { min: 2, scope: "element", note: "écrire dans un champ : niveau Type" },
  setProp: { min: 3, scope: "target", note: "changer une propriété : niveau Paint" },
  setScript: { min: 5, scope: "rights", note: "installer un script : humain seul (CAR-P-17)" },
  createPart: { min: 4, scope: "target", note: "créer un élément sur sa carte : niveau Create" },
  deletePart: { min: 4, scope: "element", note: "supprimer un élément de sa carte : niveau Create" },
  createCard: { min: 4, scope: "own", note: "créer une carte : niveau Create" },
  deleteCard: { min: 4, scope: "target", note: "supprimer une carte : niveau Create, la sienne" },
  moveCard: { min: 4, scope: "target", note: "déplacer une carte : niveau Create, la sienne" },
  navigate: { min: 4, scope: "own", note: "changer la carte affichée : niveau Create" },
  createBackground: { min: 4, scope: "shared", note: "un fond est partagé : jamais à un agent" },
  deleteBackground: { min: 4, scope: "shared", note: "un fond est partagé : jamais à un agent" },
  setAgent: { min: 5, scope: "rights", note: "droits d'un agent : humain seul (CAR-P-12)" },
  setStackProp: { min: 4, scope: "target", note: "nom de pile : structure ; consigne : droits" },
  setSettings: { min: 5, scope: "rights", note: "budgets de la pile : humain seul (CAR-P-12)" },
};

/** Ce que chaque outil exige d'un agent, en une ligne (7.4). */
export const ACTION_RULES: Record<
  AgentAction["kind"],
  { min: AgentLevel; own: boolean; token: boolean; note: string }
> = {
  reply: { min: 1, own: false, token: false, note: "répondre : le seul droit d'un agent endormi" },
  send_message: { min: 1, own: false, token: false, note: "parler à une autre carte" },
  write_field: { min: 2, own: true, token: false, note: "écrire dans un champ de sa carte" },
  set_appearance: { min: 3, own: true, token: false, note: "peindre un élément de sa carte" },
  create_part: { min: 4, own: true, token: false, note: "créer un élément sur sa carte" },
  delete_part: { min: 4, own: true, token: false, note: "supprimer un élément de sa carte" },
  create_card: { min: 4, own: false, token: false, note: "créer une carte" },
  go_to_card: { min: 4, own: false, token: false, note: "changer la carte affichée" },
  propose_script: { min: 5, own: true, token: true, note: "proposer un script, jeton à l'appui (CAR-P-17)" },
};
