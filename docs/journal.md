# Journal de bord — Cardwake

Une ligne par tâche de spec, ajoutée par le hook `journal-reminder`. Les entrées
longues restent ici ; les mesures du récit de soumission sont regroupées en bas,
dans « À mesurer ».

## 2026-11-11 — socle

- Socle posé : monorepo npm, quatre espaces de travail (`lang`, `model`,
  `agent`, `cli`) plus le site, TypeScript strict en ESM, Node 22.
- Contrats figés avant toute implémentation : `packages/lang/src/ast.ts` (la
  grammaire normative), `packages/lang/src/host.ts` (ce que l'interpréteur a le
  droit de toucher), `packages/model/src/types.ts` (le document de pile),
  `packages/model/src/limits.ts` (plafonds et réglages, deux étages distincts),
  `packages/agent/src/types.ts` (passerelle, outils, budgets).
- CI : verdict en 5 minutes au plus, jobs bornés, `fetch-depth: 1`, garde
  `ci-budget` ; la première PR est verte et mergée par la file (rebase,
  historique linéaire), `main` protégée.
- Infrastructure : trois runners auto-hébergés déplacés sur le label du projet ;
  aucune commande payante ne part d'un robot.
- Agents de conflit branchés sur un routeur de modèles : une PR en conflit ou
  rouge est reprise automatiquement, sans crédit dépensé par un agent de
  construction.
- Gardes du dépôt en place : constructions interdites, marques d'un tiers, formes
  de clé, tailles (< 500 lignes par fichier, < 50 lignes par fonction).

## 2026-11-11 — lot D : référence, specs, hooks

- `docs/language.md` écrit en anglais : la référence complète de Murmur, alignée
  sur `ast.ts` et sur l'analyseur (une sous-section par instruction, expressions,
  morceaux de texte, désignations d'objets, nombres, limites, niveaux, quinze
  pièges, dix scripts complets dont les trois du cahier des charges).
- `.kiro/steering/language.md` : la même référence, précédée d'une seule ligne de
  commentaire ; `packages/lang/test/language-sync.test.ts` vérifie l'identité des
  deux copies.
- Douze specs Kiro écrites : `language-core`, `object-model`, `message-dispatch`,
  `permissions`, `card-agents`, `phrase-to-script`, `journal-undo`,
  `llm-gateway`, `editor-ui`, `received-stacks`, `sample-stacks`, `cli-mcp`.
  Chacune porte ses exigences EARS identifiées `CAR-F-nn`, ses modules, ses cas
  limites et ses tâches cochables nommant fichiers et tests.
- Neuf gardes Kiro en `scripts/hooks/*.mjs`, logique partagée dans `lib.mjs`,
  déclarées dans `.kiro/hooks/hooks.json` ; chacune sort 0 si l'action est
  autorisée, code non nul et message sur stderr sinon. Vérifiées : un cas
  autorisé et un cas refusé par garde.
- Trois agents de relecture : `lang-reviewer` et `safety-reviewer` en lecture
  seule, `stack-author` comme premier utilisateur du langage.
- `README.md` et `docs/architecture.md` réécrits.

## Contradictions relevées par l'analyse des exigences

À compléter spec par spec. La spec `permissions` est celle où une contradiction a
le plus de chances d'apparaître ; trois candidates sont déjà identifiées :

- un champ verrouillé qu'un script peut écrire mais pas un agent — deux règles
  pour une même écriture, à trancher par le demandeur, pas par la cible ;
- un agent de niveau 4 qui change la carte affichée alors qu'il « ne modifie que
  sa carte » — la navigation n'est pas une écriture, mais elle change ce que
  l'humain voit : à journaliser comme opération de la carte de l'agent ;
- une proposition de script qui est à la fois une écriture et une demande — elle
  ne doit jamais être appliquée par l'agent, seulement déposée pour acceptation.

## À mesurer (récit de soumission, 14.6)

1. **Une seule référence pour deux IA.** `language.md` instruit l'agent de
   construction par le steering et le modèle embarqué par sa consigne.
   *Mesure attendue :* au moins un défaut trouvé par l'un des deux lecteurs et
   qui a corrigé l'autre — noter la date, le lecteur, la forme fautive et la
   correction apportée à la référence. *Actuel :* 0 défaut consigné.
