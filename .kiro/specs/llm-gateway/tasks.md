# Passerelle vers les modèles — Tâches

**Parcours.** Conception d'abord — un seul point parle à un modèle

Chaque tâche nomme les fichiers qu'elle touche et les tests qui la prouvent.
Une tâche n'est cochée que si ses tests passent et si les gardes restent verts.

## Tâches

- [ ] 1. Figer les types de requête et de réponse
  - Fichiers : `packages/agent/src/types.ts`
  - Tests : `packages/agent/test/types.test.ts`
- [ ] 2. Écrire le mode enregistrement et son empreinte
  - Fichiers : `packages/agent/src/gateway/cassette.ts`
  - Tests : `packages/agent/test/cassette.test.ts`
- [ ] 3. Écrire le mode clé, sans jamais journaliser la clé
  - Fichiers : `packages/agent/src/gateway/key.ts`
  - Tests : `packages/agent/test/key-mode.test.ts`
- [ ] 4. Écrire le mode relais et son délai
  - Fichiers : `packages/agent/src/gateway/relay.ts`
  - Tests : `packages/agent/test/relay.test.ts`
- [ ] 5. Traiter le refus avant le contenu
  - Fichiers : `packages/agent/src/gateway/key.ts`
  - Tests : `packages/agent/test/refusal.test.ts`
- [ ] 6. Vérifier qu'aucune clé ne fuit dans un message d'erreur
  - Fichiers : `packages/agent/test/no-key-leak.props.test.ts`
  - Tests : `packages/agent/test/no-key-leak.props.test.ts`

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
