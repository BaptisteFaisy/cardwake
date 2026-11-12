# Serveur MCP Cardwake

Un serveur MCP (Model Context Protocol) qui expose le **moteur** de Cardwake à
un développeur ou à un agent de codage : lecture et **simulation** de piles,
de scripts et de clics. **Aucun modèle, aucune clé, aucun réseau** — tout
tourne localement sur les paquets purs du dépôt (`@cardwake/lang` et
`@cardwake/model`). Pas de SDK MCP : le transport JSON-RPC 2.0 sur stdio est
écrit à la main dans `src/rpc.ts`.

## Ce que le serveur expose

Six outils, tous en lecture ou en simulation, tous déterministes (graine
fixe, horloge figée) :

| Outil | Paramètres | Rend |
| --- | --- | --- |
| `validate_script` | `script, cardNames[], partNames[], backgroundNames[], objectKind` | `{ issues[] }` — contrôles statiques (`checkScript`) |
| `validate_stack` | `path` | `{ ok, errors[] }` — schéma `cardwake/1` (`parseStackFile`) |
| `paraphrase` | `script` | `{ lines[] }` — relecture en clair (`paraphraseScript`) |
| `simulate` | `stackPath, card, button` | `{ ok, stack, trace[], handledBy, hopsLeft }` — le clic est exécuté sur une **copie** de la pile via `Dispatcher` + `ModelHost`, les effets sont calculés, pas joués |
| `read_stack` | `path` | `{ ok, name, cards[], backgrounds[], scripts[] }` — les scripts sont parsés (handlers, fonctions, erreurs) |
| `format_script` | `script` | `{ normalized }` — forme canonique (`printScript`) |

Chaque outil rend un JSON sérialisable et ne lève jamais d'exception : un
échec rend `{ ok: false, error }`.

## Lancer le serveur

Depuis la racine du dépôt (Node 22) :

```
npx vite-node apps/mcp/src/server.ts
```

Le serveur lit des lignes JSON sur l'entrée standard et répond une ligne par
demande sur la sortie standard. Il ne fait rien d'autre : pas d'accès disque
hors des chemins de piles qu'on lui donne, pas de réseau, pas d'écriture.

## Connecter un agent de codage

Le serveur parle le protocole stdio standard des clients MCP. Exemple de
configuration (Claude Code, opencode, et tout client MCP générique) :

```json
{
  "mcpServers": {
    "cardwake": {
      "type": "stdio",
      "command": "npx",
      "args": ["vite-node", "apps/mcp/src/server.ts"],
      "cwd": "/chemin/vers/cardwake"
    }
  }
}
```

Les chemins de piles passés aux outils (`path`, `stackPath`) sont résolus
depuis le répertoire courant du serveur : donner `cwd` pointant sur le dépôt
permet d'utiliser `stacks/manor/stack.json` tel quel.

## Exemple de dialogue

Chaque ligne est un message JSON-RPC 2.0. Initialisation puis appel :

```
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"validate_stack","arguments":{"path":"stacks/manor/stack.json"}}}
```

La réponse d'un `tools/call` porte le résultat de l'outil en JSON dans son
contenu texte :

```json
{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"{\"ok\":true,\"path\":\"stacks/manor/stack.json\",\"errors\":[]}"}]}}
```

Erreurs : `-32700` pour une ligne qui n'est pas du JSON, `-32602` pour des
paramètres invalides ou un outil inconnu. Les notifications (sans `id`, comme
`notifications/initialized`) ne reçoivent jamais de réponse.
