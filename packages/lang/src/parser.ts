/**
 * Point d'entrée de l'analyse : texte → `Script`.
 *
 * Contrat (CAR-P-02) : pour tout texte, l'analyse se termine et rend soit un
 * arbre, soit des erreurs dont la position est dans le texte. Jamais les deux :
 * un script qui ne s'analyse pas ne remplace pas le script en service
 * (CAR-F-16).
 */

import type { FunctionDef, Handler, ParseResult, Script, ScriptError, Stmt } from "./ast";
import { lex } from "./lexer";
import { Cursor, ParseAbort, skipToNextBlock } from "./parsing/cursor";
import { parseBlock } from "./parsing/statements";
import { parseExpression } from "./parsing/expressions";
import type { Expr } from "./ast";

const MAX_SCRIPT_ERRORS = 8;

/**
 * Fin d'un bloc : `end <nom>`, ou un `end` seul sur sa ligne. Un `end if` ou
 * un `end repeat` ne ferme jamais le handler — d'où le test du saut de ligne.
 */
function blockEnd(c: Cursor, name: string) {
  return (): boolean => c.isWords("end", name) || (c.isWord("end") && c.isNewline(1));
}

function parseParams(c: Cursor): string[] {
  const params: string[] = [];
  while (!c.isNewline() && !c.atEnd()) {
    params.push(c.expectWord("a parameter name").text);
    if (c.peek().kind === "comma") c.next();
  }
  return params;
}

function consumeEnd(c: Cursor, name: string): void {
  if (!c.takeWord("end")) {
    throw c.abort(`Expected "end ${name}" to close this block.`, c.peek(), `Every block closes with "end ${name}".`);
  }
  if (c.isWord(name)) c.next();
}

function parseHandler(c: Cursor): Handler {
  const start = c.next(); // "on"
  const name = c.expectWord("a message name").text;
  const params = parseParams(c);
  c.expectNewline(`the handler header "on ${name}"`);
  c.skipNewlines();
  const body = parseBlock(c, blockEnd(c, name));
  consumeEnd(c, name);
  return { name, params, body, span: { start: start.span.start, end: c.peek().span.start } };
}

function parseFunction(c: Cursor): FunctionDef {
  const start = c.next(); // "function"
  const name = c.expectWord("a function name").text;
  const params = parseParams(c);
  c.expectNewline(`the function header "function ${name}"`);
  c.skipNewlines();
  const body = parseBlock(c, blockEnd(c, name));
  consumeEnd(c, name);
  return { name, params, body, span: { start: start.span.start, end: c.peek().span.start } };
}

/** Analyse un script complet : handlers et fonctions, dans l'ordre du texte. */
export function parseScript(source: string): ParseResult {
  const lexed = lex(source);
  if (!lexed.ok) return { ok: false, errors: lexed.errors };
  const c = new Cursor(lexed.tokens);
  const script: Script = { handlers: [], functions: [] };
  const errors: ScriptError[] = [];
  try {
    c.skipNewlines();
    while (!c.atEnd() && errors.length < MAX_SCRIPT_ERRORS) {
      try {
        if (c.isWord("on")) script.handlers.push(parseHandler(c));
        else if (c.isWord("function")) script.functions.push(parseFunction(c));
        else {
          throw c.abort(
            "Expected a handler (\"on …\") or a function (\"function …\") here.",
            c.peek(),
            'A script is a list of blocks: on mouseUp … end mouseUp.',
          );
        }
      } catch (inner) {
        if (!(inner instanceof ParseAbort)) throw inner;
        errors.push(inner.error);
        if (c.atEnd()) break;
        c.next();
        skipToNextBlock(c);
      }
      c.skipNewlines();
    }
  } catch (outer) {
    if (outer instanceof ParseAbort) errors.push(outer.error);
    else throw outer;
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, script };
}

/** Analyse d'une seule expression, pour l'éditeur et les contrôles. */
export function parseExpressionText(source: string): { ok: true; expr: Expr } | ParseResult {
  const lexed = lex(source);
  if (!lexed.ok) return { ok: false, errors: lexed.errors };
  const c = new Cursor(lexed.tokens);
  try {
    const expr = parseExpression(c);
    if (!c.atEnd()) throw c.abort("Unexpected text after the expression.");
    return { ok: true, expr };
  } catch (error) {
    if (error instanceof ParseAbort) return { ok: false, errors: [error.error] };
    throw error;
  }
}

/** Analyse d'une liste d'instructions sans handler, pour l'essai à blanc. */
export function parseStatements(source: string): { ok: true; statements: Stmt[] } | ParseResult {
  const lexed = lex(source);
  if (!lexed.ok) return { ok: false, errors: lexed.errors };
  const c = new Cursor(lexed.tokens);
  try {
    const statements = parseBlock(c, () => false);
    if (!c.atEnd()) throw c.abort("Unexpected text after the last command.");
    return { ok: true, statements };
  } catch (error) {
    if (error instanceof ParseAbort) return { ok: false, errors: [error.error] };
    throw error;
  }
}
