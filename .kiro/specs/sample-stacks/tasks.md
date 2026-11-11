# Piles d'exemple et enregistrements — Tâches

**Parcours.** Quick Spec

Chaque tâche nomme les fichiers qu'elle touche et les tests qui la prouvent.
Une tâche n'est cochée que si ses tests passent et si les gardes restent verts.

## Tâches

- [ ] 1. Écrire The Manor et son parcours narratif
  - Fichiers : `stacks/manor`
  - Tests : `packages/model/test/sample-manor.test.ts`
- [ ] 2. Écrire la liste de tâches d'exemple
  - Fichiers : `stacks/dashboard`
  - Tests : `packages/model/test/sample-dashboard.test.ts`
- [ ] 3. Écrire le devis d'exemple et ses calculs
  - Fichiers : `stacks/quotes`
  - Tests : `packages/model/test/sample-quotes.test.ts`
- [ ] 4. Produire les enregistrements des parcours
  - Fichiers : `stacks/`
  - Tests : `packages/cli/test/cassette.test.ts`
- [ ] 5. Vérifier les empreintes et la fraîcheur des enregistrements
  - Fichiers : `packages/model/src/schema.ts`
  - Tests : `packages/cli/test/cassette-fresh.test.ts`

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
