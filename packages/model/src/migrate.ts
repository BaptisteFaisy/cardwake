/**
 * Format versionné et migration (CAR-N-08).
 *
 * Une seule version existe aujourd'hui (`cardwake/1`). La table de migrations
 * est déjà en place : ajouter une version, c'est ajouter une entrée, et tout
 * fichier plus ancien remonte la chaîne jusqu'à la version courante. Un format
 * inconnu est refusé net — on n'ouvre pas une pile qu'on ne sait pas lire.
 */

import { validateStack, type Validation } from "./schema";
import type { StackFormat } from "./types";

export const CURRENT_FORMAT: StackFormat = "cardwake/1";

/** Une migration prend un JSON et rend un JSON de la version suivante. */
type Migration = (json: Record<string, unknown>) => Record<string, unknown>;

/** Chaîne de migrations, de la plus ancienne à la plus récente. */
const MIGRATIONS: Record<string, { next: StackFormat; run: Migration }> = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Migre puis valide. Ne lève jamais d'exception. */
export function migrateStack(json: unknown): Validation {
  if (!isRecord(json)) return { ok: false, errors: ["the file is not a JSON object"] };
  let current = json;
  let format = typeof current.format === "string" ? current.format : "";
  let hops = 0;
  while (format !== CURRENT_FORMAT && hops < 16) {
    const step = MIGRATIONS[format];
    if (!step) {
      return {
        ok: false,
        errors: [`unknown stack format "${format || "missing"}"; this build reads ${CURRENT_FORMAT}`],
      };
    }
    current = step.run(current);
    format = step.next;
    hops += 1;
  }
  if (format !== CURRENT_FORMAT) {
    return { ok: false, errors: ["too many migrations: the file looks damaged"] };
  }
  return validateStack(current);
}

/** Dit si un fichier aurait besoin d'une migration avant d'être lu. */
export function needsMigration(json: unknown): boolean {
  return isRecord(json) && json.format !== CURRENT_FORMAT;
}
