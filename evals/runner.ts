/**
 * Le lanceur du jeu d'évaluation « phrase → script » (7.7).
 *
 * Il demande un script à un **vrai modèle**, l'installe sur l'objet désigné,
 * joue les événements de la tâche et juge **la pile finale** — jamais le
 * texte du script (c'est le rôle de `check.ts`).
 *
 * Rien n'est simulé localement : le script vient d'un modèle, il est
 * contrôlé, relu et essayé à blanc par `writeScript` (dans `@cardwake/agent`),
 * puis joué par le **vrai moteur du site** (`createModelEngine`), celui qui
 * sert les écrans. Le verdict est donc celui de l'application, pas celui d'un
 * prototype de laboratoire.
 *
 * L'or du cahier des charges : un passage complet coûte de l'argent, jamais
 * en intégration continue. Ce module ne fait donc **aucun appel réseau** par
 * lui-même : il reçoit une passerelle.
 */

import { createLocalRelayGateway, writeScript } from "@cardwake/agent";
import type { LlmGateway } from "@cardwake/agent";
import { applyOps, authorizeOp, byName, findCard, findPart, validateStack } from "@cardwake/model";
import type { Op, Part, Stack } from "@cardwake/model";
import { createModelEngine, settled } from "../apps/web/src/engine/model-engine";
import type { ModelEngineApi } from "../apps/web/src/engine/model-engine";
import { checkTask } from "./check";
import type { EvalTask } from "./schema";

// --------------------------------------------------------------------------
// Contrats
// --------------------------------------------------------------------------

/** L'objet visé par une tâche : un élément d'une carte. */
export type Target = { cardId: number; partId: number; kind: "button" | "field"; name: string };

/** Ce qu'une tâche a donné : le verdict, et de quoi le comprendre. */
export type TaskOutcome = {
  id: string;
  family: string;
  status: "ok" | "failed" | "error";
  /** Le script obtenu, s'il y en a un. */
  script: string | null;
  /** La relecture en clair du script obtenu. */
  paraphrase: string[];
  /** Ce que le vérificateur a trouvé faux dans la pile finale. */
  failures: string[];
  /** Les erreurs d'exécution rencontrées en jouant. */
  errors: string[];
  /** Les appels au modèle et les jetons dépensés pour cette tâche. */
  calls: number;
  inputTokens: number;
  outputTokens: number;
};

/** Le rapport d'un passage complet. */
export type GameReport = {
  startedAt: string;
  model: string;
  total: number;
  ok: number;
  byFamily: Record<string, { total: number; ok: number }>;
  tasks: TaskOutcome[];
  calls: number;
  inputTokens: number;
  outputTokens: number;
};

/** Ce dont le lanceur a besoin pour jouer. */
export type RunnerOptions = {
  /** La passerelle du modèle : le relais local, ou un faux modèle en test. */
  gateway: LlmGateway;
  /** La référence complète du langage : la même que celle des deux IA. */
  languageReference: string;
  /** Graine du moteur : une même graine rejoue la même partie. */
  seed: number;
  /** Horloge injectée : jamais `Date.now()`. */
  clock: () => string;
  /** Le nom du modèle, pour le rapport. */
  model?: string;
  /** Rappel après chaque tâche, pour suivre l'avancement. */
  onTask?: (outcome: TaskOutcome) => void;
};

// --------------------------------------------------------------------------
// La cible et le résumé de la pile
// --------------------------------------------------------------------------

/** Les éléments d'une carte : les siens, puis ceux de son fond. */
function partsOfCard(stack: Stack, cardId: number): Part[] {
  const card = stack.cards.find((item) => item.id === cardId);
  const background = stack.backgrounds.find((item) => item.id === card?.background);
  return [...(card?.parts ?? []), ...(background?.parts ?? [])];
}

/**
 * Retrouve l'objet désigné par `Carte/Partie` dans la pile.
 *
 * Quand un champ et un bouton portent le même nom (les piles du jeu le font
 * exprès : « Average », « Label », « Total »), c'est le **bouton** que la
 * phrase désigne : la demande commence par « When … is clicked ». Choisir le
 * champ installerait le script là où aucun clic ne le déclenche.
 */
export function targetOf(stack: Stack, object: string): Target | string {
  const [cardName, partName] = object.split("/");
  const card = findCard(stack, byName(cardName));
  if (!card) return `no card named "${cardName}"`;
  if (partName === undefined) return `the object "${object}" names no part`;
  const matches = partsOfCard(stack, card.id).filter(
    (part) => part.name.toLowerCase() === partName.toLowerCase(),
  );
  if (matches.length === 0) return `no part "${partName}" on card "${cardName}"`;
  const part = matches.find((item) => item.kind === "button") ?? matches[0];
  return { cardId: card.id, partId: part.id, kind: part.kind, name: part.name };
}

