# Journal et annulation — Tâches

**Parcours.** Quick Spec

Chaque tâche nomme les fichiers qu'elle touche et les tests qui la prouvent.
Une tâche n'est cochée que si ses tests passent et si les gardes restent verts.

## Tâches

- [ ] 1. Ouvrir, fermer et refuser une transaction
  - Fichiers : `packages/model/src/journal.ts`
  - Tests : `packages/model/test/journal.test.ts`
- [ ] 2. Appliquer l'inverse d'une transaction
  - Fichiers : `packages/model/src/journal.ts`
  - Tests : `packages/model/test/undo.test.ts`
- [ ] 3. Borner le journal par transactions entières
  - Fichiers : `packages/model/src/journal.ts`
  - Tests : `packages/model/test/journal-limit.test.ts`
- [ ] 4. Afficher le journal et son bouton Annuler
  - Fichiers : `packages/web/src/journal`
  - Tests : `packages/model/test/journal.test.ts`
- [ ] 5. Vérifier l'annulation après un tour d'agent
  - Fichiers : `packages/model/test/undo-agent.props.test.ts`
  - Tests : `packages/model/test/undo-agent.props.test.ts`

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
