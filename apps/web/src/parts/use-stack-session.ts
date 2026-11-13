/**
 * La séance de travail : quelle pile est ouverte, quel écran la montre, et ce
 * que le site dit d'un fichier refusé (O4, CAR-F-51).
 *
 * Tout le reste du site est une vue ; ce fichier tient les gestes qui
 * changent de pile — ouvrir un exemple, partir d'une pile vide, déposer ou
 * choisir un fichier, exporter — et l'enregistrement automatique qui suit
 * chaque transaction (CAR-F-07).
 *
 * Une pile reçue n'est jamais ouverte à moitié : elle est validée en bloc,
 * puis soit chargée endormie, soit refusée avec sa raison et gardée à part.
 */

import { useEffect, useState } from "react";
import { createStack } from "@cardwake/model";
import type { Stack } from "@cardwake/model";
import type { CardwakeEngine } from "../engine/types";
import { attachAutosave } from "../data/autosave";
import type { AutosaveStatus } from "../data/autosave";
import { isTrusted, keepRefusedStack, loadRefusedStack } from "../data/persist";
import type { PersistFault, SessionStart } from "../data/persist";
import type { StorageLike } from "../data/storage";
import { exportStack, exportText, readStackFile } from "../data/stack-file";
import { t } from "../i18n";
import type { Screen } from "../routes";

/** Une pile refusée, gardée en mémoire pour être dite et téléchargée. */
export type RefusedView = { fault: PersistFault; text: string };

/** Ce que la coquille du site reçoit pour dessiner et pour agir. */
export type StackSession = {
  screen: Screen;
  go: (screen: Screen) => void;
  /** La pile affichée est-elle celle reprise au démarrage ? */
  resumed: boolean;
  refused: RefusedView | null;
  dismissRefusal: () => void;
  status: AutosaveStatus;
  openNew: () => void;
  openDemo: (stack: Stack) => void;
  openFile: (file: File) => void;
  exportCurrent: () => void;
  /** Télécharge le fichier refusé, ou `null` s'il n'y a rien de gardé. */
  downloadRefused: (() => void) | null;
};

/** L'écran d'ouverture : la pile reprise, ou l'étagère. */
export function screenFor(engine: CardwakeEngine): Screen {
  const stack = engine.state();
  if (stack === null) return "shelf";
  return isTrusted(stack) ? "card" : "reception";
}

/** Le refus trouvé au démarrage : la raison, et le contenu gardé à part. */
function refusalFor(start: SessionStart, storage: StorageLike | null): RefusedView | null {
  if (start.kind !== "refused") return null;
  return { fault: start.fault, text: loadRefusedStack(storage) ?? "" };
}

/** Ouvre une pile ; une pile reçue et non fiable passe par la réception. */
function openStack(engine: CardwakeEngine, next: Stack, mode: "play" | "build"): void {
  engine.openStack(next);
  engine.setMode(isTrusted(next) ? mode : "build");
}

/** Le geste « télécharger le fichier refusé », ou `null` s'il n'y a rien. */
function downloader(refused: RefusedView | null): (() => void) | null {
  if (refused === null || refused.text === "") return null;
  return (): void => void exportText(refused.text, "refused-stack.json");
}

/** L'état de la dernière écriture automatique, branché sur le moteur. */
function useAutosave(engine: CardwakeEngine, storage: StorageLike | null): AutosaveStatus {
  const [status, setStatus] = useState<AutosaveStatus>({ kind: "saved" });
  useEffect(() => {
    const autosave = attachAutosave(engine, { storage, onStatus: setStatus });
    return autosave.detach;
  }, [engine, storage]);
  return status;
}

/** Ce qu'un import a le droit de changer dans la séance. */
type ImportTarget = {
  engine: CardwakeEngine;
  storage: StorageLike | null;
  show: (stack: Stack, mode: "play" | "build") => void;
  refuse: (view: RefusedView) => void;
};

/**
 * Le geste d'import : validation en bloc, refus entier avec sa raison, et le
 * fichier refusé gardé tel quel pour ne rien perdre.
 */
function importer(target: ImportTarget, file: File): void {
  void readStackFile(file).then((result) => {
    if (result.ok) {
      target.show(result.stack, "play");
      return;
    }
    keepRefusedStack(target.storage, result.text);
    target.refuse({ fault: { reason: result.reason, rule: "file-invalid" }, text: result.text });
  });
}

/**
 * La séance : l'état de l'écran, la pile, l'enregistrement automatique.
 * Le stockage passe par `storage` ; `null` veut dire que ce navigateur n'en
 * donne pas, et la barre du site le dit au lieu de faire semblant.
 */
export function useStackSession(options: {
  engine: CardwakeEngine;
  storage: StorageLike | null;
  start: SessionStart;
}): StackSession {
  const { engine, storage, start } = options;
  const [screen, setScreen] = useState<Screen>(() => screenFor(engine));
  // La mention « reprise au démarrage » ne vaut que pour la pile du
  // démarrage : dès qu'on en ouvre une autre, elle ne dit plus rien de vrai.
  const [resumed, setResumed] = useState(start.kind === "restored");
  const [refused, setRefused] = useState<RefusedView | null>(() => refusalFor(start, storage));
  const status = useAutosave(engine, storage);

  const show = (next: Stack, mode: "play" | "build"): void => {
    openStack(engine, next, mode);
    setResumed(false);
    setRefused(null);
    setScreen(screenFor(engine));
  };

  return {
    screen,
    go: setScreen,
    resumed,
    refused,
    dismissRefusal: () => setRefused(null),
    status,
    openNew: () => show(createStack(t("shelf.newStackName")), "build"),
    openDemo: (next: Stack) => show(next, "play"),
    openFile: (file: File) => importer({ engine, storage, show, refuse: setRefused }, file),
    exportCurrent: () => {
      const current = engine.state();
      if (current !== null) exportStack(current);
    },
    downloadRefused: downloader(refused),
  };
}
