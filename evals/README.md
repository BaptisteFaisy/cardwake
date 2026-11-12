# Jeu d'évaluation « phrase → script »

Mesure du taux de réussite de la chaîne phrase → script (cahier des charges
7.7) sur 40 tâches réelles. On juge **le comportement** — l'état final de la
pile après les événements simulés — jamais le texte du script produit.

Aucun appel réseau ici : ce dossier ne contient que des données et des
contrôles hors modèle. Le jeu lui-même se lance à la demande, par un humain,
avec une vraie clé.

## Une tâche

Un fichier JSON dans `compile/`, contrôlé par `validateTask` (`schema.ts`) :

| champ | sens |
|---|---|
| `id` | identifiant unique, égal au nom du fichier (`calcul-01`…) |
| `family` | une des six familles (voir plus bas) |
| `phrase` | la demande, en anglais naturel, ≥ 20 caractères |
| `object` | l'objet cible au format `"Carte/Partie"` — le script s'installe là |
| `stack` | une petite pile inline au format `cardwake/1`, validée par `validateStack` |
| `events` | les événements à simuler, dans l'ordre : `click` (bouton), `type` (`{field, text}`), `chat` (message à l'agent de la carte) |
| `expect` | les conditions sur l'état final, toutes vraies (≥ 1) |
| `notes` | remarque facultative pour le lanceur |

Les neuf attentes possibles : `fieldEquals`, `fieldContains`, `fieldEmpty`,
`cardIs` (carte affichée), `partExists`, `partCount`, `agentSaid` (un champ de
la carte contient le texte), `messageSent` (un champ de la carte destinataire
contient le texte), `noError`.

Sémantique du vérificateur (`check.ts`, `checkTask(task, stack)`) :

- les recherches `contient` sont insensibles à la casse, comme le langage ;
- `partCount` compte les éléments propres de la carte **plus** ceux de son fond ;
- `agentSaid` et `messageSent` regardent les champs de la carte nommée : un
  agent n'écrit que sur sa propre carte, un message reçu y laisse sa trace ;
- `noError` est jugé par le lanceur (les erreurs d'exécution ne se voient pas
  dans une pile finale) : `checkTask` seul le laisse toujours passer.

## Les six familles (40 tâches)

| famille | nombre | objet |
|---|---|---|
| `calcul` | 8 | additions, pourcentages, moyennes, lignes `label,quantité,prix` |
| `chunks` | 8 | listes et morceaux de texte : `item`, `word`, `line`, tris, comptages |
| `navigation` | 6 | aller à la carte suivante, précédente, par nom, après saisie |
| `conditions` | 6 | gardes de champ vide, seuils, tests `contains`, portes de navigation |
| `loops` | 6 | `repeat with`, `repeat for each`, comptages et transformations |
| `agents` | 6 | `consult`, `tell`, messages entre cartes, réponses en dialogue |

## Comment lancer

Contrôles hors modèle (aucune clé, aucun réseau, sûrs en CI) :

```sh
npx vitest run evals --reporter=basic
```

Le test charge les 40 fichiers, valide chacun, vérifie les comptes, et prouve
pour une tâche par famille que les attentes sont atteignables : il applique
réellement les opérations correspondantes avec `applyOps` puis exige
`checkTask → ok`.

Essai à blanc d'une pile, sans modèle :

```sh
npx vite-node packages/cli/src/main.ts run stacks/quotes/stack.json --click "Dupont/Total"
```

Le jeu complet : un humain charge une tâche (`loadTasks("evals/compile")`),
demande le script pour `object` et `phrase` avec une **vraie clé**, installe
le script accepté, joue `events`, puis appelle `checkTask` sur la pile finale.

## Règle d'argent

**Jamais en intégration continue.** Une vraie clé coûte de l'argent : un
passage complet des 40 tâches est estimé à ≈ 2,40 $ (hypothèses de 7.11). Les
tests automatisés de ce dossier n'appellent jamais le réseau ; seul un humain
décide quand dépenser.

## Cibles du cahier des charges

- **≥ 85 %** des tâches réussies au premier coup ;
- **≥ 95 %** après une réparation (un seul appel supplémentaire).
