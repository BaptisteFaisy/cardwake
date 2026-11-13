# Infrastructure CI — la topologie réelle

Ce document décrit ce qui existe **aujourd'hui**, pas ce qui serait souhaitable.
Relevé fait le 13/11/2026 au soir (19 h 12 → 19 h 45) avec `gh api`, `gh run
list`, `systemctl --user` sur le r630 et `ssh`. Chaque affirmation ci-dessous a
été vérifiée à ce moment-là ; là où un point n'est pas résolu, c'est écrit.

Un avertissement qui vaut pour tout le fichier : **cet état bouge**. Pendant le
relevé lui-même, le runner `r630-cardwake-01` est passé de `online` à `offline`
et `pc-cardwake-03` est passé de disparu à `online`. Un relevé de la semaine
dernière ne dit rien de maintenant : relancer `scripts/infra/runner-doctor.sh`
avant de conclure.

## 1. Où tourne chaque job

| Workflow | Déclencheurs | Runner | Budget |
| --- | --- | --- | --- |
| `ci.yml` → `ci` | `pull_request`, `merge_group`, manuel | `ubuntu-latest` (hébergé GitHub) | 5 min |
| `ci-budget.yml` → `ci-budget` | `pull_request`, `push` sur `main`, manuel | `ubuntu-latest` | 5 min |
| `couche0.yml` → `couche0` | `pull_request`, `merge_group`, `push` sur `gh-readonly-queue/**`, manuel | `ubuntu-latest` | 5 min |
| `stale-base-guard.yml` → `guard` | `pull_request`, manuel | `ubuntu-latest` | 5 min |
| `pages.yml` → `build`, `deploy` | `push` sur `main`, manuel | `ubuntu-latest` | 5 min |
| `pr-auto-merge.yml` → `discover`, `sweep` | `schedule` (`*/5`, toutes les 5 min), `workflow_run` sur `CI`, `pull_request` (`ready_for_review`, `edited`), `push` sur `main` | **auto-hébergé** `[self-hosted, linux, x64, cardwake-worker]` | 5 min |
| `triage-rouge.yml` → `triage` | `workflow_run` sur `CI`, manuel | **auto-hébergé** `[self-hosted, linux, x64, cardwake-worker]` | 25 min (hors PR) |
| `alert-merge-queue.yml` → `alerte` (nouveau, ce lot) | `schedule` (10 min), manuel | `ubuntu-latest` | 5 min |
| `nightly.yml` → `passage-de-nuit` (nouveau, ce lot) | `schedule` (une fois par nuit), manuel | `ubuntu-latest` | 30 min, hors PR |

Les trois checks exigés par le ruleset de `main` sont `ci`, `ci-budget` et
`couche0` (ruleset `main — PR obligatoire, checks requis (ci, ci-budget,
couche0)`, cible `refs/heads/main`, `enforcement: active`). Ce sont aussi les
`queue_conditions` de `.mergify.yml`.

**Deux workflows auto-hébergés, pas un.** Le brief de ce lot disait que
`pr-auto-merge` était le seul ; c'est faux : `triage-rouge` déclare lui aussi
`runs-on: [self-hosted, linux, x64, cardwake-worker]` (ligne 59). Toute panne
de runner casse donc **la file de merge et le triage des rouges** en même temps.

## 2. Les runners, et dans quel groupe

### 2.1 Enregistrés au niveau du dépôt (`repos/Tradoooo/cardwake/actions/runners`)

| Nom | État au relevé | Labels | Où |
| --- | --- | --- | --- |
| `pc-cardwake-03` | `online` | `self-hosted`, `Linux`, `X64`, `cardwake-worker` | le poste de travail (unit `actions-runner-cardwake-03.service`, active) |
| `r630-cardwake-01` | `offline` | idem | r630, unit `actions-runner-cardwake-01.service` → `inactive (dead)` |
| `r630-cardwake-02` | `offline` | idem | r630, unit `actions-runner-cardwake-02.service` → `inactive (dead)` |

Les deux unités du r630 existent toujours (`systemctl --user list-units` les
voit, `inactive dead`), et leurs répertoires aussi : elles sont **arrêtées**,
pas désinstallées. Un `systemctl --user start` suffit à les relever, à condition
que leur enregistrement soit encore valide côté GitHub.

