/**
 * Générateurs fast-check d'arbres Murmur, partagés par les tests de propriétés
 * (CAR-P-01 aller-retour, CAR-P-02 robustesse).
 *
 * Deux précautions rendent l'aller-retour possible : les identifiants viennent
 * d'un bassin qui ne contient aucun mot-clé du langage, et les littéraux
 * numériques portent leur texte d'origine (l'imprimeur ne reformate pas).
 */

import fc from "fast-check";
import type {
  BinOp,
  BuiltinFn,
  CardRef,
  Chunk,
  ChunkType,
  Container,
  Expr,
  FunctionDef,
  Handler,
  ObjRef,
  PropName,
  RefBy,
  Script,
  Span,
  Stmt,
} from "../src/ast";

const SPAN: Span = {
  start: { line: 1, col: 1, offset: 0 },
  end: { line: 1, col: 1, offset: 0 },
};

/** Ni mot-clé, ni nom de morceau, ni commande : un identifiant sans ambiguïté. */
const SAFE_NAMES = ["total", "counter", "qty", "price", "notes", "score", "rowValue", "amount", "draft", "tally"];

const HANDLER_NAMES = ["mouseUp", "openCard", "closeCard", "message", "returnInField", "tick"];

const CHUNK_TYPES: ChunkType[] = ["char", "word", "item", "line"];
const PROPS: PropName[] = ["name", "visible", "enabled", "locked", "hilite", "label", "style", "rect", "text"];
const BUILTINS: BuiltinFn[] = ["length", "offset", "round", "min", "max", "sum", "average", "upper", "lower", "random"];
const ARITH_OPS: BinOp[] = ["+", "-", "*", "/", "^", "div", "mod"];
const CMP_OPS: BinOp[] = ["=", "<>", "<", ">", "<=", ">=", "contains", "isIn"];
const LOGIC_OPS: BinOp[] = ["and", "or"];

export const arbIdent = fc.constantFrom(...SAFE_NAMES);
export const arbHandlerName = fc.constantFrom(...HANDLER_NAMES);
export const arbChunkType = fc.constantFrom(...CHUNK_TYPES);
export const arbProp = fc.constantFrom(...PROPS);

/** Chaînes sans retour chariot (le lexer n'en produit jamais). */
const arbText = fc.string({ maxLength: 10 }).map((s) => s.replace(/\r/g, ""));

const arbNum: fc.Arbitrary<Expr> = fc.integer({ min: -999, max: 999 }).map((n) => ({
  kind: "num" as const,
  value: n,
  text: String(n),
  span: SPAN,
}));

const arbStr: fc.Arbitrary<Expr> = arbText.map((value) => ({ kind: "str" as const, value, span: SPAN }));

function arbRefBy(): fc.Arbitrary<RefBy> {
  return fc.oneof(
    arbText.map((name): RefBy => ({ kind: "name", name, span: SPAN })),
    arbNum.map((index): RefBy => ({ kind: "index", index, span: SPAN })),
    arbNum.map((id): RefBy => ({ kind: "id", id, span: SPAN })),
  );
}

type RelativeCard = "this" | "next" | "previous" | "first" | "last";

function arbCardRef(): fc.Arbitrary<CardRef> {
  return fc.oneof(
    fc.constantFrom<RelativeCard>("this", "next", "previous", "first", "last").map(
      (kind): CardRef => ({ kind, span: SPAN }),
    ),
    arbRefBy().map((by): CardRef => ({ kind: "card", by, span: SPAN })),
  );
}

function arbObjRef(depth: number): fc.Arbitrary<ObjRef> {
  const simple = fc.constantFrom<"me" | "target" | "thisBackground" | "thisStack">(
    "me",
    "target",
    "thisBackground",
    "thisStack",
  ).map((kind): ObjRef => ({ kind, span: SPAN }));
  const card = arbCardRef().map((ref): ObjRef => ({ kind: "card", ref, span: SPAN }));
  const part = fc
    .tuple(fc.constantFrom("field", "button"), arbRefBy(), depth > 0 ? fc.option(arbCardRef(), { nil: undefined }) : fc.constant(undefined))
    .map(([partKind, by, of]): ObjRef => ({
      kind: "part",
      ref: { partKind: partKind as "field" | "button", by, of, span: SPAN },
      span: SPAN,
    }));
  const agent = fc
    .option(arbCardRef(), { nil: undefined })
    .map((of): ObjRef => ({ kind: "agent", ref: { of, span: SPAN }, span: SPAN }));
  return fc.oneof(simple, card, part, agent);
}

function arbChunk(depth: number): fc.Arbitrary<Chunk> {
  const expr = arbExpr(depth - 1);
  return fc.oneof(
    fc.tuple(arbChunkType, expr).map(([type, ordinal]): Chunk => ({ type, ordinal, span: SPAN })),
    fc.tuple(arbChunkType, expr, expr).map(([type, from, to]): Chunk => ({ type, from, to, span: SPAN })),
  );
}

