/**
 * Lexer Murmur : texte → jetons positionnés.
 *
 * Règles (7.3) : mots-clés insensibles à la casse (reconnus par l'analyseur),
 * une instruction par ligne donc les sauts de ligne sont des jetons,
 * commentaires après `--`, chaînes entre guillemets doubles avec `\"` et `\\`.
 */

import type { Pos, ScriptError, Span } from "./ast";
import { syntaxError } from "./errors";

export type TokenKind =
  | "word"
  | "number"
  | "string"
  | "op"
  | "lparen"
  | "rparen"
  | "comma"
  | "newline"
  | "eof";

export type Token = {
  kind: TokenKind;
  /** Texte brut tel qu'il apparaît dans la source (casse d'origine). */
  text: string;
  /** Valeur interprétée : nombre pour `number`, contenu décodé pour `string`. */
  value?: string | number;
  span: Span;
};

export type LexResult = { ok: true; tokens: Token[] } | { ok: false; errors: ScriptError[] };

const TWO_CHAR_OPS = ["&&", "<>", "<=", ">="];
const ONE_CHAR_OPS = ["+", "-", "*", "/", "^", "&", "=", "<", ">"];
const WORD_START = /[A-Za-z_]/;
const WORD_CHAR = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;

/** Décode le contenu d'une chaîne : `\"` → `"`, `\\` → `\`. */
function decodeString(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (char !== "\\" || i + 1 >= raw.length) {
      out += char;
      continue;
    }
    const next = raw[i + 1];
    out += next === "n" ? "\n" : next === "t" ? "\t" : next;
    i += 1;
  }
  return out;
}

class Scanner {
  line = 1;
  col = 1;
  offset = 0;
  readonly errors: ScriptError[] = [];
  readonly tokens: Token[] = [];

  constructor(readonly source: string) {}

  get done(): boolean {
    return this.offset >= this.source.length;
  }

  char(ahead = 0): string {
    return this.source[this.offset + ahead] ?? "";
  }

  here(): Pos {
    return { line: this.line, col: this.col, offset: this.offset };
  }

  advance(count = 1): void {
    for (let i = 0; i < count && !this.done; i += 1) {
      if (this.source[this.offset] === "\n") {
        this.line += 1;
        this.col = 1;
      } else {
        this.col += 1;
      }
      this.offset += 1;
    }
  }

  push(kind: TokenKind, text: string, start: Pos, value?: string | number): void {
    this.tokens.push({ kind, text, value, span: { start, end: this.here() } });
  }

  fail(message: string, start: Pos, hint?: string): void {
    this.errors.push(syntaxError({ start, end: this.here() }, message, hint));
  }
}

function scanString(s: Scanner): void {
  const start = s.here();
  s.advance(); // guillemet ouvrant
  let raw = "";
  for (;;) {
    if (s.done || s.char() === "\n") {
      s.fail("This text is missing its closing double quote.", start, 'Close it: "hello"');
      return;
    }
    if (s.char() === "\\" && !s.done) {
      raw += s.char() + s.char(1);
      s.advance(2);
      continue;
    }
    if (s.char() === '"') {
      s.advance();
      s.push("string", `"${raw}"`, start, decodeString(raw));
      return;
    }
    raw += s.char();
    s.advance();
  }
}

function scanNumber(s: Scanner): void {
  const start = s.here();
  let text = "";
  while (!s.done && (DIGIT.test(s.char()) || (s.char() === "." && DIGIT.test(s.char(1))))) {
    text += s.char();
    s.advance();
  }
  s.push("number", text, start, Number(text));
}

function scanWord(s: Scanner): void {
  const start = s.here();
  let text = "";
  while (!s.done && WORD_CHAR.test(s.char())) {
    text += s.char();
    s.advance();
  }
  s.push("word", text, start);
}

function scanOperator(s: Scanner): void {
  const start = s.here();
  const two = s.source.slice(s.offset, s.offset + 2);
  if (TWO_CHAR_OPS.includes(two)) {
    s.advance(2);
    s.push("op", two, start);
    return;
  }
  const one = s.char();
  if (ONE_CHAR_OPS.includes(one)) {
    s.advance();
    s.push("op", one, start);
    return;
  }
  s.fail(`Unexpected character "${one}".`, start);
  s.advance();
}

/** Un seul jeton `newline` pour une suite de sauts de ligne : l'analyseur s'y retrouve. */
function pushNewline(s: Scanner): void {
  const start = s.here();
  while (!s.done && (s.char() === "\n" || s.char() === "\r")) s.advance();
  const last = s.tokens[s.tokens.length - 1];
  if (last && last.kind === "newline") return;
  s.push("newline", "\n", start);
}

/** Lexe un script complet. Rend toujours : soit des jetons, soit des erreurs. */
export function lex(source: string): LexResult {
  const s = new Scanner(source);
  while (!s.done) {
    const char = s.char();
    if (char === " " || char === "\t") {
      s.advance();
      continue;
    }
    if (char === "\n" || char === "\r") {
      pushNewline(s);
      continue;
    }
    if (char === "-" && s.char(1) === "-") {
      while (!s.done && s.char() !== "\n") s.advance();
      continue;
    }
    if (char === '"') {
      scanString(s);
      continue;
    }
    if (DIGIT.test(char)) {
      scanNumber(s);
      continue;
    }
    if (WORD_START.test(char)) {
      scanWord(s);
      continue;
    }
    if (char === "(" || char === ")" || char === ",") {
      const start = s.here();
      s.advance();
      const kind = char === "(" ? "lparen" : char === ")" ? "rparen" : "comma";
      s.push(kind, char, start);
      continue;
    }
    scanOperator(s);
  }
  const end = s.here();
  s.tokens.push({ kind: "eof", text: "", span: { start: end, end } });
  if (s.errors.length > 0) return { ok: false, errors: s.errors };
  return { ok: true, tokens: s.tokens };
}

/** Texte d'un jeton, pour les messages d'erreur. */
export function describeToken(token: Token): string {
  if (token.kind === "eof") return "the end of the script";
  if (token.kind === "newline") return "the end of the line";
  return `"${token.text}"`;
}
