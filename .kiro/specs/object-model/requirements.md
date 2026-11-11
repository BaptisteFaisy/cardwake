# Modèle d'objet et format de pile — Exigences

**Parcours.** Exigences d'abord — le format est figé avant toute opération

**But.** Décrire une pile comme un document JSON versionné, sérialisable, sans fonction ni référence circulaire. Tout ce qui n'est pas dans le format n'existe pas : pas d'état caché, pas d'historique secret.

## Modules concernés

- `packages/model/src/schema.ts`
- `packages/model/src/migrate.ts`
- `packages/model/src/ops.ts`
- `packages/model/src/types.ts`
- `packages/model/src/limits.ts`

## Exigences (EARS)

1. **CAR-F-02** — Le système doit représenter une pile par un document `cardwake/1` contenant cartes, fonds, éléments, scripts, réglages et provenance, et rien d'autre.
2. **CAR-F-03** — Le système doit donner à chaque champ de fond un contenu propre à chaque carte, distinct d'une carte à l'autre.
3. **CAR-F-04** — Le système doit identifier tout élément, carte et fond par un entier stable, jamais réutilisé après suppression.
4. **CAR-F-05** — Quand une pile est enregistrée puis relue, le système doit rendre un document identique champ pour champ.
5. **CAR-F-06** — Le système doit refuser un fichier de pile qui ne respecte pas le schéma, avec un message nommant le champ fautif.
6. **CAR-F-07** — Le système doit décrire chaque modification comme une opération réversible portant son état avant et son état après.
7. **CAR-F-02** — Le système doit recadrer tout réglage importé sous les plafonds de l'application, sans jamais les dépasser.

## Cas limites à couvrir

- Pile sans carte, pile sans fond : document valide, état affiché cohérent.
- Champ de fond supprimé alors que des cartes portent son contenu.
- Identifiant d'élément déjà utilisé dans un fichier reçu : refus explicite.
- Réglage importé à zéro, négatif, ou au-delà du plafond.
- Document JSON correct mais de version inconnue.

## Hors périmètre

- Charger un format d'origine d'un autre logiciel
- Stocker des fonctions, des dates de système ou des références circulaires
- Faire confiance aux réglages d'une pile reçue

## Propriétés visées

- CAR-P-07
- CAR-P-08
- CAR-P-10
- CAR-P-18

## Acceptation

- Chaque exigence a au moins un test nommé dans `tasks.md`.
- Aucune exigence n'est contredite par une autre ; une contradiction trouvée est notée dans le journal de bord.
