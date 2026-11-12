/**
 * Les tests de la chaîne « phrase → script » (lot C7) : aucun réseau, aucune
 * clé, aucune dépense — uniquement le faux modèle et la cassette vide
 * (CAR-N-09). La référence du langage est lue depuis `docs/language.md` :
 * c'est la seule source, pour la consigne comme pour les tests.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseScript } from "@cardwake/lang";
import { serializeStack } from "@cardwake/model";
import type { Stack } from "@cardwake/model";
import { CassetteGateway } from "../src/gateway/cassette";
import { FakeModel, textResponse } from "../src/testing/fake-model";
import type { LlmRequest, LlmResponse } from "../src/types";
import { writeScript } from "../src/write-script";
import type { WriteScriptOptions, WriteScriptRequest } from "../src/write-script";
import { button, card, field, stack } from "./fixtures";

/** La référence du langage, telle que l'app l'injectera dans la consigne. */
const LANGUAGE = readFileSync(fileURLToPath(new URL("../../../docs/language.md", import.meta.url)), "utf8");

/** Une pile minuscule : une carte « Order » avec un champ et un bouton. */
function orderStack(): Stack {
  return stack({
    name: "Orders",
    cards: [card({ id: 1, name: "Order", parts: [field(20, "Total", ""), button(21, "Compute", "Compute")] })],
    currentCardId: 1,
  });
}

const REQUEST: WriteScriptRequest = {
  phrase: "When the button is clicked, write 165 into the Total field.",
  objectKind: "card",
  objectName: "Order",
  stackSummary: 'Stack "Orders": card "Order" carries field "Total" (empty) and button "Compute".',
};

function optionsFor(freshStack: Stack): WriteScriptOptions {
  return { languageReference: LANGUAGE, stack: freshStack, cardId: 1, maxOutputTokens: 600 };
}

/** Une réponse en sortie structurée. */
function draftResponse(draft: Record<string, unknown>): LlmResponse {
  return textResponse(JSON.stringify(draft));
}

/** Le texte brut des messages d'une requête (les blocs texte, dans l'ordre). */
function textOfRequest(request: LlmRequest): string {
  return request.messages
    .map((message) => message.blocks.map((block) => (block.type === "text" ? block.text : "")).join("\n"))
    .join("\n");
}

const GOOD = 'on mouseUp\n  put "165" into field "Total"\nend mouseUp\n';
const BAD = 'on mouseUp\n  put "165" into field "Missing"\nend mouseUp\n';
const BAD_AGAIN = 'on mouseUp\n  put "165" into field "Nowhere"\nend mouseUp\n';

/** Un brouillon valide, avec son résumé. */
function goodDraft(): Record<string, unknown> {
  return { script: GOOD, summary: "Writes 165 into Total.", assumptions: ["The click is a mouseUp."], questions: [] };
}

