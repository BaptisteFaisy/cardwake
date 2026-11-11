/**
 * Analyse des instructions Murmur, une par ligne.
 *
 * Chaque instruction est reconnue par son premier mot-clé ; les blocs
 * (`if`, `repeat`) se terminent par leur mot de fin et acceptent l'indentation
 * libre. Les erreurs remontent en `ParseAbort` avec la position exacte.
 */

import type { ArithOp, ChunkType, Container, CreateWhat, Expr, RepeatLoop, SortSpec, Stmt } from "../ast";
import type { Token } from "../lexer";
import { Cursor } from "./cursor";
import { PROPS, parseCardRef, parseAgentRef, parseContainer, parseExpression, parseObjRef } from "./expressions";

const CHUNK_WORDS: Record<string, ChunkType> = {
  char: "char",
  chars: "char",
  word: "word",
  words: "word",
  item: "item",
  items: "item",
  line: "line",
  lines: "line",
};

const ARITH_PREP: Record<string, string> = { add: "to", subtract: "from", multiply: "by", divide: "by" };

function wordOf(c: Cursor): string {
  const token = c.peek();
  return token.kind === "word" ? token.text.toLowerCase() : "";
}

function spanFrom(start: Token, c: Cursor) {
  return { start: start.span.start, end: c.peek().span.start };
}

/** Analyse une instruction ; le curseur doit être sur son premier mot. */
export function parseStatement(c: Cursor): Stmt {
  const token = c.peek();
  if (token.kind !== "word") throw c.abort("Expected a command here.", token);
  const word = token.text.toLowerCase();
  const parsers: Record<string, (c: Cursor, start: Token) => Stmt> = {
    put: parsePut,
    set: parseSet,
    get: parseGet,
    go: parseGo,
    send: parseSend,
    pass: parsePass,
    answer: parseAnswer,
    ask: parseAsk,
    show: parseShowHide,
    hide: parseShowHide,
    add: parseArith,
    subtract: parseArith,
    multiply: parseArith,
    divide: parseArith,
    create: parseCreate,
    delete: parseDelete,
    sort: parseSort,
    find: parseFind,
    wait: parseWait,
    consult: parseConsult,
    tell: parseTell,
    if: parseIf,
    repeat: parseRepeat,
    exit: parseExit,
    return: parseReturn,
    global: parseGlobal,
  };
  const parser = parsers[word];
  if (parser) return parser(c, token);
  return parseCallStatement(c, token);
}

function parsePut(c: Cursor, start: Token): Stmt {
  c.next();
  const expr = parseExpression(c);
  let mode: "into" | "before" | "after" = "into";
  if (c.takeWord("into")) mode = "into";
  else if (c.takeWord("before")) mode = "before";
  else if (c.takeWord("after")) mode = "after";
  else throw c.abort('Expected "into", "before" or "after" after the value.', c.peek(), 'put "x" into field "Notes"');
  const target = parseContainer(c);
  return { kind: "put", expr, mode, target, span: { start: start.span.start, end: target.span.end } };
}

function parseSet(c: Cursor, start: Token): Stmt {
  c.next();
  c.takeWord("the");
  const propToken = c.expectWord("a property name");
  const prop = PROPS[propToken.text.toLowerCase()];
  if (!prop) throw c.abort("Unknown property.", propToken, "Available: name, visible, enabled, locked, hilite, label, style, rect, text.");
  if (!c.takeWord("of")) throw c.abort(`Expected "of" after "set the ${prop}".`);
  const obj = parseObjRef(c);
  if (!c.takeWord("to")) throw c.abort('Expected "to" before the new value.');
  const value = parseExpression(c);
  return { kind: "set", prop, obj, value, span: { start: start.span.start, end: value.span.end } };
}

function parseGet(c: Cursor, start: Token): Stmt {
  c.next();
  const expr = parseExpression(c);
  return { kind: "get", expr, span: { start: start.span.start, end: expr.span.end } };
}

