#!/usr/bin/env python3
"""Mesure du contraste WCAG 2.2 des couleurs déclarées dans les styles du site.

    python3 scripts/quality/contrast.py                   # tableau et verdict
    python3 scripts/quality/contrast.py --json            # la même mesure, en JSON
    python3 scripts/quality/contrast.py --reference f.css  # compare à une autre version
    python3 scripts/quality/contrast.py --styles apps/web/src/styles

Ce qu'il fait : il lit les fichiers `.css` du répertoire des styles, **suit la
cascade** (un `@import` est résolu à sa place, dans l'ordre du source), résout
les variables CSS (`var(--nom)`), puis calcule le ratio de contraste WCAG 2.x
de chaque couple texte/fond et composant/fond qu'il trouve.

Les seuils appliqués, ceux du WCAG 2.2 niveau AA :

  - texte normal           4,5:1   (1.4.3)
  - grand texte            3:1     (1.4.3 : 24 px, ou 18,66 px en gras)
  - composant d'interface  3:1     (1.4.11 : bordures, contours, focus)

Sortie : 0 si tous les couples passent, 1 sinon (une ligne `::error::` par
couple en échec, pour que GitHub annote le run), 2 en cas d'erreur d'usage.

Ce qu'il ne fait pas, et qu'il dit : il raisonne sur le CSS seul, sans
navigateur. Le fond d'un élément est déduit de la cascade (règle la plus
spécifique compatible, sinon le fond de la page), pas du DOM rendu : une
surface posée par une classe d'ancêtre non chaînée reste inconnue. Les
couples dont le fond dépend du DOM rendu sont donc à revérifier à la main
dans un navigateur (voir `docs/accessibilite.md`).

Le moteur (lecture du CSS, couleurs, fonds) est dans `contrast_core.py`.
Bibliothèque standard uniquement, aucun accès réseau, aucune écriture.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import contrast_core  # noqa: E402  (le module ci-dessus a posé le chemin)

from contrast_core import Feuilles, Mesure  # noqa: E402

# Seuils WCAG 2.2 niveau AA.
SEUIL_TEXTE = 4.5
SEUIL_GRAND_TEXTE = 3.0
SEUIL_COMPOSANT = 3.0
TAILLE_GRAND_TEXTE = 24.0
TAILLE_GRAND_TEXTE_GRAS = 18.66

# Les types que le clavier atteint : un focus peut se poser sur eux.
TYPES_FOCUSABLES = ("button", "input", "select", "textarea", "a")


def est_grand_texte(feuilles: Feuilles, selecteur: str) -> bool:
    """Un texte en grand caractère : 24 px, ou 18,66 px en gras."""
    taille = feuilles.taille(selecteur, "font-size", 16.0)
    gras = feuilles.taille(selecteur, "font-weight", 400.0) >= 700
    if taille >= TAILLE_GRAND_TEXTE:
        return True
    return gras and taille >= TAILLE_GRAND_TEXTE_GRAS


def selecteurs_de(regle: str) -> list[str]:
    """Les sélecteurs d'une règle, un par un (une règle peut en lister)."""
    return [contrast_core.normaliser(s) for s in regle.split(",") if s.strip()]


def est_un_etat(selecteur: str) -> bool:
    """Un état de survol ou de focus : son fond n'est pas mesurable statiquement."""
    return any(etat in selecteur for etat in (":hover", ":focus", ":active", ":visited"))


def mesures_texte(feuilles: Feuilles) -> list[Mesure]:
    """Les couples texte/fond : la couleur d'un texte sur le fond qu'il trouve."""
    trouvees: list[Mesure] = []
    for regle in feuilles.regles:
        if "color" not in regle.declarations:
            continue
        texte = contrast_core.couleur(
            contrast_core.resoudre(regle.declarations["color"], feuilles.variables)
        )
        if texte is None:
            continue
        seuil = SEUIL_GRAND_TEXTE if est_grand_texte(feuilles, regle.selecteur) else SEUIL_TEXTE
        for selecteur in selecteurs_de(regle.selecteur):
            fond = feuilles.fond_de(selecteur)
            trouvees.append(
                Mesure(
                    "texte",
                    selecteur,
                    contrast_core.hexa(texte),
                    contrast_core.hexa(fond),
                    contrast_core.ratio(texte, fond),
                    seuil,
                    contrast_core.exempt(selecteur),
                )
            )
    return trouvees


