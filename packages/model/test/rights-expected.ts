/**
 * Dérivation du verdict **attendu** à partir de `rights-table.ts`.
 *
 * C'est volontairement une seconde écriture, indépendante de
 * `src/authorize.ts` : si le test recopiait les branches du code, il
 * n'affirmerait rien. Ici, on lit les capacités de l'acteur dans la table et on
 * applique l'ordre des refus que le cahier des charges impose :
 *
 * - opérations : élévation (CAR-P-12), puis sommeil, puis niveau, puis portée
 *   (CAR-F-35), puis verrou (CAR-F-06) ;
 * - outils : `reply` passe toujours (c'est le seul droit d'un endormi), puis
 *   sommeil, puis niveau, puis carte, puis verrou, puis jeton (CAR-P-17).
 *
 * Les lectures de pile (élément sur la carte, champ verrouillé) sont de la
 * géométrie, pas une décision de droits : elles sont réécrites ici pour que la
 * table reste la seule source des verdicts.
 */

import type { AgentAction } from "../src/authorize";
import type { Op, OpTarget, Part, Stack } from "../src/types";
import {
  ACTION_RULES,
  BROWSE_DENIED_ACTIONS,
  BROWSE_DENIED_OPS,
  OP_RULES,
  type Rights,
} from "./rights-table";

/** Un verdict attendu, réduit à ce qui compte : la règle du refus. */
export type Expected = { allow: true } | { allow: false; rule: string };

export const ALLOW: Expected = { allow: true };

export function refusal(rule: string): Expected {
  return { allow: false, rule };
}

/** La pile d'essai : une seule, tous les profils la partagent. */
export type Bench = { stack: Stack };

function cardOf(stack: Stack, cardId: number) {
  return stack.cards.find((card) => card.id === cardId);
}

/** Élément visé : propre à la carte, ou champ de son fond (CAR-F-03). */
export function partOf(stack: Stack, cardId: number, partId: number, backgroundId?: number): Part | undefined {
  const card = cardOf(stack, cardId);
  if (card === undefined) return undefined;
  const own = card.parts.find((part) => part.id === partId);
  if (own !== undefined) return own;
  const wanted = backgroundId ?? card.background;
  if (wanted === null) return undefined;
  return stack.backgrounds.find((background) => background.id === wanted)?.parts.find((part) => part.id === partId);
}

/** Un champ verrouillé refuse l'agent et l'humain en Jouer (CAR-F-06). */
export function fieldLocked(stack: Stack, cardId: number, partId: number, backgroundId?: number): boolean {
  const part = partOf(stack, cardId, partId, backgroundId);
  return part !== undefined && part.kind === "field" && part.locked;
}

/** L'élément est-il sur cette carte (le sien, ou un champ de son fond) ? */
function onCard(stack: Stack, cardId: number, targetCardId: number, partId: number): boolean {
  if (targetCardId !== cardId) return false;
  return partOf(stack, cardId, partId) !== undefined;
}

/** Portée d'une cible d'opération, vue depuis la carte de l'agent. */
function targetZone(stack: Stack, cardId: number, target: OpTarget): "own" | "other" {
  if (target.kind === "part") {
    return onCard(stack, cardId, target.cardId, target.partId) ? "own" : "other";
  }
  if (target.kind === "card") return target.cardId === cardId ? "own" : "other";
  // Une propriété de fond ou de pile n'est jamais sur la carte d'un agent.
  return "other";
}

/** Portée de l'opération : `own` quand elle ne quitte pas la carte de l'agent. */
export function zoneOf(stack: Stack, cardId: number, op: Op): "own" | "other" {
  switch (op.kind) {
    case "setText":
      return onCard(stack, cardId, op.cardId, op.partId) ? "own" : "other";
    case "setProp":
    case "setScript":
      return targetZone(stack, cardId, op.target);
    case "createPart":
      return op.cardId === cardId ? "own" : "other";
    case "deletePart":
      return onCard(stack, cardId, op.cardId, op.part.id) ? "own" : "other";
    case "createCard":
    case "navigate":
      return "own";
    case "deleteCard":
      return op.card.id === cardId ? "own" : "other";
    case "moveCard":
      return op.cardId === cardId ? "own" : "other";
    case "createBackground":
    case "deleteBackground":
    case "setStackProp":
    case "setAgent":
    case "setSettings":
      return "other";
  }
}

