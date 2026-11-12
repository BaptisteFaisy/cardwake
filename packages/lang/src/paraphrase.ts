/**
 * Relecture en clair : arbre → phrases anglaises (CAR-F-26, CAR-P-03).
 *
 * Module **sans modèle** : un gabarit par type d'instruction, jamais de trou —
 * c'est ce texte que l'auteur lit avant d'accepter un script proposé par un
 * agent. La relecture est totale (toute instruction a une phrase), stable (le
 * même arbre rend toujours les mêmes phrases) et lisible sans connaître la
 * syntaxe de Murmur. Règles d'écriture : les noms d'objets apparaissent sans
 * guillemets (`field Qty`, `card Kitchen`), les textes littéraux gardent les
 * leurs (`answer "Bonjour."`) ; un bloc s'ouvre sur des deux points, son corps
 * est indenté de deux espaces par niveau et une clôture le termine. Les
 * désignations d'objets viennent de `print.ts` — aucune duplication : ce
 * module les reprend et retire les guillemets des noms.
 */

import type {
  AgentRef, ArithOp, BinOp, BuiltinFn, CardRef, Container, CountSubject, CreateWhat, Expr,
  FunctionDef, Handler, ObjRef, RepeatLoop, ScriptError, SortSpec, Stmt,
} from "./ast";
import { printCardRef, printContainer, printExpr, printObjRef } from "./print";
import { parseScript } from "./parser";

/** Un bloc se relit comme il s'imprime : deux espaces par niveau. */
const INDENT = "  ";

/** Les instructions dont le gabarit lit plusieurs champs. */
type PutStmt = Extract<Stmt, { kind: "put" }>;
type SendStmt = Extract<Stmt, { kind: "send" }>;
type AskStmt = Extract<Stmt, { kind: "ask" }>;
type ArithStmt = Extract<Stmt, { kind: "arith" }>;
type CreateStmt = Extract<Stmt, { kind: "create" }>;
type SortStmt = Extract<Stmt, { kind: "sort" }>;
type IfStmt = Extract<Stmt, { kind: "if" }>;

/** Déchappe un nom imprimé ; les sauts de ligne deviennent des espaces. */
function unquote(body: string): string {
  const text = body.replace(/\\(.)/g, (_match, char: string) => (char === '"' || char === "\\" ? char : " "));
  return text.replace(/\s+/g, " ").trim();
}

/** Retire leurs guillemets aux noms d'objets d'un texte déjà imprimé. */
function plain(printed: string): string {
  return printed.replace(/"((?:[^"\\]|\\.)*)"/g, (_match, body: string) => unquote(body));
}

/** Un objet, en mots et sans guillemets : `field Qty`, `agent of card Cook`. */
function sayObj(ref: ObjRef): string {
  return plain(printObjRef(ref));
}

/** Une carte : `card Kitchen`, `card 3`, mais `the next card`. */
function sayCard(ref: CardRef): string {
  if (ref.kind === "card") return plain(printCardRef(ref));
  return ref.kind === "this" ? "this card" : `the ${ref.kind} card`;
}

/** L'agent : celui de la carte en cours n'a pas besoin d'être nommé. */
function sayAgent(ref: AgentRef): string {
  return ref.of ? `the agent of ${sayCard(ref.of)}` : "this card's agent";
}

/** Une cible d'écriture : variable, `it`, objet, ou morceau d'objet. */
function sayTarget(target: Container): string {
  return plain(printContainer(target));
}

/** Indente les phrases d'un bloc de deux espaces. */
function indent(lines: string[]): string[] {
  return lines.map((line) => (line.length === 0 ? line : INDENT + line));
}

