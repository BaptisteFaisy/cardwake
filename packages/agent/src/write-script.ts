/**
 * La chaîne « phrase → script » (lot C7, cahier des charges 7.7, 11.5).
 *
 * Un seul appel au modèle en sortie structurée (`{script, summary,
 * assumptions, questions}`), avec la référence complète du langage en
 * consigne — la même pour les deux IA (`script-prompt.ts`). Le brouillon est
 * ensuite analysé, contrôlé sans jamais l'exécuter (`checkScript`), relu en
 * clair (`paraphraseScript`), puis essayé à blanc : si le brouillon contient
 * un handler `mouseUp`, il est exécuté sur une COPIE de la pile
 * (`cloneStack`) avec un `ModelHost` et un événement simulé — l'interpréteur
 * est pur, l'essai ne coûte rien (CAR-F-24).
 *
 * Rien n'est installé ici : la fonction rend un brouillon ; l'acceptation est
 * un geste humain, vu la relecture et l'essai à blanc (CAR-F-25).
 *
 * Deux allers-retours au plus : une seule tentative de réparation quand la
 * sortie du modèle est illisible ou que les contrôles échouent, un seul
 * rappel quand le modèle pose des questions. Aucune exception ne sort :
 * `CassetteMiss` et toute panne de passerelle deviennent un échec lisible.
 */

import { parseScript, runHandler } from "@cardwake/lang";
import type { Determinism, Guards } from "@cardwake/lang";
import { APP_LIMITS, Journal, ModelHost, clampSettings, cloneStack, describeOp } from "@cardwake/model";
import type { Op, OpTarget, Stack, TransactionActor } from "@cardwake/model";
// `checkScript` et `paraphraseScript` ne sont pas (encore) exportés par
// l'index de `@cardwake/lang` : import direct dans les sources du paquet.
import { checkScript } from "../../lang/src/check";
import type { CheckContext, CheckIssue } from "../../lang/src/check";
import { paraphraseScript } from "../../lang/src/paraphrase";
import { CassetteMiss } from "./types";
import type { LlmGateway, LlmMessage, LlmPurpose, LlmResponse } from "./types";
import {
  SCRIPT_OUTPUT_SCHEMA,
  firstUserMessage,
  followupUserMessage,
  repairUserMessage,
  scriptSystemPrompt,
} from "./script-prompt";

// --------------------------------------------------------------------------
// Contrat public
// --------------------------------------------------------------------------

export type WriteScriptRequest = {
  phrase: string;
  objectKind: "card" | "background" | "part";
  objectName: string;
  stackSummary: string;
  currentScript?: string;
};

/** Ce que l'essai à blanc montre à l'auteur (CAR-F-24). */
export type DryRunView = {
  /** Chaque changement, lisible en anglais : `field Total: "" -> "165"`. */
  changes: string[];
  /** Erreur d'exécution lisible, s'il y en a une. */
  error?: string;
};

export type WriteScriptResult = {
  status: "draft" | "questions" | "failed";
  script?: string;
  summary?: string;
  assumptions: string[];
  questions: string[];
  issues: CheckIssue[];
  paraphrase: string[];
  dryRun?: DryRunView;
};

export type WriteScriptOptions = {
  languageReference: string;
  stack: Stack;
  cardId: number;
  maxOutputTokens?: number;
};

/** La sortie structurée du modèle, normalisée : quatre clés toujours présentes. */
type ModelDraft = { script: string; summary: string; assumptions: string[]; questions: string[] };

// --------------------------------------------------------------------------
// Constantes de l'essai à blanc : graine et horloge figées, aucun hasard
// --------------------------------------------------------------------------

const DEFAULT_MAX_OUTPUT_TOKENS = 2_000;
const DRY_RUN_SEED = 2026;
const DRY_RUN_CLOCK = "1970-01-01T00:00:00.000Z";
const DRY_RUN_NOW: ReturnType<Determinism["now"]> = {
  date: "1/1/70",
  time: "12:00 AM",
  longDate: "Thursday, January 1, 1970",
  epochMs: 0,
};
const DRY_RUN_GUARDS: Guards = {
  maxSteps: APP_LIMITS.maxSteps,
  maxMessageDepth: 50,
  maxWaitMs: APP_LIMITS.maxWaitMs,
  maxTextChars: APP_LIMITS.maxFieldChars,
};

// --------------------------------------------------------------------------
// Lecture de la sortie du modèle
// --------------------------------------------------------------------------

/** Le texte des blocs texte d'une réponse, dans l'ordre. */
function textOf(response: LlmResponse): string {
  return response.blocks.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
}

/** Normalise ce que le modèle a rendu ; `null` si ce n'est pas un objet. */
function normalizeDraft(value: unknown): ModelDraft | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const list = (input: unknown): string[] =>
    Array.isArray(input) ? input.filter((item): item is string => typeof item === "string") : [];
  return {
    script: typeof raw.script === "string" ? raw.script : "",
    summary: typeof raw.summary === "string" ? raw.summary : "",
    assumptions: list(raw.assumptions),
    questions: list(raw.questions),
  };
}

