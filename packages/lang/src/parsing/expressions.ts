/**
 * Analyse des expressions, des morceaux de texte et des désignations d'objets.
 *
 * Précédence, de la plus faible à la plus forte :
 * `or` → `and` → comparaisons (`= <> < > <= >=`, `contains`, `is in`,
 * `is empty`) → concaténation (`&`, `&&`) → `+ -` → `* / div mod` →
 * unaire (`not`, `-`) → `^` → valeurs primaires.
 */

import type { Token } from "../lexer";
import type {
  BinOp,
  BuiltinFn,
  CardRef,
  Chunk,
  ChunkType,
  Container,
  CountSubject,
  Expr,
  ObjRef,
  PropName,
  RefBy,
  Span,
} from "../ast";
import { Cursor } from "./cursor";

const BUILTINS: Record<string, BuiltinFn> = {
  length: "length",
  offset: "offset",
  round: "round",
  min: "min",
  max: "max",
  sum: "sum",
  average: "average",
  upper: "upper",
  lower: "lower",
  random: "random",
};

export const PROPS: Record<string, PropName> = {
  name: "name",
  visible: "visible",
  enabled: "enabled",
  locked: "locked",
  hilite: "hilite",
  label: "label",
  style: "style",
  rect: "rect",
  text: "text",
};

/** `chars`, `character`, `lines`… sont acceptés et ramenés aux quatre types. */
const CHUNK_WORDS: Record<string, ChunkType> = {
  char: "char",
  chars: "char",
  character: "char",
  characters: "char",
  word: "word",
  words: "word",
  item: "item",
  items: "item",
  line: "line",
  lines: "line",
};

const CMP_OPS = new Set(["=", "<>", "<", ">", "<=", ">="]);

function wordAt(c: Cursor, offset = 0): string {
  const token = c.peek(offset);
  return token.kind === "word" ? token.text.toLowerCase() : "";
}

function chunkWordAt(c: Cursor, offset = 0): ChunkType | null {
  const word = wordAt(c, offset);
  return CHUNK_WORDS[word] ?? null;
}

// --------------------------------------------------------------------------
// Expressions
// --------------------------------------------------------------------------

export function parseExpression(c: Cursor): Expr {
  return parseOr(c);
}

function binary(c: Cursor, op: BinOp, left: Expr, right: Expr): Expr {
  return { kind: "bin", op, left, right, span: { start: left.span.start, end: right.span.end } };
}

function parseOr(c: Cursor): Expr {
  let left = parseAnd(c);
  while (c.takeWord("or")) left = binary(c, "or", left, parseAnd(c));
  return left;
}

function parseAnd(c: Cursor): Expr {
  let left = parseComparison(c);
  while (c.takeWord("and")) left = binary(c, "and", left, parseComparison(c));
  return left;
}

function parseComparison(c: Cursor): Expr {
  let left = parseConcat(c);
  for (;;) {
    const token = c.peek();
    if (token.kind === "op" && CMP_OPS.has(token.text)) {
      c.next();
      left = binary(c, token.text as BinOp, left, parseConcat(c));
      continue;
    }
    if (c.takeWord("contains")) {
      left = binary(c, "contains", left, parseConcat(c));
      continue;
    }
    const mark = c.position;
    if (c.takeWords("is", "not", "in")) {
      const inner = binary(c, "isIn", left, parseConcat(c));
      left = { kind: "not", operand: inner, span: inner.span };
      continue;
    }
    c.rewind(mark);
    if (c.takeWords("is", "in")) {
      left = binary(c, "isIn", left, parseConcat(c));
      continue;
    }
    c.rewind(mark);
    if (c.takeWords("is", "not", "empty")) {
      left = { kind: "test", test: "notEmpty", operand: left, span: { start: left.span.start, end: c.peek().span.end } };
      continue;
    }
    c.rewind(mark);
    if (c.takeWords("is", "empty")) {
      left = { kind: "test", test: "empty", operand: left, span: { start: left.span.start, end: c.peek().span.end } };
      continue;
    }
    c.rewind(mark);
    return left;
  }
}

function parseConcat(c: Cursor): Expr {
  let left = parseAdditive(c);
  while (c.isOp("&") || c.isOp("&&")) {
    const op = c.next().text as "&" | "&&";
    left = binary(c, op, left, parseAdditive(c));
  }
  return left;
}

