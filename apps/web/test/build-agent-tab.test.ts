/**
 * L'onglet Agent dit l'agent de la carte (12.1, 7.5).
 *
 * Le défaut : l'onglet rendait `build.agentNone` même sur une carte habitée.
 * Le manoir — la pile que le jury ouvre en premier — a deux cartes avec un
 * agent : l'écran disait « No agent on this card. » à la personne qui
 * regardait l'agent de la carte Garde. Trois libellés attendaient dans le
 * dictionnaire depuis la première maquette ; rien ne le vérifiait.
 *
 * Comme le reste du site, le composant est rendu en texte par React et le
 * balisage est vérifié : pas de jsdom dans ce dépôt.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseStackFile } from "@cardwake/model";
import type { Card } from "@cardwake/model";
import manorRaw from "../../../stacks/manor/stack.json";
import { AgentTab } from "../src/screens/CardBuild";
import { missingKeys, resetMissingKeys, t } from "../src/i18n";

/** Les cartes de la pile du manoir, telles que le site les charge. */
function manorCards(): Card[] {
  const parsed = parseStackFile(JSON.stringify(manorRaw));
  if (!parsed.ok) throw new Error(`manor refused: ${parsed.errors.join(", ")}`);
  return parsed.stack.cards;
}

function markup(card: Card): string {
  return renderToStaticMarkup(createElement(AgentTab, { card }));
}

describe("onglet Agent", () => {
  it("la carte Garde dit son niveau, sa vitesse et sa consigne", () => {
    resetMissingKeys();
    const guard = manorCards().find((card) => card.agent !== null);
    if (!guard) throw new Error("le manoir n'a plus de carte habitée");
    const html = markup(guard);
    expect(html).toContain(t("build.agentLevel"));
    expect(html).toContain(String(guard.agent?.level));
    expect(html).toContain(t("build.agentSpeed"));
    expect(html).toContain(guard.agent?.persona ?? "");
    expect(html).not.toContain(t("build.agentNone"));
    expect(missingKeys()).toEqual([]);
  });

  it("une carte sans agent le dit", () => {
    const bare = manorCards().find((card) => card.agent === null);
    if (!bare) throw new Error("le manoir n'a plus de carte vide");
    expect(markup(bare)).toContain(t("build.agentNone"));
  });

  it("l'éveil se lit à l'oreille : l'état est un texte, pas une couleur", () => {
    const guard = manorCards().find((card) => card.agent?.awake === true);
    if (!guard) throw new Error("aucun agent éveillé dans le manoir");
    const html = markup(guard);
    expect(html).toContain(t("common.yes"));
    expect(html.match(/<dt>/g)?.length).toBe(4);
  });
});
