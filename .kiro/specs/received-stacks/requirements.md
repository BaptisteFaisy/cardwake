# Piles reçues — Exigences

**Parcours.** Quick Spec

**But.** Ouvrir une pile qui vient d'ailleurs sans lui donner les droits d'une pile maison : agents endormis, niveau plafonné, réglages recadrés, provenance visible.

## Modules concernés

- `packages/model/src/schema.ts`
- `packages/model/src/authorize.ts`
- `packages/model/src/types.ts`

## Exigences (EARS)

1. **CAR-F-51** — Quand une pile est ouverte depuis un fichier, le système doit marquer sa provenance « reçue » et l'afficher jusqu'à ce que l'humain déclare lui faire confiance.
2. **CAR-F-51** — Quand une pile reçue est ouverte, le système doit laisser tous ses agents endormis.
3. **CAR-F-52** — Tant que la confiance n'est pas déclarée, le système doit plafonner à 2 le niveau effectif de tout agent de la pile.
4. **CAR-F-51** — Le système doit recadrer les réglages d'une pile reçue sous les plafonds de l'application avant tout usage.
5. **CAR-F-52** — Quand l'humain déclare la pile digne de confiance, le système doit écrire cette décision dans la provenance et la journaliser.

## Cas limites à couvrir

- Pile reçue avec un agent de niveau 5 : effectif 2, endormi.
- Réglages importés au-delà des plafonds : recadrés et signalés.
- Confiance déclarée puis retirée : effet immédiat sur le niveau effectif.
- Fichier reçu illisible ou de version inconnue : refus explicite.
- Pile reçue ouverte deux fois : deux provenances distinctes, aucun mélange.

## Hors périmètre

- Exécuter un script d'une pile reçue avant le recadrage des réglages
- Confondre « reçue » et « malveillante » dans le vocabulaire de l'interface
- Importer un format d'un autre logiciel

## Propriétés visées

- CAR-P-13

## Acceptation

- Chaque exigence a au moins un test nommé dans `tasks.md`.
- Aucune exigence n'est contredite par une autre ; une contradiction trouvée est notée dans le journal de bord.