function parseAdditive(c: Cursor): Expr {
  let left = parseMultiplicative(c);
  while (c.isOp("+") || c.isOp("-")) {
    const op = c.next().text as "+" | "-";
    left = binary(c, op, left, parseMultiplicative(c));
  }
  return left;
}

function parseMultiplicative(c: Cursor): Expr {
  let left = parseUnary(c);
  for (;;) {
    if (c.isOp("*") || c.isOp("/")) {
      const op = c.next().text as "*" | "/";
      left = binary(c, op, left, parseUnary(c));
      continue;
    }
    if (c.isWord("div") || c.isWord("mod")) {
      const op = wordAt(c) as "div" | "mod";
      c.next();
      left = binary(c, op, left, parseUnary(c));
      continue;
    }
    return left;
  }
}

function parseUnary(c: Cursor): Expr {
  const token = c.peek();
  if (c.takeWord("not")) {
    const operand = parseUnary(c);
    return { kind: "not", operand, span: { start: token.span.start, end: operand.span.end } };
  }
  if (c.isOp("-")) {
    c.next();
    // `-1` est un littéral négatif, pas la négation d'un littéral : l'aller-retour
    // texte ↔ arbre (CAR-P-01) exige que le signe fasse partie du nombre.
    const following = c.peek();
    if (following.kind === "number") {
      c.next();
      const value = typeof following.value === "number" ? following.value : Number(following.text);
      return {
        kind: "num",
        value: -value,
        text: `-${following.text}`,
        span: { start: token.span.start, end: following.span.end },
      };
    }
    const operand = parseUnary(c);
    return { kind: "neg", operand, span: { start: token.span.start, end: operand.span.end } };
  }
  return parsePower(c);
}

function parsePower(c: Cursor): Expr {
  const base = parsePrimary(c);
  if (c.takeOp("^")) return binary(c, "^", base, parseUnary(c));
  return base;
}

// --------------------------------------------------------------------------
// Valeurs primaires
// --------------------------------------------------------------------------

function parsePrimary(c: Cursor): Expr {
  const token = c.peek();
  if (token.kind === "string") {
    c.next();
    return { kind: "str", value: String(token.value ?? token.text), span: token.span };
  }
  if (token.kind === "number") {
    c.next();
    const value = typeof token.value === "number" ? token.value : Number(token.text);
    return { kind: "num", value, text: token.text, span: token.span };
  }
  if (token.kind === "lparen") {
    c.next();
    const inner = parseExpression(c);
    const close = c.peek();
    if (close.kind !== "rparen") throw c.abort('Expected ")" to close the expression.', close);
    c.next();
    return { kind: "paren", inner, span: { start: token.span.start, end: close.span.end } };
  }
  if (token.kind !== "word") throw c.abort("Expected a value here.", token);
  if (c.isWord("the")) return parseThe(c);
  if (chunkWordAt(c) && isChunkStart(c)) return parseChunkValue(c);
  if (isObjRefStart(c)) return { kind: "objText", ref: parseObjRef(c), span: token.span };
  const name = token.text.toLowerCase();
  if (name === "it") {
    c.next();
    return { kind: "it", span: token.span };
  }
  if (name === "empty") {
    c.next();
    return { kind: "empty", span: token.span };
  }
  if (BUILTINS[name] && c.isKind("lparen", 1)) return parseBuiltin(c, BUILTINS[name]);
  c.next();
  if (c.isKind("lparen")) return parseCall(c, token.text, token);
  return { kind: "var", name: token.text, span: token.span };
}

function parseBuiltin(c: Cursor, fn: BuiltinFn): Expr {
  const start = c.next();
  c.next(); // "("
  const args: Expr[] = [];
  if (!c.isKind("rparen")) {
    args.push(parseExpression(c));
    while (c.peek().kind === "comma") {
      c.next();
      args.push(parseExpression(c));
    }
  }
  const close = c.peek();
  if (close.kind !== "rparen") throw c.abort(`Expected ")" after ${fn}(...).`, close);
  c.next();
  return { kind: "fn", fn, args, span: { start: start.span.start, end: close.span.end } };
}

function parseCall(c: Cursor, name: string, start: Token): Expr {
  c.next(); // "("
  const args: Expr[] = [];
  if (!c.isKind("rparen")) {
    args.push(parseExpression(c));
    while (c.peek().kind === "comma") {
      c.next();
      args.push(parseExpression(c));
    }
  }
  const close = c.peek();
  if (close.kind !== "rparen") throw c.abort(`Expected ")" after ${name}(...).`, close);
  c.next();
  return { kind: "call", name, args, span: { start: start.span.start, end: close.span.end } };
}

