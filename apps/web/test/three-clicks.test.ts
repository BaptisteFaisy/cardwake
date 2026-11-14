/**
 * Le parcours de trois clics, au niveau des **écrans** (CAR-F-55, 12.1).
 *
 * C'est la première chose que fait le jury : étagère → The Manor → bouton
 * « Show the amulet » → journal. `.kiro/specs/editor-ui/tasks.md` promettait ce
 * fichier depuis sa tâche 6 ; il n'avait jamais été écrit. Le moteur est couvert
 * ailleurs (`agent-bridge.test.ts`), mais pas **le rendu que le jury voit** :
 * rien ne vérifiait que le bouton promis existe à l'écran, que la réponse de
 * l'agent y apparaît, ni que le journal s'ouvre dessus.
 *
 * Sans clé, sans réseau, sans jsdom : la pile livrée, sa cassette livrée, le
 * moteur réel, et le balisage rendu par React (`renderToStaticMarkup`) — le même
 * procédé que `script-screen.test.ts`.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Stack } from "@cardwake/model";
import { DEMO_STACKS, Shelf } from "../src/screens/Shelf";
import { CardPlay } from "../src/screens/CardPlay";
import { Journal } from "../src/screens/Journal";
import { CardwakeProvider } from "../src/store";
import { makeEngine, settled, textOf } from "./fixtures";
import type { TestEngine } from "./fixtures";
import { t } from "../src/i18n";

/** Les identifiants du manoir : les cartes, le bouton et les champs du fond. */
const GUARD = 10;
const COOK = 20;
const AMULET = 11;
const MOOD = 3;
const MEMORY = 4;
const SAYS = 5;

/** Le troisième clic : montrer l'amulette au garde, et attendre sa réponse. */
async function pressAmulet(harness: TestEngine): Promise<void> {
  harness.engine.navigate(GUARD);
  const done = settled(harness.engine);
  harness.engine.click(AMULET);
  await done;
}

/** Le balisage d'un écran, branché sur le moteur réel. */
function screen(engine: TestEngine["engine"], child: JSX.Element): string {
  // `children` dans les props : le type du fournisseur l'exige, et React le
  // prend dans les deux formes.
  return renderToStaticMarkup(createElement(CardwakeProvider, { engine, children: child }));
}

describe("clic 1 — l'étagère", () => {
  it("les trois piles d'exemple sont là, valides, et le manoir est proposé", () => {
    expect(DEMO_STACKS).toHaveLength(3);
    const html = renderToStaticMarkup(
      createElement(Shelf, {
        onOpen: () => undefined,
        onNew: () => undefined,
        onOpenFile: () => undefined,
        fileError: null,
      }),
    );
    expect(html).toContain("The Manor");
    expect(html).toContain(t("shelf.startHere"));
    expect(html.match(/shelf-item/g)?.length).toBe(3);
  });
});

describe("clic 2 — la carte du personnage", () => {
  it("le bouton promis existe, nommé, dans la carte du garde", () => {
    const harness = makeEngine(DEMO_STACKS[0] as Stack);
    harness.engine.navigate(GUARD);
    const html = screen(harness.engine, createElement(CardPlay));
    expect(html).toContain('<button type="button" aria-label="Show the amulet"');
    expect(html).toContain(t("play.candle"));
  });
});

describe("clic 3 — la réponse, puis le journal", () => {
  it("la réponse de l'agent s'affiche dans son propre champ", async () => {
    const harness = makeEngine(DEMO_STACKS[0] as Stack);
    await pressAmulet(harness);
    const stack = harness.engine.state() as Stack;
    expect(textOf(stack, GUARD, SAYS)).toContain("Put it away before the master sees it.");
    expect(screen(harness.engine, createElement(CardPlay))).toContain(
      "Put it away before the master sees it.",
    );
  });

  it("la réponse porte l'encre d'agent, et se dit à l'oreille", async () => {
    const harness = makeEngine(DEMO_STACKS[0] as Stack);
    await pressAmulet(harness);
    const html = screen(harness.engine, createElement(CardPlay));
    // CAR-F-42 au niveau du rendu : le champ écrit par l'agent porte l'encre,
    // et sa marque n'est pas décorative seulement — un lecteur d'écran la nomme.
    expect(html).toContain("ink-agent");
    expect(html).toContain(t("play.writtenByAgent"));
  });

  it("le journal liste les tours, et chaque annuler ne défait qu'une ligne", async () => {
    const harness = makeEngine(DEMO_STACKS[0] as Stack);
    await pressAmulet(harness);
    const html = screen(harness.engine, createElement(Journal));
    expect(html).toContain('class="journal-entry from-agent"');
    expect(html).toContain("agent turn on card");
    // Annuler est actif ; rétablir est désactivé **et le dit** (CAR-F-45).
    expect(html).toContain(`<button type="button">${t("journal.undo")}</button>`);
    expect(html).toContain(`title="${t("journal.noRedo")}"`);

    // Le cahier (7.13) : un tour d'agent est sa propre transaction. Quatre
    // lignes au journal — navigation, tour du garde, script du bouton, tour du
    // cuisinier — et trois annuler pour tout défaire.
    harness.engine.undo();
    const one = harness.engine.state() as Stack;
    expect(textOf(one, COOK, MEMORY)).toBe("The kitchen is quiet tonight.");
    expect(textOf(one, GUARD, SAYS)).toContain("Put it away");
    harness.engine.undo();
    const two = harness.engine.state() as Stack;
    expect(textOf(two, GUARD, SAYS)).toBe("");
    expect(textOf(two, GUARD, MOOD)).toBe("alarmed");
    harness.engine.undo();
    const three = harness.engine.state() as Stack;
    expect(textOf(three, GUARD, MOOD)).toBe("bored");
    expect(textOf(three, GUARD, MEMORY)).toBe("Nobody came today.");
    for (let i = 0; i < 3; i += 1) harness.engine.redo();
    const after = harness.engine.state() as Stack;
    expect(textOf(after, GUARD, SAYS)).toContain("Put it away");
    expect(textOf(after, COOK, MEMORY)).toContain("The guard saw the silver amulet");
  });
});