/** Un élément décrit en une ligne : nom, nature, texte. */
function describePart(part: Part): string {
  if (part.kind === "field") {
    const text = part.text.trim() === "" ? "empty" : JSON.stringify(part.text);
    return `field "${part.name}" (${text})`;
  }
  return `button "${part.name}"`;
}

/**
 * Le résumé de la pile pour le modèle : les cartes, leurs éléments, leurs
 * textes. C'est la seule chose qu'il sait de la pile — il ne peut pas
 * inventer un champ qui n'est pas là.
 */
export function stackSummaryOf(stack: Stack, object: string): string {
  const [cardName] = object.split("/");
  const lines = stack.cards.map((card) => {
    const parts = card.parts.map(describePart).join(", ");
    return `card "${card.name}" carries ${parts === "" ? "nothing" : parts}`;
  });
  const focus = findCard(stack, byName(cardName));
  const target = focus && object.includes("/") ? ` The script will be attached to the part "${object.split("/")[1]}" of card "${focus.name}".` : "";
  return `Stack "${stack.name}". ${lines.join(". ")}.${target}`;
}

// --------------------------------------------------------------------------
// Le comptage des appels
// --------------------------------------------------------------------------

/** Une passerelle qui compte : appels et jetons, sans changer le contrat. */
export type CountedGateway = {
  gateway: LlmGateway;
  usage: { calls: number; inputTokens: number; outputTokens: number };
};

/** Enveloppe une passerelle pour compter ce qu'elle dépense. */
export function countGateway(inner: LlmGateway): CountedGateway {
  const usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  return {
    usage,
    gateway: {
      mode: inner.mode,
      async call(request, signal) {
        const response = await inner.call(request, signal);
        usage.calls += 1;
        usage.inputTokens += response.usage.inputTokens;
        usage.outputTokens += response.usage.outputTokens;
        return response;
      },
    },
  };
}

// --------------------------------------------------------------------------
// L'installation du script
// --------------------------------------------------------------------------

/** Le script actuellement porté par l'objet visé (sur la carte ou son fond). */
function scriptOf(stack: Stack, target: Target): string {
  const part = partsOfCard(stack, target.cardId).find((item) => item.id === target.partId);
  return part?.script ?? "";
}

/**
 * Installe le script sur l'objet visé, comme un auteur le ferait : l'opération
 * passe par `authorize` (le point de passage unique des droits), puis par
 * `applyOps`.
 */
export function installScript(stack: Stack, target: Target, script: string): Stack {
  const op: Op = {
    kind: "setScript",
    target: { kind: "part", cardId: target.cardId, partId: target.partId },
    before: scriptOf(stack, target),
    after: script,
  };
  const verdict = authorizeOp(
    { stack, actor: { kind: "human", mode: "author" }, cardId: target.cardId },
    op,
  );
  if (!verdict.allow) throw new Error(`the script was refused: ${verdict.reason}`);
  return applyOps(stack, [op]);
}

// --------------------------------------------------------------------------
// La partie : jouer les événements sur le vrai moteur
// --------------------------------------------------------------------------

/** Ce qu'une partie laisse : la pile finale, et les erreurs rencontrées. */
export type Played = { stack: Stack; errors: string[] };

/** Attend la fin d'une action du moteur, sans jamais attendre plus de 30 s. */
async function waitFor(engine: ModelEngineApi, action: () => void): Promise<void> {
  const done = settled(engine);
  action();
  await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 30_000))]);
}

/**
 * L'élément d'une carte, par nom et par nature. La nature compte : une pile
 * de démonstration porte souvent un champ et un bouton du même nom
 * (« Average », « Total ») ; cliquer le champ ne déclenche pas le script du
 * bouton, et le jeu mesurerait alors le silence au lieu du modèle.
 */
function partNamed(card: { parts: Part[] }, name: string, kind?: "button" | "field"): Part | undefined {
  const matches = card.parts.filter((part) => part.name.toLowerCase() === name.toLowerCase());
  if (kind === undefined) return matches[0];
  return matches.find((part) => part.kind === kind);
}

/** Les erreurs d'exécution que le moteur a rencontrées pendant une action. */
function errorsOf(engine: ModelEngineApi): string[] {
  return engine.spy().trace.filter((line) => line.includes("failed on"));
}

/** Joue un événement : un clic, une saisie, ou une phrase à l'agent. */
async function playEvent(engine: ModelEngineApi, event: EvalTask["events"][number]): Promise<string | null> {
  const card = engine.currentCard();
  if (!card) return "no card is shown";
  if (event.click !== undefined) {
    const part = partNamed(card, event.click, "button") ?? partNamed(card, event.click);
    if (!part) return `no element named "${event.click}" on card "${card.name}"`;
    if (part.kind !== "button") return `"${event.click}" is a ${part.kind}, not a button`;
    // Un bouton sans script ne produit aucun changement : le moteur ne dit
    // rien, et attendre serait mentir sur ce que le jeu mesure.
    if (part.script.trim() === "") return `the button "${part.name}" carries no script`;
    await waitFor(engine, () => engine.click(part.id));
    return null;
  }
  if (event.type !== undefined) {
    const part = partNamed(card, event.type.field, "field");
    if (!part) return `no field named "${event.type.field}" on card "${card.name}"`;
    engine.editField(part.id, event.type.text);
    return null;
  }
  if (event.chat !== undefined) {
    await waitFor(engine, () => engine.chat(event.chat as string));
    return null;
  }
  return "the event says nothing to do";
}

