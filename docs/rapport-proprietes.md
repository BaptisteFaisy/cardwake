# Rapport de propriétés — run du 11 novembre 2026

Run lancé le **11 novembre 2026 à 23 h 54** (heure locale, UTC+1) sur le dépôt
`cardwake`, avec **10 000 tirages** par propriété (`CARDWAKE_PROP_RUNS=10000`).
Le run a duré **66,56 s**, très loin du plafond de 15 minutes : il n'a **pas**
été nécessaire de descendre à 2 000 tirages. Tous les chiffres de ce document
proviennent de la sortie réelle du run, reproduite en section 3.

## 1. Commande exacte pour reproduire

```bash
cd /home/baptiste/Bureau/cardwake && git add -A && \
  CARDWAKE_PROP_RUNS=10000 timeout 900 npx vitest run packages --reporter=basic 2>&1 | tail -40
```

Le nombre de tirages est lu par chaque fichier de propriétés via
`Number(process.env.CARDWAKE_PROP_RUNS ?? 100)` (défaut : 100).

## 2. Les 23 propriétés du cahier

« Tirages » = nombre de tirages fast-check du run pour la propriété
(10 000 partout via `CARDWAKE_PROP_RUNS=10000`). Une propriété peut être
prouvée par plusieurs tests ; le fichier listé est celui qui porte le test
de propriété (les tests unitaires associés sont cités en note).

| Id | Ce qu'elle garantit | État | Fichier de test | Tirages |
|---|---|---|---|---|
| CAR-P-01 | **Aller-retour du langage** : pour tout arbre généré, l'imprimer puis l'analyser redonne le même arbre. | **couverte** | `packages/lang/test/print.test.ts` | 10 000 |
| CAR-P-02 | **Robustesse de l'analyse** : pour tout texte, l'analyse se termine et rend soit un arbre, soit des erreurs dont la position est dans le texte. | **couverte** | `packages/lang/test/print.test.ts` | 10 000 |
| CAR-P-03 | **Relecture totale** : pour tout arbre valide, la relecture en clair existe, donne au moins une phrase par instruction et cite chaque objet désigné. | **non couverte** | — (voir section 4) | — |
| CAR-P-04 | **Déterminisme** : même pile, même événement, même graine, même horloge donnent la même liste d'opérations. | **couverte** | `packages/lang/test/interpreter.test.ts` | 10 000 |
| CAR-P-05 | **Morceaux de texte** : lire après avoir écrit un morceau rend ce qui a été écrit, et les morceaux situés avant restent inchangés. | **couverte** | `packages/lang/test/values-chunks.test.ts` | 10 000 |
| CAR-P-06 | **Arrêt** : pour tout script, boucles sans fin comprises, le traitement s'arrête en au plus `maxSteps` étapes. | **couverte** | `packages/lang/test/interpreter.test.ts` | 10 000 |
| CAR-P-07 | **Tout ou rien** : si un traitement échoue, la pile est identique à ce qu'elle était avant. | **couverte** | `packages/model/test/ops-journal.test.ts` | 10 000 |
| CAR-P-08 | **Inverse** : pour toute suite d'opérations, appliquer la suite puis ses inverses en ordre contraire redonne la pile de départ. | **couverte** | `packages/model/test/ops-journal.test.ts` | 10 000 |
| CAR-P-09 | **Hiérarchie** : le handler exécuté est le premier sur le chemin cible, carte, fond, pile ; `pass` atteint le suivant. | **non couverte** | — (voir section 4) | — |
| CAR-P-10 | **Identifiants** : après toute suite d'opérations, les identifiants sont uniques et aucun identifiant supprimé ne réapparaît. | **couverte** | `packages/model/test/ops-journal.test.ts` | 10 000 |
| CAR-P-11 | **Pas de dépassement** : pour tout niveau et toute suite d'appels du faux modèle adversaire, chaque opération validée est permise à ce niveau et porte sur la carte de l'agent. | **couverte** | `packages/model/test/properties-authorize.test.ts` (générateur adversaire dans `packages/agent/test/properties-gateway.test.ts`) | 10 000 |
| CAR-P-12 | **Droits figés** : aucune suite d'actions ne change niveau, consigne, éveil ni budget d'un agent. | **couverte** | `packages/model/test/properties-authorize.test.ts` | 10 000 |
| CAR-P-13 | **Pile reçue non fiable** : rien au-dessus du niveau 2 tant que la confiance n'est pas déclarée, quel que soit le niveau écrit dans le fichier. | **couverte** | `packages/model/test/properties-authorize.test.ts` | 10 000 |
| CAR-P-14 | **Fin des bavardages** : une action humaine déclenche au plus `agentTurnsPerAction` tours et aucun message n'est remis avec un compteur de sauts négatif. | **non couverte** | — (voir section 4) | — |
| CAR-P-15 | **Budgets** : aucun compteur ne dépasse son réglage ; après épuisement, la passerelle ne reçoit plus aucun appel. | **couverte** | `packages/agent/test/properties-agent.test.ts` (unitaire : `packages/agent/test/budget.test.ts`) | 10 000 |
| CAR-P-16 | **Contexte borné** : le contexte construit respecte les tailles limites et ne contient ni la clé, ni le contenu d'une autre carte, ni le journal. | **couverte** | `packages/agent/test/properties-agent.test.ts` (unitaire : `packages/agent/test/view.test.ts`) | 10 000 |
| CAR-P-17 | **Scripts sous accord** : aucune opération de changement de script d'origine agent n'est validée sans jeton d'acceptation issu d'une action humaine. | **couverte** | `packages/model/test/properties-authorize.test.ts` | 10 000 |
| CAR-P-18 | **Fichier** : exporter puis importer redonne la même pile ; tout fichier altéré est soit importé valide, soit refusé en entier, sans exception ni chargement partiel. | **couverte** | `packages/model/test/schema-file.test.ts` | 10 000 |
| CAR-P-19 | **Empreinte** : l'empreinte d'une requête ne dépend pas de l'ordre des clés et change dès que consigne, message ou schéma d'outil change. | **couverte** | `packages/agent/test/properties-gateway.test.ts` | 10 000 |
| CAR-P-20 | **Rejeu** : en mode enregistré, une même suite d'actions sur une même pile donne les mêmes transactions. | **couverte** | `packages/agent/test/properties-gateway.test.ts` | 10 000 |
| CAR-P-21 | **Nombres** : pour deux décimaux d'au plus quatre décimales, la somme affichée est exacte ; reformater un nombre déjà formaté ne le change pas. | **couverte** | `packages/lang/test/values-chunks.test.ts` | 10 000 |
| CAR-P-22 | **Rien de secret dans l'export** : aucun fichier exporté ne contient la clé ni les compteurs de session. | **couverte** | `packages/agent/test/properties-gateway.test.ts` (unitaires : `key-relay.test.ts`, `router.test.ts`) | 10 000 |
| CAR-P-23 | **Encre** : un texte écrit par un agent reste marqué tant qu'aucune opération humaine ne modifie le champ ; annuler restaure la marque d'avant. | **couverte** | `packages/model/test/ops-journal.test.ts` | 10 000 |

