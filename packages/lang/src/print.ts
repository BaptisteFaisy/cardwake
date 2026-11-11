/**
 * Impression : arbre → texte normalisé.
 *
 * Propriété CAR-P-01 : pour tout arbre produit par l'analyseur,
 * `parse(print(ast))` redonne le même arbre. Le texte imprimé est donc la
 * forme canonique du script : mots-clés en minuscules, une instruction par
 * ligne, indentation de deux espaces, chaînes entre guillemets doubles.
 */

import type {
  CardRef,
  Chunk,
  Container,
  CreateWhat,
  Expr,
  FunctionDef,
  Handler,
  ObjRef,
  RefBy,
  RepeatLoop,
  Script,
  SortSpec,
  Stmt,
} from "./ast";

const INDENT = "  ";

/** Ré-échappe le contenu d'une chaîne pour qu'il redevienne un littéral. */
const ESCAPES: Record<string, string> = { "\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t" };

function quote(value: string): string {
  const body = value.replace(/[\\"\n\r\t]/g, (char) => ESCAPES[char] ?? char);
  return `"${body}"`;
}

function indentLines(lines: string[], depth: number): string[] {
  const pad = INDENT.repeat(depth);
  return lines.map((line) => (line.length > 0 ? pad + line : line));
}

// --------------------------------------------------------------------------
// Expressions
// --------------------------------------------------------------------------

function printRefBy(by: RefBy): string {
  if (by.kind === "name") return quote(by.name);
  if (by.kind === "id") return `id ${printExpr(by.id)}`;
  return printExpr(by.index);
}

export function printCardRef(ref: CardRef): string {
  if (ref.kind === "card") return `card ${printRefBy(ref.by)}`;
  if (ref.kind === "this") return "this card";
  return `${ref.kind} card`;
}

export function printObjRef(ref: ObjRef): string {
  switch (ref.kind) {
    case "me":
      return "me";
    case "target":
      return "the target";
    case "thisBackground":
      return "this background";
    case "thisStack":
      return "this stack";
    case "card":
      return printCardRef(ref.ref);
    case "part": {
      const of = ref.ref.of ? ` of ${printCardRef(ref.ref.of)}` : "";
      return `${ref.ref.partKind} ${printRefBy(ref.ref.by)}${of}`;
    }
    case "agent":
      return ref.ref.of ? `agent of ${printCardRef(ref.ref.of)}` : "agent";
  }
}

/** Un morceau s'imprime au singulier : `word 2`, `line 3 to 5`. */
function printChunk(chunk: Chunk): string {
  if (chunk.ordinal) return `${chunk.type} ${printExpr(chunk.ordinal)}`;
  const from = chunk.from ? printExpr(chunk.from) : "";
  const to = chunk.to ? printExpr(chunk.to) : "";
  return `${chunk.type} ${from} to ${to}`;
}

export function printContainer(target: Container): string {
  switch (target.kind) {
    case "var":
      return target.name;
    case "it":
      return "it";
    case "obj":
      return printObjRef(target.ref);
    case "chunk":
      return `${printChunk(target.chunk)} of ${printContainer(target.of)}`;
  }
}

/** Un opérateur binaire s'imprime avec ses espaces, sauf `&&` qui les porte. */
function printBin(op: string, left: string, right: string): string {
  return `${left} ${op} ${right}`;
}

export function printExpr(expr: Expr): string {
  switch (expr.kind) {
    case "str":
      return quote(expr.value);
    case "num":
      return expr.text;
    case "var":
      return expr.name;
    case "it":
      return "it";
    case "empty":
      return "empty";
    case "bin":
      return printBin(expr.op, printExpr(expr.left), printExpr(expr.right));
    case "test":
      return `${printExpr(expr.operand)} is ${expr.test === "empty" ? "empty" : "not empty"}`;
    case "not":
      return `not ${printExpr(expr.operand)}`;
    case "neg":
      return `-${printExpr(expr.operand)}`;
    case "paren":
      return `(${printExpr(expr.inner)})`;
    case "fn":
      return `${expr.fn}(${expr.args.map(printExpr).join(", ")})`;
    case "call":
      return `${expr.name}(${expr.args.map(printExpr).join(", ")})`;
    case "count": {
      if (expr.subject === "cards") return "the number of cards";
      const source = expr.of ? printExpr(expr.of) : "";
      return `the number of ${expr.subject}s in ${source}`;
    }
    case "prop":
      return `the ${expr.prop} of ${printObjRef(expr.of)}`;
    case "theDate":
      return "the date";
    case "theTime":
      return "the time";
    case "theLongDate":
      return "the long date";
    case "objText":
      return printObjRef(expr.ref);
    case "chunk":
      return `${printChunk(expr.chunk)} of ${printContainer(expr.of)}`;
  }
}

// --------------------------------------------------------------------------
// Instructions
// --------------------------------------------------------------------------

function printCreate(what: CreateWhat): string {
  if (what.kind === "card") {
    const name = what.name ? ` ${printExpr(what.name)}` : "";
    const background = what.background ? ` with background ${printExpr(what.background)}` : "";
    return `create card${name}${background}`;
  }
  if (what.kind === "background") return `create background${what.name ? ` ${printExpr(what.name)}` : ""}`;
  return `create ${what.partKind}${what.name ? ` ${printExpr(what.name)}` : ""}`;
}

function printSort(spec: SortSpec): string {
  const by = spec.by ? ` by ${spec.by.kind}${spec.by.index ? ` ${printExpr(spec.by.index)}` : ""}` : "";
  const order = spec.descending ? " descending" : "";
  const numeric = spec.numeric ? " numeric" : "";
  return `sort ${printContainer(spec.container)}${by}${order}${numeric}`;
}

function printRepeat(loop: RepeatLoop): string {
  switch (loop.kind) {
    case "with":
      return `repeat with ${loop.name} = ${printExpr(loop.from)} to ${printExpr(loop.to)}${loop.step ? ` step ${printExpr(loop.step)}` : ""}`;
    case "forEach":
      return `repeat for each ${loop.chunkType} ${loop.name} in ${printExpr(loop.in)}`;
    case "while":
      return `repeat while ${printExpr(loop.cond)}`;
    case "times":
      return `repeat ${printExpr(loop.count)} times`;
  }
}

const ARITH_PREPOSITION: Record<string, string> = {
  add: "to",
  subtract: "from",
  multiply: "by",
  divide: "by",
};

/** Une instruction sur une ligne, ou un bloc multi-lignes pour `if`/`repeat`. */
export function printStmt(stmt: Stmt): string[] {
  switch (stmt.kind) {
    case "put":
      return [`put ${printExpr(stmt.expr)} ${stmt.mode} ${printContainer(stmt.target)}`];
    case "set":
      return [`set the ${stmt.prop} of ${printObjRef(stmt.obj)} to ${printExpr(stmt.value)}`];
    case "get":
      return [`get ${printExpr(stmt.expr)}`];
    case "go":
      return [`go to ${printCardRef(stmt.card)}`];
    case "send": {
      const args = stmt.args.length > 0 ? ` with ${stmt.args.map(printExpr).join(", ")}` : "";
      return [`send ${printExpr(stmt.message)}${args} to ${printObjRef(stmt.to)}`];
    }
    case "pass":
      return [stmt.message ? `pass ${stmt.message}` : "pass"];
    case "answer":
      return [`answer ${printExpr(stmt.expr)}`];
    case "ask":
      return [`ask ${printExpr(stmt.prompt)}${stmt.into ? ` into ${printContainer(stmt.into)}` : ""}`];
    case "show":
      return [`show ${printObjRef(stmt.obj)}`];
    case "hide":
      return [`hide ${printObjRef(stmt.obj)}`];
    case "arith":
      return stmt.op === "multiply" || stmt.op === "divide"
        ? [`${stmt.op} ${printContainer(stmt.target)} by ${printExpr(stmt.value)}`]
        : [`${stmt.op} ${printExpr(stmt.value)} ${ARITH_PREPOSITION[stmt.op]} ${printContainer(stmt.target)}`];
    case "create":
      return [printCreate(stmt.what)];
    case "delete":
      return [`delete ${printObjRef(stmt.obj)}`];
    case "sort":
      return [printSort(stmt.spec)];
    case "find":
      return [`find ${printExpr(stmt.expr)}`];
    case "wait":
      return [`wait ${printExpr(stmt.duration)} ${stmt.unit === "seconds" ? "seconds" : "ms"}`];
    case "consult": {
      const agent = stmt.agent.of ? `agent of ${printCardRef(stmt.agent.of)}` : "agent";
      return [`consult ${agent} with ${printExpr(stmt.with)}`];
    }
    case "tell": {
      const agent = stmt.agent.of ? `agent of ${printCardRef(stmt.agent.of)}` : "agent";
      return [`tell ${agent} ${printExpr(stmt.text)}`];
    }
    case "if": {
      const lines = [`if ${printExpr(stmt.cond)} then`];
      lines.push(...indentLines(printBody(stmt.then), 1));
      if (stmt.otherwise) {
        lines.push("else");
        lines.push(...indentLines(printBody(stmt.otherwise), 1));
      }
      lines.push("end if");
      return lines;
    }
    case "repeat":
      return [
        printRepeat(stmt.loop),
        ...indentLines(printBody(stmt.body), 1),
        "end repeat",
      ];
    case "exit":
      return [stmt.what === "repeat" ? "exit repeat" : `exit ${stmt.what.handler}`];
    case "return":
      return [stmt.value ? `return ${printExpr(stmt.value)}` : "return"];
    case "global":
      return [`global ${stmt.names.join(", ")}`];
    case "call":
      return [stmt.args.length > 0 ? `${stmt.name} ${stmt.args.map(printExpr).join(", ")}` : stmt.name];
  }
}

export function printBody(statements: Stmt[]): string[] {
  return statements.flatMap(printStmt);
}

function printParams(params: string[]): string {
  return params.length > 0 ? ` ${params.join(", ")}` : "";
}

function printHandler(handler: Handler): string {
  const body = indentLines(printBody(handler.body), 1);
  return [`on ${handler.name}${printParams(handler.params)}`, ...body, `end ${handler.name}`].join("\n");
}

function printFunction(fn: FunctionDef): string {
  const body = indentLines(printBody(fn.body), 1);
  return [`function ${fn.name}${printParams(fn.params)}`, ...body, `end ${fn.name}`].join("\n");
}

/** Le script complet, forme canonique. */
export function printScript(script: Script): string {
  const blocks = [...script.handlers.map(printHandler), ...script.functions.map(printFunction)];
  return blocks.length === 0 ? "" : `${blocks.join("\n\n")}\n`;
}
