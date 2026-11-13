#!/usr/bin/env bash
# runner-doctor — un job auto-hébergé peut-il démarrer sur ce dépôt ?
#
# Panne du 13/11 : la file de merge (`pr-auto-merge`) et le triage des rouges
# tournent sur `[self-hosted, linux, x64, cardwake-worker]`. Quand aucun runner
# en ligne ne peut porter ce label pour ce dépôt, GitHub ne refuse pas le job :
# il le laisse `queued` — pour toujours, sans notification, sans check rouge.
# La file de merge s'arrête et personne ne l'apprend. Ce script rend cette
# panne bruyante en quelques secondes.
#
# « Peut porter le label pour ce dépôt », c'est plus large qu'« est
# enregistré dans ce dépôt » : un runner d'organisation sert aussi ce dépôt si
# le groupe qui le contient l'autorise (visibilité `all`, ou dépôt
# explicitement sélectionné) et si le groupe autorise les dépôts publics
# quand le dépôt est public. Les deux sources sont donc regardées.
#
# Usage :
#   scripts/infra/runner-doctor.sh [owner/name] [--wait 120] [--label L]
#
#   owner/name   dépôt visé (défaut : dépôt courant du checkout, sinon
#                $GITHUB_REPOSITORY)
#   --wait S     réessaie pendant S secondes avant de conclure (défaut : 0)
#   --label L    label cherché (défaut : cardwake-worker)
#
# Codes de sortie : 0 = au moins un runner éligible en ligne ; 1 = aucun
# (panne) ; 2 = API injoignable ou droits insuffisants pour conclure.
#
# Authentification : celle de `gh` (trousseau, `gh auth login`). Aucun jeton
# n'est lu dans un fichier, aucun n'est écrit sur la sortie.

set -uo pipefail

LABEL="cardwake-worker"
REPO=""
ATTENTE=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      sed -n '2,31p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    --wait)
      [ "$#" -ge 2 ] || { echo "::error::--wait attend une valeur en secondes (--wait 120)" >&2; exit 2; }
      ATTENTE="$2"
      shift 2
      ;;
    --wait=*)
      ATTENTE="${1#--wait=}"
      shift
      ;;
    --label)
      [ "$#" -ge 2 ] || { echo "::error::--label attend un nom de label" >&2; exit 2; }
      LABEL="$2"
      shift 2
      ;;
    --label=*)
      LABEL="${1#--label=}"
      shift
      ;;
    *)
      REPO="$1"
      shift
      ;;
  esac
done

case "$ATTENTE" in
  ''|*[!0-9]*) echo "::error::--wait attend un nombre de secondes (reçu : $ATTENTE)" >&2; exit 2 ;;
esac

command -v gh >/dev/null 2>&1 || {
  echo "::error::runner-doctor : gh est absent du PATH — installer gh (auth native, aucun jeton en fichier)."
  exit 2
}

if ! gh auth status >/dev/null 2>&1; then
  echo "::error::runner-doctor : gh n'est pas authentifié — lancer « gh auth login » une fois sur cette machine."
  exit 2
fi

if [ -z "$REPO" ]; then
  REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)"
fi
if [ -z "$REPO" ]; then
  REPO="${GITHUB_REPOSITORY:-}"
fi
if [ -z "$REPO" ]; then
  echo "::error::runner-doctor : dépôt inconnu — passer owner/name en argument."
  exit 2
fi

ORG="${REPO%%/*}"
PRIVE="$(gh api "repos/$REPO" --jq '.private' 2>/dev/null || echo true)"

# Trois lectures de l'API, toutes par `gh` (auth native) : les runners du
# dépôt, les groupes de l'organisation, et les runners de chaque groupe.
lignes_depot() {
  gh api --paginate "repos/$REPO/actions/runners?per_page=100" \
    --jq '.runners[] | [.name, .status, ([.labels[].name] | join(","))] | @tsv' 2>/dev/null
}

