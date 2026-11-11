/**
 * Curseur de jetons et outils partagés par l'analyseur.
 *
 * L'analyse lève `ParseAbort` dès qu'une construction est invalide : le point
 * d'entrée `parseScript` attrape, note l'erreur, puis saute au début du bloc
 * suivant pour pouvoir signaler plusieurs erreurs d'un coup (CAR-F-16).
 */

import type { Pos, ScriptError, Span } from "../ast";
import type { Token } from "../lexer";

/** Interrompre l'analyse d'un bloc en emportant l'erreur lisible. */
export class ParseAbort extends Error {
  constructor(readonly error: ScriptError) {
    super(error.message);
    this.name = "ParseAbort";
  }
}

/** Fin de script atteinte : interruption normale, jamais une erreur affichée. */
export class EndOfScript extends Error {
  constructor() {
    super("end of script");
    this.name = "EndOfScript";
  }
}

const posOf = (token: Token): Pos => token.span.start;

export class Cursor {
  private index = 0;

  constructor(readonly tokens: Token[]) {}

  get position(): number {
    return this.index;
  }

  /** Recule le curseur (retour arrière borné, utilisé par les aiguillages). */
  rewind(position: number): void {
    this.index = position;
  }

  peek(offset = 0): Token {
    return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)];
  }

  next(): Token {
    const token = this.peek();
    if (token.kind !== "eof") this.index += 1;
    return token;
  }

  atEnd(): boolean {
    return this.peek().kind === "eof";
  }

  /** Le jeton courant est un mot égal à `word`, sans tenir compte de la casse. */
  isWord(word: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token.kind === "word" && token.text.toLowerCase() === word.toLowerCase();
  }

  /** Le jeton courant est l'opérateur `op`. */
  /** La suite de mots `words` est-elle présente, sans la consommer ? */
  isWords(...words: string[]): boolean {
    return words.every((word, index) => this.isWord(word, index));
  }

  isOp(op: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token.kind === "op" && token.text === op;
  }

  isKind(kind: Token["kind"], offset = 0): boolean {
    return this.peek(offset).kind === kind;
  }

  isNewline(offset = 0): boolean {
    return this.isKind("newline", offset);
  }

  /** Consomme le mot `word` s'il est là. */
  takeWord(word: string): boolean {
    if (!this.isWord(word)) return false;
    this.index += 1;
    return true;
  }

  /** Consomme la suite de mots `words` seulement si elle est présente entière. */
  takeWords(...words: string[]): boolean {
    const start = this.index;
    for (const word of words) {
      if (!this.isWord(word)) {
        this.index = start;
        return false;
      }
      this.index += 1;
    }
    return true;
  }

  takeOp(op: string): boolean {
    if (!this.isOp(op)) return false;
    this.index += 1;
    return true;
  }

  /** Consomme un saut de ligne ; échoue (ParseAbort) s'il n'y en a pas. */
  expectNewline(context: string): void {
    if (this.atEnd()) return;
    if (!this.isNewline()) throw this.abort(`Expected a new line after ${context}.`);
    this.index += 1;
  }

  skipNewlines(): void {
    while (this.isNewline()) this.index += 1;
  }

  /** Mot obligatoire : nom de handler, de variable, de propriété. */
  expectWord(context: string): Token {
    const token = this.peek();
    if (token.kind !== "word") {
      throw this.abort(`Expected ${context} here.`, token);
    }
    this.index += 1;
    return token;
  }

  expectString(context: string): Token {
    const token = this.peek();
    if (token.kind !== "string") {
      throw this.abort(`Expected ${context} in double quotes here.`, token);
    }
    this.index += 1;
    return token;
  }

  expectOp(op: string, context: string): Token {
    const token = this.peek();
    if (!this.isOp(op)) throw this.abort(`Expected "${op}" ${context}.`, token);
    this.index += 1;
    return token;
  }

  abort(message: string, token?: Token, hint?: string): ParseAbort {
    const at = token ?? this.peek();
    const error: ScriptError = {
      category: "syntax",
      message,
      hint,
      line: at.span.start.line,
      col: at.span.start.col,
      span: at.span,
    };
    return new ParseAbort(error);
  }

  spanFrom(start: Token): Span {
    const end = this.tokens[Math.max(this.index - 1, 0)];
    return { start: start.span.start, end: end.span.end };
  }

  spanAt(start: Token, end: Token): Span {
    return { start: start.span.start, end: end.span.end };
  }
}

/** Position de repli : début de la ligne du jeton courant. */
export function startOfLine(tokens: Token[], from: number): number {
  let i = Math.max(0, Math.min(from, tokens.length - 1));
  while (i > 0 && tokens[i - 1].kind !== "newline") i -= 1;
  return i;
}

/** Avance jusqu'au prochain début de bloc (`on`/`function`) ou la fin. */
export function skipToNextBlock(cursor: Cursor): void {
  while (!cursor.atEnd()) {
    const token = cursor.next();
    const isBlockStart =
      token.kind === "word" &&
      (token.text.toLowerCase() === "on" || token.text.toLowerCase() === "function") &&
      (token.span.start.col === 1 || cursor.tokens[cursor.position - 2]?.kind === "newline");
    if (isBlockStart) {
      cursor.rewind(cursor.position - 1);
      return;
    }
  }
}

export { posOf };
