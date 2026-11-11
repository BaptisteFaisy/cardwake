/**
 * Exécution des instructions. Chaque effet passe par le `Host` : ce module ne
 * connaît ni la pile, ni le navigateur, ni les droits — il déroule l'arbre et
 * compte ses pas (7.3, CAR-F-12).
 */

import type { Container, RepeatLoop, Stmt } from "../ast";
import type { ResolvedRef } from "../host";
import { runtimeError, typeError } from "../errors";
import { addExact, formatNumber, round, toNumber, truthy } from "../values";
import { Env, ExitHandler, ExitRepeat, Halt, ReturnValue } from "./runtime";
import { evalExpr, readContainer, resolveRef, splitForLoop, writeContainer } from "./eval-expr";

export async function execBody(body: Stmt[], env: Env): Promise<void> {
  for (const statement of body) await execStmt(statement, env);
}

function number(value: string, what: string): number {
  const parsed = toNumber(value);
  if (parsed === null) {
    throw new Halt(typeError(undefined, `${what} needs a number, got "${value.slice(0, 30)}".`));
  }
  return parsed;
}

async function arithmetic(op: "add" | "subtract" | "multiply" | "divide", current: string, operand: string): Promise<string> {
  const left = number(current, "Arithmetic");
  const right = number(operand, "Arithmetic");
  if (op === "add") return formatNumber(addExact(left, right));
  if (op === "subtract") return formatNumber(round(left - right, 6));
  if (op === "multiply") return formatNumber(round(left * right, 6));
  if (right === 0) throw new Halt(typeError(undefined, "Division by zero."));
  return formatNumber(round(left / right, 6));
}

async function repeatLoop(loop: RepeatLoop, body: Stmt[], env: Env): Promise<void> {
  if (loop.kind === "with") {
    const from = number(await evalExpr(loop.from, env), "A loop start");
    const to = number(await evalExpr(loop.to, env), "A loop end");
    const step = loop.step ? number(await evalExpr(loop.step, env), "A loop step") : 1;
    if (step === 0) throw new Halt(runtimeError("A loop step cannot be zero."));
    for (let index = from; step > 0 ? index <= to : index >= to; index += step) {
      env.step("a loop iteration");
      env.set(loop.name, formatNumber(index));
      try {
        await execBody(body, env);
      } catch (signal) {
        if (!(signal instanceof ExitRepeat)) throw signal;
        return;
      }
    }
    return;
  }
  if (loop.kind === "times") {
    const times = Math.trunc(number(await evalExpr(loop.count, env), "A repetition count"));
    for (let index = 0; index < times; index += 1) {
      env.step("a loop iteration");
      try {
        await execBody(body, env);
      } catch (signal) {
        if (!(signal instanceof ExitRepeat)) throw signal;
        return;
      }
    }
    return;
  }
  if (loop.kind === "forEach") {
    const source = await evalExpr(loop.in, env);
    for (const item of splitForLoop(loop.chunkType, source)) {
      env.step("a loop iteration");
      env.set(loop.name, item);
      try {
        await execBody(body, env);
      } catch (signal) {
        if (!(signal instanceof ExitRepeat)) throw signal;
        return;
      }
    }
    return;
  }
  while (truthy(await evalExpr(loop.cond, env))) {
    env.step("a loop iteration");
    try {
      await execBody(body, env);
    } catch (signal) {
      if (!(signal instanceof ExitRepeat)) throw signal;
      return;
    }
  }
}