### 2.2 Côté organisation (`orgs/Tradoooo/actions/runner-groups`)

| Groupe | id | Visibilité | `allows_public_repositories` | Runners |
| --- | --- | --- | --- | --- |
| `Default` | 1 | `all` | **`true`** | `r630-ci-01` … `r630-ci-10` (tous `online`), plus divers runners d'autres projets |
| `cardwake` | 3 | `selected` → `Tradoooo/cardwake` seulement | `true` | **0** |
| `macos-private` | 4 | `all` | `false` | (hors sujet ici) |

### 2.3 Le trou : le groupe `cardwake` est vide, et ce que ça coûte

Le groupe `cardwake` (id 3) a été créé pour ce dépôt : visibilité `selected`,
un seul dépôt dedans, dépôts publics autorisés. Il ne contient **aucun
runner**. C'est un contenant sans contenu : Github ne lui doit rien, et les
jobs auto-hébergés ne le voient pas plus qu'un groupe inexistant.

**Ce que coûte un job auto-hébergé sans runner : un `pending` définitif.** Pas
d'échec, pas de rouge, pas de notification, pas de délai : le job reste
`queued` et personne ne l'apprend. Preuve datée, toujours visible pendant le
relevé : les runs `43095176920` (`pr-auto-merge`) et `43095176933` (`ci-budget`,
lancés sur `main` à l'époque où ce job était auto-hébergé) sont `queued` depuis
le **11/11/2026 20:18 UTC**, soit 46 heures, avec `jobs: []` — aucun job n'a
même été créé. Aucun mécanisme ne les a annulés ni signalés.

Conséquence en cascade : `pr-auto-merge` porte la file de merge. Tant qu'il ne
tourne pas, aucune PR n'est rebasée, aucune PR verte n'est mergée, et la file
Mergify ne prend que ce que les checks rendent vert — rien ne le dit. C'est
exactement la panne silencieuse que `scripts/infra/runner-doctor.sh` rend
bruyante.

### 2.4 Ce qui a changé depuis le relevé du matin — et qu'il faut savoir

Le relevé du matin (repris du brief de ce lot) affirmait deux choses que l'API
contredit ce soir :

1. « `Default` a `allows_public_repositories: false` ». Ce soir :
   `{"id":1,"name":"Default","visibility":"all","allows_public_repositories":true}`.
   Le réglage a donc été ouvert dans la journée (ou l'observation du matin était
   fausse). Preuve que les runners d'organisation servent bel et bien ce dépôt :
   le run `43477116894` (`pr-auto-merge` sur `main`, terminé à 17 h 52) a été
   exécuté par **`r630-ci-01`**, `runner_group_name: default` ; le run
   `43476992116` par `r630-ci-09`, et son `sweep` par `r630-ci-02`. Les
   `r630-ci-*` portent le label `cardwake-worker`, donc ils répondent au
   `runs-on` des deux workflows auto-hébergés.
2. « Déplacer un runner vers le groupe `cardwake` par l'API répond 404 même
   avec `admin:org` ». Je n'ai **pas rejoué** cette requête : c'est une mutation
   de configuration d'organisation, hors du périmètre de ce lot (je documente,
   je ne touche pas aux runners). Le fait est donc rapporté tel quel, non
   revérifié, et il explique pourquoi l'échappatoire choisie a été
   l'enregistrement au niveau du dépôt.

État honnête, donc : **le service tient debout aujourd'hui, mais pas grâce au
groupe prévu pour lui.** Il tient grâce à trois runners de dépôt dont deux sont
à l'arrêt, et grâce au groupe `Default` dont les runners portent par accident
(ou par héritage de label) celui du projet. Deux gestes casseraient tout, sans
bruit : retirer le label `cardwake-worker` des `r630-ci-*`, ou refermer
`Default` aux dépôts publics. Dans les deux cas : file de merge à l'arrêt, PR
qui ne mergent plus, zéro alerte. C'est le vrai risque de cette topologie, et
il n'est pas résolu.

## 3. Reconstruire un runner