def mesures_limites(feuilles: Feuilles) -> list[Mesure]:
    """Les couples composant/fond : bordures et contours (WCAG 1.4.11)."""
    trouvees: list[Mesure] = []
    for regle in feuilles.regles:
        if est_un_etat(regle.selecteur):
            continue  # le focus est mesuré à part, contre chaque surface
        for propriete, valeur in regle.declarations.items():
            if not (propriete.startswith("border") or propriete.startswith("outline")):
                continue
            couleur = contrast_core.couleur(
                contrast_core.resoudre(valeur, feuilles.variables)
            )
            if couleur is None:
                continue
            for selecteur in selecteurs_de(regle.selecteur):
                fond = feuilles.fond_de(selecteur)
                trouvees.append(
                    Mesure(
                        "limite",
                        selecteur,
                        contrast_core.hexa(couleur),
                        contrast_core.hexa(fond),
                        contrast_core.ratio(couleur, fond),
                        SEUIL_COMPOSANT,
                        contrast_core.exempt(selecteur),
                    )
                )
    return trouvees


def couleur_du_focus(feuilles: Feuilles) -> tuple[int, int, int] | None:
    """La couleur du contour de focus, telle que les styles la déclarent."""
    for regle in feuilles.regles:
        if ":focus" not in regle.selecteur:
            continue
        for propriete, valeur in regle.declarations.items():
            if not propriete.startswith("outline"):
                continue
            couleur = contrast_core.couleur(
                contrast_core.resoudre(valeur, feuilles.variables)
            )
            if couleur is not None:
                return couleur
    return None


def surfaces_accueil(feuilles: Feuilles) -> list[tuple[int, int, int]]:
    """Les fonds qui accueillent un contrôle : le focus doit y contraster."""
    fonds: set[tuple[int, int, int]] = set()
    for regle in feuilles.regles:
        for selecteur in regle.selecteur.split(","):
            selecteur = selecteur.strip()
            touche = any(
                contrast_core.nu(jeton) in TYPES_FOCUSABLES
                for jeton in contrast_core.jetons(selecteur)
            )
            if touche:
                fonds.add(feuilles.fond_du_parent(selecteur))
    return sorted(fonds)


def mesures_focus(feuilles: Feuilles) -> list[Mesure]:
    """Le couple focus/fond : le contour de focus contre chaque surface."""
    couleur = couleur_du_focus(feuilles)
    if couleur is None:
        return []
    trouvees: list[Mesure] = []
    for fond in surfaces_accueil(feuilles):
        trouvees.append(
            Mesure(
                "focus",
                ":focus-visible",
                contrast_core.hexa(couleur),
                contrast_core.hexa(fond),
                contrast_core.ratio(couleur, fond),
                SEUIL_COMPOSANT,
            )
        )
    return trouvees


def regrouper(mesures: list[Mesure]) -> list[Mesure]:
    """Regroupe les mesures identiques : une ligne par couple réel.

    Deux sélecteurs qui partagent la même couleur et le même fond sont un
    seul couple : les lister séparément ferait croire à des échecs en double.
    """
    groupes: dict[tuple[str, str, str, float, bool], Mesure] = {}
    for mesure in mesures:
        clef = (
            mesure.categorie,
            mesure.texte,
            mesure.fond,
            mesure.seuil,
            mesure.exempt,
        )
        if clef in groupes:
            groupes[clef].selecteur = "%s ; %s" % (groupes[clef].selecteur, mesure.selecteur)
            continue
        groupes[clef] = Mesure(
            mesure.categorie,
            mesure.selecteur,
            mesure.texte,
            mesure.fond,
            mesure.ratio,
            mesure.seuil,
            mesure.exempt,
            mesure.note,
        )
    return list(groupes.values())


def mesurer(chemin: str) -> list[Mesure]:
    """Toutes les mesures d'un répertoire de styles ou d'un fichier."""
    feuilles = contrast_core.collecter(contrast_core.lire(chemin))
    mesures = mesures_texte(feuilles) + mesures_limites(feuilles) + mesures_focus(feuilles)
    return regrouper(mesures)


