# Hiérarchie des messages et distribution — Exigences

**Parcours.** Exigences d'abord — petit, borné, plein de cas limites (candidat à la comparaison spec contre code improvisé)

**But.** Faire monter un message d'un cran à la fois, élément → carte → fond → pile, avec des sauts comptés, une file ordonnée et aucune boucle infinie possible.

## Modules concernés

- `packages/model/src/dispatch.ts`
- `packages/lang/src/host.ts`

## Exigences (EARS)

1. **CAR-F-10** — Quand un message est envoyé à un objet, le système doit chercher son handler sur l'objet, puis la carte, puis le fond, puis la pile, et s'arrêter au premier trouvé.
2. **CAR-F-11** — Quand un handler exécute `pass`, le système doit remettre le même message au niveau suivant, sans repasser par un niveau déjà visité.
3. **CAR-F-10** — Le système doit traiter la file dans l'ordre d'arrivée et terminer chaque traitement avant d'ouvrir le suivant.
4. **CAR-F-40** — Quand la profondeur d'envoi dépasse le plafond, le système doit arrêter le traitement, remettre l'état comme avant et afficher une erreur.
5. **CAR-F-40** — Quand un message n'a aucun handler, le système doit l'abandonner silencieusement, sans erreur et sans écriture.
6. **CAR-F-11** — Quand un message vise une carte supprimée pendant le traitement, le système doit abandonner le message et le journaliser.

## Cas limites à couvrir

- Handler absent à tous les niveaux : abandon silencieux.
- `pass` depuis la pile : rien au-dessus, message abandonné.
- Message envoyé à l'objet qui le traite : un seul tour, pas de boucle.
- Carte ou élément supprimé pendant le traitement.
- Dépassement de profondeur à la cinquantième remontée.

## Hors périmètre

- Distribuer à tous les objets à la fois (ce n'est pas une diffusion)
- Réveiller un agent sans compter de saut
- Continuer après un dépassement de profondeur

## Propriétés visées

- CAR-P-09
- CAR-P-14

## Acceptation

- Chaque exigence a au moins un test nommé dans `tasks.md`.
- Aucune exigence n'est contredite par une autre ; une contradiction trouvée est notée dans le journal de bord.
