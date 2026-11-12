/**
 * Contrôles statiques d'un script Murmur — sans jamais l'exécuter.
 *
 * `checkScript` analyse le texte, parcourt l'arbre une seule fois (un visiteur
 * récursif sur `Stmt` et `Expr`, aucun doublon par instruction) et rend la
 * liste des problèmes trouvés, chacun avec sa règle, son niveau et sa position.
 *
 * Règles implémentées :
 * - `script-too-long`  : le texte dépasse 20 000 caractères (contrôle préalable) ;
 * - `parse-error`      : une erreur d'analyse est reprise avec sa ligne/colonne ;
 * - `unknown-part` / `unknown-card` / `unknown-background` : un élément cité
 *   n'existe ni dans le contexte ni parmi les créations déjà vues — `create
 *   field "X"` rend X connu pour la suite du script ;
 * - `unknown-handler` / `unknown-message` : `exit`, `send` et `pass` doivent
 *   viser un message système connu ou un handler défini dans le script ;
 * - `forbidden-call`   : un nom appelé ressemble à un accès interdit
 *   (eval, fetch, http, file, shell, require, import) ;
 * - `unknown-function` : avertissement — une fonction appelée n'est ni
 *   intégrée, ni définie dans le script, ni listée dans `knownFunctions` ;
 * - `duplicate-handler` : avertissement — deux handlers portent le même nom.
 *
 * Les comparaisons de noms sont insensibles à la casse, comme les mots-clés
 * du langage ; les messages rendus sont en anglais, lus par l'auteur.
 */

import type {
  AgentRef, CardRef, Chunk, Container, CreateWhat, Expr, ObjRef, RefBy, RepeatLoop, Script, ScriptError, Span, Stmt,
} from "./ast";
import { parseScript } from "./parser";

/** Un problème trouvé par les contrôles : règle, niveau, message, position. */
export type CheckIssue = { level: "error" | "warning"; message: string; line?: number; col?: number; rule: string };

/** Ce que le contrôleur sait du monde autour du script. */
export type CheckContext = {
  cardNames: string[];
  partNames: string[];
  backgroundNames: string[];
  objectKind: "card" | "background" | "part" | "stack";
  knownFunctions?: string[];
};

/** Taille maximale d'un script, en caractères. */
const MAX_SCRIPT_CHARS = 20_000;

/** Messages système : toujours connus, quel que soit le script. */
const SYSTEM_MESSAGES = new Set([
  "openstack", "opencard", "closecard", "mouseup", "returninfield", "closefield", "message", "tick",
]);

/** Les dix fonctions intégrées du langage (BuiltinFn). */
const BUILTIN_FUNCTIONS = new Set([
  "length", "offset", "round", "min", "max", "sum", "average", "upper", "lower", "random",
]);

/** Mots qu'aucun nom appelé ne doit contenir : pas de réseau ni de fichiers. */
const FORBIDDEN_WORDS = ["eval", "fetch", "http", "file", "shell", "require", "import"];

/** Noms connus, modifiés au fil du parcours : `create` y ajoute des noms. */
type KnownNames = { parts: Set<string>; cards: Set<string>; backgrounds: Set<string> };

/** État du parcours : noms connus, handlers, fonctions, problèmes accumulés. */
type CheckState = { known: KnownNames; handlers: Set<string>; functions: Set<string>; issues: CheckIssue[] };

function lower(name: string): string {
  return name.toLowerCase();
}

function toSet(names: string[]): Set<string> {
  return new Set(names.map(lower));
}

/** Ajoute un problème, positionné sur le début de l'empan donné. */
function add(state: CheckState, level: CheckIssue["level"], rule: string, message: string, span?: Span): void {
  state.issues.push({ level, message, rule, line: span?.start.line, col: span?.start.col });
}

/** Le nom porté par une désignation, s'il y en a un ; rang et id ne se contrôlent pas. */
function nameOf(by: RefBy): string | null {
  return by.kind === "name" ? by.name : null;
}

// Désignations d'objets ----------------------------------------------------

function checkCardRef(ref: CardRef, state: CheckState): void {
  if (ref.kind !== "card") return; // this, next, previous, first, last : rien à vérifier
  const name = nameOf(ref.by);
  if (name !== null && !state.known.cards.has(lower(name))) {
    add(state, "error", "unknown-card", `Unknown card "${name}".`, ref.span);
  }
}

