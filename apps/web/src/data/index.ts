/**
 * Les trois piles de démonstration, embarquées dans le site.
 *
 * Elles sont **validées au chargement** par le même schéma que n'importe quel
 * fichier reçu : si un jour une pile de démo ne respecte plus le format, le
 * site échoue au démarrage au lieu d'afficher n'importe quoi. C'est aussi ce
 * qui permet aux juges de jouer sans clé ni compte (CAR-F-47, CAR-F-55).
 */

import type { Stack } from "@cardwake/model";
import { validateStack } from "@cardwake/model";
import dashboardJson from "./dashboard.json";
import manorJson from "./manor.json";
import quotesJson from "./quotes.json";

export type DemoStack = { slug: string; stack: Stack };

function load(slug: string, raw: unknown): DemoStack {
  const result = validateStack(raw);
  if (!result.ok) {
    throw new Error(`demo stack "${slug}" is not valid: ${result.errors[0]}`);
  }
  return { slug, stack: result.stack };
}

/** Ordre d'affichage sur l'étagère : le manoir d'abord, c'est la démo. */
export const DEMO_STACKS: DemoStack[] = [
  load("manor", manorJson),
  load("quotes", quotesJson),
  load("dashboard", dashboardJson),
];

export function demoStack(slug: string): DemoStack | undefined {
  return DEMO_STACKS.find((demo) => demo.slug === slug);
}

/** L'identifiant d'une pile de démonstration, si la pile en est une. */
export function demoSlugFor(stack: Stack): string | undefined {
  return DEMO_STACKS.find((demo) => demo.stack.name === stack.name)?.slug;
}
