/**
 * Les outils du clavier pour les tests d'accessibilité (cahier § 18, point 12).
 *
 * Ce module regroupe ce qui sert à répondre à trois questions :
 *   - quels contrôles un écran met-il à portée de Tab ?
 *   - chacun a-t-il un nom accessible ?
 *   - l'ordre de tabulation suit-il l'ordre du document ?
 *
 * jsdom ne fait pas de navigateur : il ne calcule pas une mise en page, il
 * n'active pas un bouton avec la touche Entrée, et il ne gère pas la touche
 * Tab. On lui ajoute donc un **harnais clavier** qui reproduit ce que fait un
 * navigateur : Tab déplace le focus au contrôle suivant, Entrée et Espace
 * activent le bouton qui a le focus. Ce que le test vérifie ensuite — l'action
 * demandée au clavier aboutit — reste vrai dans un vrai navigateur.
 */

/** Les balises qui portent un contrôle au clavier. */
export const SELECTEUR = "button, a[href], input, select, textarea, [tabindex]";

/** Les contrôles focusables d'un écran, dans l'ordre du document. */
export function focusables(conteneur: HTMLElement): HTMLElement[] {
  return [...conteneur.querySelectorAll<HTMLElement>(SELECTEUR)].filter((element) => {
    if (element.hasAttribute("disabled")) return false;
    const tabindex = element.getAttribute("tabindex");
    return tabindex === null || Number(tabindex) >= 0;
  });
}

/** Le libellé accessible d'un contrôle : aria, label, texte, titre. */
export function nomAccessible(element: HTMLElement): string {
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
export function decrire(element: HTMLElement): string {
  const texte = (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 24);
  return `<${element.tagName.toLowerCase()}>${texte === "" ? "" : ` « ${texte} »`}`;
}

/**
 * L'ordre de tabulation d'un écran, comme un navigateur le calcule : les
 * `tabindex` positifs d'abord, puis les autres dans l'ordre du document.
 * Un `tabindex` positif fait donc sortir l'ordre du document — c'est ce que
 * le test vérifie.
 */
export function ordreDeTabulation(conteneur: HTMLElement): HTMLElement[] {
  const elements = focusables(conteneur);
  return [...elements].sort((premier, second) => {
    const rangPremier = Number(premier.getAttribute("tabindex") ?? 0);
    const rangSecond = Number(second.getAttribute("tabindex") ?? 0);
    if (rangPremier !== rangSecond) return rangSecond - rangPremier;
    return 0; // tri stable : l'ordre du document reste l'ordre du document
  });
}

/**
 * Une tabulation : le focus passe au contrôle suivant, comme au clavier.
 * Renvoie le contrôle qui a le focus, ou null si l'écran n'a aucun contrôle.
 */
export function taperTab(conteneur: HTMLElement): HTMLElement | null {
  const elements = ordreDeTabulation(conteneur);
  if (elements.length === 0) return null;
  const courant = document.activeElement as HTMLElement | null;
  const index = courant ? elements.indexOf(courant) : -1;
  const suivant = elements[index + 1] ?? elements[0];
  suivant.focus();
  return suivant;
}

/** Le nombre de tabulations pour atteindre un contrôle, ou -1 si on ne l'atteint pas. */
export function tabulationsJusqua(conteneur: HTMLElement, cible: HTMLElement): number {
  const elements = ordreDeTabulation(conteneur);
  const rang = elements.indexOf(cible);
  if (rang < 0) return -1;
  for (let tapes = 0; tapes <= elements.length; tapes += 1) {
    if (document.activeElement === cible) return tapes;
    taperTab(conteneur);
  }
  return -1;
}

/**
 * Le harnais clavier : Entrée et Espace activent le bouton qui a le focus,
 * comme le fait un navigateur. Renvoie la fonction de nettoyage.
 */
export function installerClavier(): () => void {
  const auClavier = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const cible = event.target as HTMLElement | null;
    if (!cible) return;
    const activable =
      cible.tagName === "BUTTON" || (cible.tagName === "A" && cible.hasAttribute("href"));
    if (!activable) return;
    event.preventDefault();
    cible.click();
  };
  document.addEventListener("keydown", auClavier);
  return () => document.removeEventListener("keydown", auClavier);
}
