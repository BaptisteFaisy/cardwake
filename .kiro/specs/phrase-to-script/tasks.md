# De la phrase au script, et la relecture en clair — Tâches

**Parcours.** Exigences d'abord

Chaque tâche nomme les fichiers qu'elle touche et les tests qui la prouvent.
Une tâche n'est cochée que si ses tests passent et si les gardes restent verts.

## Tâches

- [ ] 1. Écrire la consigne d'appel et son schéma de sortie
  - Fichiers : `packages/agent/src/write-script.ts`
  - Tests : `packages/agent/test/write-script.test.ts`
- [ ] 2. Écrire les contrôles statiques sans modèle
  - Fichiers : `packages/lang/src/check.ts`
  - Tests : `packages/lang/test/check.test.ts`
- [ ] 3. Écrire la relecture en clair, un gabarit par instruction
  - Fichiers : `packages/lang/src/paraphrase.ts`
  - Tests : `packages/lang/test/paraphrase.test.ts`
- [ ] 4. Écrire l'essai à blanc et son compte de différences
  - Fichiers : `packages/model/src/ops.ts`
  - Tests : `packages/model/test/dry-run.test.ts`
- [ ] 5. Écrire la réparation unique et son échec affiché
  - Fichiers : `packages/agent/src/write-script.ts`
  - Tests : `packages/agent/test/repair.test.ts`
- [ ] 6. Remplir le jeu d'évaluation des six familles
  - Fichiers : `evals/compile/`
  - Tests : `packages/cli/test/eval.test.ts`

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
