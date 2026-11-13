#!/usr/bin/env python3
"""Budget de complexité du dépôt Cardwake — script autonome, stdlib seulement.

    python3 scripts/quality/complexity.py            # tableau complet, échoue si un seuil est dépassé
    python3 scripts/quality/complexity.py --top 20   # les 20 fichiers les plus lourds
    python3 scripts/quality/complexity.py --json     # la même mesure, en JSON

Ce qu'il mesure, pour chaque fichier `.ts` / `.tsx` de `packages/**` et
`apps/**` :

  - `lignes`      : la taille du fichier ;
  - `fonctions`   : combien de fonctions il contient ;
  - `plus longue` : la longueur de sa fonction la plus longue ;
  - `any`         : combien de `any` y subsistent (`: any`, `as any`, `<any>`,
                    `any[]`).

Seuils, ceux du dépôt (règle user sur les tailles, relevé antérieur, hors de
cet arbre) : **moins de 500 lignes par fichier**, **moins de 50 lignes par
fonction**, et **zéro `any`**. Un dépassement rend le code de sortie 1 et une
ligne `::error::` par fichier fautif, pour que GitHub annote le diff.

Pourquoi autonome : la CI de PR est gelée (aucun job ne peut y être ajouté), ce
script n'est donc branché nulle part et s'invoque à la main ou depuis un job
externe. Il n'importe que la bibliothèque standard, plus la mesure de fonctions
du garde `scripts/guards/run_all.py` — une seule implémentation de cette règle,
celle qui fait déjà foi dans la CI.

Sortie : 0 si tout passe, 1 sinon. Aucun accès réseau, aucune écriture.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GUARDS = os.path.join(ROOT, "scripts", "guards")

# Seuils du dépôt.
MAX_FILE_LINES = 500
MAX_FUNC_LINES = 50
MAX_ANY = 0

SCAN_ROOTS = ("packages", "apps")
SCAN_EXT = (".ts", ".tsx")
SKIP_DIRS = ("node_modules", "dist", ".git")

# Motifs d'un `any` de type. Volontairement étroits : `: any` et `as any`
# couvrent l'essentiel, `any[]` et `<any>` les formes restantes.
ANY_PATTERNS = (
    re.compile(r":\s*any\b"),
    re.compile(r"\bas\s+any\b"),
    re.compile(r"<\s*any\s*>"),
    re.compile(r"\bany\s*\[\s*\]"),
)

# Un commentaire n'est pas du code : on ne compte pas les `any` qu'il cite.
COMMENT_START = ("//", "/*", "*", "#")


def load_measure_functions():
    """La mesure de fonctions du garde : une seule implémentation, la sienne."""
    if GUARDS not in sys.path:
        sys.path.insert(0, GUARDS)
    try:
        from run_all import measure_functions  # import tardif voulu
    except Exception as error:  # dépend de l'arbre, pas du script
        print("::error::impossible de lire scripts/guards/run_all.py : %s" % error)
        raise SystemExit(1)
    return measure_functions


def walk_sources() -> list[str]:
    """Tous les fichiers TS du périmètre, triés, chemins relatifs à la racine."""
    found: list[str] = []
    for scan in SCAN_ROOTS:
        base = os.path.join(ROOT, scan)
        if not os.path.isdir(base):
            continue
        for folder, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for name in files:
                if name.endswith(SCAN_EXT):
                    found.append(os.path.relpath(os.path.join(folder, name), ROOT))
    return sorted(found)


def count_any(text: str) -> int:
    """Compte les `any` de type, hors lignes de commentaire."""
    total = 0
    for line in text.splitlines():
        if line.strip().startswith(COMMENT_START):
            continue
        total += sum(1 for pattern in ANY_PATTERNS if pattern.search(line))
    return total


def measure(path: str, measure_functions) -> dict[str, object]:
    """La ligne de tableau d'un fichier : taille, fonctions, plus longue, any."""
    with open(os.path.join(ROOT, path), encoding="utf-8", errors="replace") as handle:
        text = handle.read()
    lengths = [length for _, _, length in measure_functions(text)]
    return {
        "fichier": path,
        "lignes": len(text.splitlines()),
        "fonctions": len(lengths),
        "plus_longue": max(lengths) if lengths else 0,
        "any": count_any(text),
    }


def over_budget(row: dict[str, object]) -> list[str]:
    """Les dépassements d'un fichier, en clair ; liste vide s'il tient."""
    problems: list[str] = []
    if row["lignes"] > MAX_FILE_LINES:
        problems.append("%d lignes (> %d)" % (row["lignes"], MAX_FILE_LINES))
    if row["plus_longue"] > MAX_FUNC_LINES:
        problems.append("une fonction de %d lignes (> %d)" % (row["plus_longue"], MAX_FUNC_LINES))
    if row["any"] > MAX_ANY:
        problems.append("%d any (> %d)" % (row["any"], MAX_ANY))
    return problems


def sort_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    """Les fichiers fautifs d'abord, puis les plus lourds : on lit par gravité."""
    return sorted(rows, key=lambda row: (len(over_budget(row)) == 0, -int(row["lignes"])))


def print_table(rows: list[dict[str, object]]) -> None:
    """Le tableau, aligné : fichier, lignes, fonctions, plus longue, any."""
    print("%-58s %7s %9s %12s %4s" % ("fichier", "lignes", "fonctions", "plus longue", "any"))
    print("-" * 94)
    for row in rows:
        mark = " !" if over_budget(row) else ""
        print(
            "%-58s %7d %9d %12d %4d%s"
            % (row["fichier"], row["lignes"], row["fonctions"], row["plus_longue"], row["any"], mark)
        )


def report(rows: list[dict[str, object]]) -> int:
    """Affiche le verdict ; rend le code de sortie de la CI."""
    failing = [row for row in rows if over_budget(row)]
    for row in failing:
        print("::error file=%s::complexité : %s" % (row["fichier"], ", ".join(over_budget(row))))
    total_lines = sum(int(row["lignes"]) for row in rows)
    print(
        "%d fichier(s), %d ligne(s), %d dépasse(ment) — seuils : <%d lignes, <%d par fonction, %d any"
        % (len(rows), total_lines, len(failing), MAX_FILE_LINES, MAX_FUNC_LINES, MAX_ANY)
    )
    return 1 if failing else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Budget de complexité de packages/** et apps/**.")
    parser.add_argument("--top", type=int, default=0, help="n'afficher que les N fichiers les plus lourds")
    parser.add_argument("--json", action="store_true", help="sortir la mesure en JSON, sans tableau")
    args = parser.parse_args(argv)

    measure_functions = load_measure_functions()
    rows = sort_rows([measure(path, measure_functions) for path in walk_sources()])
    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 1 if any(over_budget(row) for row in rows) else 0
    shown = rows[: args.top] if args.top > 0 else rows
    print_table(shown)
    return report(rows)


if __name__ == "__main__":
    sys.exit(main())
