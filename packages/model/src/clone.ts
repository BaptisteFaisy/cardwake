/**
 * Clonage profond et explicite du modèle de données (7.1, 11.5).
 *
 * Un seul clone pour tout le paquet (zéro duplication) : ni `structuredClone`,
 * ni aller-retour JSON — ces deux techniques masqueraient un champ oublié et
 * casseraient sur les tuples (`rect`) et les unions discriminées (`Part`,
 * `Provenance`). Chaque type est recopié champ par champ ; les objets plats
 * (réglages, contenus, encre) sont copiés par étalement, ce qui est déjà une
 * copie complète puisqu'aucune de leurs valeurs n'est imbriquée.
 *
 * Sert à `ops.ts` : toute opération rend une nouvelle pile sans jamais muter
 * celle qu'elle reçoit (CAR-P-08).
 */

import type { StackSettings } from "./limits";
import type { Agent, Background, Card, FieldPart, ButtonPart, Part, Provenance, Rect, Stack } from "./types";

/** Un rectangle est un tuple de quatre nombres : recopié valeur par valeur. */
export function cloneRect(rect: Rect): Rect {
  return [rect[0], rect[1], rect[2], rect[3]];
}

/** Réglages : objet plat de nombres, la copie plate est complète. */
export function cloneSettings(settings: StackSettings): StackSettings {
  return { ...settings };
}

/** Les quatre réglages d'un agent, et rien d'autre (7.5). */
export function cloneAgent(agent: Agent): Agent {
  return {
    awake: agent.awake,
    level: agent.level,
    speed: agent.speed,
    persona: agent.persona,
  };
}

/** Provenance : créée ici, ou reçue d'un fichier (7.10). */
export function cloneProvenance(provenance: Provenance): Provenance {
  if (provenance.kind === "created") return { kind: "created" };
  return { kind: "received", trusted: provenance.trusted, receivedAt: provenance.receivedAt };
}

/** Un élément : champ ou bouton, chaque variante avec ses champs propres. */
export function clonePart(part: Part): Part {
  const commun = {
    id: part.id,
    kind: part.kind,
    name: part.name,
    rect: cloneRect(part.rect),
    visible: part.visible,
    style: part.style,
    script: part.script,
  };
  if (part.kind === "field") {
    const champ: FieldPart = {
      ...commun,
      kind: "field",
      text: part.text,
      locked: part.locked,
      multiline: part.multiline,
    };
    return champ;
  }
  const bouton: ButtonPart = {
    ...commun,
    kind: "button",
    label: part.label,
    enabled: part.enabled,
    hilite: part.hilite,
  };
  return bouton;
}

/** Une carte : contenu et encre sont des tables plates indexées par élément. */
export function cloneCard(card: Card): Card {
  return {
    id: card.id,
    name: card.name,
    background: card.background,
    content: { ...card.content },
    agent: card.agent === null ? null : cloneAgent(card.agent),
    script: card.script,
    parts: card.parts.map(clonePart),
    ink: { ...card.ink },
  };
}

/** Un fond : ses éléments sont partagés par toutes ses cartes. */
export function cloneBackground(background: Background): Background {
  return {
    id: background.id,
    name: background.name,
    persona: background.persona,
    script: background.script,
    parts: background.parts.map(clonePart),
  };
}

/** La pile entière, dans l'ordre de ses champs (11.5). */
export function cloneStack(stack: Stack): Stack {
  return {
    format: stack.format,
    name: stack.name,
    persona: stack.persona,
    settings: cloneSettings(stack.settings),
    backgrounds: stack.backgrounds.map(cloneBackground),
    cards: stack.cards.map(cloneCard),
    script: stack.script,
    provenance: cloneProvenance(stack.provenance),
    nextId: stack.nextId,
    currentCardId: stack.currentCardId,
  };
}