/** Une liste en anglais : `a`, `a and b`, `a, b and c`. */
function joinAnd(items: string[]): string {
  if (items.length < 2) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Un nom et ses arguments, en mots : `withVat with 3 and 4`. */
function sayArguments(name: string, args: Expr[], link: string): string {
  if (args.length === 0) return name;
  return `${name} ${link} ${joinAnd(args.map(paraphraseExpr))}`;
}

/** Une variable — sauf `return`, qui est la constante de saut de ligne. */
function sayVar(name: string): string {
  return name.toLowerCase() === "return" ? "a line break" : name;
}

/** Les opérateurs en mots : la syntaxe ne se relit pas, elle se dit. */
const BIN_WORD: Record<BinOp, string> = {
  "+": "plus", "-": "minus", "*": "times", "/": "divided by",
  "^": "to the power of", div: "integer-divided by", mod: "modulo",
  "&": "followed by", "&&": "followed by a space and",
  "=": "is equal to", "<>": "is different from",
  "<": "is less than", ">": "is greater than", "<=": "is at most", ">=": "is at least",
  and: "and", or: "or", contains: "contains", isIn: "is in",
};

/** Une phrase par fonction intégrée, tolérante au nombre d'arguments. */
function sayBuiltin(fn: BuiltinFn, args: Expr[]): string {
  const said = args.map(paraphraseExpr);
  const one = said[0] ?? "nothing";
  const two = said[1] ?? "nothing";
  switch (fn) {
    case "length": return `the length of ${one}`;
    case "offset": return `the first position of ${one} in ${two}`;
    case "round": return said.length > 1 ? `${one} rounded to ${two} decimals` : `${one} rounded to a whole number`;
    case "min": return `the smaller of ${one} and ${two}`;
    case "max": return `the larger of ${one} and ${two}`;
    case "sum": return `the sum of ${one}`;
    case "average": return `the average of ${one}`;
    case "upper": return `the upper-case form of ${one}`;
    case "lower": return `the lower-case form of ${one}`;
    case "random": return "a random number between 0 and 1";
  }
}

/** Un compteur : `the number of lines in field Tasks`. */
function sayCount(subject: CountSubject, of?: Expr): string {
  if (subject === "cards") return "the number of cards";
  const where = of ? ` in ${paraphraseExpr(of)}` : "";
  return `the number of ${subject}s${where}`;
}

/** Une expression, en mots. Totale : chaque forme de l'AST a son gabarit. */
export function paraphraseExpr(expr: Expr): string {
  switch (expr.kind) {
    case "str": return printExpr(expr);
    case "num": return expr.text;
    case "var": return sayVar(expr.name);
    case "it": return "the last result";
    case "empty": return "nothing";
    case "bin": return `${paraphraseExpr(expr.left)} ${BIN_WORD[expr.op]} ${paraphraseExpr(expr.right)}`;
    case "test": return `${paraphraseExpr(expr.operand)} is ${expr.test === "empty" ? "empty" : "not empty"}`;
    case "not": return `it is not true that ${paraphraseExpr(expr.operand)}`;
    case "neg": return `minus ${paraphraseExpr(expr.operand)}`;
    case "paren": return `(${paraphraseExpr(expr.inner)})`;
    case "fn": return sayBuiltin(expr.fn, expr.args);
    case "call": return `the function ${sayArguments(expr.name, expr.args, "applied to")}`;
    case "count": return sayCount(expr.subject, expr.of);
    case "theDate": return "today's date";
    case "theTime": return "the current time";
    case "theLongDate": return "today's full date";
    // Propriété, texte d'un objet, morceau : que des désignations d'objets,
    // l'impression canonique suffit une fois les guillemets retirés.
    case "prop":
    case "objText":
    case "chunk": return plain(printExpr(expr));
  }
}

/** Les quatre opérations, en mots et dans le bon ordre de chaque opération. */
function sayArithmetic(op: BinOp, left: string, right: string): string | null {
  switch (op) {
    case "+": return `Add ${right} to ${left}`;
    case "-": return `Subtract ${right} from ${left}`;
    case "*": return `Multiply ${left} by ${right}`;
    case "/": return `Divide ${left} by ${right}`;
    default: return null;
  }
}

/** `put` : une écriture, dite comme une opération quand c'en est une. */
function sayPut(stmt: PutStmt): string {
  const target = sayTarget(stmt.target);
  const expr = stmt.expr;
  const operation = expr.kind === "bin" ? sayArithmetic(expr.op, paraphraseExpr(expr.left), paraphraseExpr(expr.right)) : null;
  if (stmt.mode === "into" && operation) return `${operation} and write the result in ${target}.`;
  const value = paraphraseExpr(expr);
  return stmt.mode === "into" ? `Write ${value} in ${target}.` : `Write ${value} ${stmt.mode} the content of ${target}.`;
}

/** `add`, `subtract`, `multiply`, `divide` : l'asymétrie de la doc, en mots. */
function sayArith(stmt: ArithStmt): string {
  const value = paraphraseExpr(stmt.value);
  const target = sayTarget(stmt.target);
  const op: Record<ArithOp, string> = {
    add: `Add ${value} to ${target}`,
    subtract: `Subtract ${value} from ${target}`,
    multiply: `Multiply ${target} by ${value}`,
    divide: `Divide ${target} by ${value}`,
  };
  return `${op[stmt.op]}.`;
}

function saySend(stmt: SendStmt): string {
  const message = paraphraseExpr(stmt.message);
  if (stmt.args.length === 0) return `Send the message ${message} to ${sayObj(stmt.to)}.`;
  const args = joinAnd(stmt.args.map(paraphraseExpr));
  return `Send the message ${message} to ${sayObj(stmt.to)}, with ${args} as arguments.`;
}

function sayAsk(stmt: AskStmt): string {
  const prompt = paraphraseExpr(stmt.prompt);
  if (!stmt.into) return `Ask the reader ${prompt} and keep the typed text as the last result.`;
  return `Ask the reader ${prompt} and store the typed text in ${sayTarget(stmt.into)}.`;
}

/** `create` : une carte, un fond, un champ ou un bouton, nommé ou non. */
function sayCreate(stmt: CreateStmt): string {
  const what: CreateWhat = stmt.what;
  const name = what.name ? ` named ${plain(printExpr(what.name))}` : "";
  if (what.kind === "card") {
    const on = what.background ? ` on the background ${plain(printExpr(what.background))}` : "";
    return `Create a new card${name}${on}.`;
  }
  if (what.kind === "background") return `Create a new background${name}.`;
  return `Create a new ${what.partKind}${name}.`;
}

/** `sort` : le conteneur, la clé éventuelle, l'ordre et le mode numérique. */
function saySort(stmt: SortStmt): string {
  const spec: SortSpec = stmt.spec;
  const container = sayTarget(spec.container);
  const options = [
    spec.descending ? "from the largest to the smallest" : "",
    spec.numeric ? "comparing numbers" : "",
  ].filter((option) => option !== "");
  const tail = options.length === 0 ? "" : `, ${options.join(", ")}`;
  if (!spec.by) return `Sort ${container}${tail}.`;
  if (!spec.by.index) return `Sort the ${spec.by.kind}s of ${container}${tail}.`;
  const key = `${spec.by.kind} number ${paraphraseExpr(spec.by.index)}`;
  return `Sort ${container} using ${key} as the key${tail}.`;
}

/** Un titre, un corps indenté, une clôture : la forme de tous les blocs. */
function sayBlock(title: string, body: Stmt[], closing: string): string[] {
  return [title, ...indent(paraphraseBody(body)), closing];
}

function sayIf(stmt: IfStmt): string[] {
  const lines = [`If ${paraphraseExpr(stmt.cond)}:`, ...indent(paraphraseBody(stmt.then))];
  if (stmt.otherwise) lines.push("Otherwise:", ...indent(paraphraseBody(stmt.otherwise)));
  lines.push("End of the condition.");
  return lines;
}

/** Les quatre formes de `repeat`, toutes ouvertes sur des deux points. */
function sayLoop(loop: RepeatLoop): string {
  switch (loop.kind) {
    case "with": {
      const step = loop.step ? `, by steps of ${paraphraseExpr(loop.step)}` : "";
      const from = paraphraseExpr(loop.from);
      return `Repeat with ${loop.name} going from ${from} to ${paraphraseExpr(loop.to)}${step}:`;
    }
    case "forEach":
      return `Repeat for each ${loop.chunkType} of ${paraphraseExpr(loop.in)}, calling it ${loop.name}:`;
    case "while":
      return `Repeat as long as ${paraphraseExpr(loop.cond)}:`;
    case "times":
      return `Repeat ${paraphraseExpr(loop.count)} times:`;
  }
}

/** Une instruction en phrases — un bloc en rend plusieurs. */
export function paraphraseStmt(stmt: Stmt): string[] {
  switch (stmt.kind) {
    case "put": return [sayPut(stmt)];
    case "set": return [`Set the ${stmt.prop} of ${sayObj(stmt.obj)} to ${paraphraseExpr(stmt.value)}.`];
    case "get": return [`Compute ${paraphraseExpr(stmt.expr)} and keep it as the last result.`];
    case "go": return [`Go to ${sayCard(stmt.card)}.`];
    case "send": return [saySend(stmt)];
    case "pass": return [stmt.message ? `Hand the message ${stmt.message} on to the next level.` : "Hand the current message on to the next level."];
    case "answer": return [`Show a dialog that says ${paraphraseExpr(stmt.expr)} and offers a single button.`];
    case "ask": return [sayAsk(stmt)];
    case "show": return [`Show ${sayObj(stmt.obj)}.`];
    case "hide": return [`Hide ${sayObj(stmt.obj)}.`];
    case "arith": return [sayArith(stmt)];
    case "create": return [sayCreate(stmt)];
    default: return paraphraseStmtRest(stmt);
  }
}

/** `wait` : l'unité au singulier quand la durée vaut exactement 1. */
function sayWait(duration: Expr, unit: "ms" | "seconds"): string {
  const said = paraphraseExpr(duration);
  const word = unit === "seconds" ? "second" : "millisecond";
  return `Wait ${said} ${said === "1" ? word : `${word}s`}.`;
}

/** `global` : une ou plusieurs variables partagées par tous les handlers. */
function sayGlobal(names: string[]): string {
  const kind = names.length > 1 ? "variables" : "a variable";
  return `Declare ${joinAnd(names)} as ${kind} shared by all the handlers.`;
}

/** Seconde moitié du dispatch : gardée séparée pour rester sous 50 lignes. */
function paraphraseStmtRest(stmt: Stmt): string[] {
  switch (stmt.kind) {
    case "delete": return [`Delete ${sayObj(stmt.obj)}.`];
    case "sort": return [saySort(stmt)];
    case "find": return [sayFind(stmt.expr)];
    case "wait": return [sayWait(stmt.duration, stmt.unit)];
    case "consult": return [`Ask ${sayAgent(stmt.agent)}: ${paraphraseExpr(stmt.with)}, and wait for its answer.`];
    case "tell": return [`Tell ${sayAgent(stmt.agent)}: ${paraphraseExpr(stmt.text)}, without waiting for an answer.`];
    case "if": return sayIf(stmt);
    case "repeat": return sayBlock(sayLoop(stmt.loop), stmt.body, "End of the loop.");
    case "exit": return [stmt.what === "repeat" ? "stop the loop here." : "stop here."];
    case "return": return [sayReturn(stmt.value)];
    case "global": return [sayGlobal(stmt.names)];
    case "call": return [`Call the function ${sayArguments(stmt.name, stmt.args, "with")}.`];
    default: throw new Error(`Unknown statement: ${stmt.kind}`);
  }
}

function sayFind(expr: Expr): string {
  return `Search the whole stack for ${paraphraseExpr(expr)} and keep the cards that contain it as the last result.`;
}

function sayReturn(value?: Expr): string {
  if (!value) return "Stop the function here and return nothing.";
  return `Stop the function here and return ${paraphraseExpr(value)}.`;
}

/** Les phrases d'une suite d'instructions, dans l'ordre du script. */
export function paraphraseBody(statements: Stmt[]): string[] {
  return statements.flatMap(paraphraseStmt);
}

/** Un handler : le message qui le déclenche, son corps, sa clôture. */
function sayHandler(handler: Handler): string[] {
  const values = handler.params.length === 0 ? "" : ` with the values ${joinAnd(handler.params)}`;
  return sayBlock(`When the message ${handler.name} arrives${values}:`, handler.body, `End of the ${handler.name} handler.`);
}

/** Une fonction : son nom, ses paramètres, son corps, sa clôture. */
function sayFunction(fn: FunctionDef): string[] {
  const params = fn.params.length === 0 ? "" : `, which takes ${joinAnd(fn.params)}`;
  return sayBlock(`The function ${fn.name}${params}:`, fn.body, `End of the function ${fn.name}.`);
}

/** Une erreur d'analyse, relue telle quelle : elle est déjà lisible. */
function sayError(error: ScriptError): string {
  const where = error.line === undefined ? "" : ` (line ${error.line})`;
  const text = `This text cannot be read${where}: ${error.message}`;
  return /[.!?]["']?$/.test(text) ? text : `${text}.`;
}

/**
 * La relecture d'un script complet : une liste de phrases, une par ligne, les
 * blocs séparés par une ligne vide. Un texte qui ne s'analyse pas rend les
 * erreurs lisibles de l'analyseur, jamais d'exception ni de trace technique.
 */
export function paraphraseScript(source: string): string[] {
  const parsed = parseScript(source);
  if (!parsed.ok) return parsed.errors.map(sayError);
  const blocks = [...parsed.script.handlers.map(sayHandler), ...parsed.script.functions.map(sayFunction)];
  return blocks.flatMap((block, index) => (index === 0 ? block : ["", ...block]));
}
