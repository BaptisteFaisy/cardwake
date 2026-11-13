#!/usr/bin/env python3
"""Le moteur de mesure du contraste WCAG : lecture du CSS, couleurs, cascade.

Ce module fait le travail dur ; la commande qui l'exploite est
`scripts/quality/contrast.py`. Il est séparé pour tenir sous 500 lignes.

Ce qu'il apporte :

  - la lecture d'un arbre CSS, `@import` résolus dans l'ordre du source ;
  - la résolution des variables CSS (`var(--nom)`) ;
  - la résolution du fond d'un élément **par la cascade** : la règle la plus
    spécifique qui s'applique à cet élément gagne ; si elle ne pose pas de
    fond (`background: none`), on remonte au parent, jusqu'à la page ;
  - le calcul du ratio WCAG et de la luminance relative.

La cascade est approchée par le jeu des classes et l'ordre des types : une
règle s'applique à un élément si les classes de la règle sont parmi celles de
l'élément et si ses types apparaissent dans le même ordre. La structure
descendante exacte n'est pas reconstituée : c'est la limite du travail sans
navigateur, et elle est dite dans `docs/accessibilite.md`.

Bibliothèque standard uniquement, aucun accès réseau, aucune écriture.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STYLES_PAR_DEFAUT = os.path.join(ROOT, "apps", "web", "src", "styles")

# Seuils WCAG 2.2 niveau AA.
SEUIL_TEXTE = 4.5
SEUIL_GRAND_TEXTE = 3.0
SEUIL_COMPOSANT = 3.0
TAILLE_GRAND_TEXTE = 24.0
TAILLE_GRAND_TEXTE_GRAS = 18.66
TAILLE_RACINE = 16.0  # px : `html { font-size: 16px }`

NOMS_COULEUR = {
    "white": (255, 255, 255),
    "black": (0, 0, 0),
    "silver": (192, 192, 192),
    "gray": (128, 128, 128),
    "grey": (128, 128, 128),
    "red": (255, 0, 0),
    "green": (0, 128, 0),
    "blue": (0, 0, 255),
}

RE_IMPORT = re.compile(r"""@import\s+(?:url\()?\s*["']?([^"')\s;]+)["']?\s*\)?\s*;""")
RE_HEX = re.compile(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b")
RE_RGB = re.compile(r"rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)")
RE_TAILLE = re.compile(r"^\s*(-?[0-9.]+)\s*(px|rem|em|%)?\s*$")
RE_CLASSE = re.compile(r"\.([A-Za-z0-9_-]+)")
RE_ID = re.compile(r"#([A-Za-z0-9_-]+)")
RE_ATTRIBUT = re.compile(r"\[[^\]]+\]")
RE_PSEUDO = re.compile(r":[A-Za-z-]+")
RE_TYPE = re.compile(r"(?:^|[\s>+~,])([a-zA-Z][A-Za-z0-9-]*)")


@dataclass
class Regle:
    """Une règle CSS simple : un sélecteur, des déclarations, sa place."""

    selecteur: str
    declarations: dict[str, str]
    media: str = ""
    index: int = 0


@dataclass
class Mesure:
    """Un couple mesuré : deux couleurs, un ratio, un seuil."""

    categorie: str
    selecteur: str
    texte: str
    fond: str
    ratio: float
    seuil: float
    exempt: bool = False
    note: str = ""


@dataclass
class Feuilles:
    """Le résultat d'une lecture : règles, variables, fonds déclarés, page."""

    regles: list[Regle] = field(default_factory=list)
    variables: dict[str, str] = field(default_factory=dict)
    # (sélecteur, couleur ou None si `background: none`, spécificité, rang)
    fonds: list[tuple[str, tuple[int, int, int] | None, tuple[int, int, int], int]] = field(
        default_factory=list
    )
    page: tuple[int, int, int] = (255, 255, 255)

    def fond_de(self, selecteur: str) -> tuple[int, int, int]:
        """Le fond d'un élément, par la cascade, puis par herencia du parent."""
        return self.fond(selecteur, 0)

    def fond(self, selecteur: str, profondeur: int) -> tuple[int, int, int]:
        """Le fond d'un élément : la règle la plus spécifique qui s'applique."""
        if profondeur > 6:
            return self.page
        candidats = [
            (specificite, rang, couleur)
            for (sel, couleur, specificite, rang) in self.fonds
            if s_applique(sel, selecteur)
        ]
        candidats.sort(key=lambda candidat: (candidat[0], candidat[1]), reverse=True)
        for _, _, couleur in candidats:
            if couleur is None:
                return self.fond_parent(selecteur, profondeur)
            return couleur
        return self.fond_parent(selecteur, profondeur)

    def fond_parent(self, selecteur: str, profondeur: int = 0) -> tuple[int, int, int]:
        """Le fond hérité du parent : le dernier jeton retiré, puis la page."""
        jetons_texte = jetons(selecteur)
        if len(jetons_texte) < 2:
            return self.page
        return self.fond(" ".join(jetons_texte[:-1]), profondeur + 1)

    def fond_du_parent(self, selecteur: str) -> tuple[int, int, int]:
        """Le fond qui accueille un élément : celui de son parent, pas le sien.

        Un contour de focus est dessiné *hors* de l'élément (offset de 2 px) :
        c'est la surface qui l'accueille qu'il doit contraster, pas le fond que
        l'élément couvre lui-même.
        """
        jetons_texte = jetons(selecteur)
        if len(jetons_texte) < 2:
            return self.page
        return self.fond(" ".join(jetons_texte[:-1]), 1)

    def taille(self, selecteur: str, propriete: str, defaut: float) -> float:
        """Une propriété héritée : la règle la plus spécifique qui s'applique."""
        meilleur: tuple[tuple[int, int, int], int] | None = None
        for regle in self.regles:
            if propriete not in regle.declarations:
                continue
            if not s_applique(regle.selecteur, selecteur):
                continue
            rang = (specificite(regle.selecteur), regle.index)
            if meilleur is None or rang > meilleur:
                meilleur = rang
        if meilleur is None:
            return defaut
        for regle in self.regles:
            if regle.index == meilleur[1]:
                return valeur_numerique(regle.declarations[propriete], defaut)
        return defaut


