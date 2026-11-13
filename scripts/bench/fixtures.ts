/**
 * Jeux d'essai du banc, construits **par programme** avec les fabriques de
 * `@cardwake/model` : aucune pile figée dans un fichier JSON, aucun hasard.
 *
 * Trois jeux, un par cible du cahier des charges :
 * - une pile de 100 cartes (ouverture de pile, changement de carte) ;
 * - un script Murmur de 200 lignes exactement (analyse) ;
 * - un script de calcul en boucle (débit d'étapes de l'interpréteur).
 *
 * Une quatrième fabrique prépare la carte qui réagit à un clic (CAR-N-05).
 */

import {
  createBackground,
  createButton,
  createCard,
  createField,
  createStack,
} from "@cardwake/model";
import type { Stack } from "@cardwake/model";

/** Graine du banc : fixe, écrite dans le rapport, jamais tirée au hasard. */
export const SEED = 2026_11_13;

/** Cartes de la grosse pile : le cahier parle de « 100 cartes » (CAR-N-04). */
export const CARD_COUNT = 100;

/** Lignes du script d'analyse : le cahier parle de « 200 lignes » (CAR-N-04). */
export const SCRIPT_LINES = 200;

/** Une pile de 100 cartes : un fond commun, un champ et un bouton par carte. */
export function stackOf100(): Stack {
  let stack = createStack("Bench 100 cards");
  const background = createBackground(stack, "Sheet");
  stack = background.stack;
  stack = createField(stack, { name: "Title", backgroundId: background.background.id }).stack;
  for (let index = 1; index <= CARD_COUNT; index += 1) {
    const card = createCard(stack, { name: `Card ${index}`, backgroundId: background.background.id });
    stack = card.stack;
    stack = createField(stack, { name: "Body", cardId: card.card.id }).stack;
    stack = createButton(stack, { name: "Next", cardId: card.card.id }).stack;
  }
  return stack;
}

/**
 * Un script Murmur de 200 lignes exactement : 25 handlers de huit lignes.
 * Les noms sont numérotés pour que chaque handler reste indépendant.
 */
export function scriptOf200Lines(): string {
  const lines: string[] = [];
  for (let block = 1; block <= 25; block += 1) {
    lines.push(`on mouseUp${block}`);
    lines.push(`  put ${block} into counter${block}`);
    lines.push(`  put counter${block} & " ok" into status${block}`);
    lines.push(`  if counter${block} > 0 then`);
    lines.push(`    put counter${block} into seen${block}`);
    lines.push(`  end if`);
    lines.push(`  put seen${block} into status${block}`);
    lines.push(`end mouseUp${block}`);
  }
  return lines.join("\n");
}

/**
 * Un script de calcul en boucle : trois étapes par tour (le tour de boucle et
 * les deux `add`), sans aucun effet sur la pile. Il sert à compter les étapes
 * de l'interpréteur, pas celles d'un hôte.
 */
export function loopScript(): string {
  return [
    "on mouseUp",
    "  put 0 into total",
    "  repeat with n = 1 to 20000",
    "    add 1 to total",
    "    add 2 to total",
    "  end repeat",
    "end mouseUp",
  ].join("\n");
}

/** La carte qui réagit à un clic : un bouton écrit dans son champ « Status ». */
export type EventFixture = { stack: Stack; cardId: number; buttonId: number };

export function eventFixture(): EventFixture {
  let stack = createStack("Bench event");
  const card = createCard(stack, { name: "Card 1" });
  stack = card.stack;
  stack = createField(stack, { name: "Status", cardId: card.card.id }).stack;
  const button = createButton(stack, {
    name: "Go",
    cardId: card.card.id,
    script: 'on mouseUp\n  put the number of cards into field "Status"\nend mouseUp\n',
  });
  stack = button.stack;
  return { stack, cardId: card.card.id, buttonId: button.part.id };
}