/** Un essai de JSON ; `null` si le texte ne s'analyse pas. */
function tryParse(text: string): ModelDraft | null {
  try {
    return normalizeDraft(JSON.parse(text));
  } catch {
    return null;
  }
}

/** Sortie structurée → brouillon ; tolère les clôtures de code autour du JSON. */
function parseDraft(text: string): ModelDraft | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const direct = tryParse(cleaned);
  if (direct !== null) return direct;
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return start >= 0 && end > start ? tryParse(cleaned.slice(start, end + 1)) : null;
}

// --------------------------------------------------------------------------
// Résultats intermédiaires
// --------------------------------------------------------------------------

/** Un problème lisible pour le résultat. */
function issue(rule: string, message: string): CheckIssue {
  return { level: "error", rule, message };
}

/** Un échec propre : les problèmes, et rien d'installé. */
function failed(issues: CheckIssue[], summary = "", assumptions: string[] = []): WriteScriptResult {
  return { status: "failed", summary, assumptions, questions: [], issues, paraphrase: [] };
}

/** Les erreurs d'une liste de problèmes : les avertissements ne bloquent pas. */
function errorsOf(issues: CheckIssue[]): CheckIssue[] {
  return issues.filter((item) => item.level === "error");
}

/** La liste des problèmes, en anglais, pour la consigne de réparation. */
function issuesText(issues: CheckIssue[]): string {
  return issues
    .map((item) => `- ${item.message}${item.line === undefined ? "" : ` (line ${item.line})`}`)
    .join("\n");
}

/** Un appel au modèle : consigne système, messages, schéma de sortie. */
async function callModel(
  gateway: LlmGateway,
  purpose: LlmPurpose,
  system: string,
  messages: LlmMessage[],
  options: WriteScriptOptions,
): Promise<LlmResponse> {
  return gateway.call(
    {
      purpose,
      speed: "careful",
      system,
      messages,
      outputSchema: SCRIPT_OUTPUT_SCHEMA,
      maxOutputTokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    },
    new AbortController().signal,
  );
}

/** Ce que les contrôles savent du monde : la pile autour de l'objet visé. */
function checkContextOf(
  stack: Stack,
  cardId: number,
  objectKind: WriteScriptRequest["objectKind"],
): CheckContext {
  const card = stack.cards.find((item) => item.id === cardId);
  const background = stack.backgrounds.find((item) => item.id === card?.background);
  return {
    cardNames: stack.cards.map((item) => item.name),
    partNames: [...(card?.parts ?? []), ...(background?.parts ?? [])].map((part) => part.name),
    backgroundNames: stack.backgrounds.map((item) => item.name),
    objectKind,
  };
}

// --------------------------------------------------------------------------
// L'essai à blanc : une copie de la pile, un clic simulé, rien d'installé
// --------------------------------------------------------------------------

/** Le nom d'un élément sur une carte : ses propres éléments, puis ceux du fond. */
function partNameOf(stack: Stack, cardId: number, partId: number): string {
  const card = stack.cards.find((item) => item.id === cardId);
  const part =
    card?.parts.find((item) => item.id === partId) ??
    stack.backgrounds.find((item) => item.id === card?.background)?.parts.find((item) => item.id === partId);
  return part ? `${part.kind} ${part.name}` : `part ${partId}`;
}

/** La cible d'une opération, en mots : `field Total`, `card "Kitchen"`. */
function targetNameOf(target: OpTarget, stack: Stack): string {
  if (target.kind === "part") return partNameOf(stack, target.cardId, target.partId);
  if (target.kind === "card") {
    const card = stack.cards.find((item) => item.id === target.cardId);
    return card ? `card "${card.name}"` : `card ${target.cardId}`;
  }
  if (target.kind === "background") {
    const background = stack.backgrounds.find((item) => item.id === target.backgroundId);
    return background ? `background "${background.name}"` : `background ${target.backgroundId}`;
  }
  return "the stack";
}

/** Un changement, lisible en anglais : `field Total: "" -> "165"`. */
function describeChange(op: Op, stack: Stack): string {
  if (op.kind === "setText") {
    return `${partNameOf(stack, op.cardId, op.partId)}: ${JSON.stringify(op.before)} -> ${JSON.stringify(op.after)}`;
  }
  if (op.kind === "setProp") {
    return `${op.prop} of ${targetNameOf(op.target, stack)}: ${JSON.stringify(op.before)} -> ${JSON.stringify(op.after)}`;
  }
  return describeOp(op);
}

/**
 * L'essai à blanc : si le brouillon a un handler `mouseUp`, il est exécuté
 * sur une copie de la pile, comme si l'auteur avait cliqué (CAR-F-24).
 * L'interpréteur est pur : la pile d'origine n'est jamais touchée.
 */