# --------------------------------------------------------------------------
# Lecture du CSS
# --------------------------------------------------------------------------


def sans_commentaires(texte: str) -> str:
    """Retire les commentaires `/* … */` : ils ne portent aucune règle."""
    return re.sub(r"/\*.*?\*/", " ", texte, flags=re.S)


def blocs(texte: str) -> list[tuple[str, str]]:
    """Découpe un CSS en blocs de premier niveau : (prélude, contenu)."""
    trouves: list[tuple[str, str]] = []
    pile: list[tuple[int, int]] = []
    debut = 0
    for position, caractere in enumerate(texte):
        if caractere == "{":
            pile.append((debut, position))
            debut = position + 1
        elif caractere == "}" and pile:
            origine, ouverture = pile.pop()
            trouves.append((texte[origine:ouverture].strip(), texte[debut:position]))
            debut = position + 1
    return trouves


def normaliser(selecteur: str) -> str:
    """Un sélecteur sur une ligne : les listes de sélecteurs restent lisibles."""
    return re.sub(r"\s+", " ", selecteur).strip()


def declarations(corps: str) -> dict[str, str]:
    """Les déclarations d'un bloc : `propriété: valeur`, la dernière gagne."""
    resultat: dict[str, str] = {}
    for morceau in corps.split(";"):
        if ":" not in morceau:
            continue
        propriete, _, valeur = morceau.partition(":")
        resultat[propriete.strip().lower()] = valeur.strip()
    return resultat


def regles_du(texte: str, media: str = "") -> list[Regle]:
    """Les règles simples d'un texte, media queries comprises."""
    trouvees: list[Regle] = []
    for prelude, contenu in blocs(texte):
        if prelude.startswith("@media"):
            trouvees += regles_du(contenu, prelude)
        elif prelude.startswith("@"):
            continue  # @keyframes, @font-face : pas de couleur d'interface
        elif prelude:
            trouvees.append(Regle(normaliser(prelude), declarations(contenu), media))
    return trouvees


