# Passerelle vers les modèles — Exigences

**Parcours.** Conception d'abord — un seul point parle à un modèle

**But.** Traiter un refus avant le contenu, choisir le mode (enregistrement, clé, relais) sans changer les appelants, et ne jamais laisser une clé entrer dans une pile, un journal, un contexte ou un message d'erreur.

## Modules concernés

- `packages/agent/src/gateway/cassette.ts`
- `packages/agent/src/gateway/key.ts`
- `packages/agent/src/gateway/relay.ts`
- `packages/agent/src/types.ts`
- `packages/agent/src/gateway/sha256.ts`

## Exigences (EARS)

1. **CAR-F-47** — Le système doit faire passer tout appel à un modèle par `LlmGateway`, et par aucun autre chemin.
2. **CAR-F-48** — Quand une réponse est un refus, le système doit la traiter avant de lire un seul bloc de contenu.
3. **CAR-F-49** — Quand le mode est « enregistrement » et qu'aucune cassette ne correspond, le système doit rendre une erreur propre nommant l'empreinte manquante, jamais un appel réel.
4. **CAR-F-50** — Le système doit choisir le modèle selon la vitesse demandée et l'usage prévu, sans exposer le nom du fournisseur au reste du code.
5. **CAR-F-47** — Le système doit refuser d'émettre un appel contenant une clé dans un champ de pile, un journal, un contexte ou un message d'erreur.
6. **CAR-F-50** — Quand une requête dépasse le budget de jetons, le système doit la borner avant l'envoi et non après.

## Cas limites à couvrir

- Réponse de refus : traitée avant tout accès au contenu.
- Empreinte absente en mode enregistrement : erreur propre, aucun appel réel.
- Réponse tronquée par le plafond de jetons de sortie.
- Délai dépassé : interruption propre, rien d'écrit.
- Clé présente dans un contexte : refus d'émettre, erreur sans la clé.

## Hors périmètre

- Parler à un fournisseur depuis l'interface ou un script
- Rejouer un enregistrement avec un autre modèle que celui qui l'a produit
- Mettre une clé dans le dépôt, même en test

## Propriétés visées

- CAR-P-19
- CAR-P-20
- CAR-P-22

## Acceptation

- Chaque exigence a au moins un test nommé dans `tasks.md`.
- Aucune exigence n'est contredite par une autre ; une contradiction trouvée est notée dans le journal de bord.
