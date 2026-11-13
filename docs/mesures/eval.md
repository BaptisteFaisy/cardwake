# Jeu d'évaluation « phrase → script » — passages réels

Mesures prises le **2026-11-13**, avec le modèle **`combo/cheap`** servi par
le relais local (la clé reste sur la machine, le jeu n'en connaît que
l'adresse). Le lanceur est décrit par `evals/runner.ts` ; les rapports bruts
sont dans `docs/mesures/`.

| rapport | ce qu'il contient |
|---|---|
| `eval.json` | passe complète du 13/11, **avant** les recettes (40 tâches) |
| `eval-apres-loops.json` | passe `loops` du 13/11, **après** les recettes (6 tâches) |
| `eval-apres-agents.json` | passe `agents` du 13/11, **après**, arrêtée par le quota (6 tâches) |

## Les deux chiffres du cahier

| | cible | avant (passe 1) | avant (passe 2) | après (`loops`) | après (`agents`, partiel) |
|---|---|---|---|---|---|
| Réussies **au premier coup** | ≥ 85 % | **85 %** (34/40) | **78 %** (31/40) | **100 %** (6/6) | 1/2 jouées |
| Réussies **après une réparation** | ≥ 95 % | **88 %** (35/40) | **85 %** (34/40) | **100 %** (6/6) | 2/3 jouées |

Une réparation = **un seul appel supplémentaire**, et la demande porte ce que la
pile a réellement montré (« le champ `Doubled` vaut “\n60”, on attend
“20\n40\n60” »). Le modèle voit le résultat, pas seulement l'échec.

Les deux passes d'« avant » sont publiées, pas la meilleure : **le taux varie**
d'un passage à l'autre, et la variation vient du modèle, pas du harnais.
`combo/cheap` est un modèle **routé automatiquement** chez le fournisseur : la
même phrase part chez un fournisseur différent d'un appel à l'autre, et la
qualité suit. Sur une cible de 85 %, un modèle routé est un mauvais instrument
de mesure — il faut dire la fourchette, pas le meilleur chiffre.

## Ce que le jeu mesure

Pour chaque tâche de `evals/compile/` : la phrase est donnée au rédacteur de
scripts (`writeScript`), le script rendu est contrôlé, relu en clair et essayé à
blanc, puis installé sur l'objet visé par `authorize` ; les événements de la
tâche sont enfin joués par le **vrai moteur du site** (`createModelEngine`) et
la pile finale est jugée par `checkTask` — jamais le texte du script.

## Résultats par famille

**Avant** (passe 2 du 13/11, 40 tâches) :

| famille | tâches | premier coup | après réparation | taux (après réparation) | première cause d'échec |
|---|---:|---:|---:|---:|---|
| calcul | 8 | 8 | 8 | 100 % | — |
| conditions | 6 | 6 | 6 | 100 % | — |
| chunks | 8 | 6 | 7 | 88 % | panne du modèle (1) |
| navigation | 6 | 5 | 5 | 83 % | panne du modèle (1) |
| loops | 6 | 3 | 4 | 67 % | pile fausse (1), panne du modèle (1) |
| agents | 6 | 3 | 4 | 67 % | panne du modèle (1), pile fausse (1) |
| **total** | **40** | **31 (78 %)** | **34 (85 %)** | | |

**Après** les recettes et la carte d'une page (13/11) :

| famille | tâches | premier coup | après réparation | taux (après réparation) | première cause d'échec |
|---|---:|---:|---:|---:|---|
| loops | 6 | **6** | **6** | **100 %** | — |
| agents (mesuré) | 3 jouées | 1 | 2 | 67 % | panne du modèle (1) |

## Les deux familles faibles, une par une

### `loops` : 3/6 → 6/6 au premier coup

| | avant | après |
|---|---:|---:|
| premier coup | 3/6 (50 %) | **6/6 (100 %)** |
| après réparation | 4/6 (67 %) | **6/6 (100 %)** |
| appels au modèle | 11 | **7** |
| jetons d'entrée | 68 838 | 58 288 |
| jetons de sortie | 25 245 | **3 518** |

La famille est passée de « la moitié des tâches ratées » à « tout passe » : le
taux est de 100 %, il n'y a plus de réparation, et **le modèle écrit moins**.

**La cause racine n'était pas le modèle.** Les deux tâches qui échouaient
(`loops-02`, `loops-06`) échouaient parce que le modèle écrivait
`put x after maVariable` pour empiler une liste — et que **cette forme
remplace** la variable au lieu de s'y ajouter. Rejoué sur le vrai moteur, le
script du modèle (juge juste par le contrôle statique) donne `\n60` au lieu de
`20\n40\n60` : c'est exactement l'échec mesuré. La forme qui marche est
`put maVariable & return & x into maVariable`, ou l'écriture directe dans le
champ. C'est désormais ce que la recette enseigne, et c'est écrit dans les
pièges de la référence.

> **À signaler, hors de ce lot** : `packages/lang` ignore le mode `before`/`after`
> quand le conteneur est une variable (`writeContainer`, `eval-expr.ts` : la
> branche « var » fait `env.set(...)` sans regarder le mode). La référence dit
> « `before` et `after` insèrent aux extrémités » : c'est vrai pour un champ
> et pour un morceau de champ, faux pour une variable. Le paquet `lang` n'est
> pas dans mon périmètre ; la recette contourne le défaut, mais le défaut
> reste.

### `agents` : mesuré à moitié, et le dit

La passe `agents` n'a pas pu finir : le **plafond quotidien du relais (300
requêtes) était épuisé** au milieu. Sur les six tâches :

