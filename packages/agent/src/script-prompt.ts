/**
 * La consigne du rédacteur de scripts (lot C7, 7.7) : UN seul endroit où elle
 * est construite. La référence complète du langage (`docs/language.md`) y est
 * injectée — une seule source pour les deux IA — avec le résumé de la pile et
 * le schéma de la sortie structurée. Tout est en anglais : c'est ce que lit le
 * modèle. Les commentaires restent en français (règle du dépôt).
 */

import type { LlmMessage } from "./types";
import type { WriteScriptRequest } from "./write-script";

/** Schéma de la sortie structurée : les quatre clés, rien d'autre. */
export const SCRIPT_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["script", "summary", "assumptions", "questions"],
  properties: {
    script: {
      type: "string",
      description: "The complete Murmur script, or an empty string to ask questions instead.",
    },
    summary: { type: "string", description: "One or two sentences saying what the script does." },
    assumptions: { type: "array", items: { type: "string" }, description: "Everything you had to guess." },
    questions: {
      type: "array",
      items: { type: "string" },
      description: "What you cannot decide alone; empty when the request is clear.",
    },
  },
};

/** Ce que l'appelant apporte à la consigne : la référence du langage. */
export type ScriptPromptOptions = { languageReference: string };

/** La consigne système : rôle, sortie attendue, règles, pile, référence. */
export function scriptSystemPrompt(request: WriteScriptRequest, options: ScriptPromptOptions): string {
  return [
    `You are the script writer of Cardwake. You turn one sentence from the author ` +
      `into a Murmur script for the ${request.objectKind} "${request.objectName}".`,
    "",
    'Reply ONLY with the structured output: an object with the keys "script", "summary", ' +
      '"assumptions" and "questions".',
    '- "script": the complete Murmur script, or an empty string when you must ask questions first.',
    '- "summary": one or two sentences saying what the script does.',
    '- "assumptions": everything you had to guess, one item per guess.',
    '- "questions": what you cannot decide alone; empty when the request is clear.',
    "",
    "Rules:",
    "- Use ONLY the forms written in the language reference below; a form that is not written there is rejected.",
    "- Refer only to objects that exist in the stack summary below, or that the script itself creates.",
    "- Never invent fields, cards or buttons that are not listed.",
    "- If the sentence is ambiguous, ask questions instead of guessing silently.",
    "",
    "## The stack",
    request.stackSummary,
    "",
    "## The object",
    `The script will be attached to the ${request.objectKind} "${request.objectName}".`,
    "",
    "## Language reference (single source of truth)",
    options.languageReference,
  ].join("\n");
}

/** Premier message utilisateur : la phrase, puis le script en service. */
export function firstUserMessage(request: WriteScriptRequest): LlmMessage {
  const current = request.currentScript;
  const shown = current !== undefined && current.trim() !== "" ? current : "(none)";
  const text = [
    `Write the script for this request: ${request.phrase}`,
    "",
    "Current script of the object (empty if it has none):",
    shown,
  ].join("\n");
  return { role: "user", blocks: [{ type: "text", text }] };
}

/** Le message de réparation : le brouillon rejeté et la liste des problèmes. */
export function repairUserMessage(draft: string, problems: string): LlmMessage {
  const text = [
    "The draft below was rejected. Fix every listed problem and reply again with the same structured output.",
    "",
    "Problems:",
    problems,
    "",
    "Rejected draft:",
    draft,
  ].join("\n");
  return { role: "user", blocks: [{ type: "text", text }] };
}

/** Le rappel après des questions : répondre seul, puis produire le script. */
export function followupUserMessage(questions: string[]): LlmMessage {
  const text = [
    "You asked these questions:",
    questions.map((question) => `- ${question}`).join("\n"),
    "",
    "Answer them yourself from the stack summary and the language reference, state each " +
      'answer in "assumptions", and produce the best possible script now.',
    'Reply with the same structured output; leave "questions" empty.',
  ].join("\n");
  return { role: "user", blocks: [{ type: "text", text }] };
}
