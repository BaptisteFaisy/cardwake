/**
 * Sémantique des valeurs : dans Murmur, **tout est du texte** ; un texte qui a
 * la forme d'un nombre sert de nombre. Ce module est le seul endroit où cette
 * règle est appliquée, pour qu'aucun autre module n'invente la sienne.
 */

/** Constantes texte du langage : `return`, `tab`, `comma`, `space`, `quote`. */
export const TEXT_CONSTANTS: Record<string, string> = {
  return: "\n",
  linefeed: "\n",
  tab: "\t",
  comma: ",",
  space: " ",
  quote: '"',
};

const NUMBER_SHAPE = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Le texte a la forme d'un nombre (et sert donc de nombre). */
export function isNumberText(text: string): boolean {
  return NUMBER_SHAPE.test(text.trim());
}

/** Convertit un texte en nombre ; `null` si ce n'est pas un nombre. */
export function toNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!NUMBER_SHAPE.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Un texte qui n'est pas un nombre est une erreur de type, pas zéro. */
export function requireNumber(text: string): number {
  const value = toNumber(text);
  if (value === null) {
    throw new TypeError(`"${text.slice(0, 40)}" is not a number.`);
  }
  return value;
}

/**
 * Affichage d'un nombre : six décimales au plus, zéros de fin retirés.
 * C'est ce qui fait que `0.1 + 0.2` s'affiche `0.3` (CAR-P-21).
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return value > 0 ? "infinity" : value < 0 ? "-infinity" : "nan";
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
  const fixed = value.toFixed(6);
  const trimmed = fixed.replace(/0+$/, "").replace(/\.$/, "");
  // `toFixed` arrondit déjà ; on retire `-0` qui troublerait l'auteur.
  return trimmed === "-0" ? "0" : trimmed;
}

/** Arrondi à `digits` décimales ; `round(2.345, 2)` → `2.35`. */
export function round(value: number, digits = 0): number {
  const factor = 10 ** Math.max(0, Math.min(12, Math.trunc(digits)));
  return Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor;
}

/**
 * Un texte est vrai s'il n'est ni vide ni `false`. `0` est **vrai** : c'est la
 * règle de la famille d'origine, où seul le vide et `false` sont faux.
 */
export function truthy(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return trimmed !== "" && trimmed !== "false";
}

/** Comparaison numérique si les deux textes sont des nombres, lexicographique sinon. */
export function compareTexts(a: string, b: string): number {
  const left = toNumber(a);
  const right = toNumber(b);
  if (left !== null && right !== null) return left < right ? -1 : left > right ? 1 : 0;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function equalsTexts(a: string, b: string): boolean {
  const left = toNumber(a);
  const right = toNumber(b);
  if (left !== null && right !== null) return left === right;
  return a.toLowerCase() === b.toLowerCase();
}

/** `&` colle, `&&` ajoute une espace — sauf si l'un des deux côtés est vide. */
export function concat(left: string, right: string, withSpace: boolean): string {
  if (!withSpace) return left + right;
  if (left === "" || right === "") return left + right;
  return `${left} ${right}`;
}

/** Addition exacte de deux décimaux courts : `0.1 + 0.2` → `0.3` (CAR-P-21). */
export function addExact(left: number, right: number): number {
  const decimals = Math.max(decimalCount(left), decimalCount(right));
  const factor = 10 ** decimals;
  return (Math.round(left * factor) + Math.round(right * factor)) / factor;
}

function decimalCount(value: number): number {
  const text = String(value);
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : Math.min(6, text.length - dot - 1);
}

/** Somme d'une liste d'éléments séparés par des virgules. */
export function sumItems(text: string): number {
  return splitItems(text).reduce((total, item) => total + (toNumber(item) ?? 0), 0);
}

export function averageItems(text: string): number {
  const items = splitItems(text).filter((item) => toNumber(item) !== null);
  if (items.length === 0) return 0;
  return sumItems(items.join(",")) / items.length;
}

function splitItems(text: string): string[] {
  return text.split(",");
}