2. **Les droits sont des propriétés.** « Aucun agent ne dépasse son niveau » est
   une exigence, un critère d'acceptation et un test contre un faux modèle
   adversaire. *Mesure attendue :* chaque contre-exemple trouvé, avec le chemin
   d'appel. *Candidats probables :* écriture d'un agent dans un champ verrouillé,
   carte affichée changée par un agent, champ de fond écrit depuis une autre
   carte. *Actuel :* 0 contre-exemple consigné, test adversaire à écrire
   (`permissions`, tâche 6).
3. **Un langage appris sans l'avoir jamais vu.** *Mesure attendue :* nombre de
   scripts de `stack-author` valides du premier coup, avant et après chaque
   amélioration de la référence. *Actuel :* 0 script écrit, décompte à ouvrir dès
   la première pile d'exemple.
4. **L'agent ne dépense pas la clé.** *Mesure attendue :* nombre de
   déclenchements de `no-live-model-guard`, et confirmation qu'aucun appel réel
   n'est parti d'une session d'agent. *Actuel :* garde en place et testée (un cas
   autorisé, un cas refusé), compteur à brancher sur le journal.

**Budget.** Indicatif : 1 500 à 1 800 crédits sur 4 000. *À mesurer :* le coût
réel d'une spec complète, sur `message-dispatch` — petite, bien bornée, pleine de
cas limites, et déjà écrite en exigences.

**Reste à vérifier.** Le nom exact du champ qui porte la commande dans
`tool_input` d'un hook : `lib.mjs` accepte `command`, `cmd`, `shell` et
`input.command`, à confirmer sur un premier déclenchement réel puis à réduire à
une seule forme.

## 13 novembre 2026 — relecture, mesures, recette

- **Relecture en clair réparée.** `cardwake paraphrase` annonçait que le module
  de relecture n'était pas livré : la commande lui passait l'arbre syntaxique au
  lieu de la source du script. Le `catch` avalait l'échec, la commande
  retombait sur le texte normalisé. Corrigé, et vérifié sur la pile du manoir.
- **Lanceur du jeu d'évaluation** (`evals/runner.ts`, `evals/run.ts`) : la
  phrase part au modèle, le script est contrôlé, relu et essayé à blanc, installé
  par `authorize`, joué par le vrai moteur du site, puis la pile finale est
  jugée. **Mesure du 13/11, modèle `combo/cheap` : 34/40 tâches réussies au
  premier coup — 85 %** (cible du cahier : ≥ 85 %), 54 appels, 269 385 jetons
  d'entrée, 30 781 de sortie, ≈ 20 min. Rapport : `docs/mesures/eval.md` et
  `docs/mesures/eval.json`.
- **Le banc a menti une fois.** Premier passage : 70 %. Huit « échecs » étaient
  des défauts du lanceur — les piles portent un champ et un bouton du même nom,
  le script était installé sur le champ puis le clic tombait dessus. Le même
  modèle passe à 85 % après correction du lanceur seul.
- **Deux propriétés de plus, dont la dernière.** `CAR-P-09` (la hiérarchie) est
  désormais une propriété fast-check sur les 16 placements de handlers × 16
  choix de `pass` : les 23 identifiants du cahier apparaissent dans un test.
- **Mesures de performance** (`docs/mesures.md`) : changement de carte 0,004 ms
  (cible 50 ms), ouverture d'une pile de 100 cartes 1,10 ms (cible 1 s), analyse
  d'un script de 200 lignes 0,52 ms (cible 20 ms), 723 686 étapes
  d'interprétation par seconde (cible 200 000), événement → indication visible
  0,05 ms (cible 100 ms).
- **Recette automatisée** (`scripts/recette/`) : chaque point du cahier est
  exécuté, pas relu. Elle a trouvé deux vrais défauts : 13 enregistrements de
  cassettes périmés, et `CAR-P-09` sans identifiant dans les tests (corrigé
  depuis).
- **Licence** : MIT, `LICENSE` à la racine (les paquets la déclaraient déjà).
