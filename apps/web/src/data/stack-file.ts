/**
 * Le fichier de pile : ce qu'on lit, ce qu'on écrit (CAR-F-51).
 *
 * Un fichier de pile est un JSON `cardwake/1`. Il s'ouvre de deux façons :
 * le bouton « Open a file » de l'étagère, ou un glisser-déposer n'importe
 * où dans la page. Les deux passent par ici, donc le refus est le même : la
 * raison en clair, et jamais de chargement à moitié.
 *
 * L'export écrit le même texte que celui que le site garde sur l'appareil :
 * le format canonique de `serializeStack`. Deux exports de la même pile sont
 * donc identiques octet pour octet (CAR-P-18).
 */

import { parseStackFile, serializeStack } from "@cardwake/model";
import type { Stack } from "@cardwake/model";

/** Le résultat de la lecture d'un fichier : la pile, ou la raison du refus. */
export type FileRead =
  | { ok: true; stack: Stack; text: string }
  | { ok: false; reason: string; text: string };

/** Ce qu'il faut pour écrire un fichier sur l'appareil de l'utilisateur. */
export type DownloadIo = {
  /** Déclenche le téléchargement du texte donné, sous le nom donné. */
  save(text: string, filename: string): void;
};

/** L'écriture réelle : une ancre de téléchargement, puis on libère l'adresse. */
export function browserDownloadIo(): DownloadIo {
  return {
    save(text: string, filename: string): void {
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },
  };
}

/** Le nom du fichier : celui de la pile, lisible, sans caractère gênant. */
export function stackFileName(stack: Stack): string {
  const slug = stack.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug === "" ? "stack" : slug}.json`;
}

/** Le texte du fichier : le format canonique, celui qu'on exporte. */
export function stackFileText(stack: Stack): string {
  return serializeStack(stack);
}

/** Exporte la pile en un fichier, et rend le nom du fichier écrit. */
export function exportStack(stack: Stack, io: DownloadIo = browserDownloadIo()): string {
  return exportText(stackFileText(stack), stackFileName(stack), io);
}

/** Télécharge un texte tel quel : c'est ce qui garde un fichier refusé. */
export function exportText(text: string, filename: string, io: DownloadIo = browserDownloadIo()): string {
  io.save(text, filename);
  return filename;
}

/** Le texte d'un fichier, promis : la lecture ne lève jamais. */
export function readFileText(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => resolve("");
    reader.readAsText(file);
  });
}

/**
 * Lit le texte d'un fichier de pile. Un fichier invalide est refusé en bloc :
 * la pile refusée n'est jamais chargée à moitié, et la raison est dite telle
 * quelle (CAR-F-51).
 */
export function importStackText(text: string): FileRead {
  const parsed = parseStackFile(text);
  if (parsed.ok) return { ok: true, stack: parsed.stack, text };
  return { ok: false, reason: parsed.errors.join(", "), text };
}

/** Lit un fichier de pile, par le même chemin que le texte seul. */
export function readStackFile(file: File): Promise<FileRead> {
  return readFileText(file).then(importStackText);
}
