/**
 * Le contrat public du moteur du site : la barre de discussion en plus du
 * contrat figé, et le moyen d'attendre la fin d'une action asynchrone.
 *
 * Ces deux éléments vivent à part du moteur lui-même : le moteur garde ainsi
 * sa place sous la limite de taille du dépôt, et les écrans ont un seul
 * endroit où regarder.
 */

import type { CardwakeEngine } from "./types";

/** Le moteur réel : le contrat figé, plus la barre de discussion. */
export type ModelEngineApi = CardwakeEngine & {
  /** Parle à l'agent de la carte affichée (asynchrone en interne). */
  chat(text: string): void;
};

/**
 * Attend la fin d'une action asynchrone : le moteur émet `changed` quand le
 * dispatch est réglé. À appeler AVANT l'action. Un seul exemplaire : les
 * tests et les preuves du site attendent de la même façon.
 */
export function settled(engine: CardwakeEngine): Promise<void> {
  return new Promise((resolve) => {
    const off = engine.subscribe((event) => {
      if (event.type === "changed") {
        off();
        resolve();
      }
    });
  });
}
