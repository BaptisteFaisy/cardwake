# Pile technique

| Élément | Choix |
|---|---|
| Langage | TypeScript strict, ESM (`"type": "module"`), Node ≥ 22 |
| Monorepo | npm workspaces : `packages/*` (purs) + `apps/*` |
| Site | Vite + React 18, éléments de page ordinaires (pas de canevas) |
| Tests | Vitest + fast-check (propriétés) ; aucun appel réel à un modèle |
| Schémas | Zod pour le format de fichier de pile |
| CI | Runners self-hosted `cardwake-worker`, verdict ≤ 5 min, file Mergify |

## Règles de code (règle user 2026-10-24, vérifiée par `scripts/guards`)

- Un fichier de code fait **moins de 500 lignes** ; une fonction **moins de
  50 lignes**. Au-delà : découper, jamais laisser grossir.
- **Zéro duplication** : extraire un helper, paramétrer, une seule
  implémentation par logique. Chercher l'existant avant d'écrire.
- Imports entre paquets : `@cardwake/lang`, `@cardwake/model`,
  `@cardwake/agent`. À l'intérieur d'un paquet : chemin relatif **sans
  extension** (`./parser`, pas `./parser.js`).
- Les paquets `lang` et `model` sont **purs** : ni `window`, ni `document`, ni
  `fetch`, ni horloge réelle non injectée (CAR-N-09).
- `lang` ne dépend d'aucun autre paquet ; `model` ne dépend que de `lang`
  (types) ; `agent` dépend des deux ; `apps/web` et `packages/cli` dépendent
  des trois.
- Toute sortie d'erreur est lisible : objet, ligne, message simple, piste.
  Jamais de trace technique du navigateur.

## Vérifier avant de rendre

```bash
npm run typecheck && npm run test:ci && npm run guards
```
