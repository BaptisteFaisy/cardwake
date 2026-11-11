/**
 * Évaluation des expressions. Tout est du texte : chaque évaluation rend une
 * chaîne, et un texte en forme de nombre sert de nombre quand une opération
 * arithmétique le demande (`values.ts` décide, jamais ce module).
 */

import type { Chunk, Container, Expr, ObjRef, ScriptError } from "../ast";
import type { Host, ResolvedRef } from "../host";
import { typeError } from "../errors";
import { countChunks, readChunk, splitChunk } from "../chunks";
import {
  addExact,
  averageItems,
  compareTexts,
  concat,
  equalsTexts,
  formatNumber,
  lookupConstant,
  requireNumber,
  round,
  sumItems,
  truthy,
} from "../values";
import { Env, Halt, ReturnValue } from "./runtime";
import { execBody } from "./exec-stmt";

/** Le `Host` renvoie soit une valeur, soit une erreur lisible : on tranche ici. */
function unwrap(value: string | ScriptError, what: string): string {
  if (typeof value !== "string") throw new Halt(value);
  void what;
  return value;
}

export function resolveRef(ref: ObjRef, env: Env): ResolvedRef {
  return resolve(env, ref);
}

function resolve(env: Env, ref: ObjRef): ResolvedRef {
  const found = env.host.resolve(ref);
  if (found && typeof found === "object" && "category" in found) throw new Halt(found);
  return found as ResolvedRef;
}

function num(text: string, what: string): number {
  try {
    return requireNumber(text);
  } catch {
    throw new Halt(typeError(undefined, `${what} needs a number, got "${text.slice(0, 30)}".`, "Check the field content or the value you put in."));
  }
}

function int(text: string, what: string): number {
  const value = num(text, what);
  return Math.trunc(value);
}

/** Bornes d'un morceau, évaluées depuis l'arbre. */
async function boundsOf(chunk: Chunk, env: Env): Promise<{ ordinal?: number; from?: number; to?: number }> {
  if (chunk.ordinal) return { ordinal: int(await evalExpr(chunk.ordinal, env), "a chunk position") };
  const from = chunk.from ? int(await evalExpr(chunk.from, env), "a chunk range") : undefined;
  const to = chunk.to ? int(await evalExpr(chunk.to, env), "a chunk range") : undefined;
  return { from, to };
}

/** Lit un conteneur : variable, `it`, objet, ou morceau d'un conteneur. */
export async function readContainer(target: Container, env: Env): Promise<string> {
  if (target.kind === "var") return env.get(target.name) ?? lookupConstant(target.name) ?? "";
  if (target.kind === "it") return env.it;
  if (target.kind === "obj") {
    return unwrap(env.host.readText(resolve(env, target.ref)), "read");
  }
  const inner = await readContainer(target.of, env);
  const bounds = await boundsOf(target.chunk, env);
  return readChunk(inner, target.chunk.type, bounds.ordinal, bounds.from, bounds.to);
}

/** Écrit dans un conteneur, morceau compris. */
export async function writeContainer(
  target: Container,
  value: string,
  mode: "replace" | "before" | "after",
  env: Env,
): Promise<void> {
  env.checkSize(value, "this text");
  if (target.kind === "var") {
    env.set(target.name, value);
    return;
  }
  if (target.kind === "it") {
    env.it = value;
    return;
  }
  if (target.kind === "obj") {
    env.host.writeText(resolve(env, target.ref), value, mode);
    return;
  }
  const bounds = await boundsOf(target.chunk, env);
  env.host.writeChunk(resolveOfContainer(target.of, env), target.chunk.type, value, mode, bounds);
}

function resolveOfContainer(target: Container, env: Env): ResolvedRef {
  if (target.kind === "obj") return resolve(env, target.ref);
  if (target.kind === "chunk") return resolveOfContainer(target.of, env);
  throw new Halt(typeError(undefined, "Only a field can hold a chunk of text.", 'Use: put "x" into word 2 of field "Notes".'));
}

async function evalBinary(expr: Extract<Expr, { kind: "bin" }>, env: Env): Promise<string> {
  const left = await evalExpr(expr.left, env);
  if ((expr.op === "and" && !truthy(left)) || (expr.op === "or" && truthy(left))) {
    return truthy(left) ? "true" : "false";
  }
  const right = await evalExpr(expr.right, env);
  switch (expr.op) {
    case "&":
      return concat(left, right, false);
    case "&&":
      return concat(left, right, true);
    case "+":
      return formatNumber(addExact(num(left, "addition"), num(right, "addition")));
    case "-":
      return formatNumber(num(left, "subtraction") - num(right, "subtraction"));
    case "*":
      return formatNumber(round(num(left, "multiplication") * num(right, "multiplication"), 6));
    case "/": {
      const divisor = num(right, "division");
      if (divisor === 0) throw new Halt(typeError(undefined, "Division by zero.", "Check the value before dividing."));
      return formatNumber(round(num(left, "division") / divisor, 6));
    }
    case "^":
      return formatNumber(round(num(left, "power") ** num(right, "power"), 6));
    case "div":
      return formatNumber(Math.trunc(num(left, "div") / num(right, "div")));
    case "mod":
      return formatNumber(num(left, "mod") % num(right, "mod"));
    default:
      return evalComparison(expr.op, left, right);
  }
}

