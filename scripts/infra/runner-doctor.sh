#!/usr/bin/env bash
# runner-doctor — le dépôt a-t-il un runner auto-hébergé en ligne, avec le
# label `cardwake-worker` ?
#
# Panne du 13/11 : la file de merge (`pr-auto-merge`) tourne sur
# `[self-hosted, linux, x64, cardwake-worker]`. Quand aucun runner en ligne ne
# porte ce label, GitHub ne refuse pas le job : il le laisse `queued` — pour
# toujours, sans notification, sans check rouge, sans échec de workflow. La
# file de merge s'arrête et personne ne l'apprend. Ce script rend cette panne
# bruyante en quelques secondes.
#
# Usage :
#   scripts/infra/runner-doctor.sh [owner/name] [--wait 120] [--label cardwake-worker]
#
#   owner/name   dépôt visé (défaut : dépôt courant du checkout, sinon
#                $GITHUB_REPOSITORY)
#   --wait S     réessaie pendant S secondes avant de conclure (défaut : 0)
#   --label L    label cherché (défaut : cardwake-worker) — utile pour vérifier
#                un autre projet, ou pour prouver que la panne est détectée
#                sans casser le service en cours.
#
# Codes de sortie : 0 = au moins un runner en ligne ; 1 = aucun ; 2 = usage ou
# API injoignable (on ne conclut pas).
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
      sed -n '2,24p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
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

# Liste des runners du dépôt : nom, état, label. `gh api --paginate` couvre
# les dépôts à plus de 100 runners.
sonder() {
  gh api --paginate "repos/$REPO/actions/runners?per_page=100" \
    --jq '.runners[] | [.name, .status, ([.labels[].name] | join(","))] | @tsv' 2>/dev/null
}

fin=$(( $(date +%s) + ATTENTE ))
while :; do
  RUNNERS="$(sonder)"
  code=$?
  if [ "$code" -ne 0 ] && [ -z "$RUNNERS" ]; then
    echo "::error::runner-doctor : API GitHub injoignable, ou droit d'administration absent sur $REPO (lister les runners du dépôt exige « admin »). Aucun verdict rendu."
    exit 2
  fi
  EN_LIGNE="$(printf '%s\n' "$RUNNERS" | awk -F'\t' -v label="$LABEL" '
    NF >= 3 {
      n = split($3, labels, ",")
      for (i = 1; i <= n; i++) if (labels[i] == label && $2 == "online") { print $1; break }
    }')"
  if [ -n "$EN_LIGNE" ]; then
    echo "OK — runner(s) en ligne avec le label $LABEL sur $REPO :"
    printf '%s\n' "$EN_LIGNE" | sed 's/^/  - /'
    exit 0
  fi
  if [ "$(date +%s)" -ge "$fin" ]; then
    break
  fi
  sleep 10
done

echo "::error::PANNE — aucun runner EN LIGNE avec le label '$LABEL' sur $REPO."
echo "  Conséquence : tout job en runs-on: [self-hosted, linux, x64, $LABEL]"
echo "  reste en 'queued' indéfiniment (aucun échec, aucun bruit) et la file"
echo "  de merge (pr-auto-merge) s'arrête."
echo "  Runners connus de ce dépôt (nom / état / labels) :"
printf '%s\n' "$RUNNERS" | sed 's/\t/  |  /g; s/^/    /'
echo "  Reprise : démarrer l'unité systemd utilisateur sur le r630"
echo "    ssh baptiste@100.124.18.48 'systemctl --user start actions-runner-cardwake-01'"
echo "    puis relancer ce script. Détail : docs/infra.md."
exit 1
