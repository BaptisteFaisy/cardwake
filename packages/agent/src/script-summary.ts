/**
 * Le résumé de la carte visée, pour la consigne du rédacteur de scripts (7.7).
 *
 * C'est la vue canonique des agents (`buildCardView`), remise en une phrase :
 * le modèle ne peut pas inventer un champ absent de ce résumé, et l'auteur qui
 * relit retrouve les mêmes mots. Le site (`script-editor.ts`) et l'enregistreur
 * des cassettes s'en servent tous les deux — un seul texte, sinon les
 * empreintes ne concorderaient jamais en mode enregistré.
 */

import { clampSettings } from "@cardwake/model";
import type { Card, Part, Stack } from "@cardwake/model";
import { buildCardView } from "./view";

/**
 * La carte telle que le rédacteur doit la voir : son nom, ses éléments, leurs
 * textes, et l'élément visé.
 */
export function cardSummaryOf(stack: Stack, card: Card, part: Part): string {
  const view = buildCardView(stack, card.id, clampSettings(stack.settings));
  const fields = view.fields.map((field) => {
    const content = field.text.trim() === "" ? "empty" : JSON.stringify(field.text);
    return `field "${field.name}" (${content}${field.locked ? ", locked" : ""})`;
  });
  const buttons = view.buttons.map((button) => `button "${button.name}" (label "${button.label}")`);
  const carries = [...fields, ...buttons].join(", ");
  return [
    `Stack "${view.stackName}". Card "${view.cardName}", agent level ${view.level}.`,
    `The card carries ${carries === "" ? "nothing" : carries}.`,
    `Other cards: ${view.otherCards.join(", ") || "none"}.`,
    `The script will be attached to the ${part.kind} "${part.name}".`,
  ].join("\n");
}