/** `the …` : compteurs, date/heure, propriété d'un objet, cible. */
function parseThe(c: Cursor): Expr {
  const start = c.next(); // "the"
  if (c.takeWord("target")) return { kind: "objText", ref: { kind: "target", span: start.span }, span: start.span };
  if (c.takeWord("date")) return { kind: "theDate", span: start.span };
  if (c.takeWord("time")) return { kind: "theTime", span: start.span };
  if (c.takeWords("long", "date")) return { kind: "theLongDate", span: start.span };
  if (c.isWord("number")) return parseCount(c, start);
  const propToken = c.peek();
  const prop = propToken.kind === "word" ? PROPS[propToken.text.toLowerCase()] : undefined;
  if (!prop) throw c.abort("Expected a property name after \"the\".", propToken);
  c.next();
  if (!c.takeWord("of")) throw c.abort(`Expected "of" after "the ${prop}".`);
  const ref = parseObjRef(c);
  return { kind: "prop", prop, of: ref, span: { start: start.span.start, end: ref.span.end } };
}

function parseCount(c: Cursor, start: Token): Expr {
  c.next(); // "number"
  if (!c.takeWord("of")) throw c.abort('Expected "of" after "the number".');
  let subject: CountSubject;
  if (c.takeWord("cards")) {
    subject = "cards";
    return { kind: "count", subject, span: { start: start.span.start, end: c.peek().span.start } };
  }
  const chunk = chunkWordAt(c);
  if (!chunk) throw c.abort("Expected chars, words, items, lines or cards after \"the number of\".");
  c.next();
  subject = chunk;
  if (!c.takeWord("in") && !c.takeWord("of")) throw c.abort(`Expected "in" after "the number of ${subject}s".`);
  const of = parseExpression(c);
  return { kind: "count", subject, of, span: { start: start.span.start, end: of.span.end } };
}

// --------------------------------------------------------------------------
// Morceaux de texte
// --------------------------------------------------------------------------

/** Un mot de morceau n'ouvre un morceau que s'il est suivi d'une borne. */
function isChunkStart(c: Cursor): boolean {
  const next = c.peek(1);
  return next.kind === "number" || (next.kind === "op" && next.text === "-");
}

function parseChunkBounds(c: Cursor, type: ChunkType, start: Token): Chunk {
  const from = parseAdditive(c);
  if (c.takeWord("to")) {
    const to = parseAdditive(c);
    return { type, from, to, span: { start: start.span.start, end: to.span.end } };
  }
  return { type, ordinal: from, span: { start: start.span.start, end: from.span.end } };
}

function parseChunkValue(c: Cursor): Expr {
  const start = c.next();
  const chunk = parseChunkBounds(c, CHUNK_WORDS[start.text.toLowerCase()], start);
  if (!c.takeWord("of")) throw c.abort(`Expected "of" after the ${chunk.type} reference.`);
  const of = parseContainer(c);
  return { kind: "chunk", chunk, of, span: { start: start.span.start, end: of.span.end } };
}

// --------------------------------------------------------------------------
// Conteneurs (cibles d'écriture)
// --------------------------------------------------------------------------

export function parseContainer(c: Cursor): Container {
  const token = c.peek();
  if (token.kind === "word" && token.text.toLowerCase() === "it" && !c.isKind("lparen", 1)) {
    c.next();
    return { kind: "it", span: token.span };
  }
  if (chunkWordAt(c) && isChunkStart(c)) {
    const start = c.next();
    const chunk = parseChunkBounds(c, CHUNK_WORDS[start.text.toLowerCase()], start);
    if (!c.takeWord("of")) throw c.abort(`Expected "of" after the ${chunk.type} reference.`);
    const of = parseContainer(c);
    return { kind: "chunk", chunk, of, span: { start: start.span.start, end: of.span.end } };
  }
  if (isObjRefStart(c)) {
    const ref = parseObjRef(c);
    return { kind: "obj", ref, span: ref.span };
  }
  if (token.kind !== "word") throw c.abort("Expected a field, a variable or \"it\" here.", token);
  c.next();
  return { kind: "var", name: token.text, span: token.span };
}

