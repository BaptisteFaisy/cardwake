# Le site : étagère, carte, éditeur, journal — Exigences

**Parcours.** Conception d'abord

**But.** Deux modes seulement, Jouer et Fabriquer. Des éléments de page ordinaires, accessibles au clavier, et une mise en page qui laisse la carte au centre.

## Modules concernés

- `apps/web/src`
- `packages/web/src/journal`

## Exigences (EARS)

1. **CAR-F-01** — Le système doit présenter une étagère des piles, une carte affichée à la fois, et un accès en deux gestes à toute autre carte.
2. **CAR-F-05** — Quand l'humain modifie un champ, le système doit écrire la modification comme une opération réversible et la montrer dans le journal.
3. **CAR-F-16** — Quand un script ne s'analyse pas, le système doit garder le script en service et afficher les erreurs, sans rien remplacer.
4. **CAR-F-18** — Le système doit offrir deux modes : Jouer (niveaux 1 et 2) et Fabriquer (niveaux 3 à 5), sans troisième mode.
5. **CAR-F-19** — Quand l'humain écrit une phrase pour un objet, le système doit montrer la relecture en clair et l'essai à blanc avant le bouton Accepter.
6. **CAR-F-42** — Le système doit distinguer visuellement le texte écrit par un agent du texte écrit par un humain, et effacer cette marque au premier geste humain.
7. **CAR-N-06** — Le système doit être utilisable au clavier seul, avec des libellés explicites et un contraste conforme ; aucun contenu essentiel ne dépend d'une couleur seule.

## Cas limites à couvrir

- Script en erreur : le script en service reste affiché et actif.
- Champ écrit par un agent : marque visible, effacée au premier geste humain.
- Navigation clavier seule : étagère, carte, éditeur, journal.
- Pile reçue : bandeau de provenance et agents endormis.
- Erreur d'un agent affichée comme une phrase, pas comme une trace.

## Hors périmètre

- Un canevas de dessin point par point
- Un troisième mode caché
- Éditer un niveau d'agent depuis l'interface d'un agent

## Propriétés visées

- CAR-N-06

## Acceptation

- Chaque exigence a au moins un test nommé dans `tasks.md`.
- Aucune exigence n'est contredite par une autre ; une contradiction trouvée est notée dans le journal de bord.