def cle(mesure: Mesure) -> tuple[str, str, str]:
    """La clef d'appariement d'une mesure, pour comparer deux versions."""
    return (mesure.categorie, mesure.selecteur, mesure.fond)


def nombre(valeur: float) -> str:
    """Un ratio, avec la virgule décimale française."""
    return ("%.2f" % valeur).replace(".", ",")


def tableau(mesures: list[Mesure], reference: list[Mesure]) -> None:
    """Le tableau des couples : avant, après, seuil, verdict."""
    avant = {cle(m): m for m in reference}
    entete = "%-46s %-24s %8s %8s %6s  %s" % (
        "couple",
        "texte / fond",
        "avant",
        "après",
        "seuil",
        "verdict",
    )
    print(entete)
    print("-" * len(entete))
    for mesure in mesures:
        ancien = avant.get(cle(mesure))
        valeur_avant = nombre(ancien.ratio) if ancien else "—"
        seuil = nombre(mesure.seuil)
        verdict = "exempt" if mesure.exempt else ("ok" if mesure.ratio >= mesure.seuil else "ÉCHEC")
        print(
            "%-46s %-24s %8s %8s %6s  %s"
            % (
                ("%s %s" % (mesure.categorie, mesure.selecteur))[:46],
                "%s / %s" % (mesure.texte, mesure.fond),
                valeur_avant,
                nombre(mesure.ratio),
                seuil,
                verdict,
            )
        )


def rapport(mesures: list[Mesure]) -> int:
    """Le verdict : le code de sortie, et les annotations pour GitHub."""
    echecs = [m for m in mesures if not m.exempt and m.ratio < m.seuil]
    for mesure in echecs:
        print(
            "::error file=apps/web/src/styles::contraste : %s %s — %s sur %s, ratio %s (seuil %s)"
            % (
                mesure.categorie,
                mesure.selecteur,
                mesure.texte,
                mesure.fond,
                nombre(mesure.ratio),
                nombre(mesure.seuil),
            )
        )
    exempts = len([m for m in mesures if m.exempt])
    print(
        "%d couple(s) mesuré(s), %d en échec, %d exempt(s) — seuils : texte %s, grand texte %s, composant %s"
        % (
            len(mesures),
            len(echecs),
            exempts,
            nombre(SEUIL_TEXTE),
            nombre(SEUIL_GRAND_TEXTE),
            nombre(SEUIL_COMPOSANT),
        )
    )
    return 1 if echecs else 0


def en_json(mesures: list[Mesure]) -> None:
    """La même mesure, en JSON, pour un autre outil."""
    lignes = []
    for mesure in mesures:
        lignes.append(
            {
                "categorie": mesure.categorie,
                "selecteur": mesure.selecteur,
                "texte": mesure.texte,
                "fond": mesure.fond,
                "ratio": round(mesure.ratio, 2),
                "seuil": mesure.seuil,
                "exempt": mesure.exempt,
                "note": mesure.note,
            }
        )
    print(json.dumps(lignes, ensure_ascii=False, indent=2))


def main(argv: list[str] | None = None) -> int:
    """La commande : lecture, comparaison, tableau, verdict."""
    parser = argparse.ArgumentParser(
        description="Mesure le contraste WCAG 2.2 AA des couleurs des styles."
    )
    parser.add_argument(
        "--styles",
        default=contrast_core.STYLES_PAR_DEFAUT,
        help="répertoire des styles (ou fichier .css) à mesurer",
    )
    parser.add_argument(
        "--reference",
        default=None,
        help="autre version des styles, pour la colonne « avant »",
    )
    parser.add_argument("--json", action="store_true", help="sortir la mesure en JSON")
    args = parser.parse_args(argv)

    if not os.path.exists(args.styles):
        print("::error::styles introuvables : %s" % args.styles)
        return 2
    mesures = mesurer(args.styles)
    if not mesures:
        print("::error::aucune couleur déclarée dans %s" % args.styles)
        return 2
    reference = mesurer(args.reference) if args.reference else []
    if args.json:
        en_json(mesures)
        return rapport(mesures)
    tableau(mesures, reference)
    return rapport(mesures)


if __name__ == "__main__":
    sys.exit(main())
