/**
 * La pile est un fichier que tu possèdes (O4, CAR-F-07) : le site la garde
 * sur l'appareil, sans bouton « Enregistrer ».
 *
 * Ce module fait le lien entre la pile du moteur et le stockage du
 * navigateur. Il sérialise avec `serializeStack` (JSON canonique) et relit
 * avec `parseStackFile` (refus en bloc : une pile refusée n'est jamais
 * chargée à moitié). Le contenu du stockage est donc exactement le fichier
 * qu'on exporterait — ni clé, ni texte de modèle, ni compteur de session.
 *
 * Le refus est toujours motivé : une raison en anglais, et la règle qui
 * l'a produit, comme le fait le moteur pour ses propres refus.
 */

import { parseStackFile, serializeStack } from "@cardwake/model";
import type { Stack } from "@cardwake/model";
import type { CardwakeEngine } from "../engine/types";
import { readEntry, writeEntry } from "./storage";
import type { StorageFault, StorageLike } from "./storage";

/** L'entrée qui porte la pile en cours de travail : le fichier que tu possèdes. */
export const STACK_KEY = "cardwake.stack.v1";

/** L'entrée qui garde la dernière pile refusée, pour ne rien perdre. */
export const REFUSED_KEY = "cardwake.stack.refused.v1";

/** Un refus, avec la règle qui l'a motivé (même forme que celle du moteur). */
export type PersistFault = { reason: string; rule: string };

/** Le résultat d'une écriture : réussie, ou la raison du refus. */
export type SaveResult = { ok: true } | { ok: false; fault: PersistFault };

/** Le résultat d'une lecture : la pile, rien du tout, ou la raison du refus. */
export type LoadResult =
  | { ok: true; stack: Stack | null }
  | { ok: false; fault: PersistFault; text: string };

/** Ce que le démarrage a trouvé sur l'appareil. */
export type SessionStart =
  | { kind: "restored"; stack: Stack }
  | { kind: "empty" }
  | { kind: "refused"; fault: PersistFault };

/** La règle d'un refus de stockage : plein, ou indisponible. */
function ruleOf(fault: StorageFault): string {
  return fault.kind === "full" ? "storage-full" : "storage-unavailable";
}

/** Un refus de stockage, avec la règle qui l'a motivé. */
function faultOfStorage(fault: StorageFault): PersistFault {
  return { reason: fault.reason, rule: ruleOf(fault) };
}

/** Le texte canonique de la pile : le fichier qu'on exporte et qu'on garde. */
export function stackText(stack: Stack): string {
  return serializeStack(stack);
}

/** Écrit un texte de pile dans l'entrée de la pile en cours. */
export function saveStackText(storage: StorageLike | null, text: string): SaveResult {
  const written = writeEntry(storage, STACK_KEY, text);
  if (written.ok) return { ok: true };
  return { ok: false, fault: faultOfStorage(written.fault) };
}

/** Écrit la pile en cours : le contenu est exactement le fichier exportable. */
export function saveStack(storage: StorageLike | null, stack: Stack): SaveResult {
  return saveStackText(storage, stackText(stack));
}

/**
 * Relit la pile gardée. Un fichier illisible est refusé en bloc : le site
 * ne charge jamais une pile à moitié, et la raison est dite telle quelle.
 */
export function loadSavedStack(storage: StorageLike | null): LoadResult {
  const read = readEntry(storage, STACK_KEY);
  if (!read.ok) return { ok: false, fault: faultOfStorage(read.fault), text: "" };
  if (read.text === null) return { ok: true, stack: null };
  const parsed = parseStackFile(read.text);
  if (!parsed.ok) {
    return { ok: false, fault: { reason: parsed.errors.join(", "), rule: "file-invalid" }, text: read.text };
  }
  return { ok: true, stack: parsed.stack };
}

/**
 * Garde la pile refusée telle quelle. Rien n'est perdu : même en repartant
 * d'une pile vide, le contenu refusé reste lisible et téléchargeable.
 */
export function keepRefusedStack(storage: StorageLike | null, text: string): SaveResult {
  const written = writeEntry(storage, REFUSED_KEY, text);
  if (written.ok) return { ok: true };
  return { ok: false, fault: faultOfStorage(written.fault) };
}

/** Relit la pile refusée gardée, si elle l'est encore. */
export function loadRefusedStack(storage: StorageLike | null): string | null {
  const read = readEntry(storage, REFUSED_KEY);
  return read.ok ? read.text : null;
}

/**
 * Le démarrage : on reprend la pile de l'appareil, ou on dit pourquoi on ne
 * peut pas. Une pile reçue et non déclarée fiable s'ouvre endormie, comme
 * toute pile venue d'un fichier (CAR-F-52).
 *
 * Un stockage muet ne fait pas un « refus » : il n'y a simplement rien à
 * reprendre, et la barre de la pile le dit. Un contenu illisible, lui, est
 * refusé — et gardé à part pour ne rien perdre.
 */
export function startSession(engine: CardwakeEngine, storage: StorageLike | null): SessionStart {
  const loaded = loadSavedStack(storage);
  if (!loaded.ok) {
    if (loaded.fault.rule !== "file-invalid") return { kind: "empty" };
    keepRefusedStack(storage, loaded.text);
    return { kind: "refused", fault: loaded.fault };
  }
  if (loaded.stack === null) return { kind: "empty" };
  engine.openStack(loaded.stack);
  if (!isTrusted(loaded.stack)) engine.setMode("build");
  return { kind: "restored", stack: loaded.stack };
}

/** Une pile reçue et non déclarée fiable s'ouvre endormie, en mode Fabriquer. */
export function isTrusted(stack: Stack): boolean {
  return stack.provenance.kind !== "received" || stack.provenance.trusted;
}
