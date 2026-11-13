// @vitest-environment jsdom
/**
 * Contrôle d'accessibilité des sept écrans du site (cahier § 18, point 12).
 *
 * Deux contrôles, tous deux automatiques :
 * 1. **axe-core**, sur chaque écran monté dans un vrai DOM (jsdom), avec les
 *    règles WCAG 2.2 AA : toute violation fait échouer le test.
 * 2. **au clavier seul** : chaque contrôle focusable doit être un élément
 *    natif (bouton, champ, liste), porter un libellé accessible, prendre le
 *    focus et ne pas casser l'ordre de tabulation par un `tabindex` positif.
 *    Le parcours P2 (créer un champ, créer un bouton) est fait ainsi.
 *
 * Les écrans sont montés avec `react-dom/client` directement : pas de
 * bibliothèque de test en plus. `@vitest-environment jsdom` ne vaut que pour
 * ce fichier — le reste du dépôt tourne en Node.
 *
 * jsdom ne synthétise pas un clic depuis Entrée/Espace : on vérifie donc que
 * le contrôle est un vrai `<button>` (que tout navigateur active au clavier),
 * puis on déclenche son clic pour vérifier que l'action aboutit.
 */
import { afterEach, describe, expect, it } from "vitest";
import axe from "axe-core";
import { act, createElement } from "react";
import type { ComponentType, ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { parseStackFile, serializeStack } from "@cardwake/model";
import type { Stack } from "@cardwake/model";
import { CardwakeProvider } from "../src/store";
import { App } from "../src/App";
import { Shelf } from "../src/screens/Shelf";
import { CardPlay } from "../src/screens/CardPlay";
import { CardBuild } from "../src/screens/CardBuild";
import { Journal } from "../src/screens/Journal";
import { Reception } from "../src/screens/Reception";
import { Settings } from "../src/screens/Settings";
import { Spy } from "../src/screens/Spy";
import { Proof } from "../src/screens/Proof";
import { demoStack, makeEngine, memoryStorage } from "./fixtures";
import {
  decrire,
  focusables,
  installerClavier,
  nomAccessible,
  ordreDeTabulation,
  tabulationsJusqua,
  taperTab,
} from "./clavier";

/** Les balises WCAG 2.2 AA que l'audit couvre. */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * Le contraste des couleurs se mesure sur une vraie mise en page : jsdom ne
 * la calcule pas (pas de canvas), et axe rendrait la règle « incomplete ».
 * On la désactive ici, en le disant : elle se vérifie dans un navigateur,
 * et `scripts/quality/contrast.py` la mesure sur les styles du dépôt.
 */
const AUDIT = { runOnly: { type: "tag" as const, values: WCAG }, rules: { "color-contrast": { enabled: false } } };

/** Les écrans montés par le test en cours, démontés après chaque cas. */
const montes: { racine: Root; conteneur: HTMLElement }[] = [];

/** Active l'environnement d'acte de React : les mises à jour sont attendues. */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Monte un élément React dans un conteneur attaché au document. */
async function monter(element: ReactElement): Promise<HTMLElement> {
  const conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  const racine = createRoot(conteneur);
  montes.push({ racine, conteneur });
  await act(async () => {
    racine.render(element);
  });
  return conteneur;
}

/** Laisse tourner les effets asynchrones (les preuves, par exemple). */
async function laisserTourner(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

afterEach(async () => {
  for (const monte of montes.splice(0)) {
    await act(async () => {
      monte.racine.unmount();
    });
    monte.conteneur.remove();
  }
});

/** La pile du manoir telle que le site la reçoit (validée par le schéma). */
function pileDuSite(): Stack {
  return demoStack();
}

/** La même pile, marquée « reçue » : c'est ce qu'affiche l'écran de réception. */
function pileRecue(): Stack {
  const lue = parseStackFile(serializeStack(demoStack()));
  if (!lue.ok) throw new Error("the demo stack no longer parses");
  return { ...lue.stack, provenance: { kind: "received", trusted: false, receivedAt: "2026-11-12T00:00:00.000Z" } };
}

/** Un écran qui lit le contexte, monté sur un moteur neuf. */
function avecMoteur(composant: ComponentType, carteId?: number, pile: Stack = pileDuSite()): ReactElement {
  const { engine } = makeEngine(pile);
  if (carteId !== undefined) engine.navigate(carteId);
  return createElement(CardwakeProvider, { engine, children: createElement(composant) });
}

/** L'étagère : ses props viennent de la coquille de l'application. */
function ecranShelf(): ReactElement {
  return createElement(Shelf, {
    onOpen: () => undefined,
    onNew: () => undefined,
    onOpenFile: () => undefined,
    fileError: null,
  });
}

/** Les sept écrans, plus la carte dans ses deux modes (Jouer et Fabriquer). */
function ecrans(): { nom: string; construire: () => ReactElement }[] {
  return [
    { nom: "Étagère", construire: ecranShelf },
    { nom: "Carte, mode Jouer", construire: () => avecMoteur(CardPlay, 10) },
    { nom: "Carte, mode Fabriquer", construire: () => avecMoteur(CardBuild, 10) },
    { nom: "Journal", construire: () => avecMoteur(Journal) },
    { nom: "Réception", construire: () => avecMoteur(Reception, undefined, pileRecue()) },
    { nom: "Réglages", construire: () => avecMoteur(Settings) },
    { nom: "Espion", construire: () => avecMoteur(Spy) },
    { nom: "Preuves", construire: () => avecMoteur(Proof) },
    // Le site entier : la barre de la pile (O4) et ses gestes d'export, de
    // choix et de nouvelle pile vivent hors des écrans, donc ici.
    { nom: "Site, barre de la pile", construire: ecranApp },
  ];
}

/** Le site monté sur une pile gardée : la barre de la pile est affichée. */
function ecranApp(): ReactElement {
  const { engine } = makeEngine(pileDuSite());
  const storage = memoryStorage();
  return createElement(App, { engine, storage, start: { kind: "restored", stack: pileDuSite() } });
}

/** Le contrôle au clavier seul d'un écran : rend la liste des écarts.
 *
 * Un écran de pure lecture (l'espion, par exemple) n'a aucun contrôle : il
 * n'y a alors rien à parcourir, et ce n'est pas un écart.
 */
function verifierClavier(conteneur: HTMLElement): string[] {
  const ecarts: string[] = [];
  const elements = focusables(conteneur);
  for (const element of elements) {
    const natifs = ["BUTTON", "INPUT", "SELECT", "TEXTAREA", "A"];
    if (!natifs.includes(element.tagName)) ecarts.push(`${decrire(element)} : n'est pas un contrôle natif`);
    if (nomAccessible(element) === "") ecarts.push(`${decrire(element)} : aucun libellé accessible`);
    const tabindex = element.getAttribute("tabindex");
    if (tabindex !== null && Number(tabindex) > 0) ecarts.push(`${decrire(element)} : tabindex positif (${tabindex})`);
    element.focus();
    if (document.activeElement !== element) ecarts.push(`${decrire(element)} : ne prend pas le focus`);
  }
  return ecarts;
}

describe("contrôle automatique WCAG 2.2 AA (axe-core)", () => {
  for (const ecran of ecrans()) {
    it(`${ecran.nom} : aucun écart`, async () => {
      const conteneur = await monter(ecran.construire());
      await laisserTourner();
      let resultat: axe.AxeResults | undefined;
      await act(async () => {
        resultat = await axe.run(conteneur, AUDIT);
      });
      const violations = (resultat?.violations ?? []).map(
        (violation: axe.Result) => `${violation.id} (${violation.impact ?? "?"}) : ${violation.nodes.length} élément(s) — ${violation.help}`,
      );
      // Garde-fou : un audit qui ne vérifie rien passerait pour vert.
      expect(resultat?.passes.length ?? 0, "axe n'a vérifié aucune règle").toBeGreaterThan(0);
      expect(violations, violations.join("\n")).toEqual([]);
    });
  }
});

describe("parcours au clavier seul", () => {
  for (const ecran of ecrans()) {
    it(`${ecran.nom} : ordre de tabulation et libellés`, async () => {
      const conteneur = await monter(ecran.construire());
      await laisserTourner();
      const ecarts = await act(async () => verifierClavier(conteneur));
      expect(ecarts, ecarts.join("\n")).toEqual([]);
    });
  }

  /**
   * L'ordre de tabulation suit l'ordre du document : Tab passe d'un contrôle
   * au suivant, dans l'ordre où le DOM les présente. Un `tabindex` positif
   * romprait cet ordre — c'est aussi ce que vérifie `verifierClavier`.
   */
  for (const ecran of ecrans()) {
    it(`${ecran.nom} : Tab suit l'ordre du document`, async () => {
      const conteneur = await monter(ecran.construire());
      await laisserTourner();
      const attendus = focusables(conteneur);
      // L'ordre du navigateur (tabindex positifs d'abord) doit être l'ordre
      // du document : sinon un `tabindex` positif a décollé un contrôle.
      expect(ordreDeTabulation(conteneur), "un tabindex positif change l'ordre de tabulation").toEqual(attendus);
      const parcourus: HTMLElement[] = [];
      await act(async () => {
        for (const _ of attendus) {
          taperTab(conteneur);
          parcourus.push(document.activeElement as HTMLElement);
        }
      });
      const ecarts = attendus
        .map(
          (element, rang) =>
            parcourus[rang] === element
              ? null
              : `${decrire(element)} : atteint après ${decrire(parcourus[rang] ?? element)}`,
        )
        .filter((ecart): ecart is string => ecart !== null);
      expect(ecarts, ecarts.join("\n")).toEqual([]);
    });
  }

  it("parcours P2 : créer un champ puis un bouton depuis la palette", async () => {
    const { engine } = makeEngine(pileDuSite());
    engine.setMode("build");
    engine.navigate(10);
    const conteneur = await monter(createElement(CardwakeProvider, { engine, children: createElement(CardBuild) }));
    const palette = [...conteneur.querySelectorAll<HTMLButtonElement>(".palette button")];
    const champ = palette.find((bouton) => bouton.textContent?.trim() === "Field");
    const bouton = palette.find((element) => element.textContent?.trim() === "Button");
    expect(champ, "la palette n'offre pas le bouton « Field »").toBeDefined();
    expect(bouton, "la palette n'offre pas le bouton « Button »").toBeDefined();

    const avant = engine.currentCard()?.parts.length ?? 0;
    for (const controle of [champ!, bouton!]) {
      await act(async () => {
        controle.focus();
        controle.click();
      });
      expect(document.activeElement).toBe(controle);
    }
    await laisserTourner();
    expect(engine.currentCard()?.parts.length ?? 0).toBe(avant + 2);
    const ecarts = await act(async () => verifierClavier(conteneur));
    expect(ecarts, "l'écran de fabrication casse le clavier").toEqual([]);
  });

  /**
   * Le parcours P2 **au clavier seul** : Tab atteint la palette, Entrée
   * active le bouton. Le harnais clavier de `clavier.ts` fait ce qu'un
   * navigateur fait — jsdom, lui, n'active rien sur une touche.
   */
  it("parcours P2 : Tab atteint la palette, Entrée crée le champ puis le bouton", async () => {
    const { engine } = makeEngine(pileDuSite());
    engine.setMode("build");
    engine.navigate(10);
    const conteneur = await monter(createElement(CardwakeProvider, { engine, children: createElement(CardBuild) }));
    const nettoyer = installerClavier();
    try {
      const avant = engine.currentCard()?.parts.length ?? 0;
      const palette = () => [...conteneur.querySelectorAll<HTMLButtonElement>(".palette button")];
      const champ = palette().find((bouton) => bouton.textContent?.trim() === "Field");
      const bouton = palette().find((element) => element.textContent?.trim() === "Button");
      expect(champ, "la palette n'offre pas le bouton « Field »").toBeDefined();
      expect(bouton, "la palette n'offre pas le bouton « Button »").toBeDefined();

      const tapes = await act(async () => tabulationsJusqua(conteneur, champ!));
      expect(tapes, "la palette n'est pas atteignable au Tab").toBeGreaterThan(0);
      expect(document.activeElement, "Tab n'a pas posé le focus sur la palette").toBe(champ);

      await act(async () => {
        champ!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      await laisserTourner();
      expect(engine.currentCard()?.parts.length ?? 0).toBe(avant + 1);

      const tapesBouton = await act(async () => tabulationsJusqua(conteneur, bouton!));
      expect(tapesBouton, "le bouton de la palette n'est plus atteignable au Tab").toBeGreaterThan(0);
      await act(async () => {
        bouton!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      await laisserTourner();
      expect(engine.currentCard()?.parts.length ?? 0).toBe(avant + 2);
    } finally {
      nettoyer();
    }
  });
});