def imports_de(texte: str) -> list[str]:
    """Les fichiers importés par un texte, dans l'ordre d'écriture."""
    return RE_IMPORT.findall(texte)


def charger(fichier: str, media: str = "", vus: set[str] | None = None) -> list[Regle]:
    """Les règles d'un fichier, `@import` résolus à leur place."""
    vus = vus if vus is not None else set()
    absolu = os.path.abspath(fichier)
    if absolu in vus:
        return []  # import circulaire : on s'arrête
    vus.add(absolu)
    with open(absolu, encoding="utf-8", errors="replace") as handle:
        texte = sans_commentaires(handle.read())
    regles: list[Regle] = []
    for chemin in imports_de(texte):
        voisin = os.path.join(os.path.dirname(absolu), chemin)
        if os.path.isfile(voisin):
            regles += charger(voisin, media, vus)
    regles += regles_du(RE_IMPORT.sub(" ", texte), media)
    return regles


def points_d_entree(dossier: str) -> list[str]:
    """Les fichiers du dossier que rien n'importe : les racines de la cascade."""
    tous = sorted(
        os.path.join(dossier, nom) for nom in os.listdir(dossier) if nom.endswith(".css")
    )
    importes: set[str] = set()
    for fichier in tous:
        with open(fichier, encoding="utf-8", errors="replace") as handle:
            texte = sans_commentaires(handle.read())
        for chemin in imports_de(texte):
            importes.add(os.path.abspath(os.path.join(os.path.dirname(fichier), chemin)))
    return [f for f in tous if os.path.abspath(f) not in importes]


def lire(chemin: str) -> list[Regle]:
    """Les règles d'un chemin : un dossier (ses racines) ou un fichier."""
    if os.path.isdir(chemin):
        regles: list[Regle] = []
        for fichier in points_d_entree(chemin):
            regles += charger(fichier)
    else:
        regles = charger(chemin)
    for index, regle in enumerate(regles):
        regle.index = index
    return regles


# --------------------------------------------------------------------------
# Couleurs
# --------------------------------------------------------------------------


def resoudre(valeur: str, variables: dict[str, str]) -> str:
    """Remplace les `var(--nom)` par leur valeur, récursivement."""
    texte = valeur
    for _ in range(8):
        nouveau = re.sub(
            r"var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,[^()]*)?\)",
            lambda m: variables.get(m.group(1), ""),
            texte,
        )
        if nouveau == texte:
            break
        texte = nouveau
    return texte.strip()


def couleur(valeur: str) -> tuple[int, int, int] | None:
    """La couleur d'une valeur CSS : hexadécimal, rgb(), nom ou rien."""
    texte = valeur.strip().lower()
    if not texte or texte in ("none", "transparent", "inherit", "initial", "unset"):
        return None
    trouve = RE_HEX.search(texte)
    if trouve:
        chiffres = trouve.group(1)
        if len(chiffres) == 3:
            chiffres = "".join(c * 2 for c in chiffres)
        return (int(chiffres[0:2], 16), int(chiffres[2:4], 16), int(chiffres[4:6], 16))
    trouve = RE_RGB.search(texte)
    if trouve:
        return tuple(min(255, max(0, int(float(valeur)))) for valeur in trouve.groups())  # type: ignore[return-value]
    if texte in NOMS_COULEUR:
        return NOMS_COULEUR[texte]
    return None


def hexa(rgb: tuple[int, int, int]) -> str:
    """La couleur en hexadécimal, pour les tableaux."""
    return "#%02x%02x%02x" % rgb


def luminance(rgb: tuple[int, int, int]) -> float:
    """La luminance relative WCAG (2.x), entre 0 et 1."""
    canaux = []
    for canal in rgb:
        proportion = canal / 255.0
        if proportion <= 0.03928:
            canaux.append(proportion / 12.92)
        else:
            canaux.append(((proportion + 0.055) / 1.055) ** 2.4)
    return 0.2126 * canaux[0] + 0.7152 * canaux[1] + 0.0722 * canaux[2]


