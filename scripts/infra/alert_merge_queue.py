#!/usr/bin/env python3
"""Alerte « file de merge bloquée » — un seul commentaire par PR, mis à jour.

Une PR `open` peut rester bloquée sans que personne ne le voie : un check
requis (`ci`, `ci-budget`, `couche0`) est `pending`/absent, ou l'état de fusion
vaut `BLOCKED`/`UNKNOWN`, et rien ne bouge. La file de merge ne prend que des
PR vertes : elle ne dit rien, elle attend. Ce script rend l'attente visible.

Ce qu'il fait, en lecture :

  * liste les PR `open` du dépôt courant (jamais un autre dépôt) ;
  * pour chacune, lit les checks requis depuis le ruleset de la base
    (`/rulesets/{id}`) quand c'est possible, sinon retombe sur la liste
    `ci`/`ci-budget`/`couche0` — les trois checks du ruleset de `main` ;
  * mesure depuis quand c'est bloqué : `updated_at` de la PR et l'instant du
    dernier changement d'état de chaque check requis ;
  * retient les PR bloquées depuis plus de `--seuil` minutes (défaut 10).

Ce qu'il écrit, en un seul endroit par PR :

  * un commentaire identifié par une marque invisible
    (`<!-- alert-merge-queue -->`) : s'il existe, il est **mis à jour sur
    place** ; jamais un commentaire par passage ;
  * une ligne dans le résumé du job (`$GITHUB_STEP_SUMMARY`).

Hors périmètre, volontairement : il ne relance aucun job, ne modifie aucune
branche, ne touche à aucun fichier de garde, et ne commente que les PR du
dépôt où il tourne (`GITHUB_REPOSITORY` / `--repo`).

Usage :
  python3 scripts/infra/alert_merge_queue.py [--seuil 10] [--dry-run]
                                             [--max-pr 30] [--repo o/n]

Codes de sortie : 0 = verdict rendu (bloquées ou non), 2 = erreur d'API.
Aucune exception silencieuse : une PR illisible est signalée dans le résumé.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request

API = os.environ.get("GITHUB_API_URL", "https://api.github.com")
MARQUE = "<!-- alert-merge-queue -->"
CHECKS_DEFAUT = ("ci", "ci-budget", "couche0")
ETATS_BLOQUES = ("BLOCKED", "UNKNOWN")
MAX_PAGES = 10


class Erreur(Exception):
    """Échec d'API : le job le dit et sort en 2, sans rien commenter."""


def jeton() -> str:
    """Le jeton du workflow. Aucun autre chemin : pas de fichier, pas de gh."""
    jeton = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not jeton:
        raise Erreur("GITHUB_TOKEN absent : ce script ne lit aucun jeton en fichier")
    return jeton


def api(chemin: str, token: str, methode: str = "GET", corps: dict | None = None):
    """Appel JSON à l'API GitHub ; rend le corps décodé (ou None si 404)."""
    donnees = json.dumps(corps).encode("utf-8") if corps is not None else None
    requete = urllib.request.Request(API + chemin, data=donnees, method=methode)
    requete.add_header("Authorization", "bearer " + token)
    requete.add_header("Accept", "application/vnd.github+json")
    requete.add_header("User-Agent", "alert-merge-queue")
    if donnees is not None:
        requete.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(requete, timeout=30) as reponse:
            brut = reponse.read().decode("utf-8")
            return json.loads(brut) if brut.strip() else None
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise Erreur("%s %s : HTTP %s" % (methode, chemin, exc.code))
    except urllib.error.URLError as exc:
        raise Erreur("%s %s : %s" % (methode, chemin, exc.reason))


def instant(texte: str | None) -> dt.datetime | None:
    """Horodatage ISO 8601 de l'API → datetime conscient du fuseau."""
    if not texte:
        return None
    return dt.datetime.fromisoformat(texte.replace("Z", "+00:00"))


def maintenant() -> dt.datetime:
    """Horloge du run : une seule lecture, pour un seuil cohérent partout."""
    return dt.datetime.now(dt.timezone.utc)


def checks_requis(repo: str, base: str, token: str) -> tuple[str, ...]:
    """Contextes exigés par le ruleset actif de la base (repli : les trois)."""
    rulesets = api("/repos/%s/rulesets?per_page=100" % repo, token) or []
    for ruleset in rulesets:
        if ruleset.get("target") != "branch" or ruleset.get("enforcement") != "active":
            continue
        detail = api("/repos/%s/rulesets/%s" % (repo, ruleset["id"]), token) or {}
        refs = ((detail.get("conditions") or {}).get("ref_name") or {})
        if "refs/heads/" + base not in (refs.get("include") or []):
            continue
        for regle in detail.get("rules") or []:
            if regle.get("type") != "required_status_checks":
                continue
            contextes = [
                c.get("context")
                for c in ((regle.get("parameters") or {}).get("required_status_checks") or [])
                if c.get("context")
            ]
            if contextes:
                return tuple(contextes)
    return CHECKS_DEFAUT