/** Joue tous les événements d'une tâche, dans l'ordre. */
export async function playEvents(
  stack: Stack,
  events: EvalTask["events"],
  options: RunnerOptions,
): Promise<Played> {
  const engine = createModelEngine({
    clock: options.clock,
    seed: options.seed,
    gatewayOf: () => options.gateway,
    relayExpected: () => options.gateway.mode === "relay",
  });
  engine.openStack(stack);
  const errors: string[] = [];
  for (const event of events) {
    const failure = await playEvent(engine, event);
    if (failure !== null) {
      errors.push(failure);
      break;
    }
    errors.push(...errorsOf(engine));
  }
  return { stack: engine.state() ?? stack, errors };
}

// --------------------------------------------------------------------------
// Une tâche
// --------------------------------------------------------------------------

/** Une tâche en échec, avec la raison. */
function failed(task: EvalTask, reason: string, extra?: Partial<TaskOutcome>): TaskOutcome {
  return {
    id: task.id,
    family: task.family,
    status: "error",
    script: null,
    paraphrase: [],
    failures: [],
    errors: [reason],
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    ...extra,
  };
}

/** Joue une tâche : le script, l'installation, la partie, le verdict. */
export async function runTask(task: EvalTask, options: RunnerOptions): Promise<TaskOutcome> {
  const counted = countGateway(options.gateway);
  const local: RunnerOptions = { ...options, gateway: counted.gateway };
  const validated = validateStack(task.stack);
  if (!validated.ok) return failed(task, `the stack of the task is invalid: ${validated.errors.join("; ")}`);
  const target = targetOf(validated.stack, task.object);
  if (typeof target === "string") return failed(task, target);
  const draft = await writeScript(
    {
      phrase: task.phrase,
      objectKind: "part",
      objectName: target.name,
      stackSummary: stackSummaryOf(validated.stack, task.object),
      currentScript: scriptOf(validated.stack, target),
    },
    counted.gateway,
    {
      languageReference: options.languageReference,
      stack: validated.stack,
      cardId: target.cardId,
    },
  );
  if (draft.status !== "draft" || draft.script === undefined || draft.script.trim() === "") {
    const reason =
      draft.questions.length > 0
        ? `the model asked questions instead of writing: ${draft.questions.join(" ")}`
        : `the model wrote no usable script: ${draft.issues.map((issue) => issue.message).join("; ")}`;
    return failed(task, reason, { paraphrase: draft.paraphrase });
  }
  const stack = installScript(validated.stack, target, draft.script);
  const played = await playEvents(stack, task.events, local);
  const check = checkTask(task, played.stack);
  const failures = [...check.failures];
  if (played.errors.length > 0 && task.expect.some((expect) => expect.kind === "noError")) {
    failures.push(`the script failed: ${played.errors.join("; ")}`);
  }
  return {
    id: task.id,
    family: task.family,
    status: failures.length === 0 ? "ok" : "failed",
    script: draft.script,
    paraphrase: draft.paraphrase,
    failures,
    errors: played.errors,
    calls: counted.usage.calls,
    inputTokens: counted.usage.inputTokens,
    outputTokens: counted.usage.outputTokens,
  };
}

// --------------------------------------------------------------------------
// Un passage complet
// --------------------------------------------------------------------------

/** Le passage complet : les tâches, dans l'ordre, avec le rapport. */
export async function runGame(tasks: EvalTask[], options: RunnerOptions): Promise<GameReport> {
  const outcomes: TaskOutcome[] = [];
  const byFamily: GameReport["byFamily"] = {};
  let calls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const task of tasks) {
    const outcome = await runTask(task, options);
    outcomes.push(outcome);
    calls += outcome.calls;
    inputTokens += outcome.inputTokens;
    outputTokens += outcome.outputTokens;
    const family = byFamily[task.family] ?? { total: 0, ok: 0 };
    family.total += 1;
    if (outcome.status === "ok") family.ok += 1;
    byFamily[task.family] = family;
    options.onTask?.(outcome);
  }
  return {
    startedAt: options.clock(),
    model: options.model ?? "unknown",
    total: outcomes.length,
    ok: outcomes.filter((outcome) => outcome.status === "ok").length,
    byFamily,
    tasks: outcomes,
    calls,
    inputTokens,
    outputTokens,
  };
}

/** La passerelle par défaut du jeu : le relais local, qui détient la clé. */
export function relayGateway(baseUrl: string, model: string): LlmGateway {
  return createLocalRelayGateway({ baseUrl, model });
}