/** Comparaisons et logique : séparées de l'arithmétique pour rester lisibles. */
function evalComparison(op: string, left: string, right: string): string {
  switch (op) {
    case "contains":
      return left.toLowerCase().includes(right.toLowerCase()) ? "true" : "false";
    case "isIn":
      return right.split(",").some((item) => equalsTexts(item.trim(), left)) ? "true" : "false";
    case "=":
      return equalsTexts(left, right) ? "true" : "false";
    case "<>":
      return equalsTexts(left, right) ? "false" : "true";
    case "<":
    case ">":
    case "<=":
    case ">=": {
      const order = compareTexts(left, right);
      const holds =
        op === "<" ? order < 0 : op === ">" ? order > 0 : op === "<=" ? order <= 0 : order >= 0;
      return holds ? "true" : "false";
    }
    case "and":
      return truthy(left) && truthy(right) ? "true" : "false";
    case "or":
      return truthy(left) || truthy(right) ? "true" : "false";
    default:
      return "false";
  }
}

async function evalFunction(expr: Extract<Expr, { kind: "fn" }>, env: Env): Promise<string> {
  const args: string[] = [];
  for (const arg of expr.args) args.push(await evalExpr(arg, env));
  const at = (index: number): string => args[index] ?? "";
  switch (expr.fn) {
    case "length":
      return String(at(0).length);
    case "offset":
      return String(at(1).toLowerCase().indexOf(at(0).toLowerCase()) + 1);
    case "round":
      return formatNumber(round(num(at(0), "round"), args[1] === undefined ? 0 : int(at(1), "round")));
    case "min":
      return formatNumber(Math.min(...args.map((a) => num(a, "min"))));
    case "max":
      return formatNumber(Math.max(...args.map((a) => num(a, "max"))));
    case "sum":
      return formatNumber(round(sumItems(at(0)), 6));
    case "average":
      return formatNumber(round(averageItems(at(0)), 6));
    case "upper":
      return at(0).toUpperCase();
    case "lower":
      return at(0).toLowerCase();
    case "random": {
      const max = args.length > 0 ? int(at(0), "random") : 100;
      return String(Math.floor(env.host.determinism.random() * max) + 1);
    }
  }
}

/** Appel d'une fonction de l'auteur : portée neuve, globales partagées. */
async function evalCall(expr: Extract<Expr, { kind: "call" }>, env: Env): Promise<string> {
  const definition = env.functions.get(expr.name.toLowerCase());
  if (!definition) throw new Halt(typeError(undefined, `There is no function named "${expr.name}".`, "Check the spelling, or write the function in this script."));
  const args: string[] = [];
  for (const arg of expr.args) args.push(await evalExpr(arg, env));
  const child = env.child();
  definition.params.forEach((param, index) => child.set(param, args[index] ?? ""));
  try {
    await execBody(definition.body, child);
  } catch (signal) {
    if (signal instanceof ReturnValue) return signal.value;
    throw signal;
  }
  return child.it;
}

/** Évalue une expression et rend du texte. */
export async function evalExpr(expr: Expr, env: Env): Promise<string> {
  switch (expr.kind) {
    case "count":
    case "prop":
    case "theDate":
    case "theTime":
    case "theLongDate":
    case "objText":
    case "chunk":
      return evalWorld(expr, env);
    default:
      return evalValue(expr, env);
  }
}

async function evalValue(expr: Expr, env: Env): Promise<string> {
  switch (expr.kind) {
    case "str":
      return expr.value;
    case "num":
      return formatNumber(expr.value);
    case "var":
      return env.get(expr.name) ?? lookupConstant(expr.name) ?? "";
    case "it":
      return env.it;
    case "empty":
      return "";
    case "bin":
      return evalBinary(expr, env);
    case "test": {
      const value = await evalExpr(expr.operand, env);
      const empty = value.trim() === "";
      return (expr.test === "empty" ? empty : !empty) ? "true" : "false";
    }
    case "not":
      return truthy(await evalExpr(expr.operand, env)) ? "false" : "true";
    case "neg":
      return formatNumber(-num(await evalExpr(expr.operand, env), "a negative value"));
    case "paren":
      return evalExpr(expr.inner, env);
    case "fn":
      return evalFunction(expr, env);
    case "call":
      return evalCall(expr, env);
    default:
      return evalWorld(expr, env);
  }
}

/** Les expressions qui interrogent le monde : compteurs, propriétés, objets, morceaux. */
async function evalWorld(expr: Expr, env: Env): Promise<string> {
  const host: Host = env.host;
  switch (expr.kind) {
    case "count": {
      if (expr.subject === "cards") return String(host.cardCount());
      const source = expr.of ? await evalExpr(expr.of, env) : "";
      return String(countChunks(source, expr.subject));
    }
    case "prop": {
      const value = host.readProp(resolve(env, expr.of), expr.prop);
      if (typeof value !== "string") throw new Halt(value);
      return value;
    }
    case "theDate":
      return host.determinism.now().date;
    case "theTime":
      return host.determinism.now().time;
    case "theLongDate":
      return host.determinism.now().longDate;
    case "objText": {
      const text = host.readText(resolve(env, expr.ref));
      if (typeof text !== "string") throw new Halt(text);
      return text;
    }
    case "chunk": {
      const source = await readContainer(expr.of, env);
      const bounds = await boundsOf(expr.chunk, env);
      return readChunk(source, expr.chunk.type, bounds.ordinal, bounds.from, bounds.to);
    }
    default:
      throw new Halt(typeError(undefined, `Unknown expression: ${expr.kind}`));
  }
}

/** Morceaux d'un texte pour `repeat for each` : le découpage de `chunks.ts`, pas un second. */
export function splitForLoop(chunkType: Chunk["type"], source: string): string[] {
  return splitChunk(source, chunkType);
}
