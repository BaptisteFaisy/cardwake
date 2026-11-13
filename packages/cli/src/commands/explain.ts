/**
 * `cardwake explain script <pile> --object "Carte/Élément"` : la relecture
 * **ligne à ligne** d'un script (7.7). `paraphrase` lit le script d'un trait ;
 * `explain` rend le même texte, mais rattaché à la ligne qui le produit —
 * c'est ce qu'un auteur relit avant d'accepter un script proposé.
 *
 * Une seule relecture, jamais deux : les phrases des instructions viennent de
 * `paraphraseStmt` (la fonction sur laquelle `paraphraseScript` est bâtie), et
 * l'ouverture comme la clôture d'un bloc viennent de `paraphraseScript`
 * lui-même, découpé en paragraphes. Aucun gabarit de phrase n'est recopié ici.
 */

import { paraphraseScript, paraphraseStmt, parseScript } from "@cardwake/lang";
import type { Stmt } from "@cardwake/lang";
import { readStack, type CliArgs, type CliIO } from "../args";
import { resolveObject } from "./paraphrase";
import { issueLine } from "./validate";

/** Une ligne du script, et ce qu'elle fait en clair. */
export type ExplainedLine = { line: number; source: string; plain: string[] };

/** Un bloc du script : son corps, sa ligne d'ouverture, son paragraphe de relecture. */
type Block = { body: Stmt[]; startLine: number; paragraph: string[] };

/** `paraphraseScript` rend des paragraphes séparés par une ligne vide. */
function paragraphsOf(source: string): string[][] {
  const paragraphs: string[][] = [[]];
  for (const line of paraphraseScript(source)) {
    if (line === "") paragraphs.push([]);
    else paragraphs[paragraphs.length - 1].push(line);
  }
  return paragraphs;
}

/**
 * Les blocs du script, dans l'ordre du texte. `paraphraseScript` rend les
 * handlers puis les fonctions : le paragraphe est apparié avant le tri, pour
 * que l'ordre d'affichage ne dépende pas de l'ordre des paragraphes.
 */
function blocksOf(source: string, handlers: Body[], functions: Body[]): Block[] {
  const paragraphs = paragraphsOf(source);
  const paired = [
    ...handlers.map((item, index) => ({ ...item, paragraph: paragraphs[index] ?? [] })),
    ...functions.map((item, index) => ({ ...item, paragraph: paragraphs[handlers.length + index] ?? [] })),
  ];
  return paired.sort((left, right) => left.startLine - right.startLine);
}

/** Les instructions imbriquées : les deux seules formes qui portent un corps. */
function nested(stmt: Stmt): Stmt[] {
  if (stmt.kind === "if") return [...stmt.then, ...(stmt.otherwise ?? [])];
  if (stmt.kind === "repeat") return [...stmt.body];
  return [];
}

/** Les lignes des instructions d'un corps, corps imbriqués compris. */
function bodyLines(statements: Stmt[], source: string[]): ExplainedLine[] {
  const out: ExplainedLine[] = [];
  for (const stmt of statements) {
    const line = stmt.span.start.line;
    out.push({ line, source: source[line - 1] ?? "", plain: paraphraseStmt(stmt) });
    out.push(...bodyLines(nested(stmt), source));
  }
  return out;
}

/** Une instruction et son corps, d'où l'on tire les lignes. */
type Body = { body: Stmt[]; startLine: number };

/** La dernière ligne non vide d'un bloc : la ligne de sa clôture. */
function closingLine(starts: number[], index: number, source: string[]): number {
  const next = starts[index + 1];
  if (next !== undefined) return Math.max(next - 1, starts[index]);
  let last = source.length;
  while (last > starts[index] && (source[last - 1] ?? "").trim() === "") last -= 1;
  return last;
}

/**
 * Un bloc (handler ou fonction) : sa ligne d'ouverture, ses instructions, sa
 * clôture. Le paragraphe correspondant de `paraphraseScript` donne la phrase
 * d'ouverture et celle de clôture, dans le même ordre.
 */
function blockLines(block: Block, starts: number[], index: number, source: string[]): ExplainedLine[] {
  const end = closingLine(starts, index, source);
  const open = { line: block.startLine, source: source[block.startLine - 1] ?? "", plain: [block.paragraph[0] ?? ""] };
  const close = { line: end, source: source[end - 1] ?? "", plain: [block.paragraph[block.paragraph.length - 1] ?? ""] };
  return [open, ...bodyLines(block.body, source), close];
}

/** La relecture ligne à ligne d'un script : une entrée par ligne qui agit. */
export function explainScript(source: string): ExplainedLine[] | { errors: string[] } {
  const parsed = parseScript(source);
  if (!parsed.ok) {
    const path = { path: "script" };
    return { errors: parsed.errors.map((error) => issueLine({ ...path, line: error.line ?? null, message: error.message })) };
  }
  const lines = source.split("\n");
  const handlers = parsed.script.handlers.map((handler) => ({ body: handler.body, startLine: handler.span.start.line }));
  const functions = parsed.script.functions.map((fn) => ({ body: fn.body, startLine: fn.span.start.line }));
  const blocks = blocksOf(source, handlers, functions);
  const starts = blocks.map((block) => block.startLine);
  return blocks.flatMap((block, index) => blockLines(block, starts, index, lines));
}

/** Imprime la relecture : la ligne, puis ce qu'elle fait, en dessous. */
export function printExplanation(lines: ExplainedLine[], io: CliIO): void {
  for (const entry of lines) {
    io.out(`${String(entry.line).padStart(3)}  ${entry.source.trimEnd()}`);
    for (const plain of entry.plain) if (plain.trim() !== "") io.out(`     ${plain}`);
  }
}

export function explainCommand(args: CliArgs, io: CliIO): number {
  const path = args.positionals[0];
  if (args.sub !== "script" || path === undefined || args.object === null) {
    io.err('explain: needs "script", a stack file and --object "Card/Part"');
    return 3;
  }
  const read = readStack(path);
  if (!read.ok) {
    io.err(`explain: ${read.error}`);
    return 1;
  }
  const target = resolveObject(read.stack, args.object);
  if (typeof target === "string") {
    io.err(`explain: ${target}`);
    return 1;
  }
  if (target.script.trim() === "") {
    io.out(`the script of ${target.label} is empty`);
    return 0;
  }
  const explained = explainScript(target.script);
  if ("errors" in explained) {
    for (const error of explained.errors) io.err(`explain: ${error}`);
    return 1;
  }
  io.out(`-- ${target.label} --`);
  printExplanation(explained, io);
  return 0;
}
