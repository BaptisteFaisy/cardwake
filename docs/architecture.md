# Architecture

Trois paquets purs, un site, et deux points de passage uniques : les droits et le
modèle. Tout le reste est de l'assemblage.

## Les trois paquets purs et le site

| Espace | Rôle | Ce qu'il s'interdit |
|---|---|---|
| `@cardwake/lang` | Le langage Murmur : lexer, analyseur, arbre, impression, contrôles statiques, interpréteur pas à pas, relecture en clair | navigateur, réseau, modèle de données, horloge non fournie |
| `@cardwake/model` | Le document de pile, les opérations réversibles, le journal et l'annulation, `authorize`, `dispatch` | navigateur, réseau, appel à un modèle |
| `@cardwake/agent` | La vue d'une carte, ses outils, sa boucle de tour, ses budgets, les trois passerelles | écrire une opération sans passer par `authorize` |
| `@cardwake/web` | Le site : étagère, carte, éditeur, journal, réglages | parler à un modèle ailleurs que par la passerelle |

`@cardwake/cli` (option) assemble les trois paquets purs pour valider, exécuter et
relire sans navigateur. Les dépendances vont dans un seul sens : `lang` ne dépend
de rien, `model` de `lang`, `agent` des deux, le site et la CLI des trois.

Un paquet pur n'a ni `window`, ni `document`, ni `fetch`, ni horloge réelle non injectée : c'est ce qui rend l'essai à blanc gratuit et les tests déterministes.

## Le point de passage unique des droits

Une seule fonction décide : `model/authorize(actor, operation, pile)`. Elle rend
une décision — autorisée, ou refusée avec le niveau requis, le niveau effectif et
un message lisible. Personne d'autre n'applique une opération :

- un agent passe par ses outils, qui passent par `authorize` ;
- un script passe par l'interpréteur, dont les effets sont traduits par
  `model/dispatch`, qui passe par `authorize` ;
- l'interface passe par les mêmes opérations, avec un acteur humain.

Le niveau effectif se calcule, il ne s'écrit pas : une pile reçue non déclarée
digne de confiance plafonne tout agent à 2. Aucun outil ne modifie un niveau, une
consigne, un éveil ou un budget — ces quatre réglages n'appartiennent qu'à
l'humain.

## La passerelle unique

Un seul point parle à un modèle : `LlmGateway`. Trois modes interchangeables au
démarrage, jamais au milieu d'un tour :

| Mode | Usage | Coût |
|---|---|---|
| `cassette` | rejoue un échange enregistré ; le produit s'essaie sans clé | aucun |
| `key` | appel réel avec la clé de l'humain, jamais écrite dans le dépôt | réel |
| `relay` | appel par un relais, sans clé locale | réel |

Le refus est traité avant le contenu : une réponse refusée ne se lit pas. Les
types de requête et de réponse sont ceux du projet, pas ceux d'un fournisseur :
chaque mode traduit. L'usage en jetons accompagne toute réponse, et les budgets
de session se comptent sur ces faits.

## Le flux d'un message

```text
clic humain, script, agent ou horloge
   ▼
file de la pile
   ▼
distribution : élément → carte → fond → pile
   │   `pass` : un cran plus haut, même message
   │   aucun handler : message abandonné
   │   profondeur > 50 : arrêt, état remis, erreur lisible
   ▼ handler trouvé
exécution pas à pas (compteur d'étapes) → effets demandés à l'hôte
   ▼
authorize ──► refus : état inchangé
   ▼ autorisé
opérations réversibles → transaction → journal → rendu
```

Un agent réveillé par un message repasse par la même file : il n'existe pas de
canal parallèle entre deux cartes.

## Le flux de la phrase au script

```text
phrase + objet + résumé de la pile
   ▼
un appel au modèle (sortie structurée : script, résumé, hypothèses, questions)
   ▼
analyse syntaxique ──échec──► une réparation ──échec──► brouillon + erreurs
   ▼ réussi
contrôles statiques, sans modèle (éléments cités existants ou créés,
   ▼                            handlers valides, constructions permises, tailles)
relecture en clair (un gabarit par instruction, module sans modèle)
   ▼
essai à blanc sur une copie : « champ Total : 120 → 132 »
   ▼
Accepter / Modifier / Abandonner — rien n'est installé sans Accepter
```

Deux propriétés tiennent ce flux : la sortie du modèle n'est jamais exécutée, et
la relecture n'est pas écrite par le modèle qui a produit le script — il ne se
relit pas lui-même.

## Tableau des modules

| Besoin | Paquet | Module |
|---|---|---|
| Texte → arbre | `lang` | `lexer`, `parsing/*`, `ast` |
| Arbre → texte normalisé | `lang` | `print` |
| Contrôles statiques | `lang` | `check` |
| Exécution pas à pas | `lang` | `interpreter` (effets via `host`) |
| Arbre → phrases | `lang` | `paraphrase` |
| Format de pile, migrations | `model` | `schema`, `migrate` |
| Opérations et leur inverse | `model` | `ops` |
| Transactions, annulation | `model` | `journal` |
| Décision des droits | `model` | `authorize` |
| Hiérarchie des messages, file, sauts | `model` | `dispatch` |
| Plafonds et réglages | `model` | `limits` |
| Contexte d'un agent | `agent` | `view` |
| Outils et niveau minimal | `agent` | `tools` |
| Boucle d'un tour, budgets, file | `agent` | `loop`, `budget`, `queue` |
| Les trois modes d'appel | `agent` | `gateway/*` |
| Étagère, carte, éditeur, journal | `web` | `apps/web/src` |

Une seule référence du langage sert deux lecteurs : `docs/language.md` pour le
modèle embarqué, `.kiro/steering/language.md` pour l'agent de construction. Un
test garantit qu'elles restent identiques.
