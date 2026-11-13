/**
 * Le stockage du navigateur, vu par le site (frontière du DOM).
 *
 * Le site ne parle jamais à `window.localStorage` directement : il passe par
 * cette interface étroite, que les tests remplacent par un stockage qui
 * lève (navigation privée, quota atteint, cookies bloqués). Chaque échec
 * est rendu, jamais avalé : un stockage indisponible doit se dire, pas se
 * cacher derrière un silence qui fait croire que tout est enregistré.
 *
 * Ce que le stockage contient est décidé plus haut (voir `persist.ts`) :
 * des fichiers de pile, et rien d'autre — aucune clé, aucun texte de modèle.
 */

import { t } from "../i18n";

/** Ce que le site attend d'un stockage : trois opérations, rien de plus. */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/** Ce qui a empêché le stockage de répondre. */
export type StorageFault = {
  kind: "unavailable" | "full" | "unknown";
  /** Raison lisible, en anglais : elle s'affiche telle quelle. */
  reason: string;
};

/** Le résultat d'une lecture : le texte lu, ou la raison du refus. */
export type StorageRead = { ok: true; text: string | null } | { ok: false; fault: StorageFault };

/** Le résultat d'une écriture : réussie, ou la raison du refus. */
export type StorageWrite = { ok: true } | { ok: false; fault: StorageFault };

/** Le stockage du navigateur, ou `null` quand il n'y en a pas. */
export function browserStorage(): StorageLike | null {
  try {
    const candidate = (globalThis as { localStorage?: StorageLike }).localStorage;
    return candidate ?? null;
  } catch {
    // Certains navigateurs lèvent dès l'accès (cookies bloqués) : ce n'est
    // pas une panne du site, c'est une réponse à dire.
    return null;
  }
}

/**
 * Le nom de l'erreur, sans son message : un message d'erreur peut venir de
 * nulle part, et il ne doit pas finir affiché tel quel dans la page.
 */
function errorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && name !== "") return name;
  }
  return "Error";
}

/** Traduit une exception de stockage en raison lisible. */
function faultOf(error: unknown): StorageFault {
  const name = errorName(error);
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") {
    return { kind: "full", reason: t("state.storageFull") };
  }
  return { kind: "unavailable", reason: t("persist.storageError", { name }) };
}

/** La raison du refus quand il n'y a pas de stockage du tout. */
function noStorage(): StorageFault {
  return { kind: "unavailable", reason: t("persist.storageUnavailable") };
}

/** Lit une entrée : jamais d'exception, toujours un verdict. */
export function readEntry(storage: StorageLike | null, key: string): StorageRead {
  if (storage === null) return { ok: false, fault: noStorage() };
  try {
    return { ok: true, text: storage.getItem(key) };
  } catch (error) {
    return { ok: false, fault: faultOf(error) };
  }
}

/** Écrit une entrée : jamais d'exception, toujours un verdict. */
export function writeEntry(storage: StorageLike | null, key: string, value: string): StorageWrite {
  if (storage === null) return { ok: false, fault: noStorage() };
  try {
    storage.setItem(key, value);
    return { ok: true };
  } catch (error) {
    return { ok: false, fault: faultOf(error) };
  }
}