function parseGo(c: Cursor, start: Token): Stmt {
  c.next();
  c.takeWord("to");
  const card = parseCardRef(c);
  return { kind: "go", card, span: { start: start.span.start, end: card.span.end } };
}

function parseSend(c: Cursor, start: Token): Stmt {
  c.next();
  const message = parseExpression(c);
  const args: Expr[] = [];
  if (c.takeWord("with")) {
    args.push(parseExpression(c));
    while (c.peek().kind === "comma") {
      c.next();
      args.push(parseExpression(c));
    }
  }
  if (!c.takeWord("to")) throw c.abort('Expected "to" before the target of the message.');
  const to = parseObjRef(c);
  return { kind: "send", message, args, to, span: { start: start.span.start, end: to.span.end } };
}

function parsePass(c: Cursor, start: Token): Stmt {
  c.next();
  const token = c.peek();
  const message = token.kind === "word" ? c.next().text : undefined;
  return { kind: "pass", message, span: spanFrom(start, c) };
}

function parseAnswer(c: Cursor, start: Token): Stmt {
  c.next();
  const expr = parseExpression(c);
  return { kind: "answer", expr, span: { start: start.span.start, end: expr.span.end } };
}

function parseAsk(c: Cursor, start: Token): Stmt {
  c.next();
  const prompt = parseExpression(c);
  let into: Container | undefined;
  if (c.takeWord("into")) into = parseContainer(c);
  return { kind: "ask", prompt, into, span: { start: start.span.start, end: (into ?? prompt).span.end } };
}

function parseShowHide(c: Cursor, start: Token): Stmt {
  const kind = c.next().text.toLowerCase() as "show" | "hide";
  const obj = parseObjRef(c);
  return { kind, obj, span: { start: start.span.start, end: obj.span.end } };
}

function parseArith(c: Cursor, start: Token): Stmt {
  const op = c.next().text.toLowerCase() as ArithOp;
  if (op === "multiply" || op === "divide") {
    const target = parseContainer(c);
    if (!c.takeWord(ARITH_PREP[op])) throw c.abort(`Expected "${ARITH_PREP[op]}" after the target of ${op}.`);
    const value = parseExpression(c);
    return { kind: "arith", op, value, target, span: { start: start.span.start, end: value.span.end } };
  }
  const value = parseExpression(c);
  if (!c.takeWord(ARITH_PREP[op])) throw c.abort(`Expected "${ARITH_PREP[op]}" after the value of ${op}.`);
  const target = parseContainer(c);
  return { kind: "arith", op, value, target, span: { start: start.span.start, end: target.span.end } };
}

function parseCreate(c: Cursor, start: Token): Stmt {
  c.next();
  const token = c.peek();
  const word = token.kind === "word" ? token.text.toLowerCase() : "";
  if (word === "card" || word === "background") {
    c.next();
    const name = c.isKind("string") ? parseExpression(c) : undefined;
    let background: Expr | undefined;
    if (word === "card" && c.takeWords("with", "background")) background = parseExpression(c);
    const what: CreateWhat =
      word === "card"
        ? { kind: "card", name, background, span: spanFrom(start, c) }
        : { kind: "background", name, span: spanFrom(start, c) };
    return { kind: "create", what, span: spanFrom(start, c) };
  }
  if (word === "field" || word === "button") {
    c.next();
    const name = c.isKind("string") ? parseExpression(c) : undefined;
    const what: CreateWhat = { kind: "part", partKind: word, name, span: spanFrom(start, c) };
    return { kind: "create", what, span: spanFrom(start, c) };
  }
  throw c.abort("Expected card, background, field or button after \"create\".", token);
}

function parseDelete(c: Cursor, start: Token): Stmt {
  c.next();
  const obj = parseObjRef(c);
  return { kind: "delete", obj, span: { start: start.span.start, end: obj.span.end } };
}