**Version minimale : `v2.338.2`.** GitHub refuse l'enregistrement des versions
antérieures. Les trois runners du dépôt sont en `2.338.2` (vérifié par
`bin/Runner.Listener --version`), comme les runners d'organisation du r630.

```bash
# Sur la machine (r630 ou poste de travail), en tant que l'utilisateur qui
# fera tourner le service — jamais root.
mkdir -p ~/actions-runner-cardwake-01 && cd ~/actions-runner-cardwake-01
curl -fsSL -o runner.tar.gz \
  https://github.com/actions/runner/releases/download/v2.338.2/actions-runner-linux-x64-2.338.2.tar.gz
tar xzf runner.tar.gz

# Jeton d'enregistrement : éphémère (une heure), jamais un PAT, jamais
# stocké dans un fichier. Il se demande à l'API du dépôt visé.
JETON="$(gh api -X POST repos/Tradoooo/cardwake/actions/runners/registration-token --jq .token)"

./config.sh \
  --url https://github.com/Tradoooo/cardwake \
  --token "$JETON" \
  --name r630-cardwake-01 \
  --labels self-hosted,Linux,X64,cardwake-worker \
  --work _work \
  --unattended --replace

# Service systemd **utilisateur** (pas système : pas de root, pas de
# /etc/systemd/system à toucher). Le script fourni par le runner écrit l'unité.
./svc.sh install
./svc.sh start
loginctl enable-linger "$USER"   # sinon le service meurt à la déconnexion
```

Le label `cardwake-worker` est **obligatoire** : c'est la quatrième étiquette du
`runs-on`, et c'est le seul nom que `scripts/infra/runner-doctor.sh` cherche.

Vérification, dans l'ordre :

```bash
systemctl --user status actions-runner-cardwake-01 --no-pager | head -5
gh api repos/Tradoooo/cardwake/actions/runners \
  --jq '.runners[] | [.name, .status, ([.labels[].name] | join(","))] | @tsv'
scripts/infra/runner-doctor.sh        # 0 = au moins un runner en ligne
```

Pour le groupe d'organisation (si un jour le déplacement par API fonctionne) :
`--url https://github.com/Tradoooo`, et l'option de groupe du runner
(`config.sh --help` la liste) pour viser `cardwake` ; c'est la visibilité du
groupe qui décide quels dépôts voient le runner.

## 4. Procédure de secours si le r630 tombe

Le r630 héberge à la fois `r630-cardwake-01`, `r630-cardwake-02` et
`r630-ci-01..10`. Une coupure du serveur ou du tailnet emporte donc **tous** les
runners auto-hébergés utiles à ce dépôt, et les deux workflows auto-hébergés
partent en `queued` indéfini (voir 2.3).

1. **Constater en dix secondes**, depuis n'importe quelle machine authentifiée :
   ```bash
   scripts/infra/runner-doctor.sh
   # 0 = un runner en ligne avec le label ; 1 = panne (message explicite) ;
   # 2 = API ou droits insuffisants, donc pas de verdict. Ne pas confondre.
   ```
2. **Débloquer les runs coincés.** Un run `queued` ne repart pas tout seul, même
   quand le runner revient :
   ```bash
   gh run list --repo Tradoooo/cardwake --status queued --limit 20
   gh run cancel <id>          # si l'on veut repartir propre
   gh workflow run pr-auto-merge.yml    # relance propre de la file
   ```
3. **Remonter un runner ailleurs** — le poste de travail (`pc-cardwake-03`,
   `actions-runner-cardwake-03.service`, `2.338.2`) est déjà enregistré au
   niveau du dépôt : `systemctl --user start actions-runner-cardwake-03`
   suffit à rendre un runner `online` avec le bon label. C'est le secours le
   plus court, et il ne demande aucun changement de configuration côté GitHub.
4. **Basculer sur GitHub-hosted, seulement en dernier recours, et par le
   propriétaire du dépôt.** `pr-auto-merge.yml` et `triage-rouge.yml` sont du
   shell et du `gh` : ils *pourraient* tourner sur `ubuntu-latest`. Mais
   `pr-auto-merge.yml` est un **fichier de garde gelé** (`.github/couche0`,
   `GUARD_FILES`) : le modifier exige une mention explicite dans le corps de la
   PR, c'est-à-dire une décision humaine assumée. Ce n'est pas une manœuvre
   d'agent, et ce document ne la prescrit pas.
