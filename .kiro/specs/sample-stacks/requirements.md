# Piles d'exemple et enregistrements — Exigences

**Parcours.** Quick Spec

**But.** Livrer trois piles qui se tiennent : The Manor (le parcours de trois clics), la liste de tâches, le devis. Chaqu'une avec ses échanges enregistrés, pour que le produit s'essaie sans clé.

## Modules concernés

- `stacks/manor`
- `stacks/dashboard`
- `stacks/quotes`
- `packages/model/src/schema.ts`

## Exigences (EARS)

1. **CAR-F-55** — Le système doit livrer trois piles d'exemple valides, chacune conforme au schéma et ouverte sans erreur.
2. **CAR-F-55** — Chaque pile d'exemple doit livrer les échanges enregistrés nécessaires pour que le parcours de démonstration fonctionne sans clé ni réseau.
3. **CAR-F-56** — Quand un script d'exemple est modifié, le système doit refuser un enregistrement dont l'empreinte ne correspond plus, et le signaler au développement, jamais à l'utilisateur.
4. **CAR-F-56** — Les piles d'exemple doivent rester sous les plafonds : cartes, éléments, tailles de champ et de script.
5. **CAR-F-55** — The Manor doit être le parcours de trois clics : étagère, carte du personnage, bouton « Show the amulet », journal.

## Cas limites à couvrir

- Parcours de trois clics sans clé ni réseau.
- Enregistrement périmé après modification d'un script d'exemple.
- Pile d'exemple au-delà d'un plafond : refus au chargement.
- Champ d'exemple vide au départ : le parcours reste lisible.
- Les trois piles s'ouvrent dans le même ordre à chaque lancement.

## Hors périmètre

- Reprendre une pile d'un autre produit
- Enregistrer des échanges avec de vraies données personnelles
- Faire dépendre la démonstration d'une clé

## Propriétés visées

- CAR-P-19

## Acceptation

- Chaque exigence a au moins un test nommé dans `tasks.md`.
- Aucune exigence n'est contredite par une autre ; une contradiction trouvée est notée dans le journal de bord.