**Bilan : 20 propriétés couvertes sur 23** (CAR-P-01, 02, 04, 05, 06, 07, 08,
10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23), 3 non couvertes
(CAR-P-03, 09, 14 — section 4).

## 3. Sortie brute du run (10 000 tirages)

Résultat : **20 fichiers de tests passés (20), 239 tests passés (239),
0 échec**, démarré à 23:54:29, durée **66,56 s** (transform 8,72 s,
collect 20,14 s, tests 124,63 s cumulée sur les workers, prepare 6,36 s).
Sortie exacte (`tail -40`) :

```text
   ✓ morceaux — lecture et écriture > CAR-P-05 : lire après avoir écrit rend ce qui a été écrit 514ms
   ✓ morceaux — lecture et écriture > CAR-P-05 : les morceaux situés avant sont inchangés 1107ms
 ✓ packages/model/test/properties-authorize.test.ts (6 tests) 6006ms
   ✓ CAR-P-11 — toute action validée est permise au niveau et vise la carte de l'agent > résiste à un faux modèle adversaire 1184ms
   ✓ CAR-P-12 — aucune suite ne change niveau, consigne, éveil ni budget > fige les droits pour tout acteur non-humain (et l'humain en Jouer) 1061ms
   ✓ CAR-P-13 — pile reçue non fiable : rien au-dessus du niveau 2 > plafonne toute action d'agent, quel que soit le niveau déclaré 1089ms
   ✓ CAR-P-17 — aucun script d'origine agent sans jeton d'acceptation > refuse toute proposition dont le jeton n'a pas été émis 2050ms
   ✓ CAR-P-17 — aucun script d'origine agent sans jeton d'acceptation > n'accepte pas plus de propositions que de jetons émis 312ms
   ✓ CAR-P-17 — aucun script d'origine agent sans jeton d'acceptation > n'autorise jamais un agent à installer lui-même un script 308ms
 ✓ packages/lang/test/print.test.ts (7 tests) 13362ms
   ✓ CAR-P-01 — aller-retour du langage > imprimer puis analyser redonne le même arbre 5392ms
   ✓ CAR-P-01 — aller-retour du langage > l'impression est stable : imprimer deux fois donne le même texte 2930ms
   ✓ CAR-P-02 — robustesse de l'analyse > tout texte rend un arbre ou des erreurs positionnées dans le texte 3418ms
   ✓ CAR-P-02 — robustesse de l'analyse > du bruit autour d'un script valide ne fait jamais planter l'analyse 1609ms
 ✓ packages/agent/test/properties-gateway.test.ts (12 tests) 38031ms
   ✓ CAR-P-19 — empreinte > ne dépend pas de l'ordre des clés 5417ms
   ✓ CAR-P-19 — empreinte > change dès que la consigne, un message ou un schéma d'outil change 2860ms
   ✓ CAR-P-19 — empreinte > change avec la vitesse, puisque la vitesse choisit le modèle 4738ms
   ✓ CAR-P-20 — rejeu > une même suite d'actions sur une même pile donne les mêmes transactions 13456ms
   ✓ CAR-P-20 — rejeu > un texte libre hors enregistrement le dit, sans inventer de réponse 1261ms
   ✓ CAR-P-22 — rien de secret dans l'export > ni la clé, ni les compteurs de session 2988ms
   ✓ CAR-P-22 — rien de secret dans l'export > un export de cassette se recharge sans secret et rejoue à l'identique 7303ms
 ✓ packages/agent/test/properties-agent.test.ts (12 tests) 61479ms
   ✓ CAR-P-16 — le contexte ne contient que ce qu'il doit > respecte les tailles limites 4383ms
   ✓ CAR-P-16 — le contexte ne contient que ce qu'il doit > ne contient ni contenu d'une autre carte, ni journal, ni clé 4408ms
   ✓ CAR-P-16 — le contexte ne contient que ce qu'il doit > n'a que les quatre blocs, et les champs déclarés 8155ms
   ✓ CAR-P-16 — le contexte ne contient que ce qu'il doit > garde le niveau et le nombre de champs de la carte visée 5214ms
   ✓ CAR-P-15 — budgets bornés > ne dépasse jamais les tours ni les jetons accordés 7521ms
   ✓ CAR-P-15 — budgets bornés > gèle les compteurs de session une fois épuisés 1010ms
   ✓ CAR-P-15 — budgets bornés > ne dépasse jamais les sauts ni les tours d'une action 11008ms
   ✓ CAR-P-15 — budgets bornés > gèle les compteurs d'une action une fois épuisés 3340ms
   ✓ outils — schémas et lignes > ne présente que des schémas stricts, dans l'ordre des niveaux 12659ms
   ✓ outils — schémas et lignes > refuse toute clé inconnue, quel que soit l'outil 3292ms
   ✓ outils — schémas et lignes > rend une ligne non vide pour chaque outil 485ms

 Test Files  20 passed (20)
      Tests  239 passed (239)
   Start at  23:54:29
   Duration  66.56s (transform 8.72s, setup 0ms, collect 20.14s, tests 124.63s, environment 11ms, prepare 6.36s)
```

