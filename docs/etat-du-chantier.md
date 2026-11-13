# État du chantier — 13 novembre 2026, 15 h

Mis à jour après la session du 13 novembre (relecture en clair, lanceur du jeu
d'évaluation, mesures de performance, recette automatisée). Il dit ce qui est en
ligne, ce qui est prouvé par des tests et par des mesures, ce qui reste, et
comment reprendre sans repartir de zéro.

## 1. Infrastructure (terminée, vérifiée)

| Élément | État |
|---|---|
| Dépôt | `BaptisteFaisy/cardwake`, public, `main` protégée par ruleset (PR obligatoire, historique linéaire, checks requis `ci`, `ci-budget`, `couche0`) |
| Runners | 3 self-hosted en ligne, label `cardwake-worker` : `r630-cardwake-01` et `-02` (**déplacés** depuis `chantiers-en-collision`, où ils tournaient à vide) et `pc-cardwake-03` (poste local) |
| File de merge | Mergify Merge Queue activée par API (`merge_queue` + `merge_protections`), embarquement automatique dès que les trois checks sont verts |
| Agents hermes de conflit | `conflict_agent.py` et `scope_agent.py` branchés sur un **routeur de modèles** : variable de dépôt `FIREWORKS_BASE_URL` (chat-completions) + `FIREWORKS_MODEL`, secret `FIREWORKS_API_KEY`. Le commentaire rendu sur la PR nomme le fournisseur réel |
| Budget CI | 14 s pour le job `ci` complet (types + tests + gardes) — très loin des 5 minutes imposées |
| Build du site | hors PR, dans `deploy.yml` sur `main`, avec artefact et garde « aucune construction dangereuse dans le site produit » |

Les trois premières PR sont passées par la file et ont été mergées sans clic.

## 2. Ce qui est livré et testé

**`packages/lang`** (pur) — lexer, analyseur, impression, sémantique des valeurs, morceaux de texte.
- `ast.ts` : la grammaire figée, contrat de tout le projet.
- `lexer.ts`, `parser.ts`, `parsing/*` : analyse descendante récursive, positions conservées, erreurs lisibles.
- `print.ts` : forme canonique, `parse(print(ast)) === ast`.
- `values.ts`, `chunks.ts` : « tout est du texte », les quatre morceaux en lecture et écriture.
- Propriétés prouvées : **CAR-P-01**, **CAR-P-02** (2 000 tirages), **CAR-P-05**, **CAR-P-21**.
- Les trois scripts d'exemple du cahier des charges s'analysent et se réimpriment à l'identique.

**`packages/lang` (suite)** — l'interpréteur.
- `interpreter/runtime.ts` : portée des variables, `it`, compteurs d'étapes et d'attente, signaux de contrôle (`exit repeat`, `exit <handler>`, `return`, garde-fou atteint).
- `interpreter/eval-expr.ts`, `exec-stmt.ts`, `index.ts` : évaluation des expressions, exécution des instructions, `runHandler`.
- Tous les effets passent par l'interface `Host` : le paquet reste pur et le point de passage des droits reste unique.
- Propriétés prouvées : **CAR-P-04** (même graine, même suite d'effets), **CAR-P-06** (une boucle sans fin s'arrête sous `maxSteps`).
- Les trois scripts du cahier s'exécutent : la liste de tâches ajoute sa ligne, le devis calcule 150 / 15 / 165, le bouton du manoir consulte l'agent.
- Découverte notée au passage : `true`, `false`, `return`, `tab` et `comma` doivent être des **constantes**, pas des variables — sinon `repeat while true` ne boucle jamais, et c'est exactement le contre-exemple que CAR-P-06 a trouvé.

**`packages/model`** (pur) — schéma, fabriques, identifiants, fichier, migration, droits.
- `schema.ts` : validation à la main du format `cardwake/1`, erreurs avec chemin en anglais.
- `factory.ts`, `ids.ts` : fabriques sans mutation, identifiants monotones jamais réutilisés.
- `file.ts`, `migrate.ts` : JSON canonique, refus en bloc, format versionné.
- `authorize.ts` : **le point de passage unique des droits**.
- `clone.ts`, `ops.ts`, `journal.ts` : les 14 variantes d'`Op` s'appliquent et s'inversent, le journal annule transaction par transaction, l'historique fond dans un instantané au-delà de 200.
- Propriétés prouvées : **CAR-P-07**, **CAR-P-08**, **CAR-P-10**, **CAR-P-11**, **CAR-P-12**, **CAR-P-13**, **CAR-P-17**, **CAR-P-18**, **CAR-P-22**, **CAR-P-23**.

**`packages/agent`** — passerelle et outillage d'agent.
- `gateway/sha256.ts`, `canon.ts` : empreinte SHA-256 canonique d'une requête.
- `gateway/cassette.ts` : mode enregistré (essai sans clé), `verify()` liste les enregistrements périmés.
- `gateway/key.ts`, `relay.ts`, `http.ts`, `router.ts` : clé personnelle, relais plafonné, repli propre.
- `testing/fake-model.ts` : faux modèle, y compris **adversaire** (outils interdits, cartes d'autres agents).
- `view.ts`, `tools.ts`, `budget.ts`, `queue.ts` : contexte borné, schémas stricts par niveau, budgets qui gèlent à l'épuisement, file des tours.
- Propriétés prouvées : **CAR-P-15**, **CAR-P-16**, **CAR-P-19**, **CAR-P-20**.

**Documentation et outillage Kiro**
- `docs/language.md` : la référence du langage (795 lignes), **le même fichier** est copié dans `.kiro/steering/language.md` pour instruire l'IA de développement ; un test (`language-sync.test.ts`) vérifie que les deux copies restent identiques.
- `.kiro/specs/` : les 12 specs (requirements EARS avec identifiants `CAR-F-nn`, design, tasks).
- `.kiro/hooks/hooks.json` + `scripts/hooks/*.mjs` : les 9 gardes, avec leurs tests.
- `.kiro/agents/` : `lang-reviewer`, `safety-reviewer`, `stack-author`.
- `docs/architecture.md`, `docs/journal.md`.

**Piles de démonstration** : `stacks/manor`, `stacks/quotes`, `stacks/dashboard` — les trois passent la validation ; The Manor a ses deux cartes habitées et son bouton qui consulte l'agent.

**Gardes CI** (`scripts/guards/run_all.py`) : constructions dangereuses, marques d'un tiers, clés en clair, fichiers < 500 lignes et fonctions < 50 lignes, présence de `.kiro/`.

## 3. Ce qui reste

| Lot | État | Où |
|---|---|---|
| Passe d'accessibilité au lecteur d'écran | à faire — le contrôle automatique existe (axe-core, WCAG 2.2 AA, parcours clavier) et a déjà trouvé un défaut corrigé | `apps/web/test/a11y.test.ts` |
| Seconde cible du jeu d'évaluation (≥ 95 % après réparation) | non mesurée séparément : la chaîne répare une fois dans la tâche, la tâche est comptée une fois | `evals/runner.ts` |
| Exemple 7.13 : trois transactions et quatre appels au lieu de deux et trois | **écart documenté**, pas un défaut : chaque tour d'agent est sa propre transaction, et l'agent est rappelé après ses appels d'outils. Le comportement observé est celui du cahier (`alarmed`, puis `nervous`, état de départ restauré) | `docs/recette.md` |
| Vidéo de trois minutes | hors périmètre (exclue par le demandeur) ; le script est livré | `docs/video-script.md` |

Ce qui est livré depuis la première session : le pont `host.ts` et le
`Dispatcher`, la boucle d'agent, la chaîne phrase → script, les cassettes, la CLI
complète, le serveur MCP, le relais local, **l'éditeur de script et de phrase
dans l'écran** (brouillon, relecture en clair, essai à blanc, diff, Accept ou
Refus), le lanceur du jeu d'évaluation (85 % au premier coup sur 40 tâches), le
banc de performance (toutes les cibles atteintes) et la recette automatisée
(point par point, rejouable).

Les cassettes ne sont plus « périmées » : `cassette verify` compare enfin les
empreintes enregistrées aux situations que les parcours de démonstration
demandent aujourd'hui.

## 4. Reprendre le travail

```bash
cd ~/Bureau/cardwake
npm install                     # déjà fait sur ce poste
npm run typecheck               # 0 erreur attendue
npx vitest run --reporter=basic # attention : `--dir` ne filtre rien ici
python3 scripts/guards/run_all.py
```

Règles de la maison : `~/Bureau/cardwake/.kiro/steering/tech.md` (tailles, duplication, imports), `agent-safety.md` (les 10 règles non négociables), `trademarks.md` (aucun nom de tiers hors README/docs).

Une PR doit déclarer son périmètre dans une section `## Scope` avec des puces
(globs ou dossiers terminés par `/`) : tout fichier modifié non déclaré est
refusé, et toute déclaration inutilisée aussi. Modifier un fichier de garde
(`.github/workflows/ci.yml`, `pr-auto-merge.yml`, `couche0*`, `ci-budget*`)
exige la mention libre `SAMVISION_ALLOW_GUARD_BUMP` dans le corps.

## 5. Pièges payés pendant cette session

- **Délégation** : un sous-agent qui n'a rien écrit après 30 minutes est
  généralement figé sur une génération trop longue ; mieux vaut plusieurs petits
  lots qu'un gros, et **peu d'agents en parallèle** quand la machine est chargée
  (le poste tournait à 13-24 de charge avec d'autres chantiers).
- **`vitest --dir`** : avec `include: packages/*/test/**` dans la config racine,
  `--dir packages/x` ne trouve aucun test. Utiliser le filtre positionnel.
- **`couche0`** : les dates antérieures au 26 octobre sont un motif interdit —
  écrire « relevé antérieur, hors de cet arbre ».
- **Garde des 500/50** : les gros `switch` d'impression et les générateurs
  fast-check dépassent vite 50 lignes ; les découper en deux moitiés qui se
  délèguent l'une à l'autre.
- **Fausse clé de test** : même factice, un texte en `sk-…` fait rougir la CI et
  `couche0` ; nommer les clés de test autrement.
- **Runners r630** : la machine est très chargée (load 95 observé) ; le runner
  local du poste rend le verdict CI en 14 s, c'est lui qui a pris les runs.
- **Le banc peut mentir.** Le premier passage du jeu d'évaluation a noté 70 % :
  huit « échecs » étaient des défauts du lanceur, pas du modèle — les piles
  portent un champ *et* un bouton du même nom, et le lanceur installait le
  script sur le champ avant de cliquer dessus. Corrigé, le même modèle passe de
  70 % à 85 %. Toujours comparer le script rendu à la pile finale avant de
  croire un chiffre.
- **Sortie structurée tronquée** : la référence du langage est longue ; un
  plafond de 2 000 jetons coupait le JSON en pleine réponse et forçait une
  réparation. Quatre mille jetons suffisent.
- **Fournisseur lent** : `combo/cheap` ne répond pas toujours en 60 s ; le délai
  d'attente du relais est réglable (`CARDWAKE_UPSTREAM_TIMEOUT_MS`) et reste à
  60 s par défaut.
