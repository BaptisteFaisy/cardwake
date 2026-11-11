# L'agent d'une carte — Tâches

**Parcours.** Exigences d'abord

Chaque tâche nomme les fichiers qu'elle touche et les tests qui la prouvent.
Une tâche n'est cochée que si ses tests passent et si les gardes restent verts.

## Tâches

- [ ] 1. Construire la vue bornée de la carte
  - Fichiers : `packages/agent/src/view.ts`
  - Tests : `packages/agent/test/view.test.ts`
- [ ] 2. Décrire les outils et leur schéma strict
  - Fichiers : `packages/agent/src/tools.ts`
  - Tests : `packages/agent/test/tools.test.ts`
- [ ] 3. Écrire la boucle d'un tour et son arrêt propre
  - Fichiers : `packages/agent/src/loop.ts`
  - Tests : `packages/agent/test/loop.test.ts`
- [ ] 4. Compter les budgets de session et d'action
  - Fichiers : `packages/agent/src/budget.ts`
  - Tests : `packages/agent/test/budget.test.ts`
- [ ] 5. Écrire la file d'agents bornée
  - Fichiers : `packages/agent/src/queue.ts`
  - Tests : `packages/agent/test/queue.test.ts`
- [ ] 6. Vérifier qu'aucune mémoire ne survit hors des champs
  - Fichiers : `packages/agent/test/no-hidden-state.test.ts`
  - Tests : `packages/agent/test/no-hidden-state.test.ts`

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
