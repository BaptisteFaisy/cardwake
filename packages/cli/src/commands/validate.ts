/**
 * `cardwake validate <pile>` : le fichier de pile, puis chaque script.
 *
 * Deux étages de contrôle, dans cet ordre :
 * 1. `parseStackFile` refuse un fichier invalide **en bloc** (CAR-P-18) : ses
 *    erreurs citent déjà le chemin JSON.
 * 2. Chaque script de la pile (pile, fonds, cartes, éléments) passe par
 *    `parseScript` ; une erreur est imprimée avec son chemin et sa ligne.
 *
 * Code de sortie : 0 si tout passe, 1 dès qu'une erreur est trouvée.
 */

import { parseScript } from "@cardwake/lang";
import type { ScriptError } from "@cardwake/lang";
import type { Stack } from "@cardwake/model";
import { readStack, type CliArgs, type CliIO } from "../args";

/** Une erreur localisée : le chemin JSON où la lire dans le fichier. */
export type Issue = { path: string; line: number | null; message: string };

/** Une erreur d'analyse, mise en ligne : `line 4 — message (try: …)`. */
function issueOf(path: string, error: ScriptError): Issue {
  const hint = error.hint ? ` (try: ${error.hint})` : "";
  return { path, line: error.line ?? null, message: `${error.message}${hint}` };
}

/** Tous les scripts d'une pile, avec le chemin JSON de chacun. */
function scriptsOf(stack: Stack): Array<[string, string]> {
  const scripts: Array<[string, string]> = [];
  if (stack.script !== "") scripts.push(["script", stack.script]);
  stack.backgrounds.forEach((background, i) => {
    if (background.script !== "") scripts.push([`backgrounds[${i}].script`, background.script]);
    background.parts.forEach((part, j) => {
      if (part.script !== "") scripts.push([`backgrounds[${i}].parts[${j}].script`, part.script]);
    });
  });
  stack.cards.forEach((card, i) => {
    if (card.script !== "") scripts.push([`cards[${i}].script`, card.script]);
    card.parts.forEach((part, j) => {
      if (part.script !== "") scripts.push([`cards[${i}].parts[${j}].script`, part.script]);
    });
  });
  return scripts;
}

/** Valide chaque script : une erreur d'analyse devient une `Issue`. */
export function scriptIssues(stack: Stack): Issue[] {
  const issues: Issue[] = [];
  for (const [path, source] of scriptsOf(stack)) {
    const parsed = parseScript(source);
    if (!parsed.ok) for (const error of parsed.errors) issues.push(issueOf(path, error));
  }
  return issues;
}

/** Une ligne d'erreur, telle que l'auteur la lit : chemin, ligne, message. */
export function issueLine(issue: Issue): string {
  const where = issue.line === null ? "" : `line ${issue.line} — `;
  return `${issue.path}: ${where}${issue.message}`;
}

/** La commande complète : lecture, schéma, scripts, impression. */
export function validateCommand(args: CliArgs, io: CliIO): number {
  const path = args.positionals[0];
  if (path === undefined) {
    io.err("validate: needs the path of a stack file");
    return 3;
  }
  const read = readStack(path);
  if (!read.ok) {
    if (args.json) io.out(JSON.stringify({ ok: false, file: path, errors: read.error.split("\n") }, null, 2));
    else for (const line of read.error.split("\n")) io.err(`${path}: ${line}`);
    return 1;
  }
  const issues = scriptIssues(read.stack);
  if (args.json) {
    io.out(JSON.stringify({ ok: issues.length === 0, file: path, errors: issues.map(issueLine) }, null, 2));
  } else if (issues.length === 0) {
    io.out(`${path}: ok (${read.stack.cards.length} cards, ${scriptsOf(read.stack).length} scripts checked)`);
  } else {
    for (const issue of issues) io.err(`${path}: ${issueLine(issue)}`);
  }
  return issues.length === 0 ? 0 : 1;
}