def prs_ouvertes(repo: str, token: str, plafond: int) -> list[dict]:
    """Les PR `open`, de la plus anciennement mise à jour à la plus récente."""
    resultat, page = [], 1
    while page <= MAX_PAGES and len(resultat) < plafond:
        lot = api("/repos/%s/pulls?state=open&per_page=100&page=%d&sort=updated&direction=asc"
                  % (repo, page), token) or []
        resultat.extend(lot)
        if len(lot) < 100:
            break
        page += 1
    return resultat[:plafond]


def checks_de_la_tete(repo: str, sha: str, token: str) -> dict[str, dict]:
    """Nom du check → {status, conclusion, started_at} sur la tête de la PR."""
    reponse = api("/repos/%s/commits/%s/check-runs?per_page=100" % (repo, sha), token) or {}
    return {c.get("name", "?"): c for c in reponse.get("check_runs") or []}


def raison_blocage(pr: dict, requis: tuple[str, ...], checks: dict[str, dict]) -> str:
    """Pourquoi la PR n'avance pas (chaîne vide : elle avance)."""
    etat = pr.get("mergeable_state") or "UNKNOWN"
    manquants = [nom for nom in requis if nom not in checks]
    en_cours = [
        nom for nom in requis
        if nom in checks and checks[nom].get("status") != "completed"
    ]
    if manquants:
        return "check(s) requis jamais lancé(s) : %s" % ", ".join(manquants)
    if en_cours:
        return "check(s) requis encore en cours : %s" % ", ".join(en_cours)
    if etat in ETATS_BLOQUES:
        return "état de fusion `%s` alors que les checks requis sont terminés" % etat
    return ""


def depuis(pr: dict, requis: tuple[str, ...], checks: dict[str, dict]) -> dt.datetime | None:
    """Le plus récent des instants qui expliquent l'attente actuelle.

    On prend le maximum : tant qu'un check requis démarre ou se termine, la
    situation change et le blocage n'est pas encore « vieux ». L'attente se
    mesure donc depuis le dernier mouvement, pas depuis la création de la PR.
    """
    candidats = [instant(pr.get("updated_at"))]
    for nom in requis:
        candidats.append(instant((checks.get(nom) or {}).get("started_at")))
    connus = [c for c in candidats if c is not None]
    return max(connus) if connus else None


