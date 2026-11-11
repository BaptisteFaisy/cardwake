/**
 * Fabrique d'erreurs Murmur.
 *
 * Une erreur porte toujours l'objet concerné quand il est identifiable, la
 * ligne, la colonne, une catégorie, un message en langage simple et une piste
 * (CAR-F-15). Jamais de trace technique : ce texte est lu par l'auteur.
 */

import type { ErrorCategory, Pos, ScriptError, Span } from "./ast";

/** Construit une erreur complète à partir d'un empan et d'un message. */
export function mkError(
  category: ErrorCategory,
  message: string,
  span?: Span,
  hint?: string,
  object?: string,
): ScriptError {
  return {
    category,
    message,
    hint,
    object,
    line: span?.start.line,
    col: span?.start.col,
    span,
  };
}

export function syntaxError(span: Span | undefined, message: string, hint?: string): ScriptError {
  return mkError("syntax", message, span, hint);
}

export function referenceError(span: Span | undefined, message: string, object?: string, hint?: string): ScriptError {
  return mkError("reference", message, span, hint, object);
}

export function typeError(span: Span | undefined, message: string, hint?: string): ScriptError {
  return mkError("type", message, span, hint);
}

export function limitError(message: string, hint?: string, span?: Span): ScriptError {
  return mkError("limit", message, span, hint);
}

export function permissionError(message: string, rule: string, span?: Span): ScriptError {
  return mkError("permission", `${message} (rule: ${rule})`, span, undefined, rule);
}

export function runtimeError(message: string, hint?: string, span?: Span, object?: string): ScriptError {
  return mkError("runtime", message, span, hint, object);
}

export function haltedError(reason: string, span?: Span): ScriptError {
  return mkError("halted", reason, span);
}

/** Position à partir d'une ligne et d'une colonne, pour les erreurs de lecture. */
export function pos(line: number, col: number, offset = 0): Pos {
  return { line, col, offset };
}

/** Formate une erreur pour l'affichage : `line 12, column 3 — message`. */
export function formatError(error: ScriptError): string {
  const where = error.line ? `line ${error.line}${error.col ? `, column ${error.col}` : ""}` : "this script";
  const object = error.object ? ` in ${error.object}` : "";
  const hint = error.hint ? ` Try: ${error.hint}` : "";
  return `${where}${object}: ${error.message}${hint}`;
}
