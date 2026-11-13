/**
 * Les cassettes des trois piles de démonstration (7.11), chargées depuis la
 * racine du dépôt (`stacks/<pile>/cassette.json`) : des empreintes et des
 * réponses enregistrées, sans clé ni réseau (CAR-N-09, CAR-P-22). Le site
 * rejoue les parcours enregistrés hors ligne ; une situation non enregistrée
 * remonte l'avis lisible de `CassetteMiss` et ne consomme aucun budget.
 *
 * Chaque fichier est vérifié au chargement : une cassette tordue doit échouer
 * au démarrage du site, pas en pleine démonstration.
 */

import { CassetteGateway } from "@cardwake/agent";
import type { LlmGateway } from "@cardwake/agent";
import type { CassetteEntry, Stack } from "@cardwake/model";
import { demoSlugFor } from "./index";
import dashboardCassette from "../../../../stacks/dashboard/cassette.json";
import manorCassette from "../../../../stacks/manor/cassette.json";
import quotesCassette from "../../../../stacks/quotes/cassette.json";

/** La forme d'un fichier cassette tel qu'il est livré (7.11). */
type CassetteFile = { mode: string; entries: readonly CassetteEntry[] };

/** Une entrée vérifiée : empreinte et `purpose` en texte, réponse en objet. */
function isEntry(value: unknown): value is CassetteEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.fingerprint === "string" &&
    typeof entry.purpose === "string" &&
    typeof entry.response === "object" &&
    entry.response !== null
  );
}

/** Décode un fichier cassette : une liste d'entrées valides, sinon un échec. */
function entriesOf(raw: unknown, slug: string): readonly CassetteEntry[] {
  const file = raw as CassetteFile;
  if (file.mode !== "cassette" || !Array.isArray(file.entries) || !file.entries.every(isEntry)) {
    throw new Error(`demo cassette "${slug}" is not valid`);
  }
  return file.entries;
}

/** Les trois cassettes livrées, par identifiant de pile. */
const ENTRIES: Record<string, readonly CassetteEntry[]> = {
  manor: entriesOf(manorCassette, "manor"),
  quotes: entriesOf(quotesCassette, "quotes"),
  dashboard: entriesOf(dashboardCassette, "dashboard"),
};

/** Les entrées enregistrées d'une pile de démonstration, par identifiant. */
export function cassetteFor(slug: string): readonly CassetteEntry[] {
  return ENTRIES[slug] ?? [];
}

/** Les passerelles en mode enregistré, une par pile, construites une seule fois. */
const GATEWAYS = new Map<string, CassetteGateway>();

/** La `CassetteGateway` bâtie sur les entrées d'une pile, ou `undefined`. */
export function cassetteGateway(slug: string): CassetteGateway | undefined {
  let gateway = GATEWAYS.get(slug);
  if (gateway === undefined && ENTRIES[slug] !== undefined) {
    gateway = new CassetteGateway({ entries: [...ENTRIES[slug]] });
    GATEWAYS.set(slug, gateway);
  }
  return gateway;
}

/** La passerelle enregistrée d'une pile ouverte : retrouvée par son nom. */
export function cassetteForStack(stack: Stack): LlmGateway | null {
  const slug = demoSlugFor(stack);
  if (slug === undefined) return null;
  return cassetteGateway(slug) ?? null;
}