function parseSort(c: Cursor, start: Token): Stmt {
  c.next();
  // Deux formes acceptées : `sort lines of field "X"` (dimension d'abord) et
  // `sort field "X" by line 2 descending` (conteneur d'abord).
  const leading = CHUNK_WORDS[wordOf(c)];
  if (leading && c.isWord("of", 1)) {
    c.next();
    c.next();
    const target = parseContainer(c);
    const spec: SortSpec = { container: target, by: { kind: leading }, descending: false, numeric: false, span: spanFrom(start, c) };
    finishSortOptions(c, spec);
    return { kind: "sort", spec, span: spec.span };
  }
  const container = parseContainer(c);
  const spec: SortSpec = { container, descending: false, numeric: false, span: spanFrom(start, c) };
  finishSortOptions(c, spec);
  spec.span = spanFrom(start, c);
  return { kind: "sort", spec, span: spec.span };
}

/** Options facultatives de `sort` : by <chunktype> [n], ascending/descending, numeric. */
function finishSortOptions(c: Cursor, spec: SortSpec): void {
  for (;;) {
    if (c.takeWord("by")) {
      const token = c.expectWord("a chunk type (char, word, item, line)");
      const type = CHUNK_WORDS[token.text.toLowerCase()];
      if (!type) throw c.abort("Expected char, word, item or line after \"by\".", token);
      const index = c.isKind("number") ? parseExpression(c) : undefined;
      spec.by = { kind: type, index };
      continue;
    }
    if (c.takeWord("descending")) {
      spec.descending = true;
      continue;
    }
    if (c.takeWord("ascending")) continue;
    if (c.takeWord("numeric")) {
      spec.numeric = true;
      continue;
    }
    break;
  }
}

function parseFind(c: Cursor, start: Token): Stmt {
  c.next();
  const expr = parseExpression(c);
  return { kind: "find", expr, span: { start: start.span.start, end: expr.span.end } };
}

function parseWait(c: Cursor, start: Token): Stmt {
  c.next();
  const duration = parseExpression(c);
  let unit: "ms" | "seconds" = "ms";
  if (c.takeWord("seconds") || c.takeWord("second")) unit = "seconds";
  else if (c.takeWord("ms") || c.takeWords("milliseconds")) unit = "ms";
  return { kind: "wait", duration, unit, span: spanFrom(start, c) };
}

function parseConsult(c: Cursor, start: Token): Stmt {
  c.next();
  const agent = parseAgentRef(c);
  if (!c.takeWord("with")) throw c.abort('Expected "with" after the agent reference.');
  const withExpr = parseExpression(c);
  return { kind: "consult", agent, with: withExpr, span: { start: start.span.start, end: withExpr.span.end } };
}

function parseTell(c: Cursor, start: Token): Stmt {
  c.next();
  const agent = parseAgentRef(c);
  const text = parseExpression(c);
  return { kind: "tell", agent, text, span: { start: start.span.start, end: text.span.end } };
}

function parseIf(c: Cursor, start: Token): Stmt {
  c.next();
  const cond = parseExpression(c);
  if (!c.takeWord("then")) throw c.abort('Expected "then" after the condition.');
  if (!c.isNewline() && !c.atEnd()) {
    const single = parseStatement(c);
    const otherwise = parseOptionalElseInline(c);
    if (c.takeWords("end", "if")) c.skipNewlines();
    return { kind: "if", cond, then: [single], otherwise, span: spanFrom(start, c) };
  }
  c.skipNewlines();
  const thenBlock = parseBlock(c, () => c.isWord("else") || c.isWords("end", "if"));
  let otherwise: Stmt[] | undefined;
  if (c.takeWord("else")) {
    c.skipNewlines();
    otherwise = parseBlock(c, () => c.isWords("end", "if"));
  }
  if (!c.takeWords("end", "if")) throw c.abort('Expected "end if" to close the condition.', c.peek());
  return { kind: "if", cond, then: thenBlock, otherwise, span: spanFrom(start, c) };
}

