# Journal et annulation — Exigences

**Parcours.** Quick Spec

**But.** Chaque traitement devient une transaction : cause lisible, opérations réversibles, état avant et après. L'humain voit tout ce qui a été fait et annule d'un geste.

## Modules concernés

- `packages/model/src/journal.ts`
- `packages/model/src/ops.ts`
- `packages/web/src/journal`

## Exigences (EARS)

1. **CAR-F-44** — Quand un traitement modifie la pile, le système doit ouvrir une transaction et y consigner chaque opération, avec sa cause lisible.
2. **CAR-F-45** — Quand l'humain annule une transaction, le système doit appliquer l'inverse de chaque opération, de la dernière à la première, et rendre exactement l'état d'avant.
3. **CAR-F-46** — Le système doit borner le journal et jeter les transactions les plus anciennes en premier, sans jamais couper une transaction en deux.
4. **CAR-F-44** — Une transaction refusée ou interrompue ne doit laisser aucune opération partielle : tout ou rien.
5. **CAR-F-45** — Le système doit distinguer dans le journal l'auteur d'une transaction : humain, script ou agent de carte, avec son niveau.

## Cas limites à couvrir

- Annulation d'une transaction d'agent : état et encre rendus.
- Journal plein : les transactions les plus anciennes partent entières.
- Transaction interrompue par un dépassement de garde-fou : aucune opération partielle.
- Annulation demandée deux fois de suite : la seconde est sans effet.
- Annulation d'une transaction dont l'état a depuis changé : refus explicite.

## Hors périmètre

- Rétablir une transaction annulée au-delà de la limite du journal
- Réécrire l'histoire : une transaction consignée ne se modifie pas
- Journaliser des données secrètes (clé, consigne complète)

## Propriétés visées

- CAR-P-08
- CAR-P-23

## Acceptation

- Chaque exigence a au moins un test nommé dans `tasks.md`.
- Aucune exigence n'est contredite par une autre ; une contradiction trouvée est notée dans le journal de bord.
