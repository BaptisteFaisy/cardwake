# Le site : étagère, carte, éditeur, journal — Tâches

**Parcours.** Conception d'abord

Chaque tâche nomme les fichiers qu'elle touche et les tests qui la prouvent.
Une tâche n'est cochée que si ses tests passent et si les gardes restent verts.

## Tâches

- [ ] 1. Écrire l'étagère et l'ouverture d'une pile
  - Fichiers : `apps/web/src`
  - Tests : `apps/web/test/shelf.test.ts`
- [ ] 2. Écrire la carte et la sélection des éléments
  - Fichiers : `apps/web/src`
  - Tests : `apps/web/test/card.test.ts`
- [ ] 3. Écrire l'éditeur de script et l'affichage des erreurs
  - Fichiers : `apps/web/src`
  - Tests : `apps/web/test/editor.test.ts`
- [ ] 4. Écrire le panneau journal et son bouton Annuler
  - Fichiers : `apps/web/src`
  - Tests : `apps/web/test/journal-panel.test.ts`
- [ ] 5. Marquer l'encre d'agent et l'effacer au geste humain
  - Fichiers : `apps/web/src`
  - Tests : `apps/web/test/ink.test.ts`
- [ ] 6. Vérifier le parcours de trois clics
  - Fichiers : `apps/web/test/three-clicks.test.ts`
  - Tests : `apps/web/test/three-clicks.test.ts`

## Ordre

1. Les contrats d'abord : les types sont figés avant la première implémentation.
2. Le chemin nominal, puis les cas limites de `requirements.md`.
3. Les propriétés en dernier, sur un chemin déjà testé.

## Critères d'achèvement

- Chaque exigence de `requirements.md` est couverte par un test coché ci-dessus.
- `npm run typecheck`, `npm run test:ci` et `npm run guards` passent.
- Aucune fonction au-delà de 50 lignes, aucun fichier au-delà de 500 lignes.
- Le journal de bord porte une ligne pour cette spec.

## Vérification locale

```bash
npm run typecheck && npm run test:ci && npm run guards
```
