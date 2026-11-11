# De la phrase au script, et la relecture en clair — Exigences

**Parcours.** Exigences d'abord

**But.** Transformer une phrase de l'auteur en script Murmur vérifié, puis en phrases relues par un module sans modèle, puis en essai à blanc des effets, avant toute installation.

## Modules concernés

- `packages/agent/src/write-script.ts`
- `packages/lang/src/check.ts`
- `packages/lang/src/paraphrase.ts`
- `packages/model/src/ops.ts`

## Exigences (EARS)

1. **CAR-F-21** — Quand l'auteur décrit un comportement, le système doit envoyer un seul appel au modèle, avec l'objet visé, la phrase et un résumé de la pile.
2. **CAR-F-22** — Le système doit recevoir du modèle une sortie structurée : script, résumé, hypothèses, questions — et rien d'autre.
3. **CAR-F-23** — Quand le script reçu s'analyse, le système doit le contrôler sans modèle : éléments cités existants ou créés, handlers valides, constructions permises, tailles respectées.
4. **CAR-F-24** — Quand un contrôle échoue, le système doit demander une réparation au modèle avec le brouillon et la liste des erreurs, puis afficher ces erreurs si la réparation échoue aussi.
5. **CAR-F-25** — Quand le modèle signale une ambiguïté, le système doit poser la question à l'auteur avant toute installation, avec deux allers-retours au plus.
6. **CAR-F-26** — Le système doit relire tout script en phrases par un module sans modèle, un gabarit par type d'instruction.
7. **CAR-F-27** — Quand l'auteur demande un essai, le système doit exécuter le handler sur une copie de la pile et montrer ce qui changerait, champ par champ.
8. **CAR-F-28** — Rien ne doit être installé sans le bouton Accepter ; le script installé doit garder la phrase d'origine en commentaire d'en-tête.

## Cas limites à couvrir

- Script reçu qui ne s'analyse pas : une réparation, puis erreurs affichées.
- Script qui cite un élément inexistant et ne le crée pas.
- Script au-delà de la taille permise.
- Question du modèle posée à l'auteur, deux allers-retours au plus.
- Essai à blanc sur une pile dont l'état a changé entre-temps.

## Hors périmètre

- Exécuter la sortie du modèle comme du code
- Installer un script refusé par un contrôle
- Faire relire le script par le modèle qui l'a écrit

## Propriétés visées

- CAR-P-03

## Acceptation

- Chaque exigence a au moins un test nommé dans `tasks.md`.
- Aucune exigence n'est contredite par une autre ; une contradiction trouvée est notée dans le journal de bord.