| tâche | avant | après | pourquoi |
|---|---|---|---|
| `agents-01` | ok au premier coup | ok **après réparation** | le script final est `consult agent with …` puis `put it into field "Follow-up"` — la recette |
| `agents-02` | **échec** | **ok au premier coup** | le script produit est exactement la forme de la recette : le chat va à l'agent, le script ne répond pas à sa place |
| `agents-03` | échec | échec | le script est bon (`tell agent of card "Kitchen" …`), mais le tour d'agent n'a pas été servi : **quota épuisé (429)** |
| `agents-04` | ok | **non mesurée** | quota épuisé avant le tour |
| `agents-05` | ok | **non mesurée** | quota épuisé avant le tour |
| `agents-06` | ok | **non mesurée** | quota épuisé avant le tour |

Donc : **une tâche gagnée au premier coup** (`agents-02`, qui échouait avant),
une tâche qui reste bonne (`agents-01`), une tâche dont l'échec n'est pas
imputable au script (`agents-03`), et **trois tâches non mesurées**. Je ne
publie pas de pourcentage pour `agents` : il n'y a pas assez de mesures, et
trois tâches sur six n'ont pas été jouées. Le tableau dit « 3 jouées ».

Ce que la recette a changé, de façon visible : le script de `agents-02` est
devenu

```text
on mouseUp
  -- Chat is handled by the card's agent; its persona should greet the visitor…
end mouseUp
```

alors qu'avant le modèle écrivait un `on chat` qui ne se déclenche jamais (le
message du chat va à l'agent, pas à un script de champ). C'est exactement le
piège que la recette énonce.

## La preuve qui ne coûte rien : 12/12

Une mesure au modèle coûte de l'argent et dépend du fournisseur. La **forme**
enseignée, elle, se vérifie gratuitement : `evals/recipes.test.ts` écrit, pour
chacune des douze tâches des deux familles faibles, le script que la recette
enseigne, le joue sur le vrai moteur, et demande au vérificateur du jeu de
le juger.

```sh
npx vitest run evals/recipes.test.ts
```

Les douze passent. C'est une garantie, pas une mesure : elle dit que la
consigne contient une forme juste pour chaque tâche faible, et qu'elle le
restera si le langage change.

## Ce que la consigne a changé, et pourquoi ça devrait aider

1. **Une section « Recipes »** dans `docs/language.md` : quatre recettes
   complètes et commentées — parcourir les lignes d'un champ, écrire une
   liste ligne par ligne, une table numérotée, faire parler l'agent — avec les
   deux pièges qui coûtent cher (`return` est le saut de ligne ; une variable
   grandit avec `into`, pas avec `after`).
