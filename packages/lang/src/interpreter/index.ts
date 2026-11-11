/**
 * Point d'entrée de l'exécution : `runHandler` et `runStatements`.
 *
 * Le résultat suit le contrat `RunResult` de `host.ts` : soit les effets ont
 * tous eu lieu, soit une erreur lisible est rendue et l'appelant restaure
 * l'état d'avant — tout ou rien (CAR-P-07).
 */

import type { Script } from "../ast";
import type { Host, RunResult } from "../host";
import { runtimeError } from "../errors";
import { Env, ExitHandler, Halt, ReturnValue } from "./runtime";
import { execBody } from "./exec-stmt";

export type { Env } from "./runtime";
export { execBody, execStmt } from "./exec-stmt";
export { evalExpr, readContainer, writeContainer, resolveRef } from "./eval-expr";

function newEnv(host: Host, script?: Script): Env {
  const env = new Env(host);
  for (const fn of script?.functions ?? []) env.functions.set(fn.name.toLowerCase(), fn);
  return env;
}

/** Exécute le handler d'un message, avec ses paramètres déjà évalués en texte. */
export async function runHandler(
  script: Script,
  handlerName: string,
  params: string[],
  host: Host,
  env?: Env,
): Promise<RunResult> {
  const handler = script.handlers.find((item) => item.name.toLowerCase() === handlerName.toLowerCase());
  if (!handler) {
    return {
      ok: false,
      steps: env?.steps ?? 0,
      error: runtimeError(`No handler named "${handlerName}" in this script.`),
    };
  }
  const scope = env ?? newEnv(host, script);
  scope.messageName = handler.name;
  handler.params.forEach((name, index) => scope.set(name, params[index] ?? ""));
  return finish(execBody(handler.body, scope), scope);
}

/** Exécute une liste d'instructions (essai à blanc, CLI, tests). */
export async function runStatements(statements: unknown[], host: Host, env?: Env, script?: Script): Promise<RunResult> {
  const scope = env ?? newEnv(host, script);
  return finish(execBody(statements as never, scope), scope);
}

async function finish(run: Promise<void>, env: Env): Promise<RunResult> {
  try {
    await run;
    return { ok: true, it: env.it, steps: env.steps, returned: env.it };
  } catch (signal) {
    if (signal instanceof ReturnValue) {
      return { ok: true, it: env.it, steps: env.steps, returned: signal.value };
    }
    if (signal instanceof ExitHandler) {
      return { ok: true, it: env.it, steps: env.steps };
    }
    if (signal instanceof Halt) {
      return { ok: false, steps: env.steps, error: signal.error };
    }
    throw signal;
  }
}
