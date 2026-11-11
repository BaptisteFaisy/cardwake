# Arborescence

```text
.
├── .kiro/                 specs, steering, hooks, agents
├── apps/
│   └── web/               le site : étagère, carte, éditeur, journal, réglages
├── packages/
│   ├── lang/              lexer, parser, ast, interpréteur, contrôles, relecture
│   ├── model/             schémas, opérations, journal, droits, dispatch
│   ├── agent/             vue, outils, boucle, budgets, passerelles
│   └── cli/               validate, run, paraphrase, cassette, eval
├── stacks/                manor, quotes, dashboard + leurs enregistrements
├── evals/compile/         les tâches du jeu d'évaluation
├── docs/                  language.md, cahier des charges, journal de bord
└── scripts/               guards/ (CI), hooks/ (gardes Kiro)
```

## Où va quoi

| Besoin | Paquet | Module |
|---|---|---|
| Texte → arbre | `lang` | `lexer`, `parser`, `ast` |
| Arbre → texte normalisé | `lang` | `print` |
| Contrôles statiques | `lang` | `check` |
| Exécution pas à pas | `lang` | `interpreter` (effets via `Host`) |
| Arbre → phrases | `lang` | `paraphrase` |
| Format de pile, migrations | `model` | `schema`, `migrate` |
| Opérations et leur inverse | `model` | `ops` |
| Transactions, annulation | `model` | `journal` |
| **Le point de passage des droits** | `model` | `authorize` |
| Hiérarchie des messages, file, sauts | `model` | `dispatch` |
| Contexte d'un agent | `agent` | `view` |
| Outils, schémas, ligne équivalente | `agent` | `tools` |
| Boucle d'un tour, budgets, file | `agent` | `loop`, `budget`, `queue` |
| Les trois passerelles | `agent` | `gateway/*` |

Un seul point décide de qui peut faire quoi : `model/authorize`. Un seul point
parle à un modèle : `LlmGateway`.