export function arbContainer(depth: number): fc.Arbitrary<Container> {
  if (depth <= 0) {
    return fc.oneof(
      arbIdent.map((name): Container => ({ kind: "var", name, span: SPAN })),
      fc.constant({ kind: "it", span: SPAN } as Container),
      arbObjRef(0).map((ref): Container => ({ kind: "obj", ref, span: SPAN })),
    );
  }
  return fc.oneof(
    arbContainer(0),
    fc
      .tuple(arbChunk(depth), arbContainer(depth - 1))
      .map(([chunk, of]): Container => ({ kind: "chunk", chunk, of, span: SPAN })),
  );
}

export function arbExpr(depth = 2): fc.Arbitrary<Expr> {
  const leaf: fc.Arbitrary<Expr> = fc.oneof(
    arbStr,
    arbNum,
    arbIdent.map((name): Expr => ({ kind: "var", name, span: SPAN })),
    fc.constant({ kind: "it", span: SPAN } as Expr),
    fc.constant({ kind: "empty", span: SPAN } as Expr),
    arbObjRef(0).map((ref): Expr => ({ kind: "objText", ref, span: SPAN })),
    fc.constantFrom<"theDate" | "theTime" | "theLongDate">("theDate", "theTime", "theLongDate").map(
      (kind): Expr => ({ kind, span: SPAN }),
    ),
  );
  if (depth <= 0) return leaf;
  const sub = (): fc.Arbitrary<Expr> => arbExpr(depth - 1);
  return fc.oneof(
    leaf,
    fc.tuple(fc.constantFrom(...ARITH_OPS), sub(), sub()).map(
      ([op, left, right]): Expr => ({ kind: "bin", op, left, right, span: SPAN }),
    ),
    fc.tuple(fc.constantFrom(...CMP_OPS), sub(), sub()).map(
      ([op, left, right]): Expr => ({ kind: "bin", op, left, right, span: SPAN }),
    ),
    fc.tuple(fc.constantFrom(...LOGIC_OPS), sub(), sub()).map(
      ([op, left, right]): Expr => ({ kind: "bin", op, left, right, span: SPAN }),
    ),
    fc.tuple(fc.constantFrom("&" as const, "&&" as const), sub(), sub()).map(
      ([op, left, right]): Expr => ({ kind: "bin", op, left, right, span: SPAN }),
    ),
    sub().map((operand): Expr => ({ kind: "not", operand, span: SPAN })),
    sub().map((operand): Expr => ({ kind: "neg", operand, span: SPAN })),
    sub().map((inner): Expr => ({ kind: "paren", inner, span: SPAN })),
    fc.tuple(fc.constantFrom("empty" as const, "notEmpty" as const), sub()).map(
      ([test, operand]): Expr => ({ kind: "test", test, operand, span: SPAN }),
    ),
    fc
      .tuple(fc.constantFrom(...BUILTINS), fc.array(sub(), { minLength: 1, maxLength: 2 }))
      .map(([fn, args]): Expr => ({ kind: "fn", fn, args, span: SPAN })),
    fc
      .tuple(arbIdent, fc.array(sub(), { minLength: 0, maxLength: 2 }))
      .map(([name, args]): Expr => ({ kind: "call", name, args, span: SPAN })),
    fc.tuple(arbChunkType, sub()).map(
      ([subject, of]): Expr => ({ kind: "count", subject, of, span: SPAN }),
    ),
    fc.constant({ kind: "count", subject: "cards", span: SPAN } as Expr),
    fc.tuple(arbProp, arbObjRef(depth - 1)).map(
      ([prop, of]): Expr => ({ kind: "prop", prop, of, span: SPAN }),
    ),
    fc
      .tuple(arbChunk(depth), arbContainer(depth - 1))
      .map(([chunk, of]): Expr => ({ kind: "chunk", chunk, of, span: SPAN })),
  );
}

// --------------------------------------------------------------------------
// Instructions et scripts
// --------------------------------------------------------------------------

