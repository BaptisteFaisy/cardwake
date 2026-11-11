# Piles reçues — Tâches

**Parcours.** Quick Spec

Chaque tâche nomme les fichiers qu'elle touche et les tests qui la prouvent.
Une tâche n'est cochée que si ses tests passent et si les gardes restent verts.

## Tâches

- [ ] 1. Ajouter la provenance et son affichage
  - Fichiers : `packages/model/src/types.ts`
  - Tests : `packages/model/test/provenance.test.ts`
- [ ] 2. Endormir les agents à l'ouverture d'une pile reçue
  - Fichiers : `packages/model/src/schema.ts`
  - Tests : `packages/model/test/received-sleep.test.ts`
- [ ] 3. Plafonner le niveau effectif des agents
  - Fichiers : `packages/model/src/authorize.ts`
  - Tests : `packages/model/test/received-cap.test.ts`
- [ ] 4. Recadrer les réglages importés
  - Fichiers : `packages/model/src/schema.ts`
  - Tests : `packages/model/test/received-settings.test.ts`
- [ ] 5. Écrire la déclaration de confiance et sa journalisation
  - Fichiers : `packages/model/src/schema.ts`
  - Tests : `packages/model/test/trust.test.ts`

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
