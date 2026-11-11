/**
 * Environnement d'exécution et signaux de contrôle.
 *
 * L'interpréteur est synchrone sauf aux trois endroits où le monde extérieur
 * répond (`ask`, `consult`, `wait`) : ces appels sont attendus, ce qui permet
 * au navigateur de rendre la main pendant un tour d'agent.
 */

import type { FunctionDef, ScriptError } from "../ast";
import type { Host } from "../host";
import { haltedError, limitError, runtimeError } from "../errors";

/** Sortie de boucle `exit repeat`. */
export class ExitRepeat extends Error {
  constructor() {
    super("exit repeat");
    this.name = "ExitRepeat";
  }
}

/** Sortie de handler `exit <nom>`. */
export class ExitHandler extends Error {
  constructor(readonly handler: string) {
    super(`exit ${handler}`);
    this.name = "ExitHandler";
  }
}

/** `return <valeur>` : remonte jusqu'à l'appelant. */
export class ReturnValue extends Error {
  constructor(readonly value: string) {
    super("return");
    this.name = "ReturnValue";
  }
}

/** Un garde-fou est atteint : le traitement s'arrête, l'appelant restaure l'état. */
export class Halt extends Error {
  constructor(readonly error: ScriptError) {
    super(error.message);
    this.name = "Halt";
  }
}

/** Portée d'un traitement : variables, `it`, compteurs et fonctions de l'auteur. */
export class Env {
  readonly locals = new Map<string, string>();
  private globals = new Map<string, string>();
  private globalNames = new Set<string>();
  readonly functions = new Map<string, FunctionDef>();
  /** Une fonction appelée partage globales, fonctions et compteurs avec son parent. */
  private globalsRef: Map<string, string> | null = null;
  private globalNamesRef: Set<string> | null = null;
  private functionsRef: Map<string, FunctionDef> | null = null;
  private counter: Env | null = null;
  it = "";
  /** Nom du message en cours de traitement, pour `pass` sans argument. */
  messageName = "";
  steps = 0;
  waitedMs = 0;

  constructor(readonly host: Host) {}

  /** Portée d'une fonction de l'auteur : locales neuves, globales et fonctions partagées. */
  child(): Env {
    const next = new Env(this.host);
    next.globalsRef = this.globals;
    next.globalNamesRef = this.globalNames;
    next.functionsRef = this.functions;
    next.counter = this;
    next.messageName = this.messageName;
    return next;
  }

  /** Les noms sont insensibles à la casse, comme les mots-clés. */
  get globals_(): Map<string, string> {
    return this.globalsRef ?? this.globals;
  }

  private get names_(): Set<string> {
    return this.globalNamesRef ?? this.globalNames;
  }

  get(name: string): string | undefined {
    const key = name.toLowerCase();
    if (this.names_.has(key)) return this.globals_.get(key) ?? "";
    return this.locals.get(key);
  }

  set(name: string, value: string): void {
    const key = name.toLowerCase();
    if (this.names_.has(key)) this.globals_.set(key, value);
    else this.locals.set(key, value);
  }

  declareGlobals(names: string[]): void {
    for (const name of names) {
      const key = name.toLowerCase();
      this.names_.add(key);
      if (this.locals.has(key)) {
        this.globals_.set(key, this.locals.get(key) ?? "");
        this.locals.delete(key);
      }
    }
  }

  /** Un pas d'exécution ; lève `Halt` au-delà de `maxSteps` (CAR-P-06). */
  step(what = "this script"): void {
    const root = this.counter ?? this;
    root.steps += 1;
    this.steps = root.steps;
    if (root.steps > this.host.guards.maxSteps) {
      throw new Halt(
        haltedError(`Stopped after ${this.host.guards.maxSteps} steps in ${what}. The script probably loops without end.`),
      );
    }
  }

  /** L'attente cumulée est bornée, sinon une boucle de `wait` bloque tout. */
  addWait(ms: number): void {
    const root = this.counter ?? this;
    root.waitedMs += ms;
    this.waitedMs = root.waitedMs;
    if (root.waitedMs > this.host.guards.maxWaitMs) {
      throw new Halt(haltedError(`Total wait exceeded ${this.host.guards.maxWaitMs} ms.`));
    }
  }

  /** Contrôle de la taille d'un texte avant écriture. */
  checkSize(text: string, where: string): void {
    if (text.length > this.host.guards.maxTextChars) {
      throw new Halt(limitError(`"${where}" would exceed ${this.host.guards.maxTextChars} characters.`));
    }
  }

  /** Une erreur d'exécution lisible, jamais une trace technique. */
  fail(message: string, hint?: string, object?: string): never {
    throw new Halt(runtimeError(message, hint, undefined, object));
  }
}
