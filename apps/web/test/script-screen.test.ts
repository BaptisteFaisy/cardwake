/**
 * Le rendu de l'onglet Script (12.1) : un vrai éditeur, des contrôles nommés.
 *
 * Pas de jsdom dans ce dépôt : le composant est rendu en texte par React, et
 * c'est le balisage qui est vérifié — un `textarea` modifiable (le défaut
 * corrigé : il était `readOnly`), des `<label>` autour des champs, de vrais
 * `<button>` désactivés quand ils ne peuvent rien faire. Les gestes, eux, sont
 * testés sur la chaîne elle-même (`script-editor.test.ts`), moteur en main.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createButton, createCard, createField, createStack } from "@cardwake/model";
import type { Card, Part, Stack } from "@cardwake/model";
import { CassetteGateway, FakeModel, textResponse } from "@cardwake/agent";
import { DraftView, ScriptEditor } from "../src/screens/ScriptEditor";
import { proposeScript } from "../src/engine/script-editor";
import { missingKeys, resetMissingKeys } from "../src/i18n";
import { makeEngine } from "./fixtures";

const SCRIPT = 'on mouseUp\n  put "165" into field "Total"\nend mouseUp\n';

/** La pile d'une carte « Order », et l'élément dont on écrit le script. */
function screen(): { stack: Stack; card: Card; part: Part } {
  let stack = createStack("Orders");
  const card = createCard(stack, { name: "Order" });
  stack = card.stack;
  const field = createField(stack, { name: "Total", cardId: card.card.id });
  stack = field.stack;
  const button = createButton(stack, { name: "Compute", cardId: card.card.id, script: SCRIPT });
  stack = button.stack;
  return { stack, card: card.card, part: button.part };
}

/** Le balisage de l'onglet Script, moteur réel en main. */
function markup(): string {
  const { stack, card, part } = screen();
  const { engine } = makeEngine(stack);
  engine.setMode("build");
  return renderToStaticMarkup(createElement(ScriptEditor, { engine, stack, card, part }));
}

describe("onglet Script", () => {
  it("montre un champ de texte modifiable, avec le script en place", () => {
    const html = markup();
    expect(html).toContain("<textarea");
    expect(html).not.toContain("readonly");
    expect(html).toContain("on mouseUp");
  });

  it("nomme ses contrôles et n'offre que ce qui peut aboutir", () => {
    const html = markup();
    for (const label of ["Script of this element", "Describe what you want", "Apply script"]) {
      expect(html).toContain(label);
    }
    // Le script en place est déjà celui de la zone : rien à appliquer.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Apply script<\/button>/);
    // Une phrase vide ne demande pas de brouillon.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Propose a draft<\/button>/);
    // Rien n'est proposé tant qu'on n'a pas demandé : aucune défense à l'écran.
    expect(html).not.toContain("Draft — nothing is installed yet");
  });

  it("ne réclame aucune clé absente du dictionnaire", () => {
    resetMissingKeys();
    markup();
    expect(missingKeys()).toEqual([]);
  });
});
describe("panneau du brouillon", () => {
  /** Un brouillon réel, demandé au faux modèle : aucune réponse écrite à la main. */
  async function draftOf(): Promise<string> {
    const { stack, card, part } = screen();
    const model = new FakeModel({
      respond: () =>
        textResponse(
          JSON.stringify({
            script: SCRIPT,
            summary: "Puts 165 into the Total field.",
            assumptions: ["The total is 165."],
            questions: [],
          }),
        ),
    });
    const draft = await proposeScript({ phrase: "Put 165 in Total.", stack, card, part, gateway: model });
    return renderToStaticMarkup(
      createElement(DraftView, { draft, onAccept: () => undefined, onRefuse: () => undefined }),
    );
  }

  it("montre les trois défenses, et les deux gestes", async () => {
    const html = await draftOf();
    expect(html).toContain("Draft — nothing is installed yet");
    expect(html).toContain("Plain-English readback");
    expect(html).toContain("Dry run");
    expect(html).toContain('field Total: &quot;&quot; -&gt; &quot;165&quot;');
    expect(html).toContain("Diff with the script in place");
    expect(html).toContain("Assumptions");
    expect(html).toMatch(/<button[^>]*>Accept<\/button>/);
    expect(html).toMatch(/<button[^>]*>Refuse<\/button>/);
  });

  it("dit honnêtement qu'aucune réponse n'est enregistrée", async () => {
    const { stack, card, part } = screen();
    const draft = await proposeScript({
      phrase: "Put 165 in Total.",
      stack,
      card,
      part,
      gateway: new CassetteGateway({ entries: [] }),
    });
    const html = renderToStaticMarkup(
      createElement(DraftView, { draft, onAccept: () => undefined, onRefuse: () => undefined }),
    );
    expect(html).toContain("No recorded answer for this phrase");
    // Sans script utilisable, le geste d'acceptation reste fermé.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Accept<\/button>/);
  });
});
