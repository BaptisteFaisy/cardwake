# Modèle d'objet et format de pile — Tâches

**Parcours.** Exigences d'abord — le format est figé avant toute opération

Chaque tâche nomme les fichiers qu'elle touche et les tests qui la prouvent.
Une tâche n'est cochée que si ses tests passent et si les gardes restent verts.

## Tâches

- [ ] 1. Figer les types du document et le format `cardwake/1`
  - Fichiers : `packages/model/src/types.ts`
  - Tests : `packages/model/test/types.test.ts`
- [ ] 2. Écrire les schémas de vérification et leurs messages
  - Fichiers : `packages/model/src/schema.ts`
  - Tests : `packages/model/test/schema.test.ts`
- [ ] 3. Écrire la migration de version et son refus explicite
  - Fichiers : `packages/model/src/migrate.ts`
  - Tests : `packages/model/test/migrate.test.ts`
- [ ] 4. Écrire les opérations réversibles et leur inverse
  - Fichiers : `packages/model/src/ops.ts`
  - Tests : `packages/model/test/ops.test.ts`
- [ ] 5. Recadrer les réglages importés sous les plafonds
  - Fichiers : `packages/model/src/limits.ts`
  - Tests : `packages/model/test/limits.test.ts`
- [ ] 6. Vérifier l'aller-retour enregistrer puis relire
  - Fichiers : `packages/model/test/roundtrip.props.test.ts`
  - Tests : `packages/model/test/roundtrip.props.test.ts`

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
