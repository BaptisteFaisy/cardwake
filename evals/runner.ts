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
import { playEvents } from "./play";
import type { Played } from "./play";
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
  /** La tâche a-t-elle réussi **du premier coup** (sans réparation) ? */
  firstTry: boolean;
  /** Une réparation a-t-elle été demandée au modèle ? */
  repaired: boolean;
  /** Les tentatives de rédaction (1 = premier coup seulement). */
  attempts: number;
};

/** Le rapport d'un passage complet. */
export type GameReport = {
  startedAt: string;
  model: string;
  total: number;
  /** Les tâches réussies, après au plus une réparation. */
  ok: number;
  /** Les tâches réussies **du premier coup**, sans réparation. */
  okFirstTry: number;
  /** Les tâches qui ont demandé une réparation. */
  repaired: number;
  byFamily: Record<string, { total: number; ok: number; firstTry: number }>;
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
    firstTry: false,
    repaired: false,
    attempts: 0,
    ...extra,
  };
}

/** Ce que le modèle a rendu : un script, ou la raison de son absence. */
type Draft = { script: string; paraphrase: string[] } | { reason: string; paraphrase: string[] };

/** Demande le script au modèle : contrôlé, relu et essayé à blanc par lui. */
async function draftFor(
  task: EvalTask,
  stack: Stack,
  target: Target,
  counted: LlmGateway,
  options: RunnerOptions,
  phrase: string,
): Promise<Draft> {
  const draft = await writeScript(
    {
      phrase,
      objectKind: "part",
      objectName: target.name,
      stackSummary: stackSummaryOf(stack, task.object),
      currentScript: scriptOf(stack, target),
    },
    counted,
    {
      languageReference: options.languageReference,
      stack,
      cardId: target.cardId,
      // La référence du langage est longue : une sortie plafonnée à 2 000
      // jetons était coupée en pleine réponse structurée, que le modèle
      // devait alors réparer (deux appels au lieu d'un). Quatre mille jetons
      // laissent un script entier passer au premier coup.
      maxOutputTokens: 4_000,
    },
  );
  if (draft.status === "draft" && draft.script !== undefined && draft.script.trim() !== "") {
    return { script: draft.script, paraphrase: draft.paraphrase };
  }
  const reason =
    draft.questions.length > 0
      ? `the model asked questions instead of writing: ${draft.questions.join(" ")}`
      : `the model wrote no usable script: ${draft.issues.map((issue) => issue.message).join("; ")}`;
  return { reason, paraphrase: draft.paraphrase };
}

/** Les échecs du verdict : les attentes, plus les erreurs si la tâche en exige l'absence. */
function failuresOf(task: EvalTask, played: Played): string[] {
  const failures = [...checkTask(task, played.stack).failures];
  if (played.errors.length > 0 && task.expect.some((expect) => expect.kind === "noError")) {
    failures.push(`the script failed: ${played.errors.join("; ")}`);
  }
  return failures;
}

/**
 * Un essai : le script demandé, installé, joué, puis judged. Soit le script et
 * ce que la pile a montré, soit la raison pour laquelle il n'y a pas de script.
 */
type Attempt =
  | { script: string; paraphrase: string[]; failures: string[]; errors: string[] }
  | { reason: string; paraphrase: string[] };

/** Un essai complet : un brouillon, une installation, une partie. */
async function attemptTask(
  task: EvalTask,
  stack: Stack,
  target: Target,
  gateway: LlmGateway,
  options: RunnerOptions,
  phrase: string,
): Promise<Attempt> {
  const draft = await draftFor(task, stack, target, gateway, options, phrase);
  if ("reason" in draft) return { reason: draft.reason, paraphrase: draft.paraphrase };
  const played = await playEvents(installScript(stack, target, draft.script), task.events, {
    ...options,
    gateway,
  });
  return {
    script: draft.script,
    paraphrase: draft.paraphrase,
    failures: failuresOf(task, played),
    errors: played.errors,
  };
}

/**
 * La demande de réparation : la phrase d'origine, et ce que la pile a
 * réellement montré. Un seul appel supplémentaire, comme le cahier le
 * prévoit — et le modèle voit le résultat, pas seulement l'échec.
 */
