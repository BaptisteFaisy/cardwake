# Jeu d'évaluation « phrase → script » — passages réels

Mesures prises le **2026-11-13**, deux passages complets avec le modèle
**`combo/cheap`** servi par le relais local (la clé reste sur la machine, le jeu
n'en connaît que l'adresse). Le lanceur est décrit par `evals/runner.ts` ; le
rapport brut de la dernière passe est dans `docs/mesures/eval.json`.

## Les deux chiffres du cahier

| | cible | passe 1 | passe 2 | moyenne |
|---|---|---|---|---|
| Réussies **au premier coup** | ≥ 85 % | **85 %** (34/40) | **78 %** (31/40) | 81 % |
| Réussies **après une réparation** | ≥ 95 % | **88 %** (35/40) | **85 %** (34/40) | 87 % |

Une réparation = **un seul appel supplémentaire**, et la demande porte ce que la
pile a réellement montré (« le champ `Doubled` vaut “\n60”, on attend
“20\n40\n60” »). Le modèle voit le résultat, pas seulement l'échec.

Les deux passes sont publiées, pas la meilleure : **le taux varie** d'un passage
à l'autre, et la variation vient du modèle, pas du harnais. `combo/cheap` est un
modèle **routé automatiquement** chez le fournisseur : la même phrase part chez
un fournisseur différent d'un appel à l'autre, et la qualité suit. Sur une cible
de 85 %, un modèle routé est un mauvais instrument de mesure — il faut dire la
fourchette, pas le meilleur chiffre.

Ce que le harnais, lui, ne fait plus : jouer faux. Les deux défauts qui
faussaient le tout premier passage (70 %) sont corrigés — voir « ce que le
premier passage a appris » plus bas.

## Ce que le jeu mesure

Pour chaque tâche de `evals/compile/` : la phrase est donnée au rédacteur de
scripts (`writeScript`), le script rendu est contrôlé, relu en clair et essayé à
blanc, puis installé sur l'objet visé par `authorize` ; les événements de la
tâche sont enfin joués par le **vrai moteur du site** (`createModelEngine`) et
la pile finale est jugée par `checkTask` — jamais le texte du script.

## Résultats par famille (passe 2)

| famille | tâches | premier coup | après réparation |
|---|---:|---:|---:|
| calcul | 8 | 8 | 8 |
| conditions | 6 | 6 | 6 |
| chunks | 8 | 6 | 7 |
| navigation | 6 | 5 | 5 |
| loops | 6 | 3 | 4 |
| agents | 6 | 3 | 4 |
| **total** | **40** | **31 (78 %)** | **34 (85 %)** |

Les familles **`agents`** et **`loops`** sont les plus faibles : ce sont celles
qui demandent au modèle de construire une boucle (`repeat for each`) ou de
faire parler un agent par un outil. Ce sont aussi celles où le routage
automatique fait le plus de dégâts.

## Coût réel

| | passe 1 | passe 2 |
|---|---:|---:|
| Appels au modèle | 63 | 61 |
| Jetons d'entrée | 269 385 | 320 471 |
| Jetons de sortie | 30 781 | 88 072 |
| Durée | ≈ 20 min | ≈ 22 min |

Le cahier estimait ≈ 2,40 $ par passage complet ; le coût réel dépend du tarif
du fournisseur au moment de l'appel et n'est pas vérifié ici. Ce qui est
mesuré, ce sont les appels et les jetons — le relais les compte, pas le jeu.

## Les six tâches non réussies (passe 2)

| tâche | ce qui s'est passé |
|---|---|
| `agents-02` | l'agent de la carte n'a pas écrit son salut dans le champ attendu (réparation tentée, sans effet) |
| `agents-03` | le message entre cartes n'est pas arrivé tel que l'attendait la vérification (réparation tentée) |
| `chunks-04` | le fournisseur a refusé l'appel (502) — incident d'infrastructure, pas de qualité du script |
| `loops-02` | la table construite ne contenait qu'une ligne |
| `loops-06` | la boucle de doublement a écrit `\n60` au lieu de `20\n40\n60` |
| `navigation-03` | la pile affiche « Page two » au lieu de « Page three » |

## Ce que le premier passage a appris (défauts du lanceur, pas du modèle)

Le premier passage mesurait 70 % — faux. Deux défauts du lanceur, trouvés en
comparant les scripts obtenus (justes) aux piles finales (vides) :

1. **La cible était le champ, pas le bouton.** Les piles du jeu portent un champ
   *et* un bouton du même nom (`Average`, `Label`, `Total`) ; le lanceur prenait
   le premier élément trouvé — le champ — y installait le script, puis cliquait
   le champ, qui n'a pas de script. Le moteur ne produisait aucun changement, le
   jeu attendait en vain, et la tâche était notée « échouée » alors que le
   script du modèle était juste.
2. **La sortie structurée était coupée.** La référence du langage est longue ;
   une sortie plafonnée à 2 000 jetons était tronquée en pleine réponse, et le
   modèle devait réparer (deux appels au lieu d'un). Le lanceur demande désormais
   4 000 jetons — et le produit aussi (c'est le défaut par défaut de `writeScript`).

Après ces deux correctifs, le taux passe de 70 % à 85 % **sans toucher au
modèle** : c'est le banc qui mentait, pas la chaîne.

## Rejouer

```sh
npm run relay --workspace @cardwake/relay          # terminal 1 : porte la clé
npx vite-node evals/run.ts --relay http://127.0.0.1:8787/v1 --out docs/mesures/eval.json
```

Le jeu n'est **jamais** en intégration continue : il dépense de l'argent et
demande une clé. `evals/runner.test.ts` couvre la même chaîne sans réseau, sur un
faux modèle — y compris la phase de réparation.