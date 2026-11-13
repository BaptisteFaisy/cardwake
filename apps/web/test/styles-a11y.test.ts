// @vitest-environment jsdom
/**
 * Les règles de style qui portent l'accessibilité (cahier § 18, point 12).
 *
 * Trois contrôles, tous déterministes :
 *   1. le mouvement réduit est respecté : la media query existe, et elle
 *      neutralise les animations, les transitions et le défilement doux ;
 *   2. le focus est visible : la règle `:focus-visible` existe, elle porte
 *      un contour, et elle couvre tous les types de contrôles que le site
 *      met à portée de Tab ;
 *   3. le contraste est mesuré pour de vrai : `scripts/quality/contrast.py`
 *      passe sur les styles du dépôt — et il échoue bien quand il doit.
 *
 * Pourquoi tester la présence des règles et non leur effet : jsdom n'a pas
 * de mise en page, ne calcule pas les styles d'un media query, et ne peut
 * donc pas rendre un focus ni une animation. Ce qui est vérifié ici, c'est
 * que la règle existe, qu'elle est complète, et que le mesureur de contraste
 * refuse un couple trop juste.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** La racine du dépôt : on la remonte depuis le dossier de travail. */
function racineDuDepot(): string {
  let dossier = process.cwd();
  for (let profondeur = 0; profondeur < 6; profondeur += 1) {
    if (existsSync(join(dossier, "scripts/quality/contrast.py"))) return dossier;
    dossier = dirname(dossier);
  }
  throw new Error("la racine du dépôt est introuvable");
}

const RACINE = racineDuDepot();
const DOSSIER_STYLES = join(RACINE, "apps/web/src/styles");
const SCRIPT_CONTRASTE = join(RACINE, "scripts/quality/contrast.py");

/** Tous les styles du site, dans l'ordre des fichiers. */
function stylesDuSite(): string {
  const fichiers = readdirSync(DOSSIER_STYLES).filter((nom) => nom.endsWith(".css")).sort();
  return fichiers.map((nom) => readFileSync(join(DOSSIER_STYLES, nom), "utf8")).join("\n");
}

/** Le contenu d'un bloc `@media … { … }`, accolades comptées. */
function blocMedia(css: string, condition: string): string {
  const debut = css.indexOf(condition);
  if (debut < 0) return "";
  const ouverture = css.indexOf("{", debut);
  if (ouverture < 0) return "";
  let profondeur = 0;
  for (let index = ouverture; index < css.length; index += 1) {
    if (css[index] === "{") profondeur += 1;
    if (css[index] === "}") {
      profondeur -= 1;
      if (profondeur === 0) return css.slice(ouverture + 1, index);
    }
  }
  return "";
}

/** La règle qui porte le contour de focus, telle qu'elle est écrite. */
function regleFocus(css: string): string {
  const debut = css.indexOf(":focus-visible");
  if (debut < 0) return "";
  const ouverture = css.indexOf("{", debut);
  const fermeture = css.indexOf("}", ouverture);
  // Le sélecteur commence après la règle précédente : sans lui, on ne
  // verrait que les déclarations, et la liste des types couverts disparaît.
  const debutSelecteur = Math.max(css.lastIndexOf("}", ouverture), css.lastIndexOf("\n", ouverture)) + 1;
  return css.slice(debutSelecteur, fermeture + 1).trim();
}

/** Le code de sortie du mesureur de contraste, sans lever. */
function codeDeSortie(arguments_: string[]): number {
  try {
    execFileSync("python3", [SCRIPT_CONTRASTE, ...arguments_], { cwd: RACINE, stdio: "pipe" });
    return 0;
  } catch (erreur) {
    const echec = erreur as { status?: number };
    return echec.status ?? 2;
  }
}

describe("mouvement réduit", () => {
  it("la media query `prefers-reduced-motion` existe", () => {
    expect(stylesDuSite()).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("elle coupe les animations, les transitions et le défilement doux", () => {
    const bloc = blocMedia(stylesDuSite(), "@media (prefers-reduced-motion: reduce)");
    expect(bloc, "la media query du mouvement réduit est vide").not.toBe("");
    // L'alternative sans animation : plus de durée, plus d'itération, plus de
    // défilement doux — la flamme reste allumée mais immobile.
    expect(bloc).toContain("animation-duration");
    expect(bloc).toContain("animation-iteration-count");
    expect(bloc).toContain("transition-duration");
    expect(bloc).toContain("scroll-behavior: auto");
  });

  it("le site annonce un défilement doux, que la préférence vient couper", () => {
    const styles = stylesDuSite();
    expect(styles).toContain("scroll-behavior: smooth");
  });
});

describe("focus visible", () => {
  it("la règle `:focus-visible` porte un contour", () => {
    const regle = regleFocus(stylesDuSite());
    expect(regle, "aucune règle `:focus-visible` dans les styles").not.toBe("");
    expect(regle).toContain("outline");
  });

  it("elle couvre tous les types de contrôles que le site met à portée de Tab", () => {
    const regle = regleFocus(stylesDuSite());
    for (const type of ["button", "input", "textarea", "select", "a", "[tabindex]"]) {
      expect(regle, `le focus ne couvre pas « ${type} »`).toContain(type);
    }
  });
});

describe("contraste mesuré", () => {
  it("les styles du dépôt passent le mesureur", () => {
    expect(codeDeSortie(["--styles", DOSSIER_STYLES]), "les styles du dépôt ne passent pas le contraste").toBe(0);
  });

  it("le mesureur échoue bien quand un couple est trop juste", () => {
    const dossier = mkdtempSync(join(tmpdir(), "cardwake-contraste-"));
    writeFileSync(
      join(dossier, "trop-juste.css"),
      ":root {\n  --fond: #ffffff;\n  --texte: #eeeeee;\n}\n\np {\n  color: var(--texte);\n  background: var(--fond);\n}\n",
      "utf8",
    );
    expect(codeDeSortie(["--styles", dossier]), "le mesureur n'a pas vu le couple trop juste").toBe(1);
  });
});