/** L'humain règle les droits, tous les autres non (CAR-P-12). */
function elevationRefusal(rights: Rights, op: Op): Expected | null {
  if (op.kind === "setAgent" || op.kind === "setSettings") {
    return rights.rights ? null : refusal("no-elevation");
  }
  // Seul un agent est arrêté ici : l'humain en Jouer est refusé plus loin, par
  // le mode, et le script exécute ce que l'auteur a installé.
  if (op.kind === "setScript" && rights.regime === "agent") return refusal("no-elevation");
  if (op.kind === "setStackProp" && op.prop === "persona" && rights.regime === "script") {
    return refusal("no-elevation");
  }
  return null;
}

/** Mode Jouer : ce que la table refuse, et le verrou (CAR-F-05, CAR-F-06). */
function expectedBrowseOp(bench: Bench, op: Op): Expected {
  if (BROWSE_DENIED_OPS.has(op.kind)) return refusal("mode-browse");
  if (op.kind === "setStackProp") return refusal("mode-browse");
  if (op.kind === "setText" && fieldLocked(bench.stack, op.cardId, op.partId, op.backgroundId)) {
    return refusal("locked-field");
  }
  return ALLOW;
}

/** Un agent : niveau, portée de sa carte, verrou, rien d'autre. */
function expectedAgentOp(rights: Rights, bench: Bench, op: Op): Expected {
  // La consigne de la pile est une élévation, refusée avant tout le reste.
  if (op.kind === "setStackProp" && op.prop === "persona") return refusal("no-elevation");
  const rule = OP_RULES[op.kind];
  if (rule.scope === "rights") return refusal("no-elevation");
  if (!rights.awake) return refusal("agent-asleep");
  const level = rights.level ?? 1;
  if (level < rule.min) return refusal("level-too-low");
  if (rule.scope !== "own" && zoneOf(bench.stack, rights.cardId, op) === "other") {
    return refusal("not-own-card");
  }
  if (op.kind === "setText" && fieldLocked(bench.stack, op.cardId, op.partId, op.backgroundId)) {
    return refusal("locked-field");
  }
  return ALLOW;
}

/** Verdict attendu pour une opération du journal. */
export function expectedOp(rights: Rights, bench: Bench, op: Op): Expected {
  const elevation = elevationRefusal(rights, op);
  if (elevation !== null) return elevation;
  if (rights.regime === "author" || rights.regime === "script") return ALLOW;
  if (rights.regime === "browse") return expectedBrowseOp(bench, op);
  return expectedAgentOp(rights, bench, op);
}

/** Mode Jouer : structure et script refusés, le verrou tient (CAR-F-05, CAR-F-06). */
function expectedBrowseAction(bench: Bench, rights: Rights, action: AgentAction): Expected {
  if (BROWSE_DENIED_ACTIONS.has(action.kind)) return refusal("mode-browse");
  if (action.kind === "write_field") {
    // L'humain saisit dans un champ ; le verrou se lit sur la carte visée.
    if (action.locked || fieldLocked(bench.stack, rights.cardId, action.partId)) {
      return refusal("locked-field");
    }
  }
  return ALLOW;
}

/** Un agent : `reply` d'abord, puis sommeil, niveau, carte, verrou, jeton. */
function expectedAgentAction(rights: Rights, bench: Bench, action: AgentAction): Expected {
  if (action.kind === "reply") return ALLOW;
  if (!rights.awake) return refusal("agent-asleep");
  const rule = ACTION_RULES[action.kind];
  const level = rights.level ?? 1;
  if (level < rule.min) return refusal("level-too-low");
  if (rule.own && "onOwnCard" in action && !action.onOwnCard) return refusal("not-own-card");
  if ("partId" in action && !partOf(bench.stack, rights.cardId, action.partId)) {
    return refusal("not-own-card");
  }
  if (action.kind === "write_field") {
    // Le drapeau de l'appelant et la pile font foi tous les deux (CAR-F-06).
    if (action.locked || fieldLocked(bench.stack, rights.cardId, action.partId)) {
      return refusal("locked-field");
    }
  }
  if (rule.token && !rights.token) return refusal("no-token");
  return ALLOW;
}

/** Verdict attendu pour un appel d'outil. */
export function expectedAction(rights: Rights, bench: Bench, action: AgentAction): Expected {
  if (rights.regime === "author") return ALLOW;
  if (rights.regime === "browse") return expectedBrowseAction(bench, rights, action);
  if (rights.regime === "script") {
    // Un script exécute ; la seule chose qu'on lui demande est un jeton.
    if (action.kind !== "propose_script") return ALLOW;
    return rights.token ? ALLOW : refusal("no-token");
  }
  return expectedAgentAction(rights, bench, action);
}