def analyser(repo: str, token: str, seuil: int, plafond: int, requis: tuple[str, ...]):
    """Rend (bloquées, saines, illisibles) — chaque bloquée porte son détail."""
    bloquees, saines, illisibles = [], [], []
    horloge = maintenant()
    for pr in prs_ouvertes(repo, token, plafond):
        numero = pr["number"]
        if pr.get("draft"):
            continue
        try:
            checks = checks_de_la_tete(repo, pr["head"]["sha"], token)
        except Erreur as exc:
            illisibles.append((numero, str(exc)))
            continue
        raison = raison_blocage(pr, requis, checks)
        age = depuis(pr, requis, checks)
        minutes = int((horloge - age).total_seconds() // 60) if age else 0
        if raison and minutes >= seuil:
            bloquees.append({
                "numero": numero,
                "titre": pr.get("title") or "",
                "branche": (pr.get("head") or {}).get("ref") or "?",
                "etat": pr.get("mergeable_state") or "UNKNOWN",
                "raison": raison,
                "minutes": minutes,
                "url": pr.get("html_url") or "",
            })
        elif raison:
            saines.append((numero, "bloquée depuis %d min (< seuil)" % minutes))
        else:
            saines.append((numero, "avance"))
    return bloquees, saines, illisibles


def corps_du_commentaire(pr: dict, seuil: int) -> str:
    """Le corps markdown d'une PR, réécrit à chaque passage : même place, à jour."""
    return "\n".join([
        MARQUE,
        "_alerte automatique · `scripts/infra/alert_merge_queue.py` · seuil %d min_"
        % seuil,
        "",
        "- état de fusion : `%s`" % pr["etat"],
        "- bloquée depuis : **%d min**" % pr["minutes"],
        "- cause : %s" % pr["raison"],
        "",
        "La file de merge ne prend que des PR vertes : tant que c'est bloqué, "
        "elle attend sans rien dire. Le remède est côté cause — un check requis "
        "absent se relance (`gh workflow run`), un job auto-hébergé `queued` "
        "depuis des heures signale un runner hors ligne "
        "(`scripts/infra/runner-doctor.sh`).",
        "",
        "Ce commentaire est mis à jour sur place à chaque passage, jamais "
        "dupliqué.",
    ])


def trouver_commentaire(repo: str, numero: int, token: str) -> int | None:
    """Identifiant du commentaire d'alerte déjà posé sur cette PR, s'il existe."""
    commentaires = api("/repos/%s/issues/%d/comments?per_page=100" % (repo, numero), token) or []
    for commentaire in commentaires:
        if MARQUE in (commentaire.get("body") or ""):
            return commentaire.get("id")
    return None


def publier(repo: str, cible: dict, corps: str, token: str, seche: bool) -> str:
    """Crée ou met à jour LE commentaire d'alerte ; rend ce qui a été fait."""
    if seche:
        return "à écrire (essai à blanc)"
    existant = trouver_commentaire(repo, cible["numero"], token)
    if existant is None:
        api("/repos/%s/issues/%d/comments" % (repo, cible["numero"]), token,
            "POST", {"body": corps})
        return "commentaire créé"
    api("/repos/%s/issues/comments/%d" % (repo, existant), token, "PATCH", {"body": corps})
    return "commentaire mis à jour"


def resume(lignes: list[str]) -> None:
    """Écrit le résumé du job (et le log, pour la lecture en console)."""
    texte = "\n".join(lignes)
    print(texte)
    chemin = os.environ.get("GITHUB_STEP_SUMMARY")
    if not chemin:
        return
    try:
        with open(chemin, "a", encoding="utf-8") as fichier:
            fichier.write("### File de merge\n\n" + texte + "\n")
    except OSError:
        pass


def arguments(argv: list[str] | None = None) -> argparse.Namespace:
    """Les options (une seule définition du parseur, utilisable en test)."""
    parseur = argparse.ArgumentParser(description="Alerte de file de merge bloquée.")
    parseur.add_argument("--repo", default=None,
                         help="owner/name (défaut : GITHUB_REPOSITORY)")
    parseur.add_argument("--base", default="main", help="branche de base (défaut : main)")
    parseur.add_argument("--seuil", type=int, default=10,
                         help="minutes de blocage avant alerte (défaut : 10)")
    parseur.add_argument("--max-pr", type=int, default=30,
                         help="nombre de PR examinées, les plus anciennes d'abord")
    parseur.add_argument("--dry-run", action="store_true",
                         help="n'écrit aucun commentaire, dit ce qu'il ferait")
    parseur.add_argument("-v", "--verbeux", action="store_true",
                         help="liste aussi les PR qui avancent")
    return parseur.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = arguments(argv)
    repo = args.repo or os.environ.get("GITHUB_REPOSITORY", "")
    if not repo:
        print("::error::dépôt inconnu : --repo owner/name ou GITHUB_REPOSITORY")
        return 2
    try:
        token = jeton()
        requis = checks_requis(repo, args.base, token)
        bloquees, saines, illisibles = analyser(
            repo, token, args.seuil, args.max_pr, requis)
    except Erreur as exc:
        print("::error::alerte impossible : %s" % exc)
        return 2
    rapport = ["Dépôt `%s` · checks requis : %s · seuil %d min"
               % (repo, ", ".join("`%s`" % c for c in requis), args.seuil)]
    if bloquees:
        rapport.append("**%d PR bloquée(s) depuis plus de %d min.**"
                       % (len(bloquees), args.seuil))
        for p in bloquees:
            # Une PR bloquée vieille d'heures est une panne d'infrastructure :
            # l'annotation la rend visible dans l'onglet du run.
            if p["minutes"] >= 60:
                print("::warning::PR #%d bloquée %d min — %s"
                      % (p["numero"], p["minutes"], p["raison"]))
            try:
                action = publier(repo, p, corps_du_commentaire(p, args.seuil),
                                 token, args.dry_run)
            except Erreur as exc:
                action = "commentaire refusé (%s)" % exc
            rapport.append("- #%d `%s` %d min — %s — %s"
                           % (p["numero"], p["branche"], p["minutes"], p["raison"], action))
    else:
        rapport.append("aucune PR bloquée au-delà de %d min." % args.seuil)
    if illisibles:
        rapport.append("")
        rapport.append("Illisibles (non jugées) : %s"
                       % ", ".join("#%d (%s)" % (n, e) for n, e in illisibles))
    if args.verbeux:
        rapport.append("")
        rapport.append("Autres PR ouvertes : %s"
                       % (", ".join("#%d %s" % s for s in saines) or "aucune"))
    resume(rapport)
    return 0


if __name__ == "__main__":
    sys.exit(main())
