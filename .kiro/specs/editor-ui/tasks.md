# Le site : étagère, carte, éditeur, journal — Tâches

**Parcours.** Conception d'abord

Chaque tâche nomme les fichiers qu'elle touche et les tests qui la prouvent.
Une tâche n'est cochée que si ses tests passent et si les gardes restent verts.

## Tâches

Les noms de tests ci-dessous étaient ceux du **plan**, pas ceux du dépôt : cinq
fichiers cités n'ont jamais existé (`shelf`, `card`, `editor`, `journal-panel`,
`ink`), et le parcours de trois clics était promis sans être écrit. La liste est
alignée le 14 novembre 2026 sur les fichiers qui **existent**, vérifiés à la main
(`ls apps/web/test`, `npx vitest run`) : une tâche cochée sur un test fantôme
vaut moins qu'une tâche non cochée sur un test réel.

- [x] 1. Écrire l'étagère et l'ouverture d'une pile
  - Fichiers : `apps/web/src/screens/Shelf.tsx`, `apps/web/src/data/index.ts`
  - Tests : `apps/web/test/three-clicks.test.ts` (clic 1), `apps/web/test/engine.test.ts` (ouverture, navigation), `apps/web/test/a11y.test.ts` (étagère)

- [ ] 2. Écrire la carte et la sélection des éléments
  - Fichiers : `apps/web/src/screens/CardPlay.tsx`, `apps/web/src/screens/CardBuild.tsx`, `apps/web/src/parts/`
  - Tests : `apps/web/test/engine.test.ts` (construction, refus en mode Jouer), `apps/web/test/a11y.test.ts` (les deux modes, parcours P2 de la palette)
  - **Ce qui manque** : la sélection d'un élément à l'écran (`onSelect`, `selectedId`, inspecteur) n'est testée nulle part — la tâche reste non cochée.

- [x] 3. Écrire l'éditeur de script et l'affichage des erreurs
  - Fichiers : `apps/web/src/screens/ScriptEditor.tsx`, `apps/web/src/engine/script-editor.ts`
  - Tests : `apps/web/test/script-screen.test.ts`, `apps/web/test/script-editor.test.ts`, `apps/web/test/engine.test.ts` (`setScript`, refus en mode Jouer, annulation)

- [x] 4. Écrire le panneau journal et son bouton Annuler
  - Fichiers : `apps/web/src/screens/Journal.tsx`, `apps/web/src/screens/JournalScreen.tsx`
  - Tests : `apps/web/test/engine.test.ts` (annuler, rétablir, export), `apps/web/test/three-clicks.test.ts` (clic 3 : le journal liste les tours, un annuler ne défait qu'une ligne)

- [x] 5. Marquer l'encre d'agent et l'effacer au geste humain
  - Fichiers : `apps/web/src/parts/FieldPartView.tsx`, `packages/model/src/ops.ts`, `packages/model/src/journal.ts`
  - Tests : `packages/model/test/ops-journal.test.ts` (`inkAfter` posé par un agent, nul par un humain), `apps/web/test/engine.test.ts` (« encre nulle : c'est un humain »), `apps/web/test/three-clicks.test.ts` (la marque se nomme à l'oreille)

- [x] 6. Vérifier le parcours de trois clics
  - Fichiers : `apps/web/test/three-clicks.test.ts`
  - Tests : `apps/web/test/three-clicks.test.ts` — cinq cas, sans clé ni réseau, sur la pile et la cassette livrées

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