async function dryRunMouseUp(script: string, stack: Stack, cardId: number): Promise<DryRunView | undefined> {
  const parsed = parseScript(script);
  if (!parsed.ok) return undefined;
  const handler = parsed.script.handlers.find((item) => item.name.toLowerCase() === "mouseup");
  if (!handler) return undefined;
  const actor: TransactionActor = { kind: "script", cardId, objectId: 0 };
  const copy = cloneStack(stack);
  const journal = new Journal();
  const host = new ModelHost({
    stack: copy,
    journal,
    actor,
    cardId,
    guards: DRY_RUN_GUARDS,
    determinism: { seed: DRY_RUN_SEED, random: () => 0.5, now: () => DRY_RUN_NOW },
    settings: clampSettings(copy.settings),
  });
  journal.begin(actor, "dry run of mouseUp", DRY_RUN_SEED);
  const result = await runHandler(parsed.script, handler.name, [], host);
  if (!result.ok) {
    journal.abort();
    return { changes: [], error: result.error.message };
  }
  const transaction = journal.commit(host.stack, DRY_RUN_CLOCK);
  return { changes: transaction.ops.map((op) => describeChange(op, copy)) };
}

// --------------------------------------------------------------------------
// La chaîne : au plus deux appels au modèle, jamais d'exception
// --------------------------------------------------------------------------

/** Vérifie un brouillon : contrôles, réparation unique, puis produit final. */
async function checkedDraft(
  draft: ModelDraft,
  request: WriteScriptRequest,
  gateway: LlmGateway,
  system: string,
  options: WriteScriptOptions,
  allowRepair = true,
): Promise<WriteScriptResult> {
  const context = checkContextOf(options.stack, options.cardId, request.objectKind);
  let current = draft;
  let issues = checkScript(current.script, context);
  if (errorsOf(issues).length > 0 && allowRepair) {
    const repaired = await callModel(
      gateway,
      "repair-script",
      system,
      [repairUserMessage(current.script, issuesText(issues))],
      options,
    );
    const next = parseDraft(textOf(repaired));
    if (next === null || next.script === "") {
      const problems = [...errorsOf(issues), issue("repair-output", "The repair attempt did not return a readable script.")];
      return failed(problems, current.summary, current.assumptions);
    }
    current = next;
    issues = checkScript(current.script, context);
  }
  const errors = errorsOf(issues);
  if (errors.length > 0) return failed(errors, current.summary, current.assumptions);
  const dryRun = await dryRunMouseUp(current.script, options.stack, options.cardId);
  return {
    status: "draft",
    script: current.script,
    summary: current.summary,
    assumptions: current.assumptions,
    questions: current.questions,
    issues,
    paraphrase: paraphraseScript(current.script),
    dryRun,
  };
}

/** Le modèle a posé des questions : un seul rappel, puis « questions ». */
async function askedQuestions(
  draft: ModelDraft,
  request: WriteScriptRequest,
  gateway: LlmGateway,
  system: string,
  options: WriteScriptOptions,
): Promise<WriteScriptResult> {
  const second = await callModel(gateway, "write-script", system, [followupUserMessage(draft.questions)], options);
  const next = parseDraft(textOf(second));
  if (next === null) {
    return failed([issue("model-output", "The second answer was not readable structured output.")], draft.summary, draft.assumptions);
  }
  if (next.script !== "") return checkedDraft(next, request, gateway, system, options, false);
  return {
    status: "questions",
    summary: next.summary !== "" ? next.summary : draft.summary,
    assumptions: [...draft.assumptions, ...next.assumptions],
    questions: next.questions.length > 0 ? next.questions : draft.questions,
    issues: [],
    paraphrase: [],
  };
}

/** Un essai de la chaîne : premier appel, puis réparation ou questions. */
async function attempt(
  request: WriteScriptRequest,
  gateway: LlmGateway,
  options: WriteScriptOptions,
): Promise<WriteScriptResult> {
  const system = scriptSystemPrompt(request, options);
  const first = await callModel(gateway, "write-script", system, [firstUserMessage(request)], options);
  let draft = parseDraft(textOf(first));
  if (draft === null) {
    const problem = "- The answer was not the expected structured output (a JSON object with script, summary, assumptions and questions).";
    const repaired = await callModel(gateway, "repair-script", system, [repairUserMessage(textOf(first), problem)], options);
    draft = parseDraft(textOf(repaired));
    if (draft === null) return failed([issue("model-output", "The model did not return readable structured output.")]);
  }
  if (draft.script === "" && draft.questions.length > 0) {
    return askedQuestions(draft, request, gateway, system, options);
  }
  if (draft.script === "") {
    return failed([issue("empty-script", "The model returned neither a script nor a question.")], draft.summary, draft.assumptions);
  }
  return checkedDraft(draft, request, gateway, system, options);
}

/**
 * La chaîne complète : phrase → brouillon contrôlé, relu et essayé à blanc.
 * Aucune exception ne sort : `CassetteMiss` et toute panne de passerelle
 * deviennent un échec lisible qui propose d'ajouter une clé.
 */
export async function writeScript(
  request: WriteScriptRequest,
  gateway: LlmGateway,
  options: WriteScriptOptions,
): Promise<WriteScriptResult> {
  try {
    return await attempt(request, gateway, options);
  } catch (error) {
    if (error instanceof CassetteMiss) return failed([issue("cassette-miss", error.message)]);
    const message = error instanceof Error ? error.message : String(error);
    return failed([issue("gateway-error", `The model gateway failed: ${message}`)]);
  }
}