function checkObjRef(ref: ObjRef, state: CheckState): void {
  if (ref.kind === "card") return checkCardRef(ref.ref, state);
  if (ref.kind === "agent") return checkAgentRef(ref.ref, state);
  if (ref.kind !== "part") return; // me, target, thisBackground, thisStack : rien à vérifier
  if (ref.ref.of) checkCardRef(ref.ref.of, state);
  const name = nameOf(ref.ref.by);
  if (name !== null && !state.known.parts.has(lower(name))) {
    add(state, "error", "unknown-part", `Unknown ${ref.ref.partKind} "${name}".`, ref.span);
  }
}

function checkAgentRef(ref: AgentRef, state: CheckState): void {
  if (ref.of) checkCardRef(ref.of, state);
}

/** Une création rend son nom connu pour la suite du script. */
function recordCreate(what: CreateWhat, state: CheckState): void {
  const name = what.name && what.name.kind === "str" ? what.name.value : null;
  if (what.kind === "background") {
    if (name !== null) state.known.backgrounds.add(lower(name));
    return;
  }
  if (what.kind === "part") {
    if (name !== null) state.known.parts.add(lower(name));
    return;
  }
  if (name !== null) state.known.cards.add(lower(name));
  // Le fond d'une carte créée doit, lui, déjà exister.
  if (what.background && what.background.kind === "str") {
    const background = what.background.value;
    if (!state.known.backgrounds.has(lower(background))) {
      add(state, "error", "unknown-background", `Unknown background "${background}".`, what.span);
    }
  }
}

// Messages et appels -------------------------------------------------------

/** Un nom de message : système connu, ou handler défini dans le script. */
function checkMessageName(name: string, rule: string, state: CheckState, span: Span): void {
  if (SYSTEM_MESSAGES.has(lower(name)) || state.handlers.has(lower(name))) return;
  add(state, "error", rule, `Unknown message "${name}": not a system message, and no handler defines it.`, span);
}

/** Un nom appelé : d'abord l'accès interdit, ensuite la fonction inconnue. */
function checkCalledName(name: string, state: CheckState, span: Span): void {
  const low = lower(name);
  const hit = FORBIDDEN_WORDS.find((word) => low.includes(word));
  if (hit !== undefined) {
    add(state, "error", "forbidden-call", `The name "${name}" looks like a forbidden access ("${hit}").`, span);
    return;
  }
  if (BUILTIN_FUNCTIONS.has(low) || state.functions.has(low)) return;
  add(state, "warning", "unknown-function", `Unknown function "${name}": it is not defined in this script.`, span);
}

// Expressions et conteneurs ------------------------------------------------

function checkChunk(chunk: Chunk, state: CheckState): void {
  for (const bound of [chunk.ordinal, chunk.from, chunk.to]) {
    if (bound) checkExpr(bound, state);
  }
}

function checkContainer(target: Container, state: CheckState): void {
  if (target.kind === "obj") checkObjRef(target.ref, state);
  else if (target.kind === "chunk") {
    checkChunk(target.chunk, state);
    checkContainer(target.of, state);
  }
}

/** Visiteur d'expressions : un seul parcours, récursif sur chaque forme. */
function checkExpr(expr: Expr, state: CheckState): void {
  switch (expr.kind) {
    case "bin": checkExpr(expr.left, state); return checkExpr(expr.right, state);
    case "test":
    case "not":
    case "neg": return checkExpr(expr.operand, state);
    case "paren": return checkExpr(expr.inner, state);
    case "fn": return expr.args.forEach((arg) => checkExpr(arg, state));
    case "call":
      expr.args.forEach((arg) => checkExpr(arg, state));
      return checkCalledName(expr.name, state, expr.span);
    case "count": if (expr.of) checkExpr(expr.of, state); return;
    case "prop": return checkObjRef(expr.of, state);
    case "objText": return checkObjRef(expr.ref, state);
    case "chunk": checkChunk(expr.chunk, state); return checkContainer(expr.of, state);
    default: return; // str, num, var, it, empty, theDate, theTime, theLongDate : rien à vérifier
  }
}

// Instructions -------------------------------------------------------------

/** Visiteur d'instructions, première moitié du dispatch. */
function checkStmt(stmt: Stmt, state: CheckState): void {
  switch (stmt.kind) {
    case "put": checkExpr(stmt.expr, state); return checkContainer(stmt.target, state);
    case "set": checkObjRef(stmt.obj, state); return checkExpr(stmt.value, state);
    case "get":
    case "answer":
    case "find": return checkExpr(stmt.expr, state);
    case "go": return checkCardRef(stmt.card, state);
    case "send":
      checkExpr(stmt.message, state);
      stmt.args.forEach((arg) => checkExpr(arg, state));
      checkObjRef(stmt.to, state);
      // Un message calculé ne se contrôle pas ; un littéral, si.
      if (stmt.message.kind === "str") checkMessageName(stmt.message.value, "unknown-message", state, stmt.span);
      return;
    case "pass":
      if (stmt.message) checkMessageName(stmt.message, "unknown-message", state, stmt.span);
      return;
    case "ask":
      checkExpr(stmt.prompt, state);
      if (stmt.into) checkContainer(stmt.into, state);
      return;
    case "show":
    case "hide":
    case "delete": return checkObjRef(stmt.obj, state);
    case "arith": checkExpr(stmt.value, state); return checkContainer(stmt.target, state);
    case "create": return recordCreate(stmt.what, state);
    default: return checkStmtRest(stmt, state);
  }
}

