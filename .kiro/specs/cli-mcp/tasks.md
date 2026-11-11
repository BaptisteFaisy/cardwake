# Ligne de commande et serveur d'outils (option) — Tâches

**Parcours.** Quick Spec (option)

Chaque tâche nomme les fichiers qu'elle touche et les tests qui la prouvent.
Une tâche n'est cochée que si ses tests passent et si les gardes restent verts.

## Tâches

- [ ] 1. Écrire les commandes validate, run et paraphrase
  - Fichiers : `packages/cli/src/index.ts`
  - Tests : `packages/cli/test/commands.test.ts`
- [ ] 2. Écrire les codes de sortie et les comptes rendus
  - Fichiers : `packages/cli/src/index.ts`
  - Tests : `packages/cli/test/exit-codes.test.ts`
- [ ] 3. Exposer les trois outils en schéma strict
  - Fichiers : `packages/cli/src/index.ts`
  - Tests : `packages/cli/test/mcp-tools.test.ts`
- [ ] 4. Refuser tout outil d'écriture
  - Fichiers : `packages/cli/test/mcp-readonly.test.ts`
  - Tests : `packages/cli/test/mcp-readonly.test.ts`
- [ ] 5. Isoler la commande d'évaluation payante derrière un drapeau explicite
  - Fichiers : `packages/cli/src/index.ts`
  - Tests : `packages/cli/test/eval-flag.test.ts`

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
