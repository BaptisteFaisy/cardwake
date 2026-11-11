#!/usr/bin/env python3
"""Gardes automatiques du dépôt Cardwake — exécutées par la CI (job `ci`).

Quatre contrôles, aucun réseau, stdlib uniquement :

1. `no-eval`      : aucune évaluation de texte comme code du navigateur
                     (`eval(`, `new Function`, `innerHTML`,
                     `dangerouslySetInnerHTML`) — CAR-N-01, recette 18.
2. `trademarks`   : les marques d'un tiers (5.4) n'apparaissent ni dans le
                     code, ni dans les piles, ni dans les libellés — CAR-N-11.
                     `README.md` et `docs/` restent autorisés : on peut y dire
                     d'où vient l'idée, en une phrase factuelle.
3. `secrets`      : aucune clé d'API en clair dans l'arbre — CAR-N-03.
4. `limits`       : fichiers < 500 lignes, fonctions < 50 lignes
                     (règle user 2026-10-24), avec liste d'exceptions explicite.

Sortie : code 0 si tout passe, 1 sinon ; une ligne `::error::` par problème
pour que GitHub annote le run.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 1. Constructions interdites : la sortie d'un modèle n'est jamais du code.
DANGEROUS = [
    (r"\beval\s*\(", "eval() — aucun texte n'est exécuté comme code"),
    (r"\bnew\s+Function\s*\(", "new Function() — aucun texte n'est exécuté"),
    (r"\.innerHTML\s*=", "innerHTML — aucun rendu HTML depuis le contenu d'une pile"),
    (r"dangerouslySetInnerHTML", "dangerouslySetInnerHTML — injection HTML"),
    (r"\bdocument\.write\s*\(", "document.write — injection HTML"),
]
DANGEROUS_SCAN = ("apps/", "packages/", "scripts/")
DANGEROUS_SKIP = ("/dist/", "/node_modules/", "run_all.py")

# 2. Marques d'un tiers (5.4). Jamais dans le produit, ses libellés, ses piles.
TRADEMARKS = [r"HyperCard", r"HyperTalk", r"\bApple\b", r"Macintosh"]
TRADEMARK_SCAN = ("apps/", "packages/", "stacks/", "evals/")
TRADEMARK_ALLOW = ("README.md", "docs/", ".kiro/", "CHANGELOG")

# 3. Motifs de clé. Le dépôt, les exports et le journal n'en contiennent aucun.
SECRET_PATTERNS = [
    (r"sk-[A-Za-z0-9_\-]{24,}", "clé sk-… en clair"),
    (r"sk_[a-f0-9]{32}", "clé sk_… en clair"),
    (r"ghp_[A-Za-z0-9]{36}", "jeton GitHub ghp_… en clair"),
    (r"github_pat_[A-Za-z0-9_]{40,}", "jeton fin GitHub en clair"),
    (r"-----BEGIN [A-Z ]*PRIVATE KEY-----", "clé privée en clair"),
]
SECRET_SKIP = ("run_all.py", "/node_modules/", "/dist/", ".git/")

# 4. Tailles (règle user 2026-10-24).
MAX_FILE_LINES = 500
MAX_FUNC_LINES = 50
LIMITS_SCAN_EXT = (".ts", ".tsx", ".py")
LIMITS_ALLOW_FILE = os.path.join("scripts", "guards", "allowlist.txt")

FUNC_START = re.compile(
    r"^(?P<indent>\s*)(?:(?:export|default|async|public|private|protected)\s+)*"
    r"(?:function\s*\*?\s*(?P<fname>[A-Za-z0-9_$]+)"
    r"|(?:const|let|var)\s+(?P<cname>[A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>"
    r"|(?:def\s+(?P<pyname>[A-Za-z0-9_]+)\s*\())"
)


def tracked_files() -> list[str]:
    """Liste les fichiers suivis par git (jamais les produits de build)."""
    out = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=False
    )
    if out.returncode != 0:
        return []
    return [p for p in out.stdout.decode("utf-8", "replace").split("\0") if p]


def read(path: str) -> str:
    with open(os.path.join(ROOT, path), encoding="utf-8", errors="replace") as fh:
        return fh.read()


def err(path: str, line: int, message: str) -> None:
    print("::error file=%s,line=%d::%s" % (path, line, message))


def skipped(path: str, needles: tuple[str, ...]) -> bool:
    norm = path.replace(os.sep, "/")
    return any(n.strip("/") in ("/" + norm + "/") or n in norm for n in needles)


def check_patterns(files: list[str], patterns, scan, allow, label) -> int:
    """Factorisé : les trois premiers contrôles sont des recherches de motifs."""
    found = 0
    for path in files:
        norm = path.replace(os.sep, "/")
        if scan and not norm.startswith(scan):
            continue
        if allow and any(a in norm for a in allow):
            continue
        for lineno, line in enumerate(read(path).splitlines(), 1):
            stripped = line.lstrip()
            if stripped.startswith("//") or stripped.startswith("#"):
                # Un commentaire qui cite la règle n'est pas une violation,
                # sauf pour les secrets : une clé en commentaire fuit quand même.
                if label != "secrets":
                    continue
            for pattern, message in patterns:
                if re.search(pattern, line):
                    err(path, lineno, "%s : %s" % (label, message))
                    found += 1
    return found


def measure_functions(text: str) -> list[tuple[str, int, int]]:
    """Rend (nom, ligne de début, longueur) pour chaque fonction d'un fichier.

    Heuristique assumée : on compte du premier `{` (ou de la ligne `def`)
    jusqu'à la ligne qui referme ce bloc, en suivant la profondeur des
    accolades. Un fichier de code reste sous 500 lignes, donc ce parcours
    linéaire ne coûte rien.
    """
    lines = text.splitlines()
    results: list[tuple[str, int, int]] = []
    depth = 0
    current: tuple[str, int, int] | None = None
    for index, line in enumerate(lines, 1):
        if current is None:
            match = FUNC_START.match(line)
            if match and ("{" in line or match.group("pyname")):
                name = match.group("fname") or match.group("cname") or match.group("pyname")
                current = (name or "?", index, depth)
        for char in line:
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
        if current is not None:
            name, start, base = current
            if depth <= base and index > start:
                results.append((name, start, index - start + 1))
                current = None
    return results


def check_limits(files: list[str]) -> int:
    allow: set[str] = set()
    if os.path.exists(os.path.join(ROOT, LIMITS_ALLOW_FILE)):
        allow = {
            line.strip()
            for line in read(LIMITS_ALLOW_FILE).splitlines()
            if line.strip() and not line.startswith("#")
        }
    found = 0
    for path in files:
        if not path.endswith(LIMITS_SCAN_EXT) or path in allow:
            continue
        text = read(path)
        lines = text.splitlines()
        if len(lines) > MAX_FILE_LINES:
            err(path, len(lines), "limits : %d lignes (> %d) — découper" % (len(lines), MAX_FILE_LINES))
            found += 1
        if path.endswith(".py"):
            continue
        for name, start, length in measure_functions(text):
            if length > MAX_FUNC_LINES:
                err(path, start, "limits : %s() fait %d lignes (> %d)" % (name, length, MAX_FUNC_LINES))
                found += 1
    return found


def check_kiro(files: list[str]) -> int:
    """CAR-N-13 : `/.kiro` est présent à la racine et suivi par git."""
    if any(f.replace(os.sep, "/").startswith(".kiro/") for f in files):
        return 0
    print("::error::.kiro/ absent du dépôt (CAR-N-13)")
    return 1


def main() -> int:
    files = tracked_files()
    if not files:
        print("::error::aucun fichier suivi par git — garde impossible")
        return 1
    problems = 0
    problems += check_patterns(
        [f for f in files if not skipped(f, DANGEROUS_SKIP)],
        DANGEROUS,
        DANGEROUS_SCAN,
        (),
        "no-eval",
    )
    problems += check_patterns(files, [(p, "marque d'un tiers") for p in TRADEMARKS], TRADEMARK_SCAN, TRADEMARK_ALLOW, "trademarks")
    problems += check_patterns(
        [f for f in files if not skipped(f, SECRET_SKIP)],
        SECRET_PATTERNS,
        (),
        (),
        "secrets",
    )
    problems += check_limits(files)
    problems += check_kiro(files)
    if problems:
        print("%d problème(s) — voir les annotations" % problems)
        return 1
    print("gardes : %d fichier(s) contrôlé(s), 0 problème" % len(files))
    return 0


if __name__ == "__main__":
    sys.exit(main())
