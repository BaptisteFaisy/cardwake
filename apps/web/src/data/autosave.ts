/**
 * L'enregistrement automatique (CAR-F-07) : la pile s'écrit après chaque
 * transaction validée. Il n'existe pas de commande « Enregistrer ».
 *
 * Le journal du moteur est la source de vérité : on n'écrit que sur les
 * événements qui portent une pile — une transaction validée, son annulation,
 * ou son rétablissement. Un refus n'écrit rien : une transaction refusée ne
 * laisse aucune trace (7.9).
 *
 * L'écriture est idempotente : si le texte canonique n'a pas changé, on
 * n'écrit pas. Une pile grosse ne coûte donc pas une écriture par événement.
 */

import type { CardwakeEngine, EngineEvent } from "../engine/types";
import type { Stack } from "@cardwake/model";
import { saveStackText, stackText } from "./persist";
import type { PersistFault } from "./persist";
import type { StorageLike } from "./storage";

/** Les événements qui portent une pile : la source de vérité de l'écriture. */
const STACK_EVENTS: ReadonlySet<EngineEvent["type"]> = new Set([
  "opened",
  "changed",
  "undone",
  "redone",
]);

/** L'état de la dernière écriture : le site l'affiche tel quel. */
export type AutosaveStatus = { kind: "saved" } | { kind: "fault"; fault: PersistFault };

/** Comment l'enregistrement automatique écrit. */
export type AutosaveOptions = {
  /** Le stockage de l'appareil : `null` quand il n'y en a pas. */
  storage: StorageLike | null;
  /** Appelé à chaque changement d'état : l'interface affiche la raison. */
  onStatus?: (status: AutosaveStatus) => void;
};

/** L'enregistrement automatique, et la main pour le détacher. */
export type Autosave = {
  /** L'état de la dernière écriture. */
  status: () => AutosaveStatus;
  /** Détache l'enregistrement automatique. */
  detach: () => void;
};

/** La pile portée par un événement, ou `null` si l'événement n'en porte pas. */
function stackOf(event: EngineEvent): Stack | null {
  switch (event.type) {
    case "opened":
    case "changed":
    case "undone":
    case "redone":
      return event.stack;
    default:
      return null;
  }
}

/**
 * Branche l'enregistrement automatique sur le moteur. Renvoie l'état de la
 * dernière écriture et la main pour tout détacher.
 */
export function attachAutosave(engine: CardwakeEngine, options: AutosaveOptions): Autosave {
  const { storage, onStatus } = options;
  let last: AutosaveStatus = { kind: "saved" };
  let lastText = "";

  const say = (status: AutosaveStatus): void => {
    last = status;
    if (onStatus) onStatus(status);
  };

  /** Écrit la pile, sans réécrire un texte identique au précédent. */
  const write = (stack: Stack): void => {
    const text = stackText(stack);
    if (text === lastText) return;
    const saved = saveStackText(storage, text);
    if (!saved.ok) {
      say({ kind: "fault", fault: saved.fault });
      return;
    }
    lastText = text;
    say({ kind: "saved" });
  };

  const unsubscribe = engine.subscribe((event) => {
    if (!STACK_EVENTS.has(event.type)) return;
    const stack = stackOf(event);
    if (stack !== null) write(stack);
  });

  return {
    status: () => last,
    detach: () => {
      unsubscribe();
    },
  };
}
