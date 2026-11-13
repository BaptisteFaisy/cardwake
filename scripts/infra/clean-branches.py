#!/usr/bin/env python3
"""Nettoyage des branches distantes mortes : on liste, puis on supprime.

Le dépôt porte une quarantaine de branches distantes, dont beaucoup de
branches de lot (`lot-*`), de correction (`fix/*`) ou de fonctionnalité
(`feat/*`) déjà mergées. Les garder coûte des appels d'API et brouille la
lecture de l'état du chantier ; les supprimer sans regarder casse le travail
en cours.

Politique, dans cet ordre (le doute profite toujours à la branche) :

  GARDÉE      la base (`main`), ou une branche nommée par `--protegee` ;
  GARDÉE      une PR `OPEN` porte la branche — vérifié par l'API, jamais deviné ;
  GARDÉE      la branche est ouverte dans un worktree local (quelqu'un
              travaille dessus en ce moment) ;
  SUPPRIMABLE la PR de la branche est `MERGED` (vérifié par l'API) ;
  SUPPRIMABLE aucune PR, et la tête est déjà contenue dans la base
              (`compare` : `ahead_by == 0`) — la branche ne porte aucun commit ;
  GARDÉE      aucune PR et des commits absents de la base : travail non mergé.
              C'est la règle « en cas de doute, laisse-la et dis-le » ;
              `--allow-unmerged` lève cette garde explicitement.

Aucun push forcé : une branche supprimée ici est déjà dans la base, donc
`git push origin --delete` suffit (le garde `couche0` refuse le push forcé).

Usage :
  python3 scripts/infra/clean-branches.py              # liste, n'écrit rien
  python3 scripts/infra/clean-branches.py --apply      # supprime les sûres
  python3 scripts/infra/clean-branches.py --apply --allow-unmerged

Options :
  --repo owner/name   dépôt visé (défaut : celui du checkout, vu par `gh`)
  --base main         branche de référence (défaut : main)
  --apply             exécute les suppressions (défaut : liste seule)
  --allow-unmerged    supprime aussi les branches sans PR ni merge
  --protegee NOM      branche supplémentaire à ne jamais toucher (répétable)
  --limit N           n'affiche que les N premières lignes de chaque groupe

Bibliothèque standard uniquement. L'authentification est celle de `gh`
(`gh auth status`) : ce script ne lit ni ne transporte aucun jeton.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys

MAX_PAGES = 15
PER_PAGE = 100

GARDEE_BASE = "gardée (branche de base)"
GARDEE_PR_OUVERTE = "gardée (PR ouverte)"
GARDEE_WORKTREE = "gardée (worktree local)"
GARDEE_NON_MERGEE = "gardée (travail non mergé)"
SUPPR_PR = "supprimable (PR mergée)"
SUPPR_CONTIENT = "supprimable (commits déjà dans la base)"
SUPPR_FORCEE = "supprimable (--allow-unmerged)"

ORDRE_AFFICHAGE = [SUPPR_PR, SUPPR_CONTIENT, SUPPR_FORCEE,
                   GARDEE_PR_OUVERTE, GARDEE_WORKTREE, GARDEE_NON_MERGEE, GARDEE_BASE]


class Erreur(Exception):
    """Échec de `gh` ou de `git` : on s'arrête, on ne devine pas."""


def gh(args: list[str]) -> str:
    """Lance `gh` et rend sa sortie standard (auth native, aucun jeton ici)."""
    sortie = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=120)
    if sortie.returncode != 0:
        raise Erreur("gh %s : %s" % (" ".join(args[:3]), (sortie.stderr or "").strip()[:300]))
    return sortie.stdout


def git(args: list[str]) -> str:
    """Lance `git` et rend sa sortie standard."""
    sortie = subprocess.run(["git", *args], capture_output=True, text=True, timeout=120)
    if sortie.returncode != 0:
        raise Erreur("git %s : %s" % (" ".join(args), (sortie.stderr or "").strip()[:300]))
    return sortie.stdout


def verifier_gh() -> None:
    """`gh` présent et authentifié : sans ça, aucun verdict fiable."""
    try:
        sortie = subprocess.run(["gh", "auth", "status"], capture_output=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise Erreur("gh introuvable : %s" % exc)
    if sortie.returncode != 0:
        raise Erreur("gh n'est pas authentifié — lancer « gh auth login » une fois.")


def depot(argument: str | None) -> str:
    """`owner/name` : l'argument, sinon le dépôt vu par `gh` depuis le checkout."""
    if argument:
        return argument
    return gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]).strip()


def branches_distantes() -> dict[str, str]:
    """Branche → SHA de tête, lu sur le distant (aucune écriture locale)."""
    branches = {}
    for ligne in git(["ls-remote", "--heads", "origin"]).splitlines():
        sha, _, ref = ligne.partition("\t")
        if ref.startswith("refs/heads/"):
            branches[ref[len("refs/heads/"):]] = sha
    return branches


def worktrees_actifs() -> set[str]:
    """Branches ouvertes dans un worktree local : du travail en cours."""
    try:
        sortie = git(["worktree", "list", "--porcelain"])
    except Erreur:
        return set()
    return {ligne[len("branch refs/heads/"):]
            for ligne in sortie.splitlines()
            if ligne.startswith("branch refs/heads/")}