describe("writeScript — la chaîne phrase → script", () => {
  it("une phrase simple produit un brouillon analysable, contrôlé et relu", async () => {
    const model = new FakeModel({ responses: [draftResponse(goodDraft())] });
    const result = await writeScript(REQUEST, model, optionsFor(orderStack()));
    expect(result.status).toBe("draft");
    expect(result.script).toBe(GOOD);
    expect(result.summary).toBe("Writes 165 into Total.");
    expect(result.assumptions).toEqual(["The click is a mouseUp."]);
    expect(parseScript(result.script!).ok).toBe(true);
    expect(result.issues.filter((item) => item.level === "error")).toEqual([]);
    expect(result.paraphrase.length).toBeGreaterThan(0);
    expect(model.callCount).toBe(1);
    expect(model.requests[0].purpose).toBe("write-script");
    expect(model.requests[0].outputSchema).toBeDefined();
  });

  it("la relecture cite les objets du script", async () => {
    const model = new FakeModel({ responses: [draftResponse(goodDraft())] });
    const result = await writeScript(REQUEST, model, optionsFor(orderStack()));
    const said = result.paraphrase.join(" ");
    expect(said).toContain("field Total");
    expect(said).toContain('"165"');
    expect(said).toContain("mouseUp");
  });

  it("l'essai à blanc montre le changement sur une copie, sans toucher la pile", async () => {
    const frozen = orderStack();
    const before = serializeStack(frozen);
    const model = new FakeModel({ responses: [draftResponse(goodDraft())] });
    const result = await writeScript(REQUEST, model, optionsFor(frozen));
    expect(result.dryRun?.error).toBeUndefined();
    expect(result.dryRun?.changes).toEqual(['field Total: "" -> "165"']);
    expect(serializeStack(frozen)).toBe(before);
  });

  it("un brouillon invalide déclenche exactement une réparation, puis échoue proprement", async () => {
    const model = new FakeModel({
      responses: [
        draftResponse({ script: BAD, summary: "", assumptions: [], questions: [] }),
        draftResponse({ script: BAD_AGAIN, summary: "", assumptions: [], questions: [] }),
      ],
    });
    const result = await writeScript(REQUEST, model, optionsFor(orderStack()));
    expect(result.status).toBe("failed");
    expect(model.callCount).toBe(2);
    expect(model.requests[1].purpose).toBe("repair-script");
    const repairText = textOfRequest(model.requests[1]);
    expect(repairText).toContain("Missing"); // la liste des erreurs est transmise
    expect(repairText).toContain(BAD); // le brouillon rejeté aussi
    expect(result.issues.some((item) => item.rule === "unknown-part")).toBe(true);
    expect(result.script).toBeUndefined();
  });

  it("des questions du modèle remontent en status questions", async () => {
    const asked = ["Which field should receive the total?"];
    const model = new FakeModel({
      responses: [
        draftResponse({ script: "", summary: "Needs details.", assumptions: [], questions: asked }),
        draftResponse({ script: "", summary: "", assumptions: ["Maybe Total."], questions: asked }),
      ],
    });
    const result = await writeScript(REQUEST, model, optionsFor(orderStack()));
    expect(result.status).toBe("questions");
    expect(result.questions).toEqual(asked);
    expect(result.assumptions).toEqual(["Maybe Total."]);
    expect(model.callCount).toBe(2); // deux allers-retours au plus
    expect(textOfRequest(model.requests[1])).toContain(asked[0]);
  });

  it("une sortie non analysable est réparée une fois, puis échoue proprement", async () => {
    const model = new FakeModel({
      responses: [textResponse("I would rather tell you a story."), textResponse("still nothing structured")],
    });
    const result = await writeScript(REQUEST, model, optionsFor(orderStack()));
    expect(result.status).toBe("failed");
    expect(model.callCount).toBe(2);
    expect(model.requests[1].purpose).toBe("repair-script");
    expect(result.issues[0].rule).toBe("model-output");
    expect(result.issues[0].message).toContain("structured output");
  });

  it("une CassetteMiss remonte un message lisible qui propose une clé", async () => {
    const result = await writeScript(REQUEST, new CassetteGateway(), optionsFor(orderStack()));
    expect(result.status).toBe("failed");
    expect(result.issues[0].rule).toBe("cassette-miss");
    expect(result.issues[0].message).toContain("Add an API key");
  });

  it("la consigne contient la référence du langage et le résumé de la pile", async () => {
    const model = new FakeModel({ responses: [draftResponse(goodDraft())] });
    await writeScript(REQUEST, model, optionsFor(orderStack()));
    const system = model.requests[0].system;
    expect(system).toContain("# The Murmur Language — Complete Reference");
    expect(system).toContain('add 1 to field "Count"'); // un extrait caractéristique
    expect(system).toContain('button "Compute"'); // le résumé de la pile
    expect(system).toContain('card "Order"'); // l'objet visé
  });
});