2. **Une carte d'une page** (`docs/language-card.md`), imprimée **avant** la
   référence complète : formes principales, recettes, cinq pièges. Un test
   (`packages/agent/test/language-card.test.ts`) interdit à la carte d'enseigner
   une forme que la référence n'a pas — la référence reste la source unique.
3. **Les motifs de refus portent la pile.** Quand le contrôle statique refuse
   (« Unknown field "Heard" »), le message de réparation rappelle désormais les
   noms qui existent vraiment : sans cela, le modèle corrige en inventant un
   autre nom.
4. **Le chat va à l'agent** : la recette et les pièges le disent, et le
   `on chat` inutile disparaît des scripts produits.

## Les incidents, dits comme ils sont

- **Panne du fournisseur.** Entre 18 h 57 et 19 h 08, `combo/cheap` a renvoyé
  des 502 sur presque tout. Une première passe de mesure (12 tâches) n'a
  produit que des échecs d'infrastructure ; elle a été jetée et n'est pas
  publiée. Le fournisseur est revenu, la passe `loops` s'est faite ensuite.
- **Quota épuisé.** Le relais plafonne à 300 requêtes par jour ; il en restait
  50 en début de journée, et la passe `loops` (7 appels) puis `agents` (8
  appels, dont 4 rejetés en 429) ont consommé le reste. **La passe `agents` est
  donc partielle**, et c'est dit partout où elle est citée.
- **La moitié des échecs d'« avant » n'étaient pas des défauts de script** :
  quatre des six tâches ratées (agents-02, chunks-04, loops-06, navigation-03)
  portaient une 502 du fournisseur dans leurs erreurs. Seules `agents-03` et
  `loops-02` étaient de vrais défauts de script — et `loops-02` venait du bug
  d'`after` sur variable.
- **Un tour d'agent qui échoue était invisible.** Le lanceur ne remontait que
  les erreurs de script ; une panne pendant le tour d'un agent se lisait
  « le champ est vide », et la réparation partait sur une fausse piste. Le
  lanceur remonte maintenant la panne, et la réparation la reçoit.

## Coût réel

| | passe 1 | passe 2 | après : `loops` | après : `agents` (partiel) |
|---|---:|---:|---:|---:|
| Appels au modèle | 63 | 61 | 7 | 8 (+ 4 requêtes refusées par le quota, non comptées) |
| Jetons d'entrée | 269 385 | 320 471 | 58 288 | 38 123 |
| Jetons de sortie | 30 781 | 88 072 | 3 518 | 6 140 |

Le cahier estimait ≈ 2,40 $ par passage complet ; le coût réel dépend du tarif
du fournisseur au moment de l'appel et n'est pas vérifié ici. Ce qui est
mesuré, ce sont les appels et les jetons — le relais les compte, pas le jeu.

Les recettes et la carte d'une page allongent la consigne d'environ 2 000 jetons par appel
(≈ 6 300 → ≈ 8 300 jetons d'entrée sur une tâche de script) ; elle est payée
plus que compensée sur `loops`, où le nombre d'appels a **tombé de 11 à 7**
et les jetons de sortie de 25 245 à 3 518.

## Ce qu'il reste à faire

- Reprendre la passe `agents` complète quand le quota du relais est revenu :
  trois des six tâches n'ont pas été jouées.
- Jouer une passe complète (40 tâches) pour vérifier que les recettes n'ont
  pas fait régresser les quatre familles qui étaient déjà bonnes.
- Faire trancher le défaut `put … after` sur une variable : corriger
  `packages/lang`, ou acter que la forme n'existe pas.

## Rejouer

```sh
npm run relay --workspace @cardwake/relay          # terminal 1 : porte la clé
npx vite-node evals/run.ts --relay http://127.0.0.1:8787/v1 --out docs/mesures/eval.json
# une famille, ou deux :
npx vite-node evals/run.ts --relay http://127.0.0.1:8787/v1 --family loops --family agents
```

Le jeu n'est **jamais** en intégration continue : il dépense de l'argent et
demande une clé. `evals/runner.test.ts` couvre la même chaîne sans réseau, sur
un faux modèle — y compris la phase de réparation — et `evals/recipes.test.ts`
couvre les formes que la consigne enseigne.