/** Exécute une instruction. Les signaux de contrôle remontent jusqu'au bon niveau. */
export async function execStmt(stmt: Stmt, env: Env): Promise<void> {
  env.step(stmt.kind);
  const host = env.host;
  switch (stmt.kind) {
    case "put":
      // `into` remplace, `before`/`after` insèrent : les trois modes du langage
      // tiennent dans les trois modes du `Host`.
      return writeContainer(stmt.target, await evalExpr(stmt.expr, env), stmt.mode === "into" ? "replace" : stmt.mode, env);
    case "set":
      return host.writeProp(resolveRef(stmt.obj, env), stmt.prop, await evalExpr(stmt.value, env));
    case "get":
      env.it = await evalExpr(stmt.expr, env);
      return;
    case "go": {
      const target = resolveRef({ kind: "card", ref: stmt.card, span: stmt.span }, env);
      if (target.kind !== "card") throw new Halt(runtimeError("go to needs a card."));
      return host.goToCard(target.id);
    }
    case "send": {
      const args: string[] = [];
      for (const arg of stmt.args) args.push(await evalExpr(arg, env));
      return host.sendMessage(await evalExpr(stmt.message, env), args, resolveRef(stmt.to, env));
    }
    case "pass":
      return host.pass(stmt.message ?? env.messageName);
    case "answer":
      return host.answer(await evalExpr(stmt.expr, env));
    case "ask": {
      const answer = await host.ask(await evalExpr(stmt.prompt, env));
      env.it = answer;
      if (stmt.into) await writeContainer(stmt.into, answer, "replace", env);
      return;
    }
    case "show":
      return host.writeProp(resolveRef(stmt.obj, env), "visible", "true");
    case "hide":
      return host.writeProp(resolveRef(stmt.obj, env), "visible", "false");
    case "arith": {
      const operand = await evalExpr(stmt.value, env);
      const current = await readContainer(stmt.target, env);
      const result = await arithmetic(stmt.op, current, operand);
      return writeContainer(stmt.target, result, "replace", env);
    }
    case "create": {
      if (stmt.what.kind === "background") {
        host.createBackground(stmt.what.name ? await evalExpr(stmt.what.name, env) : undefined);
        return;
      }
      if (stmt.what.kind === "card") {
        host.createCard(
          stmt.what.name ? await evalExpr(stmt.what.name, env) : undefined,
          stmt.what.background ? await evalExpr(stmt.what.background, env) : undefined,
        );
        return;
      }
      const name = stmt.what.name ? await evalExpr(stmt.what.name, env) : undefined;
      host.createPart(stmt.what.partKind, name, host.currentCardId());
      return;
    }
    case "delete":
      return host.delete(resolveRef(stmt.obj, env));
    case "sort": {
      const target = resolveOfContainer(stmt.spec.container, env);
      const index = stmt.spec.by?.index ? Number(await evalExpr(stmt.spec.by.index, env)) : undefined;
      return host.sort(target, stmt.spec.numeric, stmt.spec.descending, stmt.spec.by?.kind, index);
    }
    case "find": {
      const found = host.find(await evalExpr(stmt.expr, env));
      env.it = found.map((id) => host.cardName(id)).join(",");
      return;
    }
    case "wait": {
      const value = number(await evalExpr(stmt.duration, env), "wait");
      const ms = stmt.unit === "seconds" ? value * 1000 : value;
      env.addWait(ms);
      await host.wait(ms);
      return;
    }
    case "consult": {
      const reply = await host.consult(resolveRef({ kind: "agent", ref: stmt.agent, span: stmt.span }, env), await evalExpr(stmt.with, env));
      env.it = reply;
      return;
    }
    case "tell":
      return host.tell(
        resolveRef({ kind: "agent", ref: stmt.agent, span: stmt.span }, env),
        await evalExpr(stmt.text, env),
      );
    case "if":
      return truthy(await evalExpr(stmt.cond, env))
        ? execBody(stmt.then, env)
        : stmt.otherwise
          ? execBody(stmt.otherwise, env)
          : Promise.resolve();
    case "repeat":
      return repeatLoop(stmt.loop, stmt.body, env);
    case "exit":
      if (stmt.what === "repeat") throw new ExitRepeat();
      throw new ExitHandler(stmt.what.handler.toLowerCase());
    case "return":
      throw new ReturnValue(stmt.value ? await evalExpr(stmt.value, env) : env.it);
    case "global":
      env.declareGlobals(stmt.names);
      return;
    case "call": {
      const args: string[] = [];
      for (const arg of stmt.args) args.push(await evalExpr(arg, env));
      if (env.functions.has(stmt.name.toLowerCase())) {
        env.it = await callFunction(stmt.name, args, env);
        return;
      }
      return host.sendMessage(stmt.name, args, resolveRef({ kind: "me", span: stmt.span }, env));
    }
  }
}

/** Appel de fonction depuis une instruction : même portée que depuis une expression. */
async function callFunction(name: string, args: string[], env: Env): Promise<string> {
  const definition = env.functions.get(name.toLowerCase());
  if (!definition) throw new Halt(runtimeError(`There is no function named "${name}".`));
  const child = env.child();
  definition.params.forEach((param, index) => child.set(param, args[index] ?? ""));
  child.messageName = definition.name;
  try {
    await execBody(definition.body, child);
  } catch (signal) {
    if (signal instanceof ReturnValue) return signal.value;
    if (signal instanceof ExitHandler && signal.handler === definition.name.toLowerCase()) return child.it;
    throw signal;
  }
  return child.it;
}

/** Un conteneur de `sort` doit désigner un objet, pas une variable. */
function resolveOfContainer(target: Container, env: Env): ResolvedRef {
  if (target.kind === "obj") return resolveRef(target.ref, env);
  if (target.kind === "chunk") return resolveOfContainer(target.of, env);
  throw new Halt(runtimeError("sort needs a field, not a variable.", 'Use: sort lines of field "Tasks".'));
}