// --------------------------------------------------------------------------
// Désignations d'objets
// --------------------------------------------------------------------------

const CARD_WORDS = new Set(["next", "previous", "first", "last"]);

export function isObjRefStart(c: Cursor): boolean {
  const word = wordAt(c);
  if (word === "me" || word === "card" || word === "field" || word === "button" || word === "agent") return true;
  if (word === "this") return ["card", "background", "stack"].includes(wordAt(c, 1));
  if (CARD_WORDS.has(word)) return wordAt(c, 1) === "card";
  return word === "the" && wordAt(c, 1) === "target";
}

function parseRefBy(c: Cursor, what: string): RefBy {
  const token = c.peek();
  if (token.kind === "string") {
    c.next();
    return { kind: "name", name: String(token.value ?? token.text), span: token.span };
  }
  if (c.isWord("id")) {
    const start = c.next();
    // Même règle que le rang : on s'arrête avant un opérateur binaire, sinon
    // `card id -41 -781` lirait une soustraction au lieu d'un identifiant suivi
    // d'un second opérande.
    const id = parseUnary(c);
    return { kind: "id", id, span: { start: start.span.start, end: id.span.end } };
  }
  // Un rang est un nombre ou une expression entre parenthèses : `card 3`,
  // `card -1`, `card (n + 1)`. On s'arrête avant tout opérateur binaire, sinon
  // `tell agent of card 0 -1` avalerait le message `-1` comme une soustraction.
  if (token.kind === "number" || (token.kind === "op" && token.text === "-") || token.kind === "lparen") {
    const index = parseUnary(c);
    return { kind: "index", index, span: { start: token.span.start, end: index.span.end } };
  }
  throw c.abort(`Expected the name, the number or the id of ${what} here.`, token);
}

export function parseCardRef(c: Cursor): CardRef {
  const token = c.peek();
  if (c.isWord("this") && wordAt(c, 1) === "card") {
    c.next();
    c.next();
    return { kind: "this", span: c.spanAt(token, c.peek()) };
  }
  for (const word of ["next", "previous", "first", "last"]) {
    if (c.isWord(word) && wordAt(c, 1) === "card") {
      c.next();
      c.next();
      const kind = word === "next" ? "next" : word === "previous" ? "previous" : word === "first" ? "first" : "last";
      return { kind, span: c.spanAt(token, c.peek()) };
    }
  }
  if (c.takeWord("card")) return { kind: "card", by: parseRefBy(c, "the card"), span: c.spanAt(token, c.peek()) };
  throw c.abort("Expected a card reference here.", token);
}

export function parseAgentRef(c: Cursor): { of?: CardRef; span: Span } {
  const token = c.peek();
  if (!c.takeWord("agent")) throw c.abort('Expected "agent" here.', token);
  if (c.takeWord("of")) return { of: parseCardRef(c), span: c.spanAt(token, c.peek()) };
  return { span: token.span };
}

export function parseObjRef(c: Cursor): ObjRef {
  const token = c.peek();
  if (c.takeWord("me")) return { kind: "me", span: token.span };
  if (c.takeWords("the", "target")) return { kind: "target", span: c.spanAt(token, c.peek()) };
  if (c.isWord("this")) {
    const second = wordAt(c, 1);
    if (second === "background") {
      c.next();
      c.next();
      return { kind: "thisBackground", span: c.spanAt(token, c.peek()) };
    }
    if (second === "stack") {
      c.next();
      c.next();
      return { kind: "thisStack", span: c.spanAt(token, c.peek()) };
    }
  }
  if (c.isWord("agent")) {
    const ref = parseAgentRef(c);
    return { kind: "agent", ref, span: ref.span };
  }
  if (c.isWord("field") || c.isWord("button")) {
    const kindWord = c.next().text.toLowerCase() as "field" | "button";
    const by = parseRefBy(c, `the ${kindWord}`);
    const partSpan = c.spanAt(token, c.peek());
    let of: CardRef | undefined;
    if (c.takeWord("of") && (c.isWord("card") || c.isWord("this") || CARD_WORDS.has(wordAt(c)))) {
      of = parseCardRef(c);
    }
    return { kind: "part", ref: { partKind: kindWord, by, of, span: partSpan }, span: c.spanAt(token, c.peek()) };
  }
  return { kind: "card", ref: parseCardRef(c), span: c.spanAt(token, c.peek()) };
}
