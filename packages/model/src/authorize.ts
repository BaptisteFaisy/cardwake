/**
 * Point de passage unique des droits (11.1, CAR-N-09, règle 1 de
 * `.kiro/steering/agent-safety.md`). Aucun module n'applique une opération
 * sans un verdict d'ici : `authorize` pour les outils d'un agent, `authorizeOp`
 * pour les opérations réversibles du journal.
 *
 * Trois acteurs, trois régimes :
 * - `human` : en mode Jouer (`browse`), aucune structure ni script (CAR-F-05) ;
 *   en mode Fabriquer (`author`), tout est permis.
 * - `script` : pas de niveau, mais aucune élévation (CAR-P-12) ; il peut écrire
 *   dans un champ verrouillé (CAR-F-06).
 * - `agent` : outils bornés par le niveau effectif (7.4) et par sa carte
 *   (CAR-F-35) ; un script ne s'installe qu'avec un jeton d'acceptation humaine
 *   (CAR-P-17).
 *
 * Paquet **pur** : ni `Date.now`, ni `Math.random`. Le seul état de module est
 * le registre des jetons, documenté plus bas.
 */

import type { Actor, PropName } from "@cardwake/lang";
import { APP_LIMITS } from "./limits";
import type { AgentLevel, Card, Op, Part, Stack, Verdict } from "./types";

/** Les neuf outils qu'un agent peut demander (7.4). */
export type AgentAction =
  | { kind: "reply" }
  | { kind: "send_message"; toCardId: number }
  | { kind: "write_field"; partId: number; locked: boolean; onOwnCard: boolean }
  | { kind: "set_appearance"; partId: number; prop: PropName; onOwnCard: boolean }
  | { kind: "create_part"; partKind: "field" | "button"; onOwnCard: boolean }
  | { kind: "delete_part"; partId: number; onOwnCard: boolean }
  | { kind: "create_card" }
  | { kind: "go_to_card" }
  | { kind: "propose_script"; onOwnCard: boolean; acceptanceToken?: string };

/** Qui demande, dans quelle pile, sur quelle carte (celle de l'agent). */
export type ActorContext = { stack: Stack; actor: Actor; cardId: number };

/** Noms des cinq niveaux (7.4) : ce que l'agent sait faire, en un mot. */
export const LEVEL_LABELS: Record<AgentLevel, string> = {
  1: "Browse",
  2: "Type",
  3: "Paint",
  4: "Create",
  5: "Program",
};

/** Niveau minimal pour chaque outil (7.4). */
export const ACTION_MIN_LEVEL: Record<AgentAction["kind"], AgentLevel> = {
  reply: 1,
  send_message: 1,
  write_field: 2,
  set_appearance: 3,
  create_part: 4,
  delete_part: 4,
  create_card: 4,
  go_to_card: 4,
  propose_script: 5,
};

/** Outils qui n'existent pas pour l'humain en mode Jouer. */
const HUMAN_BROWSE_DENIED: ReadonlySet<AgentAction["kind"]> = new Set<AgentAction["kind"]>([
  "create_part",
  "delete_part",
  "create_card",
  "propose_script",
]);

/**
 * Opérations interdites à l'humain en mode Jouer : structure et script
 * (CAR-F-05), plus les droits et les budgets. Ces derniers ne relèvent pas de
 * la structure au sens strict, mais ils sont du réglage d'auteur : jouer n'est
 * pas régler les agents (CAR-P-12, règle 4 de la charte de sécurité).
 */
