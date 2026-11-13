/**
 * `cardwake paraphrase <pile> --object "Carte/Élément"` : la relecture en
 * clair d'un script (7.7). L'auteur lit des phrases, pas du code.
 *
 * Le module de relecture est écrit en parallèle (lot `paraphrase.ts` de
 * `@cardwake/lang`). Tant qu'il manque, on replie sur `printScript` (le texte
 * normalisé) avec un avertissement — le branchement final tient en une ligne :
 * dès que `paraphraseScript` est exporté par le paquet, il est utilisé.
 */

import * as lang from "@cardwake/lang";
import type { Script } from "@cardwake/lang";
import { byName, findBackground, findCard, findPart } from "@cardwake/model";
import type { Stack } from "@cardwake/model";
import { readStack, type CliArgs, type CliIO } from "../args";
import { issueLine } from "./validate";

/** L'objet retrouvé : son script et son chemin pour les messages. */
type Target = { label: string; script: string };

/** Retrouve l'objet désigné par `Carte` ou `Carte/Élément` (ou un fond). */
export function resolveObject(stack: Stack, object: string): Target | string {
  const [first, second] = object.split("/");
  const card = findCard(stack, byName(first));
  if (card && second === undefined) return { label: `card "${card.name}"`, script: card.script };
  if (card) {
    const found = findPart(stack, card.id, byName(second));
    if (!found) return `no part "${second}" on card "${card.name}"`;
    return { label: `${found.part.kind} "${found.part.name}" of card "${card.name}"`, script: found.part.script };
  }
  const background = findBackground(stack, byName(first));
  if (background && second === undefined) return { label: `background "${background.name}"`, script: background.script };
  if (background) {
    const part = background.parts.find((item) => item.name.toLowerCase() === second.toLowerCase());
    if (!part) return `no part "${second}" on background "${background.name}"`;
    return { label: `${part.kind} "${part.name}" of background "${background.name}"`, script: part.script };
  }
  return `no card or background named "${first}"`;
}

type ParaphraseFn = (source: string) => unknown;

/**
 * Le module de relecture s'il est livré. `paraphraseScript` prend la SOURCE du
 * script, pas l'arbre syntaxique : le passer à l'AST le faisait échouer et la
 * CLI tombait sur le repli alors que la relecture existait.
 */
function paraphraseModule(): ParaphraseFn | null {
  const candidate = (lang as unknown as Record<string, unknown>).paraphraseScript;
  return typeof candidate === "function" ? (candidate as ParaphraseFn) : null;
}

/** Met en lignes ce que rend la relecture : texte, liste, ou objet à lignes. */
function toLines(result: unknown): string[] | null {
  if (typeof result === "string") return result.split("\n");
  if (Array.isArray(result) && result.every((item) => typeof item === "string")) return result as string[];
  if (result && typeof result === "object" && Array.isArray((result as { lines?: unknown }).lines)) {
    return toLines((result as { lines: unknown }).lines);
  }
  return null;
}

/**
 * Relecture en clair d'un script, à partir de sa source. Repli sur le texte
 * normalisé si le module de relecture ne rend rien d'exploitable.
 */
export function plainLines(source: string, script: Script, io: CliIO): string[] {
  const paraphrase = paraphraseModule();
  if (paraphrase) {
    try {
      const lines = toLines(paraphrase(source));
      if (lines) return lines;
    } catch {
      /* repli : le module existe mais ne rend rien d'exploitable */
    }
  }
  io.out("-- paraphrase unavailable, printed the normalized script --");
  return lang.printScript(script).split("\n");
}

export function paraphraseCommand(args: CliArgs, io: CliIO): number {
  const path = args.positionals[0];
  const objectName = args.object;
  if (path === undefined || objectName === null) {
    io.err('paraphrase: needs a stack file and --object "Card/Part"');
    return 3;
  }
  const read = readStack(path);
  if (!read.ok) {
    io.err(`paraphrase: ${read.error}`);
    return 1;
  }
  const target = resolveObject(read.stack, objectName);
  if (typeof target === "string") {
    io.err(`paraphrase: ${target}`);
    return 1;
  }
  if (target.script.trim() === "") {
    io.out(`the script of ${target.label} is empty`);
    return 0;
  }
  const parsed = lang.parseScript(target.script);
  if (!parsed.ok) {
    for (const error of parsed.errors) io.err(`paraphrase: ${issueLine({ path: objectName, line: error.line ?? null, message: error.message })}`);
    return 1;
  }
  io.out(`-- ${target.label} --`);
  for (const line of plainLines(target.script, parsed.script, io)) io.out(line);
  return 0;
}