function arbSimpleStmt(depth: number): fc.Arbitrary<Stmt> {
  const expr = arbExpr(depth);
  const container = arbContainer(depth);
  const obj = arbObjRef(depth);
  return fc.oneof(
    fc.tuple(expr, fc.constantFrom("into" as const, "before" as const, "after" as const), container).map(
      ([e, mode, target]): Stmt => ({ kind: "put", expr: e, mode, target, span: SPAN }),
    ),
    fc.tuple(arbProp, obj, expr).map(
      ([prop, o, value]): Stmt => ({ kind: "set", prop, obj: o, value, span: SPAN }),
    ),
    expr.map((e): Stmt => ({ kind: "get", expr: e, span: SPAN })),
    arbCardRef().map((card): Stmt => ({ kind: "go", card, span: SPAN })),
    fc.tuple(expr, fc.array(expr, { maxLength: 2 }), obj).map(
      ([message, args, to]): Stmt => ({ kind: "send", message, args, to, span: SPAN }),
    ),
    fc.option(arbHandlerName, { nil: undefined }).map(
      (message): Stmt => ({ kind: "pass", message, span: SPAN }),
    ),
    expr.map((e): Stmt => ({ kind: "answer", expr: e, span: SPAN })),
    fc.tuple(expr, fc.option(container, { nil: undefined })).map(
      ([prompt, into]): Stmt => ({ kind: "ask", prompt, into, span: SPAN }),
    ),
    fc.tuple(fc.constantFrom("show" as const, "hide" as const), obj).map(
      ([kind, o]): Stmt => ({ kind, obj: o, span: SPAN }),
    ),
    fc
      .tuple(fc.constantFrom("add" as const, "subtract" as const), expr, container)
      .map(([op, value, target]): Stmt => ({ kind: "arith", op, value, target, span: SPAN })),
    fc
      .tuple(fc.constantFrom("multiply" as const, "divide" as const), expr, container)
      .map(([op, value, target]): Stmt => ({ kind: "arith", op, value, target, span: SPAN })),
    fc.option(arbText, { nil: undefined }).map(
      (name): Stmt => ({
        kind: "create",
        what: { kind: "card", name: name ? { kind: "str", value: name, span: SPAN } : undefined, span: SPAN },
        span: SPAN,
      }),
    ),
    obj.map((o): Stmt => ({ kind: "delete", obj: o, span: SPAN })),
    container.map((c): Stmt => ({
      kind: "sort",
      spec: { container: c, descending: false, numeric: false, span: SPAN },
      span: SPAN,
    })),
    expr.map((e): Stmt => ({ kind: "find", expr: e, span: SPAN })),
    fc.tuple(arbNum, fc.constantFrom("ms" as const, "seconds" as const)).map(
      ([duration, unit]): Stmt => ({ kind: "wait", duration, unit, span: SPAN }),
    ),
    fc.tuple(fc.option(arbCardRef(), { nil: undefined }), expr).map(
      ([of, withExpr]): Stmt => ({ kind: "consult", agent: { of, span: SPAN }, with: withExpr, span: SPAN }),
    ),
    fc.tuple(fc.option(arbCardRef(), { nil: undefined }), expr).map(
      ([of, text]): Stmt => ({ kind: "tell", agent: { of, span: SPAN }, text, span: SPAN }),
    ),
    fc.constant({ kind: "exit", what: "repeat", span: SPAN } as Stmt),
    arbHandlerName.map((handler): Stmt => ({ kind: "exit", what: { handler }, span: SPAN })),
    fc.option(expr, { nil: undefined }).map((value): Stmt => ({ kind: "return", value, span: SPAN })),
    fc
      .array(arbIdent, { minLength: 1, maxLength: 3 })
      .map((names): Stmt => ({ kind: "global", names, span: SPAN })),
    fc
      .tuple(arbIdent, fc.array(expr, { maxLength: 2 }))
      .map(([name, args]): Stmt => ({ kind: "call", name, args, span: SPAN })),
  );
}

export function arbStmt(depth = 1): fc.Arbitrary<Stmt> {
  if (depth <= 0) return arbSimpleStmt(0);
  return fc.oneof(
    arbSimpleStmt(depth - 1),
    fc
      .tuple(arbExpr(depth - 1), arbBody(depth - 1), fc.option(arbBody(depth - 1), { nil: undefined }))
      .map(([cond, then, otherwise]): Stmt => ({ kind: "if", cond, then, otherwise, span: SPAN })),
    fc
      .tuple(arbIdent, arbNum, arbNum, arbBody(depth - 1))
      .map(([name, from, to, body]): Stmt => ({
        kind: "repeat",
        loop: { kind: "with", name, from, to },
        body,
        span: SPAN,
      })),
    fc
      .tuple(arbChunkType, arbIdent, arbExpr(depth - 1), arbBody(depth - 1))
      .map(([chunkType, name, inExpr, body]): Stmt => ({
        kind: "repeat",
        loop: { kind: "forEach", chunkType, name, in: inExpr },
        body,
        span: SPAN,
      })),
    fc
      .tuple(arbExpr(depth - 1), arbBody(depth - 1))
      .map(([cond, body]): Stmt => ({ kind: "repeat", loop: { kind: "while", cond }, body, span: SPAN })),
    fc
      .tuple(arbNum, arbBody(depth - 1))
      .map(([count, body]): Stmt => ({ kind: "repeat", loop: { kind: "times", count }, body, span: SPAN })),
  );
}

export function arbBody(depth = 1): fc.Arbitrary<Stmt[]> {
  return fc.array(arbStmt(depth), { minLength: 0, maxLength: 3 });
}

export function arbScript(): fc.Arbitrary<Script> {
  const handler = fc
    .tuple(arbHandlerName, fc.array(arbIdent, { maxLength: 2 }), arbBody(1))
    .map(([name, params, body]): Handler => ({ name, params, body, span: SPAN }));
  const fn = fc
    .tuple(arbIdent, fc.array(arbIdent, { maxLength: 2 }), arbBody(0))
    .map(([name, params, body]): FunctionDef => ({ name, params, body, span: SPAN }));
  return fc
    .tuple(fc.array(handler, { minLength: 1, maxLength: 2 }), fc.array(fn, { maxLength: 1 }))
    .map(([handlers, functions]): Script => ({ handlers, functions }));
}