const BROWSE_DENIED_OPS: ReadonlySet<Op["kind"]> = new Set<Op["kind"]>([
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

const ALLOW: Verdict = { allow: true };

function deny(reason: string, rule: string): Verdict {
  return { allow: false, reason, rule };
}

// --------------------------------------------------------------------------
// Registre des jetons d'acceptation (CAR-P-17)
// --------------------------------------------------------------------------

/**
 * Registre des jetons d'acceptation, au niveau du module et **volontairement
 * non cryptographique** : un compteur monotone suffit à distinguer deux jetons.
 * Ce n'est pas un secret, c'est un lien d'usage interne entre l'écran de
 * relecture (l'humain accepte) et la proposition de l'agent (niveau 5).
 *
 * Propriétés tenues ici :
 * - un jeton n'est délivré que par `acceptanceToken()` ;
 * - il n'est accepté qu'une fois : `authorize` le consomme et le retire ;
 * - le registre vit en mémoire : un rechargement de page invalide les jetons,
 *   donc une acceptation ne survit pas à la session qui l'a donnée ;
 * - il est borné (les plus anciens tombent), pour qu'aucune fuite mémoire ne
 *   s'installe si l'écran accepte sans que l'agent propose.
 */
const MAX_LIVE_TOKENS = 64;
const liveTokens = new Map<string, true>();
let tokenSeed = 0;

/** Fabrique un jeton opaque, à usage unique. */
export function acceptanceToken(): string {
  tokenSeed += 1;
  const token = `accept-${tokenSeed.toString(36)}-${liveTokens.size.toString(36)}`;
  liveTokens.set(token, true);
  while (liveTokens.size > MAX_LIVE_TOKENS) {
    const oldest = liveTokens.keys().next().value;
    if (oldest === undefined) break;
    liveTokens.delete(oldest);
  }
  return token;
}

/** Vrai si le jeton a été émis et n'a pas encore servi. */
export function isLiveAcceptanceToken(token: string | undefined): boolean {
  return token !== undefined && token !== "" && liveTokens.has(token);
}

/** Échange un jeton vivant contre le droit d'installer un script, une fois. */
function consumeAcceptanceToken(token: string | undefined): boolean {
  if (!isLiveAcceptanceToken(token)) return false;
  liveTokens.delete(token as string);
  return true;
}

// --------------------------------------------------------------------------
// Niveau effectif
// --------------------------------------------------------------------------

/** Une pile créée ici, ou reçue et déclarée fiable (7.10, CAR-F-52). */
export function isTrusted(stack: Stack): boolean {
  return stack.provenance.kind === "created" || stack.provenance.trusted;
}

/** Recadre un niveau venu d'un fichier : entier, entre 1 et 5. */
function normalizeLevel(value: number): AgentLevel {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return APP_LIMITS.agentLevelMin;
  const n = Math.trunc(raw);
  return Math.min(APP_LIMITS.agentLevelMax, Math.max(APP_LIMITS.agentLevelMin, n)) as AgentLevel;
}

/**
 * Niveau réellement accordé : le niveau déclaré, plafonné à
 * `APP_LIMITS.receivedLevelCap` tant que la pile est reçue et non déclarée
 * fiable (CAR-P-13, CAR-F-52). Un agent endormi n'a aucun droit : niveau 1.
 */
export function effectiveLevel(stack: Stack, card: Card | undefined): AgentLevel {
  const agent = card?.agent;
  if (agent === null || agent === undefined || !agent.awake) return 1;
  const declared = normalizeLevel(agent.level);
  if (isTrusted(stack)) return declared;
  return Math.min(declared, APP_LIMITS.receivedLevelCap) as AgentLevel;
}

// --------------------------------------------------------------------------
// Lecture de la pile : carte, élément, verrou
// --------------------------------------------------------------------------

function findCard(stack: Stack, cardId: number): Card | undefined {
  return stack.cards.find((card) => card.id === cardId);
}

/** Élément visé : propre à la carte, ou champ de son fond (CAR-F-03). */
function findPart(stack: Stack, card: Card, partId: number, backgroundId?: number): Part | undefined {
  const own = card.parts.find((part) => part.id === partId);
  if (own !== undefined) return own;
  const bgId = backgroundId ?? card.background;
  if (bgId === null) return undefined;
  const background = stack.backgrounds.find((bg) => bg.id === bgId);
  return background?.parts.find((part) => part.id === partId);
}

/** L'élément est-il sur cette carte (à elle, ou champ de son fond) ? */
function partOnCard(stack: Stack, card: Card, partId: number): boolean {
  return findPart(stack, card, partId) !== undefined;
}

/** Un champ verrouillé refuse l'agent et l'humain en Jouer, pas le script. */
function fieldIsLocked(
  stack: Stack,
  cardId: number,
  partId: number,
  backgroundId?: number,
): boolean {
  const card = findCard(stack, cardId);
  if (card === undefined) return false;
  const part = findPart(stack, card, partId, backgroundId);
  return part !== undefined && part.kind === "field" && part.locked;
}

function agentCardId(ctx: ActorContext): number {
  return ctx.actor.kind === "agent" ? ctx.actor.cardId : ctx.cardId;
}

// --------------------------------------------------------------------------
// Outils d'agent
// --------------------------------------------------------------------------

/**
 * Verdict pour une demande d'outil. L'ordre des refus est celui du cahier des
 * charges : endormi, puis niveau, puis carte, puis verrou, puis jeton.
 */
export function authorize(ctx: ActorContext, action: AgentAction): Verdict {
  switch (ctx.actor.kind) {
    case "agent":
      return authorizeAgent(ctx, agentCardId(ctx), action);
    case "human":
      return authorizeHuman(ctx, action);
    case "script":
      // Un script n'a pas de niveau ; ses limites sont celles de l'élévation.
      return authorizeScript(action);
  }
}

/** Un script exécute ; il n'a pas de carte, donc pas de proposition d'outil. */
function authorizeScript(action: AgentAction): Verdict {
  if (action.kind !== "propose_script") return ALLOW;
  if (!consumeAcceptanceToken(action.acceptanceToken)) {
    return deny("Proposing a script needs a human acceptance token, used once.", "no-token");
  }
  return ALLOW;
}

function authorizeAgent(ctx: ActorContext, cardId: number, action: AgentAction): Verdict {
  if (action.kind === "reply") return ALLOW;
  const card = findCard(ctx.stack, cardId);
  if (card === undefined || card.agent === null || !card.agent.awake) {
    return deny("The agent is asleep: it may only reply.", "agent-asleep");
  }
  const level = denyIfLevelTooLow(ctx.stack, card, ctx.actor, action.kind);
  if (level !== null) return level;
  const ownCard = denyIfNotOwnCard(ctx.stack, card, action);
  if (ownCard !== null) return ownCard;
  const locked = denyIfLocked(ctx, cardId, action);
  if (locked !== null) return locked;
  if (action.kind !== "propose_script") return ALLOW;
  if (!consumeAcceptanceToken(action.acceptanceToken)) {
    return deny("Proposing a script needs a human acceptance token, used once.", "no-token");
  }
  return ALLOW;
}

/**
 * Niveau réellement opposable : celui de la carte, mais jamais plus que celui
 * que l'acteur s'attribue. Un appelant qui annoncerait un niveau plus haut que
 * la carte n'obtient donc rien de plus (aucune élévation par incohérence).
 */
function actionableLevel(stack: Stack, card: Card, actor: Actor): AgentLevel {
  const fromCard = effectiveLevel(stack, card);
  if (actor.kind !== "agent") return fromCard;
  return Math.min(fromCard, normalizeLevel(actor.level)) as AgentLevel;
}

function denyIfLevelTooLow(stack: Stack, card: Card, actor: Actor, kind: AgentAction["kind"]): Verdict | null {
  const level = actionableLevel(stack, card, actor);
  const need = ACTION_MIN_LEVEL[kind];
  if (level >= need) return null;
  const reason =
    `Tool "${kind}" needs level ${need} (${LEVEL_LABELS[need]}), ` +
    `the agent is at level ${level} (${LEVEL_LABELS[level]}).`;
  return deny(reason, "level-too-low");
}

/** Un agent n'agit que sur sa carte ; `reply` et `send_message` parlent ailleurs. */
function denyIfNotOwnCard(stack: Stack, card: Card, action: AgentAction): Verdict | null {
  if (!("onOwnCard" in action)) return null;
  if (!action.onOwnCard) {
    return deny("An agent only acts on its own card; use send_message to reach another one.", "not-own-card");
  }
  if (!("partId" in action)) return null;
  if (partOnCard(stack, card, action.partId)) return null;
  return deny("This element is not on the agent's own card.", "not-own-card");
}

function denyIfLocked(ctx: ActorContext, cardId: number, action: AgentAction): Verdict | null {
  if (action.kind !== "write_field") return null;
  // Le drapeau vient de `dispatch` ; on le recoupe avec la pile pour qu'un
  // appelant distrait ne perce pas le verrou (CAR-F-06).
  if (!action.locked && !fieldIsLocked(ctx.stack, cardId, action.partId)) return null;
  return deny("The field is locked: only a script may write into it.", "locked-field");
}

function authorizeHuman(ctx: ActorContext, action: AgentAction): Verdict {
  if (ctx.actor.kind !== "human" || ctx.actor.mode === "author") return ALLOW;
  if (HUMAN_BROWSE_DENIED.has(action.kind)) {
    return deny("In play mode only the author changes structure or scripts.", "mode-browse");
  }
  if (action.kind === "write_field") {
    const locked = action.locked || fieldIsLocked(ctx.stack, ctx.cardId, action.partId);
    if (locked) return deny("The field is locked: only a script may write into it.", "locked-field");
  }
  return ALLOW;
}

// --------------------------------------------------------------------------
// Opérations du journal
// --------------------------------------------------------------------------

/** Ce qu'un agent doit avoir pour produire une opération. */
type AgentNeed = { min: AgentLevel; zone: "own" | "other" };

/** Marqueur : cette opération n'appartient qu'à un humain (CAR-P-12). */
const ELEVATION_ONLY: AgentNeed | Verdict = {
  allow: false,
  reason: "Only a human sets a level, a persona, an awake state or a budget.",
  rule: "no-elevation",
};

function sameCard(agentCardIdValue: number, targetId: number): "own" | "other" {
  return agentCardIdValue === targetId ? "own" : "other";
}

function zoneOfPart(
  stack: Stack,
  agentCardIdValue: number,
  targetCardId: number,
  partId: number,
): "own" | "other" {
  const card = findCard(stack, targetCardId);
  if (card === undefined || targetCardId !== agentCardIdValue) return "other";
  return partOnCard(stack, card, partId) ? "own" : "other";
}

/** Aucune élévation : seul un humain touche aux droits et aux budgets. */
function denyElevation(actor: Actor, op: Op): Verdict | null {
  if (op.kind === "setAgent" || op.kind === "setSettings") {
    if (actor.kind !== "human") {
      return deny("Only a human sets a level, a persona, an awake state or a budget.", "no-elevation");
    }
    return null;
  }
  if (op.kind === "setScript" && actor.kind === "agent") {
    return deny("An agent may only propose a script; a human installs it.", "no-elevation");
  }
  if (op.kind === "setStackProp" && op.prop === "persona" && actor.kind === "script") {
    return deny("A script cannot change the stack persona.", "no-elevation");
  }
  return null;
}

/** Traduit une opération en besoin d'agent, ou en refus immédiat. */
function agentNeedForOp(ctx: ActorContext, op: Op, cardId: number): AgentNeed | Verdict {
  switch (op.kind) {
    case "setText":
      return { min: 2, zone: zoneOfPart(ctx.stack, cardId, op.cardId, op.partId) };
    case "setProp":
      if (op.target.kind === "part") {
        return { min: 3, zone: zoneOfPart(ctx.stack, cardId, op.target.cardId, op.target.partId) };
      }
      if (op.target.kind === "card") return { min: 3, zone: sameCard(cardId, op.target.cardId) };
      return { min: 3, zone: "other" };
    case "createPart":
      return { min: 4, zone: sameCard(cardId, op.cardId) };
    case "deletePart":
      return { min: 4, zone: zoneOfPart(ctx.stack, cardId, op.cardId, op.part.id) };
    case "createCard":
    case "navigate":
      return { min: 4, zone: "own" };
    case "deleteCard":
      return { min: 4, zone: sameCard(cardId, op.card.id) };
    case "moveCard":
      return { min: 4, zone: sameCard(cardId, op.cardId) };
    // Les opérations de droits sont écartées avant d'arriver ici par
    // `denyElevation` : on ne les traite pas deux fois (CAR-P-12).
    case "setScript":
    case "setAgent":
    case "setSettings":
      return ELEVATION_ONLY;
    case "setStackProp":
      if (op.prop === "persona") return ELEVATION_ONLY;
      return { min: 4, zone: "other" };
    case "createBackground":
    case "deleteBackground":
      return { min: 4, zone: "other" };
  }
}

function authorizeAgentOp(ctx: ActorContext, op: Op): Verdict {
  const cardId = agentCardId(ctx);
  const need = agentNeedForOp(ctx, op, cardId);
  if ("allow" in need) return need;
  const card = findCard(ctx.stack, cardId);
  if (card === undefined || card.agent === null || !card.agent.awake) {
    return deny("The agent is asleep: it may only reply.", "agent-asleep");
  }
  const actual = actionableLevel(ctx.stack, card, ctx.actor);
  if (actual < need.min) {
    const reason =
      `Operation "${op.kind}" needs level ${need.min} (${LEVEL_LABELS[need.min]}), ` +
      `the agent is at level ${actual} (${LEVEL_LABELS[actual]}).`;
    return deny(reason, "level-too-low");
  }
  if (need.zone === "other") {
    return deny("An agent only acts on its own card.", "not-own-card");
  }
  if (op.kind === "setText" && fieldIsLocked(ctx.stack, op.cardId, op.partId, op.backgroundId)) {
    return deny("The field is locked: only a script may write into it.", "locked-field");
  }
  return ALLOW;
}

function authorizeHumanOp(ctx: ActorContext, op: Op): Verdict {
  if (ctx.actor.kind !== "human" || ctx.actor.mode === "author") return ALLOW;
  if (BROWSE_DENIED_OPS.has(op.kind)) {
    return deny("In play mode only the author changes structure, scripts or agent rights.", "mode-browse");
  }
  if (op.kind === "setStackProp") {
    return deny("In play mode only the author renames the stack or changes its persona.", "mode-browse");
  }
  if (op.kind === "setText" && fieldIsLocked(ctx.stack, op.cardId, op.partId, op.backgroundId)) {
    return deny("The field is locked: in play mode only a script writes into it.", "locked-field");
  }
  return ALLOW;
}

/** Verdict pour une opération réversible du journal (7.9, CAR-P-12). */
export function authorizeOp(ctx: ActorContext, op: Op): Verdict {
  const elevation = denyElevation(ctx.actor, op);
  if (elevation !== null) return elevation;
  switch (ctx.actor.kind) {
    case "agent":
      return authorizeAgentOp(ctx, op);
    case "human":
      return authorizeHumanOp(ctx, op);
    case "script":
      // Un script écrit où il veut, y compris dans un champ verrouillé.
      return ALLOW;
  }
}
