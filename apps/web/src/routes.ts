/**
 * Les écrans du brief (12.1), routés sans bibliothèque externe.
 *
 * Le type vit hors de `App.tsx` pour que la mécanique de session (`parts/
 * use-stack-session`) puisse nommer un écran sans dépendre du composant
 * racine : un seul type, deux lecteurs, aucune boucle d'import.
 */

export type Screen = "shelf" | "card" | "journal" | "reception" | "settings" | "spy" | "proof";
