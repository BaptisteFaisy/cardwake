# Cœur du langage Murmur — Tâches

**Parcours.** Conception d'abord — la grammaire de 7.3 entre en entrée, la conception la traduit en contrats

Chaque tâche nomme les fichiers qu'elle touche et les tests qui la prouvent.
Une tâche n'est cochée que si ses tests passent et si les gardes restent verts.

## Tâches

- [ ] 1. Écrire le lexer (mots, chaînes, nombres, opérateurs, commentaires `--`)
  - Fichiers : `packages/lang/src/lexer.ts`
  - Tests : `packages/lang/test/lexer.test.ts`
- [ ] 2. Écrire le curseur et l'abandon d'analyse typé
  - Fichiers : `packages/lang/src/parsing/cursor.ts`
  - Tests : `packages/lang/test/cursor.test.ts`
- [ ] 3. Écrire l'analyse des expressions et des désignations d'objets
  - Fichiers : `packages/lang/src/parsing/expressions.ts`
  - Tests : `packages/lang/test/expressions.test.ts`
- [ ] 4. Écrire l'analyse des instructions, blocs et en-têtes de messages
  - Fichiers : `packages/lang/src/parsing/statements.ts`
  - Tests : `packages/lang/test/parser.test.ts`
- [ ] 5. Figer le contrat d'arbre et refuser toute évolution qui ne passe pas par `ast.ts`
  - Fichiers : `packages/lang/src/ast.ts`
  - Tests : `packages/lang/test/ast-contract.test.ts`
- [ ] 6. Vérifier chaque exemple de la référence par analyse
  - Fichiers : `docs/language.md`
  - Tests : `packages/lang/test/reference-examples.test.ts`
- [ ] 7. Ajouter les propriétés de déterminisme et de terminaison de l'analyse
  - Fichiers : `packages/lang/test/parser.props.test.ts`
  - Tests : `packages/lang/test/parser.props.test.ts`

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