export function repairPhrase(task: EvalTask, failures: string[]): string {
  return [
    task.phrase,
    "",
    "The script you proposed was installed and played on the stack. Here is what the stack actually showed:",
    ...failures.map((failure) => `- ${failure}`),
    "",
    "Write the corrected script for the same request.",
  ].join("\n");
}

/**
 * La demande de réparation quand le modèle n'a rien donné d'utilisable : on
 * lui rend son propre verdict (contrôle statique refusé, sortie illisible),
 * et on lui demande une fois de plus.
 */
export function rewritePhrase(task: EvalTask, reason: string): string {
  return [
    task.phrase,
    "",
    `The script you proposed could not be used: ${reason}`,
    "",
    "Write the script again, in the exact form the language reference describes.",
  ].join("\n");
}

/** Le compte rendu d'une tâche : le verdict et ce qui a été dépensé. */
function outcomeOf(
  task: EvalTask,
  attempt: Attempt,
  counted: CountedGateway,
  firstTry: boolean,
  repaired: boolean,
  attempts: number,
): TaskOutcome {
  if ("reason" in attempt) {
    return failed(task, attempt.reason, {
      paraphrase: attempt.paraphrase,
      calls: counted.usage.calls,
      inputTokens: counted.usage.inputTokens,
      outputTokens: counted.usage.outputTokens,
      attempts,
    });
  }
  return {
    id: task.id,
    family: task.family,
    status: attempt.failures.length === 0 ? "ok" : "failed",
    script: attempt.script,
    paraphrase: attempt.paraphrase,
    failures: attempt.failures,
    errors: attempt.errors,
    calls: counted.usage.calls,
    inputTokens: counted.usage.inputTokens,
    outputTokens: counted.usage.outputTokens,
    firstTry,
    repaired,
    attempts,
  };
}

/**
 * Joue une tâche : le script, l'installation, la partie, le verdict — puis,
 * si le script n'a pas fait ce qu'on attendait, **une** réparation demandée
 * au modèle avec ce que la pile a montré (le cahier : « ≥ 95 % après une
 * réparation, un seul appel supplémentaire »).
 */
export async function runTask(task: EvalTask, options: RunnerOptions): Promise<TaskOutcome> {
  const counted = countGateway(options.gateway);
  const validated = validateStack(task.stack);
  if (!validated.ok) return failed(task, `the stack of the task is invalid: ${validated.errors.join("; ")}`);
  const target = targetOf(validated.stack, task.object);
  if (typeof target === "string") return failed(task, target);
  const first = await attemptTask(task, validated.stack, target, counted.gateway, options, task.phrase);
  if ("reason" in first) {
    // Pas de script du tout : le modèle retente une fois, en sachant ce que
    // son propre answer avait fait rejeter.
    const again = await attemptTask(
      task,
      validated.stack,
      target,
      counted.gateway,
      options,
      rewritePhrase(task, first.reason),
    );
    if ("reason" in again) return outcomeOf(task, again, counted, false, true, 2);
    return outcomeOf(task, again, counted, false, true, 2);
  }
  if (first.failures.length === 0) return outcomeOf(task, first, counted, true, false, 1);
  const repair = await attemptTask(
    task,
    validated.stack,
    target,
    counted.gateway,
    options,
    repairPhrase(task, first.failures),
  );
  if ("reason" in repair) {
    return outcomeOf(task, { ...first, errors: [...first.errors, repair.reason] }, counted, false, true, 2);
  }
  return outcomeOf(task, repair, counted, false, true, 2);
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
    const family = byFamily[task.family] ?? { total: 0, ok: 0, firstTry: 0 };
    family.total += 1;
    if (outcome.status === "ok") family.ok += 1;
    if (outcome.firstTry) family.firstTry += 1;
    byFamily[task.family] = family;
    options.onTask?.(outcome);
  }
  return {
    startedAt: options.clock(),
    model: options.model ?? "unknown",
    total: outcomes.length,
    ok: outcomes.filter((outcome) => outcome.status === "ok").length,
    okFirstTry: outcomes.filter((outcome) => outcome.firstTry).length,
    repaired: outcomes.filter((outcome) => outcome.repaired).length,
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
