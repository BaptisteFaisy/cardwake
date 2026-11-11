/**
 * Le fichier de pile : une pile est un fichier que tu possèdes (O4).
 *
 * `serializeStack` produit un JSON **canonique** — clés triées à tous les
 * niveaux — pour que deux exports de la même pile soient octet pour octet
 * identiques (CAR-P-18) et pour que l'empreinte du mode enregistré soit stable.
 * Aucun compteur de session ni clé n'y figure (CAR-P-22) : le format ne prévoit
 * tout simplement pas de champ pour eux.
 */

import { APP_LIMITS } from "./limits";
import { validateStack } from "./schema";
import type { Stack } from "./types";

export type FileResult = { ok: true; stack: Stack } | { ok: false; errors: string[] };

/** JSON canonique : clés triées récursivement, tableaux dans leur ordre. */
export function canonicalJson(value: unknown, indent = 2): string {
  return JSON.stringify(sortKeys(value), null, indent);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) out[key] = sortKeys(source[key]);
    return out;
  }
  return value;
}

export function serializeStack(stack: Stack): string {
  return `${canonicalJson(stack)}\n`;
}

/** Relit un fichier : refuse en bloc, jamais de chargement partiel (CAR-P-18). */
export function parseStackFile(text: string): FileResult {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > APP_LIMITS.maxStackFileBytes) {
    return {
      ok: false,
      errors: [`the file is ${bytes} bytes, above the ${APP_LIMITS.maxStackFileBytes} byte limit`],
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["the file is not valid JSON"] };
  }
  return validateStack(json);
}

/** Exporter puis relire rend la même pile, à l'ordre des clés près. */
export function stackFileRoundTrip(stack: Stack): Stack {
  const parsed = parseStackFile(serializeStack(stack));
  return parsed.ok ? parsed.stack : stack;
}

/** Taille en octets d'une pile sérialisée, pour l'interface et les gardes. */
export function stackFileSize(stack: Stack): number {
  return new TextEncoder().encode(serializeStack(stack)).length;
}