Les fichiers de tests non listés dans ces 40 dernières lignes (tools, view,
key-relay, authorize, interpreter, sha256, router, budget, cassette,
language-sync, smoke, queue, ops-journal, values-chunks, schema-file, parser)
sont tous passés eux aussi : le décompte final « 20 passed / 239 passed »
couvre l'ensemble. Le run complet du dépôt (22 fichiers, tirages au défaut
100) donne **262 tests passés, 0 échec, 2,81 s** — les 23 tests d'écart sont
ceux de `apps/web` et des hooks, hors périmètre `packages` de ce run.

## 4. Non couvertes : ce qui manque

### CAR-P-03 — Relecture totale

La relecture en clair d'un script (une phrase par instruction, chaque objet
cité) n'existe pas encore : il manque `packages/lang/src/paraphrase.ts`
(lot C1 fin). Dès qu'il est écrit, la propriété se teste en générant des
arbres valides avec `packages/lang/test/generators.ts` et en vérifiant que
chaque instruction produit au moins une phrase citant ses objets.

### CAR-P-09 — Hiérarchie

La resolution d'un message le long du chemin cible → carte → fond → pile,
avec `pass` qui atteint le handler suivant, dépend de
`packages/model/src/dispatch.ts` (lot C4), lui-même dépendant de
`packages/model/src/host.ts` (lot C4a). La propriété se prouvera contre
l'arbre d'objets généré : pour tout placement de handlers, le handler
exécuté est le premier sur le chemin.

### CAR-P-14 — Fin des bavardages

Le plafonnement des tours d'agent par action humaine
(`agentTurnsPerAction`) et le compteur de sauts (aucun message remis avec
un saut négatif) vivent aussi dans `dispatch.ts` (lot C4) et la file
(`packages/agent/src/queue.ts`, déjà écrit). La propriété attend un graphe
de cartes dont les agents s'écrivent sans cesse, généré par fast-check, et
l'exécution réelle des tours — donc aussi `agent/src/loop.ts` (lot C6 fin).

Ces trois propriétés sont les seules qui manquent pour atteindre 23/23 ;
elles sont toutes bloquées sur les lots C4a/C4 (host + dispatch) et
C1/C6 fin (paraphrase, loop).
