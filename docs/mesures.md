# Mesures de performance — CAR-N-04 et CAR-N-05

Mesures prises le **2026-11-13T13:16:47.901Z** par le banc `scripts/bench/bench.ts`, sur la machine décrite ci-dessous. Chaque cible du cahier des charges est comparée à sa valeur mesurée ; le verdict porte sur la **médiane**, et le p95 montre la dispersion. Aucun chiffre de ce fichier n'est recopié à la main : il est réécrit à chaque exécution du banc.

## Configuration

| | |
| --- | --- |
| Hôte | `baptiste-MS-7D18` |
| Système | linux 7.0.0-43-generic x64 |
| Processeur | 11th Gen Intel(R) Core(TM) i5-11600K @ 3.90GHz (12 cœurs) |
| Mémoire | 31 Go |
| Node | v26.9.0 (V8 14.6.202.34-node.32) |
| Graine du banc | 20261113 (fixe) |

## Résultats

| Cible | Mesure | Médiane | p95 | Tours | Seuil | Verdict |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| CAR-N-04 | Changement de carte | 0.006 ms | 0.106 ms | 200 | < 50 ms | atteint |
| CAR-N-04 | Ouverture d'une pile de 100 cartes | 1.25 ms | 6.54 ms | 30 | < 1000 ms | atteint |
| CAR-N-04 | Analyse d'un script de 200 lignes | 0.535 ms | 3.11 ms | 300 | < 20 ms | atteint |
| CAR-N-04 | Étapes d'interprétation par seconde | 1 328 340 étapes/s | 1 695 864 étapes/s | 12 | ≥ 200 000 étapes/s | atteint |
| CAR-N-05 | Délai entre un événement et l'indication visible | 0.046 ms | 0.125 ms | 100 | < 100 ms | atteint |
| CAR-N-05 | Tour d'agent médian | — | — | — | < 4000 ms | mesuré ailleurs |

## Ce que couvre chaque mesure

- **Changement de carte** (CAR-N-04) — chemin réel du site — `ModelEngine.navigate` sur une pile de 100 cartes : autorisation, transaction du journal, application de l'opération `navigate`, notification des abonnés ; le rendu React n'est pas compris (banc headless).
- **Ouverture d'une pile de 100 cartes** (CAR-N-04) — ouverture d'un fichier de pile de 100 cartes : lecture disque, `JSON.parse`, puis `validateStack` (le schéma `cardwake/1`) ; un fichier refusé ne rend jamais une pile partielle.
- **Analyse d'un script de 200 lignes** (CAR-N-04) — `parseScript` sur un script de 200 lignes exactement (25 handlers) : lexer et analyseur, jusqu'à l'arbre syntaxique.
- **Étapes d'interprétation par seconde** (CAR-N-04) — étapes comptées par l'interpréteur (`result.steps`) sur un script de boucle sans effet sur la pile, divisées par la durée mesurée avec `performance.now()`.
- **Délai entre un événement et l'indication visible** (CAR-N-05) — clic sur un bouton du vrai moteur jusqu'à l'événement `changed` qui porte l'indication visible (le champ réécrit) : analyse du script, `Dispatcher`, `authorize`, transaction ; le rendu React n'est pas compris (banc headless).
- **Tour d'agent médian** (CAR-N-05) — un tour d'agent appelle un vrai modèle : il sort de ce banc, qui n'a ni clé ni réseau

## Tour d'agent

Le tour d'agent médian (cible < 4 s, CAR-N-05) n'est **pas** mesuré par ce banc : il demande un vrai modèle et une vraie clé, donc du réseau et de l'argent. **mesuré avec une vraie clé : voir le rapport d'évaluation** (`evals/`, lancé par un humain).

## Ce que ce banc ne mesure pas

- Le **rendu** de l'interface (React, peinture du navigateur) : le banc est headless et mesure le cœur déterministe du produit. Le changement de carte et le délai d'indication passent par le vrai moteur du site, sans DOM.
- La **lecture disque à froid** : le fichier de la pile est relu à chaque tour, donc servi par le cache du système — c'est le cas d'une pile déjà ouverte une première fois, et la marge sur la cible d'une seconde reste très large.

## Rejouer

```sh
npx vite-node scripts/bench/bench.ts
```

Le banc écrit les deux rapports, n'appelle aucun réseau, et affiche sa graine fixe : deux exécutions sur la même machine donnent les mêmes jeux d'essai.

