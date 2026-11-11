# Règles de test

- **Vitest**, fichiers dans `packages/<p>/test/*.test.ts` et
  `apps/web/test/*.test.ts`. Nom : `<module>.test.ts`.
- **Aucun appel réel à un modèle** dans un test (CAR-N-09). Utiliser le faux
  modèle (`agent/src/testing/fake-model.ts`) ou une cassette.
- **Propriétés** avec fast-check, une par propriété du cahier des charges
  (`CAR-P-01` … `CAR-P-23`), nommée dans le `describe`. Le nombre de tirages
  vient de `CARDWAKE_PROP_RUNS` (défaut 100 en CI, 2 000 en local, 10 000
  pour le rapport de recette).
- Déterminisme : les tests fournissent graine et horloge, jamais `Date.now()`
  ni `Math.random()` en direct.
- Chaque correction de bogue s'accompagne du test qui le reproduit.
- Budget : la suite complète doit tenir dans le job `ci` de 5 minutes. Un test
  plus long va dans `npm run test:props`, hors PR.

## Commandes

```bash
npx vitest run --dir packages/lang     # un paquet
npm run test:ci                        # tout, en mode CI
CARDWAKE_PROP_RUNS=10000 npm run test:props   # rapport de recette
```
