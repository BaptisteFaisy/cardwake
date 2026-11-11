/**
 * Piles de test construites à la main : aucune dépendance aux générateurs du
 * paquet `model`, seulement à ses types (figés). Une pile lisible vaut mieux
 * qu'une usine : chaque test voit exactement ce que l'agent voit.
 */

import type {
  Background,
  ButtonPart,
  Card,
  FieldPart,
  Part,
  Stack,
  StackSettings,
} from "@cardwake/model";

/** Réglages complets, aux valeurs par défaut utiles, recopiés ici exprès. */
export function settings(overrides: Partial<StackSettings> = {}): StackSettings {
  return {
    maxSteps: 100_000,
    maxMessageDepth: 50,
    maxWaitMs: 5_000,
    hopBudget: 3,
    agentTurnsPerAction: 8,
    agentTurnsPerSession: 60,
    agentInputTokensPerSession: 400_000,
    agentMaxIterations: 6,
    agentMaxOutputTokens: 2_000,
    agentTimeoutMs: 30_000,
    agentQueueLength: 20,
    fieldViewChars: 2_000,
    cardViewChars: 8_000,
    tickSeconds: 0,
    ...overrides,
  };
}

export function field(id: number, name: string, text = "", locked = false): FieldPart {
  return {
    id,
    kind: "field",
    name,
    rect: [0, 0, 200, 20],
    visible: true,
    style: "",
    script: "",
    text,
    locked,
    multiline: false,
  };
}

export function button(id: number, name: string, label: string): ButtonPart {
  return {
    id,
    kind: "button",
    name,
    rect: [0, 40, 80, 20],
    visible: true,
    style: "",
    script: "",
    label,
    enabled: true,
    hilite: false,
  };
}

export function background(id: number, name: string, persona: string, parts: Part[]): Background {
  return { id, name, persona, script: "", parts };
}

export function card(overrides: Partial<Card> & { id: number; name: string }): Card {
  return {
    background: null,
    content: {},
    agent: null,
    script: "",
    parts: [],
    ink: {},
    ...overrides,
  };
}

export function stack(overrides: Partial<Stack> = {}): Stack {
  return {
    format: "cardwake/1",
    name: "Kitchen",
    persona: "This stack is a quiet kitchen at night.",
    settings: settings(),
    backgrounds: [],
    cards: [],
    script: "",
    provenance: { kind: "created" },
    nextId: 100,
    currentCardId: null,
    ...overrides,
  };
}

/**
 * La pile de référence des tests d'agent :
 * - un fond « Room » qui porte un champ « Light » et le rôle commun ;
 * - une carte « Cook » de niveau 3, avec un champ propre et un bouton ;
 * - deux voisines, « Pantry » et « Garden », jamais visibles en détail.
 */
export function kitchenStack(overrides: Partial<Stack> = {}): Stack {
  const room = background(1, "Room", "You keep a tidy room.", [
    field(10, "Light", "off"),
    button(11, "Lamp", "Toggle lamp"),
  ]);
  const cook = card({
    id: 1,
    name: "Cook",
    background: 1,
    content: { "10": "A small lamp burns." },
    agent: { awake: true, level: 3, speed: "fast", persona: "You are the cook." },
    parts: [field(20, "Mood", "calm"), button(21, "Serve", "Serve dinner")],
  });
  return stack({
    backgrounds: [room],
    cards: [cook, card({ id: 2, name: "Pantry" }), card({ id: 3, name: "Garden" })],
    currentCardId: 1,
    ...overrides,
  });
}
