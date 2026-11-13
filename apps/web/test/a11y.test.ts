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
import { Shelf } from "../src/screens/Shelf";
import { CardPlay } from "../src/screens/CardPlay";
import { CardBuild } from "../src/screens/CardBuild";
import { Journal } from "../src/screens/Journal";
import { Reception } from "../src/screens/Reception";
import { Settings } from "../src/screens/Settings";
import { Spy } from "../src/screens/Spy";
import { Proof } from "../src/screens/Proof";
import { demoStack, makeEngine } from "./fixtures";

/** Les balises WCAG 2.2 AA que l'audit couvre. */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * Le contraste des couleurs se mesure sur une vraie mise en page : jsdom ne
 * la calcule pas (pas de canvas), et axe rendrait la règle « incomplete ».
 * On la désactive ici, en le disant : elle se vérifie dans un navigateur.
 */
const AUDIT = { runOnly: { type: "tag" as const, values: WCAG }, rules: { "color-contrast": { enabled: false } } };

/** Les balises qui portent un contrôle au clavier. */
const SELECTEUR = "button, a[href], input, select, textarea, [tabindex]";

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
  ];
}

/** Les contrôles focusables d'un écran, dans l'ordre du DOM. */
function focusables(conteneur: HTMLElement): HTMLElement[] {
  return [...conteneur.querySelectorAll<HTMLElement>(SELECTEUR)].filter((element) => {
    if (element.hasAttribute("disabled")) return false;
    const tabindex = element.getAttribute("tabindex");
    return tabindex === null || Number(tabindex) >= 0;
  });
}

/** Le libellé accessible d'un contrôle : aria, label, texte, titre. */
function nomAccessible(element: HTMLElement): string {
  const aria = element.getAttribute("aria-label")?.trim();
  if (aria) return aria;
  const reference = element.getAttribute("aria-labelledby");
  if (reference) {
    const texte = reference
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
      .join(" ")
      .trim();
    if (texte) return texte;
  }
  const etiquettes = (element as HTMLInputElement).labels;
  if (etiquettes && etiquettes.length > 0) {
    const texte = [...etiquettes].map((label) => label.textContent?.trim() ?? "").join(" ").trim();
    if (texte) return texte;
  }
  const propre = element.textContent?.trim();
  if (propre) return propre;
  return element.getAttribute("title")?.trim() ?? "";
}

/** Un libellé court pour les messages d'échec. */
function decrire(element: HTMLElement): string {
  const texte = (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
  return `<${element.tagName.toLowerCase()}>${texte === "" ? "" : ` « ${texte} »`}`;
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
});