function parseOptionalElseInline(c: Cursor): Stmt[] | undefined {
  if (!c.takeWord("else")) return undefined;
  if (c.isNewline() || c.atEnd()) {
    c.skipNewlines();
    return parseBlock(c, () => c.isWords("end", "if"));
  }
  return [parseStatement(c)];
}

function parseRepeat(c: Cursor, start: Token): Stmt {
  c.next();
  const loop = parseRepeatForm(c, start);
  c.skipNewlines();
  const body = parseBlock(c, () => c.isWords("end", "repeat"));
  if (!c.takeWords("end", "repeat")) throw c.abort('Expected "end repeat" to close the loop.', c.peek());
  return { kind: "repeat", loop, body, span: spanFrom(start, c) };
}

function parseRepeatForm(c: Cursor, start: Token): RepeatLoop {
  if (c.takeWords("for", "each")) {
    const token = c.expectWord("a chunk type (char, word, item, line)");
    const chunkType = CHUNK_WORDS[token.text.toLowerCase()];
    if (!chunkType) throw c.abort("Expected char, word, item or line after \"for each\".", token);
    const name = c.expectWord("a variable name").text;
    if (!c.takeWord("in")) throw c.abort('Expected "in" after the loop variable.');
    return { kind: "forEach", chunkType, name, in: parseExpression(c) };
  }
  if (c.takeWord("while")) return { kind: "while", cond: parseExpression(c) };
  if (c.takeWord("with")) {
    const name = c.expectWord("a variable name").text;
    c.expectOp("=", "after the loop variable");
    const from = parseExpression(c);
    if (!c.takeWord("to")) throw c.abort('Expected "to" after the starting value.');
    const to = parseExpression(c);
    const step = c.takeWord("step") ? parseExpression(c) : undefined;
    return { kind: "with", name, from, to, step };
  }
  const count = parseExpression(c);
  if (!c.takeWord("times")) throw c.abort('Expected "times" after the number of repetitions.', c.peek());
  void start;
  return { kind: "times", count };
}

function parseExit(c: Cursor, start: Token): Stmt {
  c.next();
  if (c.takeWord("repeat")) return { kind: "exit", what: "repeat", span: spanFrom(start, c) };
  const handler = c.expectWord("the handler name to exit").text;
  return { kind: "exit", what: { handler }, span: spanFrom(start, c) };
}

function parseReturn(c: Cursor, start: Token): Stmt {
  c.next();
  if (c.isNewline() || c.atEnd()) return { kind: "return", span: spanFrom(start, c) };
  const value = parseExpression(c);
  return { kind: "return", value, span: { start: start.span.start, end: value.span.end } };
}

function parseGlobal(c: Cursor, start: Token): Stmt {
  c.next();
  const names = [c.expectWord("a variable name").text];
  while (c.peek().kind === "comma") {
    c.next();
    names.push(c.expectWord("a variable name").text);
  }
  return { kind: "global", names, span: spanFrom(start, c) };
}

function parseCallStatement(c: Cursor, start: Token): Stmt {
  c.next();
  const args: Expr[] = [];
  if (!c.isNewline() && !c.atEnd()) {
    args.push(parseExpression(c));
    while (c.peek().kind === "comma") {
      c.next();
      args.push(parseExpression(c));
    }
  }
  return { kind: "call", name: start.text, args, span: spanFrom(start, c) };
}

/**
 * Analyse une suite d'instructions jusqu'à ce que `isEnd` soit vrai ou que le
 * script se termine. Chaque instruction doit commencer sur sa ligne.
 */
export function parseBlock(c: Cursor, isEnd: () => boolean): Stmt[] {
  const statements: Stmt[] = [];
  for (;;) {
    c.skipNewlines();
    if (c.atEnd() || isEnd()) return statements;
    const statement = parseStatement(c);
    statements.push(statement);
    if (!c.isNewline() && !c.atEnd() && !isEnd()) {
      throw c.abort("Expected a new line after this command.", c.peek(), "One command per line.");
    }
  }
}
