/**
 * L'atelier de script du site (7.7, 12.1) : la chaîne « phrase → brouillon »,
 * et rien de plus.
 *
 * La chaîne elle-même est celle de `@cardwake/agent` (`writeScript`) : un seul
 * appel au modèle, les contrôles sans exécution, la relecture en clair, l'essai
 * à blanc sur une copie de la pile. Ce module ne la réécrit pas : il apporte ce
 * que l'écran ajoute — le résumé de la carte visée pour le modèle, le diff avec
 * le script en place, et le refus honnête quand il n'y a pas de modèle à
 * joindre.
 *
 * Trois défenses précèdent l'installation, et l'installation n'appartient qu'à
 * l'humain : `proposeScript` rend un brouillon, `acceptDraft` est le seul
 * chemin qui installe (CAR-F-25). Refuser, c'est jeter le brouillon.
 *
 * La référence du langage est `docs/language.md`, importée telle quelle : la
 * même source pour le modèle et pour l'auteur qui relit (7.7).
 */

import { buildCardView, writeScript } from "@cardwake/agent";
import type { LlmGateway, WriteScriptResult } from "@cardwake/agent";
import { clampSettings } from "@cardwake/model";
import type { Card, Part, Stack } from "@cardwake/model";
import reference from "../../../../docs/language.md?raw";

/** Une ligne du diff : identique, retirée du script en place, ou ajoutée. */
export type DiffLine = { kind: "same" | "removed" | "added"; text: string };

/** Pourquoi il n'y a pas de brouillon : le cas que l'écran doit savoir dire. */
export type DraftFailure = "none" | "no-gateway" | "no-recording" | "model";

/** Un brouillon et ses trois défenses. Rien de tout cela n'est installé. */
export type ScriptDraft = {
  /** `draft` : accepté ou refusé ; `questions` : le modèle demande ;
   * `failed` : rien d'utilisable, `problem` dit pourquoi. */
  status: "draft" | "questions" | "failed";
  /** Le script proposé ; vide hors `draft`. */
  script: string;
  summary: string;
  assumptions: string[];
  questions: string[];
  /** Première défense : la relecture en clair, phrase par phrase. */
  readback: string[];
  /** Seconde défense : l'essai à blanc, et son erreur s'il y en a une. */
  dryRun: { lines: string[]; error: string | null };
  /** Troisième défense : le diff avec le script en place. */
  diff: DiffLine[];
  failure: DraftFailure;
  /** Le message du modèle ou de la passerelle, quand il y en a un. */
  problem: string;
};

/** Ce que l'écran fournit pour demander un brouillon. */
export type ProposeRequest = {
  /** La phrase de l'auteur, en clair. */
  phrase: string;
  stack: Stack;
  card: Card;
  /** L'élément dont on écrit le script. */
  part: Part;
  /** La passerelle du moment ; `null` quand cette page n'en a aucune. */
  gateway: LlmGateway | null;
};

/** Les lignes d'un script : le texte découpé, sans la dernière ligne vide. */
export function linesOf(script: string): string[] {
  const lines = script.split("\n");
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  return lines;
}

/** La table des plus longues sous-suites communes, remplie par le bas. */
function lcsTable(before: string[], after: string[]): number[][] {
  const table: number[][] = [];
  for (let row = 0; row <= before.length; row += 1) {
    table.push(new Array<number>(after.length + 1).fill(0));
  }
  for (let row = before.length - 1; row >= 0; row -= 1) {
    for (let column = after.length - 1; column >= 0; column -= 1) {
      table[row][column] =
        before[row] === after[column]
          ? table[row + 1][column + 1] + 1
          : Math.max(table[row + 1][column], table[row][column + 1]);
    }
  }
  return table;
}

/**
 * Le diff ligne à ligne de deux scripts : ce qui reste, ce qui part, ce qui
 * arrive. Une seule implémentation, l'écran s'en sert pour la troisième
 * défense ; aucun exécution, seulement du texte comparé.
 */
export function diffLines(before: string[], after: string[]): DiffLine[] {
  const table = lcsTable(before, after);
  const lines: DiffLine[] = [];
  let row = 0;
  let column = 0;
  while (row < before.length && column < after.length) {
    if (before[row] === after[column]) {
      lines.push({ kind: "same", text: before[row] });
      row += 1;
      column += 1;
    } else if (table[row + 1][column] >= table[row][column + 1]) {
      lines.push({ kind: "removed", text: before[row] });
      row += 1;
    } else {
      lines.push({ kind: "added", text: after[column] });
      column += 1;
    }
  }
  while (row < before.length) {
    lines.push({ kind: "removed", text: before[row] });
    row += 1;
  }
  while (column < after.length) {
    lines.push({ kind: "added", text: after[column] });
    column += 1;
  }
  return lines;
}

