# Cardwake, outil de développeur

Cardwake se construit et se vérifie **sans navigateur et sans clé**. La ligne
de commande `cardwake` valide, relit et simule une pile ; le serveur MCP du
projet expose les mêmes gestes à un agent de codage (humain ou LLM) au format
MCP. La seule commande qui parle à un vrai modèle est `cardwake live`, et elle
passe par le relais local — ce document ne s'en sert jamais.

Tout ce qui suit s'exécute depuis la racine du dépôt, sur Node 22.

## 1. Écrire un script Murmur

Une pile est un fichier `stack.json` dont chaque carte, fond, bouton ou champ
porte un petit script en langage **Murmur** (référence complète :
`docs/language.md`). Rien d'autre n'est nécessaire : pas de build, pas de
navigateur.

Exemple réel — le bouton « Show the amulet » de `stacks/manor/stack.json` :

```text
on mouseUp
  consult agent with "The visitor shows you a silver amulet."
  put it into field "Says"
end mouseUp
```

## 2. Valider une pile

`cardwake validate` contrôle le fichier en entier, puis chaque script :

```
$ cardwake validate stacks/manor/stack.json
stacks/manor/stack.json: ok (3 cards, 4 scripts checked)
```

Code de sortie `0`. Un script faux est refusé avec le chemin JSON et la ligne :

```
$ cardwake validate /tmp/stack.json
/tmp/stack.json: cards[0].parts[0].script: line 2 — Expected a field, a variable or "it" here.
```

Code de sortie `1`. Un mauvais usage (fichier absent) sort en `3`.

## 3. Relire un script en clair

`cardwake paraphrase` traduit un script en phrases que l'auteur peut approuver :

```
$ cardwake paraphrase stacks/manor/stack.json --object "Guard/Show the amulet"
-- button "Show the amulet" of card "Guard" --
on mouseUp
  consult agent with "The visitor shows you a silver amulet."
  put it into field "Says"
end mouseUp
```

Tant que le module de relecture n'est pas encore branché, la commande l'annonce
et imprime le texte normalisé — elle reste exploitable.

## 4. Simuler un clic

`cardwake run` rejoue un clic sur une copie, sans réseau, avec une graine
reproductible, et imprime les opérations produites :

```
$ cardwake run stacks/manor/stack.json --click "Guard/Go to the kitchen"
click on button "Go to the kitchen" of card "Guard" (seed 1) — 1 operation(s)
  show card 20
```

```
$ cardwake run stacks/quotes/stack.json --click "Dupont/Total"
click on button "Total" of card "Dupont" (seed 1) — 3 operation(s)
  write into part 6 of card 10: "" becomes "150"
  write into part 7 of card 10: "" becomes "15"
  write into part 8 of card 10: "" becomes "165"
```

`--seed n` fixe la graine : deux passes avec la même graine impriment la même
chose. `consult agent` sans passerelle répond « The card did not answer. » —
aucun appel réseau.

## 5. Enregistrer et vérifier une cassette

`cardwake cassette list` lit les enregistrements qui rejouent une pile sans
clé (fichier `<pile>/cassette.json`) :

```
$ cardwake cassette list stacks/quotes/stack.json
3573185c…  agent-turn  212 bytes
72db7608…  agent-turn  195 bytes
2 recording(s)
```

`cardwake cassette verify` compare l'empreinte de chaque enregistrement à la
pile actuelle : `stale` = la pile a changé, `missing` = une situation attendue
n'a pas d'enregistrement. `cardwake cassette record` est **refusée**
volontairement : enregistrer appelle un vrai modèle, cela coûte de l'argent et
reste un geste humain.

## 6. Lancer le serveur MCP

`cardwake mcp` démarre le serveur MCP du projet, en lecture et simulation
seulement. Ses six outils recouvrent exactement les gestes ci-dessus :
`validate_script` et `validate_stack` (valider), `paraphrase` (relire),
`simulate` (simuler un clic), `read_stack` et `format_script` (lire). Si le
module serveur n'est pas encore présent, la commande l'annonce et sort en
code `2` — jamais d'appel réseau, jamais de clé.

## 7. Brancher un agent de codage

Forme JSON MCP standard, prête à coller dans la configuration de votre client
(Claude Desktop, VS Code, un agent qui parle MCP…) :

```json
{
  "mcpServers": {
    "cardwake": {
      "command": "cardwake",
      "args": ["mcp"]
    }
  }
}
```

Depuis les sources, sans installer le binaire globalement :

```json
{
  "mcpServers": {
    "cardwake": {
      "command": "npx",
      "args": ["vite-node", "packages/cli/src/main.ts", "mcp"]
    }
  }
}
```

Les chemins de piles donnés aux outils (`path`, `stackPath`) sont résolus
depuis le répertoire courant du serveur : lancez-le depuis la racine du dépôt
(ou donnez un `cwd`) pour écrire `stacks/manor/stack.json` tel quel.

## 8. Ce que l'agent d'une carte peut faire pour le développeur

Chaque carte peut héberger un agent, plafonné par un **niveau** fixé par
l'humain et par personne d'autre :

| Niveau | Nom | Ce que l'agent peut faire |
|---|---|---|
| 1 | Browse | lire sa carte, répondre, envoyer un message à une autre carte |
| 2 | Type | écrire dans les champs déverrouillés de sa propre carte |
| 3 | Paint | changer l'apparence de ses éléments (visible, label, style) |
| 4 | Create | créer, déplacer, supprimer des éléments, créer une carte |
| 5 | Program | **proposer** un script pour un objet de sa carte |

Un agent de carte peut donc relire, décrire et, au niveau 5, **proposer** un
script. La relecture en clair (`cardwake paraphrase`) et l'essai à blanc
(`cardwake run`, outil MCP `simulate`) sont les outils du développeur pour
juger cette proposition. Règle sans exception : **un script proposé n'est
installé qu'après accord humain**, au vu de la relecture en clair et de la
différence avec l'ancien script. Un agent n'écrit jamais d'opération sans
passer par `authorize`, et ne modifie jamais un niveau, une consigne ou un
budget.