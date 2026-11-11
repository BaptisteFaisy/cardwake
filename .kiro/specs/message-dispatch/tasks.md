# Hiérarchie des messages et distribution — Tâches

**Parcours.** Exigences d'abord — petit, borné, plein de cas limites (candidat à la comparaison spec contre code improvisé)

Chaque tâche nomme les fichiers qu'elle touche et les tests qui la prouvent.
Une tâche n'est cochée que si ses tests passent et si les gardes restent verts.

## Tâches

- [ ] 1. Écrire la file de messages et son ordre
  - Fichiers : `packages/model/src/dispatch.ts`
  - Tests : `packages/model/test/dispatch.test.ts`
- [ ] 2. Écrire la remontée élément → carte → fond → pile
  - Fichiers : `packages/model/src/dispatch.ts`
  - Tests : `packages/model/test/dispatch-chain.test.ts`
- [ ] 3. Compter les sauts et refuser au-delà du plafond
  - Fichiers : `packages/model/src/dispatch.ts`
  - Tests : `packages/model/test/hops.test.ts`
- [ ] 4. Traiter handler absent, `pass` final et carte supprimée
  - Fichiers : `packages/model/test/dispatch-edges.test.ts`
  - Tests : `packages/model/test/dispatch-edges.test.ts`
- [ ] 5. Vérifier la propriété « aucun message ne boucle »
  - Fichiers : `packages/model/test/dispatch.props.test.ts`
  - Tests : `packages/model/test/dispatch.props.test.ts`

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
