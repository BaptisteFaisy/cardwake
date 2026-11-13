# Jeu d'évaluation « phrase → script » — passage réel

Mesures prises le **2026-11-13T13:34:54Z** par `npx vite-node evals/run.ts`, avec
le modèle **`combo/cheap`** servi par le relais local (la clé reste sur la
machine, le jeu n'en connaît que l'adresse). Le lanceur est décrit par
`evals/runner.ts` ; le rapport brut, tâche par tâche, est dans
`docs/mesures/eval.json`.

**Résultat : 34 tâches réussies sur 40 — 85 %.** C'est la cible du cahier des
charges pour un premier coup (≥ 85 %) ; la cible « ≥ 95 % après une réparation »
n'est pas mesurée séparément (la chaîne tente une seule réparation en interne et
la tâche n'est comptée qu'une fois).

## Ce que le jeu mesure

Pour chaque tâche de `evals/compile/` : la phrase est donnée au rédacteur de
scripts (`writeScript`), le script rendu est contrôlé, relu en clair et essayé à
blanc, puis installé sur l'objet visé par `authorize` ; les événements de la
tâche sont enfin joués par le **vrai moteur du site** (`createModelEngine`) et
la pile finale est jugée par `checkTask` — jamais le texte du script.

## Résultats par famille

| famille | tâches | réussies | taux |
| --- | ---: | ---: | ---: |
| calcul | 8 | 8 | 100 % |
| conditions | 6 | 6 | 100 % |
| agents | 6 | 5 | 83 % |
| navigation | 6 | 5 | 83 % |
| chunks | 8 | 6 | 75 % |
| loops | 6 | 4 | 67 % |
| **total** | **40** | **34** | **85 %** |

## Coût réel du passage

| | |
| --- | ---: |
| Appels au modèle | 54 |
| Jetons d'entrée | 269 385 |
| Jetons de sortie | 30 781 |
| Durée | ≈ 20 min |

Le cahier des charges estimait ≈ 2,40 $ par passage complet ; le coût réel dépend
du tarif du fournisseur au moment de l'appel et n'est pas vérifié ici. Ce qui est
mesuré, ce sont les appels et les jetons ci-dessus — le relais les compte, pas le
jeu.

## Les six tâches non réussies

| tâche | verdict | ce qui s'est passé |
| --- | --- | --- |
| `agents-06` | contrôle | le modèle a inventé un champ (`"Heard"`) : le contrôle statique l'a refusé avant toute installation — c'est le garde qui a tenu, pas le modèle |
| `chunks-04` | contrôle | erreur de syntaxe (`then` manquant) que la réparation n'a pas rattrapée |
| `chunks-06` | comportement | le tri n'a rien écrit dans `Sorted` |
| `loops-02` | comportement | la table est juste mais finit par un saut de ligne de trop |
| `loops-06` | comportement | la boucle de doublement n'a rien écrit dans `Doubled` |
| `navigation-03` | comportement | la pile affiche « Page two » au lieu de « Page three » |

## Ce que le premier passage a appris (défauts du lanceur, pas du modèle)

Le premier passage mesurait 70 % — faux. Deux défauts du lanceur, trouvés en
comparant les scripts obtenus (justes) aux piles finales (vides) :

1. **La cible était le champ, pas le bouton.** Les piles du jeu portent un champ
   *et* un bouton du même nom (`Average`, `Label`, `Total`) ; le lanceur prenait
   le premier élément trouvé, y installait le script, puis cliquait le champ, qui
   n'a pas de script. Corrigé : la cible est le bouton quand les deux existent, et
   un clic sur un élément sans script est dit tel quel.
2. **La sortie structurée était coupée.** La référence du langage est longue ;
   une sortie plafonnée à 2 000 jetons était tronquée en pleine réponse, et le
   modèle devait réparer (deux appels au lieu d'un). Le lanceur demande désormais
   4 000 jetons.

Après ces deux correctifs, le taux passe de 70 % à 85 % **sans toucher au
modèle** : c'est le banc qui mentait, pas la chaîne.

## Rejouer

```sh
npm run relay --workspace @cardwake/relay          # terminal 1 : porte la clé
npx vite-node evals/run.ts --relay http://127.0.0.1:8787/v1 --out docs/mesures/eval.json
```

Le jeu n'est **jamais** en intégration continue : il dépense de l'argent et
demande une clé. `evals/runner.test.ts` couvre la même chaîne sans réseau, sur un
faux modèle.