/**
 * La carte telle que le rédacteur doit la voir : son nom, ses éléments, leurs
 * textes, et l'élément visé. C'est la vue canonique des agents (`buildCardView`),
 * remise en une phrase : le modèle ne peut pas inventer un champ absent d'ici.
 */
function cardSummaryOf(stack: Stack, card: Card, part: Part): string {
  const view = buildCardView(stack, card.id, clampSettings(stack.settings));
  const fields = view.fields.map((field) => {
    const content = field.text.trim() === "" ? "empty" : JSON.stringify(field.text);
    return `field "${field.name}" (${content}${field.locked ? ", locked" : ""})`;
  });
  const buttons = view.buttons.map((button) => `button "${button.name}" (label "${button.label}")`);
  const carries = [...fields, ...buttons].join(", ");
  return [
    `Stack "${view.stackName}". Card "${view.cardName}", agent level ${view.level}.`,
    `The card carries ${carries === "" ? "nothing" : carries}.`,
    `Other cards: ${view.otherCards.join(", ") || "none"}.`,
    `The script will be attached to the ${part.kind} "${part.name}".`,
  ].join("\n");
}

/** Un brouillon vide : le cas d'échec, avec de quoi le dire à l'écran. */
function failedDraft(failure: DraftFailure, problem: string): ScriptDraft {
  return {
    status: "failed",
    script: "",
    summary: "",
    assumptions: [],
    questions: [],
    readback: [],
    dryRun: { lines: [], error: null },
    diff: [],
    failure,
    problem,
  };
}

/** Les messages des contrôles, en une ligne : ce que le modèle a raté. */
function problemOf(result: WriteScriptResult): string {
  return result.issues.map((item) => item.message).join(" ");
}

/** La sorte d'échec : une réponse enregistrée manquante se dit à part. */
function failureOf(result: WriteScriptResult): DraftFailure {
  return result.issues.some((item) => item.rule === "cassette-miss") ? "no-recording" : "model";
}

/** Un résultat de `writeScript` traduit pour l'écran, trois défenses comprises. */
function draftOf(result: WriteScriptResult, current: string): ScriptDraft {
  if (result.status !== "draft" || result.script === undefined) {
    return {
      ...failedDraft(result.status === "questions" ? "none" : failureOf(result), problemOf(result)),
      status: result.status,
      summary: result.summary ?? "",
      assumptions: result.assumptions,
      questions: result.questions,
    };
  }
  return {
    status: "draft",
    script: result.script,
    summary: result.summary ?? "",
    assumptions: result.assumptions,
    questions: result.questions,
    readback: result.paraphrase,
    dryRun: { lines: result.dryRun?.changes ?? [], error: result.dryRun?.error ?? null },
    diff: diffLines(linesOf(current), linesOf(result.script)),
    failure: "none",
    problem: "",
  };
}

/**
 * Demande un brouillon : la phrase, la carte, l'élément, et la référence du
 * langage. Aucune exception ne sort ; sans passerelle, l'écran reçoit un échec
 * honnête plutôt qu'une promesse.
 */
export async function proposeScript(request: ProposeRequest): Promise<ScriptDraft> {
  if (request.gateway === null) {
    return failedDraft("no-gateway", "No model gateway is available for this stack.");
  }
  const result = await writeScript(
    {
      phrase: request.phrase,
      objectKind: "part",
      objectName: request.part.name,
      stackSummary: cardSummaryOf(request.stack, request.card, request.part),
      currentScript: request.part.script,
    },
    request.gateway,
    { languageReference: reference, stack: request.stack, cardId: request.card.id },
  );
  return draftOf(result, request.part.script);
}

/**
 * Le seul geste qui installe : accepter un brouillon. Un brouillon en
 * questions, un échec, ou rien, n'installent jamais rien.
 */
export function acceptDraft(draft: ScriptDraft | null, install: (script: string) => void): boolean {
  if (draft === null || draft.status !== "draft" || draft.script.trim() === "") return false;
  install(draft.script);
  return true;
}