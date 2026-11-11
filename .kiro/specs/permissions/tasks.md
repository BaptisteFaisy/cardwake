# Droits des agents — le point de passage unique — Tâches

**Parcours.** Exigences d'abord — c'est la spec où l'analyse des exigences doit trouver des contradictions

Chaque tâche nomme les fichiers qu'elle touche et les tests qui la prouvent.
Une tâche n'est cochée que si ses tests passent et si les gardes restent verts.

## Tâches

- [ ] 1. Écrire la table des niveaux par outil
  - Fichiers : `packages/agent/src/tools.ts`
  - Tests : `packages/agent/test/tool-levels.test.ts`
- [ ] 2. Écrire `authorize` et ses trois catégories de demandeurs
  - Fichiers : `packages/model/src/authorize.ts`
  - Tests : `packages/model/test/authorize.test.ts`
- [ ] 3. Refuser l'écriture d'un agent dans un champ verrouillé
  - Fichiers : `packages/model/src/authorize.ts`
  - Tests : `packages/model/test/locked-field.test.ts`
- [ ] 4. Plafonner le niveau effectif d'une pile reçue
  - Fichiers : `packages/model/src/authorize.ts`
  - Tests : `packages/model/test/received-cap.test.ts`
- [ ] 5. Interdire tout outil qui toucherait niveau, consigne ou budget
  - Fichiers : `packages/agent/src/tools.ts`
  - Tests : `packages/model/test/no-level-tool.test.ts`
- [ ] 6. Éprouver `authorize` contre un faux modèle adversaire
  - Fichiers : `packages/model/test/authorize-adversary.props.test.ts`
  - Tests : `packages/model/test/authorize-adversary.props.test.ts`

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