def pulls(repo: str) -> dict[str, dict]:
    """Branche de tête → PR la plus récente (toutes PR confondues)."""
    carte: dict[str, dict] = {}
    for page in range(1, MAX_PAGES + 1):
        lignes = gh([
            "api", "--paginate",
            "repos/%s/pulls?state=all&per_page=%d&page=%d&sort=updated&direction=asc"
            % (repo, PER_PAGE, page),
            "--jq", '.[] | {number, state, merged: (.merged_at != null), ref: .head.ref}',
        ])
        lot = [json.loads(l) for l in lignes.splitlines() if l.strip()]
        # Ordre croissant d'ancienneté : la PR la plus récente écrase.
        for pull in lot:
            if pull.get("ref"):
                carte[pull["ref"]] = pull
        if len(lot) < PER_PAGE:
            break
    return carte


def contenu_dans_base(repo: str, base: str, branche: str) -> bool:
    """Vrai si la branche n'a aucun commit absent de `base` (`ahead_by == 0`)."""
    sortie = gh(["api", "repos/%s/compare/%s...%s" % (repo, base, branche),
                 "--jq", ".ahead_by"])
    return int(sortie.strip() or "1") == 0


def classer(branche: str, contexte: dict) -> tuple[str, str]:
    """Rend (verdict, détail lisible) pour une branche distante."""
    base = contexte["base"]
    pull = contexte["pulls"].get(branche)
    if branche == base or branche in contexte["protegees"]:
        return GARDEE_BASE, "branche de référence ou protégée"
    if pull and pull.get("state") == "open":
        return GARDEE_PR_OUVERTE, "PR #%s" % pull["number"]
    if branche in contexte["worktrees"]:
        return GARDEE_WORKTREE, "worktree local"
    if pull and pull.get("merged"):
        return SUPPR_PR, "PR #%s MERGED" % pull["number"]
    if contenu_dans_base(contexte["repo"], base, branche):
        if pull:
            return SUPPR_CONTIENT, "PR #%s fermée sans merge, commits dans %s" % (
                pull["number"], base)
        return SUPPR_CONTIENT, "aucune PR, commits dans %s" % base
    if contexte["allow_unmerged"]:
        return SUPPR_FORCEE, "aucune PR, commits absents de %s" % base
    return GARDEE_NON_MERGEE, "aucune PR ouverte, commits absents de %s" % base


def supprimer(branche: str, appliquer: bool) -> bool:
    """`git push origin --delete` (jamais forcé) ; rend True si c'est passé."""
    if not appliquer:
        return True
    try:
        git(["push", "origin", "--delete", branche])
    except Erreur as exc:
        print("::error::suppression refusée : %s" % exc)
        return False
    return True


def afficher(verdicts: list[tuple[str, str, str]], limite: int) -> None:
    """Une ligne par branche, groupée par verdict, ordre stable."""
    for categorie in ORDRE_AFFICHAGE:
        lignes = [l for l in verdicts if l[0] == categorie]
        if not lignes:
            continue
        print("\n== %s (%d) ==" % (categorie, len(lignes)))
        montrees = lignes[:limite] if limite else lignes
        for _, branche, detail in montrees:
            print("  %-38s %s" % (branche, detail))
        if limite and len(lignes) > limite:
            print("  … et %d autre(s) (--limit 0 pour tout voir)" % (len(lignes) - limite))


def arguments(argv: list[str] | None = None) -> argparse.Namespace:
    """Les options de la ligne de commande."""
    parseur = argparse.ArgumentParser(
        description="Liste puis supprime les branches distantes mortes.")
    parseur.add_argument("--repo", default=None, help="owner/name (défaut : celui du checkout)")
    parseur.add_argument("--base", default="main", help="branche de référence")
    parseur.add_argument("--apply", action="store_true",
                         help="supprime les branches sûres (défaut : liste seule)")
    parseur.add_argument("--allow-unmerged", action="store_true",
                         help="supprime aussi les branches sans PR ni merge")
    parseur.add_argument("--protegee", action="append", default=[],
                         help="branche à ne jamais toucher (répétable)")
    parseur.add_argument("--limit", type=int, default=0,
                         help="n'affiche que N lignes par groupe (0 = tout)")
    return parseur.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = arguments(argv)
    try:
        verifier_gh()
        repo = depot(args.repo)
        contexte = {
            "repo": repo,
            "base": args.base,
            "pulls": pulls(repo),
            "worktrees": worktrees_actifs(),
            "protegees": set(args.protegee) | {args.base},
            "allow_unmerged": args.allow_unmerged,
        }
        branches = branches_distantes()
    except Erreur as exc:
        print("::error::%s" % exc)
        return 2
    verdicts = []
    for branche in sorted(branches):
        verdict, detail = classer(branche, contexte)
        verdicts.append((verdict, branche, detail))
    print("dépôt %s — %d branche(s) distante(s), base %s" % (repo, len(branches), args.base))
    afficher(verdicts, args.limit)
    a_supprimer = [v for v in verdicts if v[0].startswith("supprimable")]
    if not args.apply:
        print("\n%d branche(s) supprimable(s) — relancer avec --apply pour agir."
              % len(a_supprimer))
        return 0
    echecs = [v[1] for v in a_supprimer if not supprimer(v[1], True)]
    print("\n%d branche(s) supprimée(s), %d échec(s)."
          % (len(a_supprimer) - len(echecs), len(echecs)))
    return 1 if echecs else 0


if __name__ == "__main__":
    sys.exit(main())
