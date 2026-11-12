# Le relais local

Un petit serveur HTTP qui tourne **sur le poste** : il détient la clé du modèle
et la relaie vers le fournisseur, sous des plafonds. La clé ne quitte jamais
cette machine — elle part dans l'en-tête `Authorization` de l'appel vers
`https://api.inferhub.dev/v1/chat/completions`, et n'apparaît ni dans une
réponse, ni dans un journal, ni dans un export.

C'est l'option « relais » du cahier des charges (7.11, 11.6). Elle est **locale** :
le site public reste en mode enregistré (cassette). Le relais sert la personne
qui écrit les piles, sur sa propre machine.

## Lancer

Depuis la racine du dépôt :

```bash
npm run relay --workspace @cardwake/relay
```

Les équivalents : `npm start --workspace @cardwake/relay`, ou le binaire
`relay` après installation. Le relais écoute sur le port `PORT` (8787 par
défaut). Aucune dépendance npm : seulement `node:http`, `node:fs`, `node:os`.

## La clé

- `CARDWAKE_API_KEY` si la variable est posée ;
- sinon le fichier `~/.inferhub-key`.

Si aucune clé n'est trouvée, le relais démarre quand même : `/health` répond
`ok: false` et les appels rendus au fournisseur sont refusés.

## Les plafonds

| Plafond | Valeur | Refus |
|---|---|---|
| Modèles servis (liste fermée) | `combo/cheap`, `ag/claude-sonnet-4-6` | `403` `model is not allowed` |
| Longueur d'une requête | 100 000 caractères | `413` `request too long` |
| Requêtes par session et par heure | 60 | `429` `session limit reached` |
| Requêtes par jour, toutes sessions | 500 | `429` `daily limit reached` |

La session vient de l'en-tête `X-Cardwake-Session` ; sans en-tête, les requêtes
partagent dans une session commune. Le compteur du jour est tenu en mémoire et
remis à zéro au changement de jour.

Ces valeurs se règlent par l'environnement : `CARDWAKE_ALLOWED_MODELS`,
`CARDWAKE_MAX_REQUEST_CHARS`, `CARDWAKE_SESSION_REQUESTS_PER_HOUR`,
`CARDWAKE_DAILY_REQUESTS`.

Au plafond, le relais répond `429` avec un corps JSON
(`{"error":"daily limit reached"}`) : le client bascule alors proprement sur le
mode enregistré, sans exception.

Le site doit demander un modèle de la liste (`combo/cheap` ou
`ag/claude-sonnet-4-6`) : la passerelle du paquet `agent` se règle avec ces
noms, sinon la requête est refusée en `403`.

## Les routes

- `POST /v1/chat/completions` — corps OpenAI-compatible, relayé tel quel.
- `GET /health` — `{ ok, model, remainingToday }`, sans secret.
- `GET /config` — `{ baseUrl, mode: "relay", models, dailyLimit }` : c'est ce
  que le site lit pour savoir qu'il peut parler en direct.

## CORS

Seules les origines de `CARDWAKE_ALLOWED_ORIGINS` sont autorisées
(`http://localhost:5173,http://127.0.0.1:5173` par défaut), pour les méthodes
`GET`, `POST`, `OPTIONS`.

## Le journal

Des métadonnées seulement : heure, modèle, statut, durée, nombre de jetons
s'il y en a. Aucun contenu de requête ni de réponse n'est journalisé.