def ratio(premier: tuple[int, int, int], second: tuple[int, int, int]) -> float:
    """Le ratio de contraste WCAG entre deux couleurs (de 1 à 21)."""
    clair, sombre = sorted((luminance(premier), luminance(second)), reverse=True)
    return (clair + 0.05) / (sombre + 0.05)


# --------------------------------------------------------------------------
# Sélecteurs et cascade
# --------------------------------------------------------------------------


def jetons(selecteur: str) -> list[str]:
    """Les jetons d'un sélecteur : combinateurs et listes compris."""
    return [j for j in re.split(r"\s*[>+~,]\s*|\s+", selecteur.strip()) if j]


def nu(jeton: str) -> str:
    """Le type d'un jeton : `button` pour `button[aria-selected="true"]`."""
    trouve = re.match(r"[A-Za-z][A-Za-z0-9]*", jeton)
    return trouve.group(0).lower() if trouve else ""


def classes_de(selecteur: str) -> set[str]:
    """Les classes nommées par un sélecteur."""
    return set(RE_CLASSE.findall(selecteur))


def types_de(selecteur: str) -> list[str]:
    """Les types d'un sélecteur, dans l'ordre d'écriture."""
    return [t.lower() for t in RE_TYPE.findall(selecteur)]


def specificite(selecteur: str) -> tuple[int, int, int]:
    """La spécificité CSS : (identifiants, classes et pseudo-classes, types)."""
    identifiants = len(RE_ID.findall(selecteur))
    classes = (
        len(RE_CLASSE.findall(selecteur))
        + len(RE_ATTRIBUT.findall(selecteur))
        + len(RE_PSEUDO.findall(selecteur))
    )
    return (identifiants, classes, len(types_de(selecteur)))


def s_applique(regle: str, element: str) -> bool:
    """Une règle s'applique-t-elle à cet élément ?

    Les classes de la règle doivent être parmi celles de l'élément, et ses
    types apparaître dans le même ordre. La structure descendante exacte
    n'est pas reconstituée : c'est la limite du travail sans navigateur.
    """
    if not classes_de(regle) <= classes_de(element):
        return False
    types_regle = types_de(regle)
    if not types_regle:
        return True
    rang = 0
    for type_element in types_de(element):
        if rang < len(types_regle) and types_regle[rang] == type_element:
            rang += 1
    return rang == len(types_regle)


def collecter(regles: list[Regle]) -> Feuilles:
    """Les variables, les fonds déclarés et le fond de page d'un arbre CSS."""
    feuilles = Feuilles(regles=regles)
    for regle in regles:
        for propriete, valeur in regle.declarations.items():
            if propriete.startswith("--"):
                feuilles.variables[propriete] = valeur
    for regle in regles:
        if "background" not in regle.declarations:
            continue
        valeur = resoudre(regle.declarations["background"], feuilles.variables)
        couleur_fond = couleur(valeur)
        for selecteur in regle.selecteur.split(","):
            selecteur = normaliser(selecteur)
            if selecteur:
                feuilles.fonds.append(
                    (selecteur, couleur_fond, specificite(selecteur), regle.index)
                )
    for selecteur, couleur_fond, _ in [(f[0], f[1], f[2]) for f in feuilles.fonds]:
        if couleur_fond is not None and nu(selecteur) in ("body", "html"):
            feuilles.page = couleur_fond
    return feuilles


def valeur_numerique(valeur: str, defaut: float) -> float:
    """Une taille CSS en pixels : `1.2rem` vaut 19,2 px avec une racine de 16 px."""
    trouve = RE_TAILLE.match(valeur)
    if not trouve:
        return defaut
    nombre = float(trouve.group(1))
    unite = trouve.group(2) or "px"
    if unite in ("rem", "em"):
        return nombre * TAILLE_RACINE
    if unite == "%":
        return defaut
    return nombre


def exempt(selecteur: str) -> bool:
    """Un composant inactif est exempt des seuils de contraste (WCAG 1.4.11)."""
    return ":disabled" in selecteur or "[disabled]" in selecteur
