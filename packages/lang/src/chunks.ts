/**
 * Les morceaux de texte : `char`, `word`, `item` (séparé par virgules) et
 * `line`, en lecture **et** en écriture. C'est la marque de fabrique de la
 * famille : `put "payé" into word 2 of line 3 of field "Suivi"`.
 *
 * Le découpage conserve les séparateurs, donc recoller les morceaux redonne
 * exactement le texte de départ — c'est ce qui rend CAR-P-05 vérifiable.
 */

import type { ChunkType } from "./ast";

/**
 * Un morceau, le séparateur qui le suit et, pour les mots, les blancs qui le
 * précèdent. Conserver les trois fait que recoller les morceaux redonne le
 * texte de départ au caractère près.
 */
type Piece = { pre?: string; text: string; sep: string };

export type Bounds = { start: number; end: number };

const SEPARATORS: Record<ChunkType, string> = { char: "", word: " ", item: ",", line: "\n" };

/** Découpe en morceaux en conservant les séparateurs d'origine. */
export function splitPieces(text: string, type: ChunkType): Piece[] {
  if (type === "word") return splitWords(text);
  if (type === "char") return [...text].map((char) => ({ text: char, sep: "" }));
  const separator = SEPARATORS[type];
  const parts = text.split(separator);
  return parts.map((part, index) => ({
    text: part,
    sep: index < parts.length - 1 ? separator : "",
  }));
}

/**
 * Les mots sont les suites de caractères non blancs. Les blancs qui précèdent
 * un mot sont conservés dans `pre`, ceux qui suivent le dernier mot dans `sep`,
 * donc aucun blanc n'est perdu. Un texte qui ne contient que des blancs n'a
 * aucun morceau : c'est le comportement attendu de `the number of words`.
 */
function splitWords(text: string): Piece[] {
  const pieces: Piece[] = [];
  const pattern = /\S+/g;
  let lastEnd = 0;
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match !== null) {
    pieces.push({ pre: text.slice(lastEnd, match.index), text: match[0], sep: "" });
    lastEnd = match.index + match[0].length;
    match = pattern.exec(text);
  }
  if (pieces.length > 0 && lastEnd < text.length) {
    pieces[pieces.length - 1].sep = text.slice(lastEnd);
  }
  return pieces;
}

export function joinPieces(pieces: Piece[]): string {
  return pieces.map((piece) => (piece.pre ?? "") + piece.text + piece.sep).join("");
}

/** Nombre de morceaux d'un texte, pour les compteurs `the number of …`. */
export function countChunks(text: string, type: ChunkType): number {
  if (text === "") return 0;
  return splitPieces(text, type).length;
}

export function splitChunk(text: string, type: ChunkType): string[] {
  return splitPieces(text, type).map((piece) => piece.text);
}

export function joinChunk(parts: string[], type: ChunkType): string {
  return parts.join(SEPARATORS[type] || "");
}

/**
 * Résout des bornes 1-based en indices de tableau. Une borne négative compte
 * depuis la fin (`-1` = dernier morceau). Rend `null` si la plage est vide ou
 * entièrement hors du texte.
 */
export function resolveBounds(total: number, ordinal?: number, from?: number, to?: number): Bounds | null {
  if (total <= 0) return null;
  const resolve = (value: number): number => (value < 0 ? total + value + 1 : value);
  if (ordinal !== undefined) {
    const index = resolve(ordinal);
    if (index < 1 || index > total) return null;
    return { start: index - 1, end: index - 1 };
  }
  if (from === undefined || to === undefined) return null;
  const start = resolve(from);
  const end = resolve(to);
  if (end < start) return null;
  const clampedStart = Math.max(1, start) - 1;
  const clampedEnd = Math.min(total, end) - 1;
  if (clampedEnd < clampedStart) return null;
  return { start: clampedStart, end: clampedEnd };
}

/** Lit un morceau (ou une plage) ; texte vide si la plage est hors du texte. */
export function readChunk(
  text: string,
  type: ChunkType,
  ordinal?: number,
  from?: number,
  to?: number,
): string {
  const pieces = splitPieces(text, type);
  const bounds = resolveBounds(pieces.length, ordinal, from, to);
  if (bounds === null) return "";
  const slice = pieces.slice(bounds.start, bounds.end + 1);
  if (slice.length === 0) return "";
  const last = slice[slice.length - 1];
  return joinPieces(slice.slice(0, -1)) + last.text;
}

/**
 * Écrit dans un morceau. `replace` substitue la plage, `before` insère au début
 * du premier morceau désigné, `after` à la fin du dernier. Une plage hors du
 * texte ajoute à la fin, ce qui évite de perdre une écriture de l'auteur.
 */
export function writeChunk(
  text: string,
  type: ChunkType,
  value: string,
  mode: "replace" | "before" | "after",
  ordinal?: number,
  from?: number,
  to?: number,
): string {
  const pieces = splitPieces(text, type);
  const bounds = resolveBounds(pieces.length, ordinal, from, to);
  if (bounds === null) return appendChunk(pieces, value, type);
  if (mode === "before") {
    const target = pieces[bounds.start];
    pieces[bounds.start] = { ...target, text: value + target.text };
    return joinPieces(pieces);
  }
  if (mode === "after") {
    const target = pieces[bounds.end];
    pieces[bounds.end] = { ...target, text: target.text + value };
    return joinPieces(pieces);
  }
  const replaced: Piece = { pre: pieces[bounds.start].pre, text: value, sep: pieces[bounds.end].sep };
  pieces.splice(bounds.start, bounds.end - bounds.start + 1, replaced);
  return joinPieces(pieces);
}

/** Ajout en fin de texte, avec le séparateur du type de morceau. */
function appendChunk(pieces: Piece[], value: string, type: ChunkType): string {
  if (pieces.length === 0) return value;
  const last = pieces[pieces.length - 1];
  const separator = last.sep === "" ? SEPARATORS[type] : last.sep;
  pieces[pieces.length - 1] = { ...last, sep: separator };
  pieces.push({ text: value, sep: "" });
  return joinPieces(pieces);
}
