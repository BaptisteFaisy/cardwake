# Ligne de commande et serveur d'outils (option) — Exigences

**Parcours.** Quick Spec (option)

**But.** Vérifier une pile sans navigateur : valider un script, exécuter une pile en mode sans interface, la relire en clair, lancer le jeu d'évaluation. Le même code, une autre porte.

## Modules concernés

- `packages/cli/src/index.ts`
- `packages/lang/src/check.ts`
- `packages/lang/src/paraphrase.ts`

## Exigences (EARS)

1. **CAR-F-57** — Le système doit offrir en ligne de commande : valider un script, exécuter une pile, relire un script en clair, et lancer le jeu d'évaluation.
2. **CAR-F-57** — Chaque commande doit rendre un code de sortie non nul en cas d'échec et un compte rendu lisible sur la sortie standard.
3. **CAR-F-58** — Le serveur d'outils doit exposer `validate_script`, `simulate` et `paraphrase`, en schéma strict, sans outil d'écriture sur une pile.
4. **CAR-F-58** — Aucune commande ne doit appeler un vrai modèle : le jeu d'évaluation qui en a besoin reste une commande explicite, réservée à l'humain.
5. **CAR-F-57** — Le mode sans interface doit être utilisable dans l'intégration continue, sans navigateur et sans réseau.

## Cas limites à couvrir

- Script invalide en entrée : compte rendu lisible, code de sortie non nul.
- Pile exécutée en mode sans interface : aucun navigateur, aucun réseau.
- Outil exposé qui tenterait une écriture : absent du schéma.
- Commande d'évaluation lancée sans drapeau explicite : refus.
- Argument manquant : usage court, code de sortie distinct.

## Hors périmètre

- Exposer un outil qui écrirait dans une pile
- Lancer une évaluation payante par défaut
- Remplacer l'interface : la ligne de commande est une seconde porte

## Propriétés visées

- CAR-P-21

## Acceptation

- Chaque exigence a au moins un test nommé dans `tasks.md`.
- Aucune exigence n'est contredite par une autre ; une contradiction trouvée est notée dans le journal de bord.