/** Seconde moitié du dispatch : gardée séparée pour rester sous 50 lignes. */
function checkStmtRest(stmt: Stmt, state: CheckState): void {
  switch (stmt.kind) {
    case "sort":
      checkContainer(stmt.spec.container, state);
      if (stmt.spec.by?.index) checkExpr(stmt.spec.by.index, state);
      return;
    case "wait": return checkExpr(stmt.duration, state);
    case "consult": checkAgentRef(stmt.agent, state); return checkExpr(stmt.with, state);
    case "tell": checkAgentRef(stmt.agent, state); return checkExpr(stmt.text, state);
    case "if":
      checkExpr(stmt.cond, state);
      checkBody(stmt.then, state);
      if (stmt.otherwise) checkBody(stmt.otherwise, state);
      return;
    case "repeat": checkLoop(stmt.loop, state); return checkBody(stmt.body, state);
    case "exit":
      if (stmt.what !== "repeat") checkMessageName(stmt.what.handler, "unknown-handler", state, stmt.span);
      return;
    case "return": if (stmt.value) checkExpr(stmt.value, state); return;
    case "call":
      stmt.args.forEach((arg) => checkExpr(arg, state));
      return checkCalledName(stmt.name, state, stmt.span);
    default: return; // global : rien à vérifier
  }
}

/** Les quatre formes de `repeat` : leurs bornes sont des expressions. */
function checkLoop(loop: RepeatLoop, state: CheckState): void {
  switch (loop.kind) {
    case "with":
      checkExpr(loop.from, state);
      checkExpr(loop.to, state);
      if (loop.step) checkExpr(loop.step, state);
      return;
    case "forEach": return checkExpr(loop.in, state);
    case "while": return checkExpr(loop.cond, state);
    case "times": return checkExpr(loop.count, state);
  }
}

function checkBody(body: Stmt[], state: CheckState): void {
  for (const stmt of body) checkStmt(stmt, state);
}

// Entrée -------------------------------------------------------------------

/** Deux handlers du même nom : avertissement sur chaque doublon. */
function checkDuplicates(script: Script, state: CheckState): void {
  const seen = new Set<string>();
  for (const handler of script.handlers) {
    const low = lower(handler.name);
    if (seen.has(low)) {
      add(state, "warning", "duplicate-handler", `The handler "${handler.name}" is defined more than once.`, handler.span);
    }
    seen.add(low);
  }
}

/** Les erreurs d'analyse reprises telles quelles, avec leur position. */
function parseIssues(errors: ScriptError[]): CheckIssue[] {
  return errors.map((error) => ({
    level: "error" as const, message: error.message, line: error.line, col: error.col, rule: "parse-error",
  }));
}

function buildState(script: Script, context: CheckContext): CheckState {
  return {
    known: {
      parts: toSet(context.partNames),
      cards: toSet(context.cardNames),
      backgrounds: toSet(context.backgroundNames),
    },
    handlers: toSet(script.handlers.map((handler) => handler.name)),
    functions: toSet([...script.functions.map((fn) => fn.name), ...(context.knownFunctions ?? [])]),
    issues: [],
  };
}

/**
 * Contrôle un script complet : taille, analyse, puis parcours de l'arbre.
 * Rend la liste des problèmes, dans l'ordre du texte ; liste vide = script sain.
 */
export function checkScript(source: string, context: CheckContext): CheckIssue[] {
  if (source.length > MAX_SCRIPT_CHARS) {
    const message = `This script has ${source.length} characters; the limit is ${MAX_SCRIPT_CHARS}.`;
    return [{ level: "error", message, line: 1, col: 1, rule: "script-too-long" }];
  }
  const parsed = parseScript(source);
  if (!parsed.ok) return parseIssues(parsed.errors);
  const state = buildState(parsed.script, context);
  checkDuplicates(parsed.script, state);
  for (const handler of parsed.script.handlers) checkBody(handler.body, state);
  for (const fn of parsed.script.functions) checkBody(fn.body, state);
  return state.issues;
}