5. **Ne pas allonger un timeout pour « laisser une chance ».** Un job
   auto-hébergé sans runner n'échoue pas plus vite avec 30 minutes
   qu'avec 5 : il attend, c'est tout.

## 5. Les trois gardes ajoutés par ce lot

| Fichier | Ce qu'il fait | Comment le lancer |
| --- | --- | --- |
| `scripts/infra/runner-doctor.sh` | Vérifie qu'au moins un runner **en ligne** porte le label `cardwake-worker` ; sort en 1 avec un message explicite sinon (la panne du 13/11). Auth native de `gh`, aucun jeton lu en fichier. | `scripts/infra/runner-doctor.sh [owner/name] [--wait 120] [--label L]` |
| `.github/workflows/alert-merge-queue.yml` | Toutes les 10 minutes (cron) **et à chaque fin de CI** (`workflow_run` sur `CI`) : détecte les PR `open` bloquées plus de 10 min (check requis `pending` ou absent, état `BLOCKED`/`UNKNOWN`) et pose **un seul** commentaire par PR, mis à jour sur place, plus une ligne au résumé du job. N'écrit jamais ailleurs que sur les PR de ce dépôt, ne relance rien, ne touche à aucune garde. | `gh workflow run alert-merge-queue.yml` (options `seuil`, `dry_run`) |
| `.github/workflows/nightly.yml` | Une fois par nuit : propriétés fast-check à 10 000 tirages, banc de mesures, recette ; les trois rapports partent en artefact. `timeout-minutes: 30`, hors budget de 5 min **parce qu'il ne tourne jamais en PR**. | `gh workflow run nightly.yml -f tirages=10000` |

`scripts/infra/clean-branches.py` complète l'ensemble : il **liste** puis
supprime les branches distantes dont la PR est `MERGED` (vérifiée par l'API) ou
qui ne portent aucun commit absent de `main`. Politique de sûreté : jamais
`main`, jamais une branche portant une PR `OPEN`, jamais une branche ouverte
dans un worktree local, et une branche sans PR dont les commits ne sont pas
dans `main` est **gardée** (travail non mergé). Aucun push forcé : `git push
origin --delete` suffit pour une branche déjà mergée.

## 6. Ce qui n'est pas résolu

- Le groupe d'organisation `cardwake` (id 3) reste **vide**. Les runners de ce
  dépôt vivent au niveau du dépôt, ce qui marche mais ne survit pas à un
  ré-enregistrement : chaque nouvelle machine doit être ajoutée à la main, dépôt
  par dépôt.
- Le déplacement d'un runner vers un groupe reste un geste **manuel dans
  l'interface GitHub** (l'API répond 404 d'après le relevé du 13/11, non
  rejoué ici).
- Les deux runs `queued` depuis le 11/11 20:18 ne sont annulés par personne :
  ils resteront affichés jusqu'à ce qu'une main les annule.
- `r630-cardwake-01` et `-02` sont installés mais **arrêtés** ; rien ne les
  redémarre automatiquement au boot tant que `Restart=always` ne s'applique
  qu'à un service déjà démarré (`systemctl --user enable` est nécessaire, et
  `loginctl enable-linger` pour que l'utilisateur survive à la déconnexion).
- Un crédit : `ci-native.yml` mentionné par le garde `couche0` n'existe pas dans
  `.github/workflows/` — le garde se protège d'un fichier absent, ce qui est
  sans effet mais à savoir avant de chercher un workflow fantôme.
- Les crons GitHub sont **très en retard sur ce dépôt** : `pr-auto-merge` est
  en `*/5` et ses runs observés sont espacés de 2 à 8 heures. Tout ce qui doit
  être régulier ici ne peut pas reposer sur le cron seul — c'est pourquoi
  l'alerte de file de merge se réveille aussi à chaque fin de CI
  (`workflow_run`), le cron n'étant qu'un filet.