lignes_groupes() {
  gh api --paginate "orgs/$ORG/actions/runner-groups?per_page=100" \
    --jq '.runner_groups[] | [.id, .name, .visibility, (.allows_public_repositories|tostring)] | @tsv' 2>/dev/null
}

lignes_runners_groupe() {
  gh api --paginate "orgs/$ORG/actions/runner-groups/$1/runners?per_page=100" \
    --jq '.runners[] | [.name, .status, ([.labels[].name] | join(","))] | @tsv' 2>/dev/null
}

depot_dans_groupe() {
  gh api --paginate "orgs/$ORG/actions/runner-groups/$1/repositories?per_page=100" \
    --jq '.repositories[].full_name' 2>/dev/null | grep -Fxq "$REPO"
}

# Un runner en ligne et éligible : son nom et l'origine du droit.
# Code de retour : 0 = verdict rendu, 3 = groupes d'organisation illisibles.
eligibles() {
  local nom etat labels
  while IFS=$'\t' read -r nom etat labels; do
    [ -n "${nom:-}" ] || continue
    if [ "$etat" = "online" ] && printf '%s' ",$labels," | grep -q ",$LABEL,"; then
      printf '%s\t%s\n' "$nom" "runner du dépôt"
    fi
  done <<< "$(lignes_depot)"
  local groupes_org
  groupes_org="$(lignes_groupes)"
  if [ -z "$groupes_org" ]; then
    return 3
  fi
  local id nomgroupe visibilite publics
  while IFS=$'\t' read -r id nomgroupe visibilite publics; do
    [ -n "${id:-}" ] || continue
    if [ "$visibilite" != "all" ] && ! depot_dans_groupe "$id"; then
      continue
    fi
    if [ "$PRIVE" = "false" ] && [ "$publics" != "true" ]; then
      continue
    fi
    while IFS=$'\t' read -r nom etat labels; do
      [ -n "${nom:-}" ] || continue
      if [ "$etat" = "online" ] && printf '%s' ",$labels," | grep -q ",$LABEL,"; then
        printf '%s\t%s\n' "$nom" "groupe d'organisation « $nomgroupe »"
      fi
    done <<< "$(lignes_runners_groupe "$id")"
  done <<< "$groupes_org"
  return 0
}

fin=$(( $(date +%s) + ATTENTE ))
while :; do
  SORTIE="$(eligibles)"
  code=$?
  if [ "$code" -eq 3 ]; then
    echo "::warning::les groupes de runners de l'organisation $ORG sont illisibles (droits « admin:org » manquants) : seul le périmètre du dépôt a été regardé."
  elif [ "$code" -ne 0 ]; then
    echo "::error::runner-doctor : API GitHub injoignable — aucun verdict rendu."
    exit 2
  fi
  if [ -n "$SORTIE" ]; then
    echo "OK — runner(s) en ligne portant le label $LABEL pour $REPO :"
    printf '%s\n' "$SORTIE" | while IFS=$'\t' read -r nom origine; do
      printf '  - %s (%s)\n' "$nom" "$origine"
    done
    exit 0
  fi
  if [ "$(date +%s)" -ge "$fin" ]; then
    break
  fi
  sleep 10
done

echo "::error::PANNE — aucun runner EN LIGNE portant le label '$LABEL' ne peut servir $REPO."
echo "  Conséquence : tout job en runs-on: [self-hosted, linux, x64, $LABEL]"
echo "  reste en 'queued' indéfiniment (aucun échec, aucun bruit) et la file"
echo "  de merge (pr-auto-merge) s'arrête."
echo "  Runners enregistrés dans le dépôt (nom / état / labels) :"
lignes_depot | sed 's/\t/  |  /g; s/^/    /'
echo "  (aucun runner de dépôt : il faut en enregistrer un — voir docs/infra.md)"
echo "  Reprise rapide : démarrer l'unité systemd utilisateur du runner"
echo "    ssh baptiste@100.124.18.48 'systemctl --user start actions-runner-cardwake-01'"
echo "  puis relancer ce script. Détail : docs/infra.md."
exit 1
