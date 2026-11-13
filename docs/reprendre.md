# Reprendre le chantier — Cardwake

Ce que je ferais ensuite, et ce qu'il ne faut surtout pas redécouvrir à mes
place. Tout ce qui suit est vérifiable : les commandes sont celles du dépôt,
les chiffres sont ceux des rapports régénérables.

## 1. L'état réel, en six lignes

- **Le produit est complet et jouable** : sept écrans, trois piles de
  démonstration, un éditeur de phrase qui produit un brouillon, une
  rélecture en clair, un essai à blanc, un diff, et rien ne s'installe sans
  Accept.
- **La suite est verte** : `npm run ci` → 542 tests sur 55 fichiers, 0 échec ;
  `npm run typecheck` → 0 erreur ; `python3 scripts/guards/run_all.py` → 378
  fichiers contrôlés, 0 problème.
- **Les 23 propriétés du cahier sont citées dans un fichier de test**, et les
  propriétés fast-check tournent à 10 000 tirages sur demande
  (`CARDWAKE_PROP_RUNS=10000 npx vitest run packages`).
- **Les cibles de performance sont atteintes** (`docs/mesures.md`, régénéré par
  `npx vite-node scripts/bench/bench.ts`), sauf le tour d'agent médian, qui
  demande une vraie clé.
- **Le jeu d'évaluation est mesuré, deux fois** : 85 % puis 78 % au premier
  coup, 88 % puis 85 % après une réparation (`docs/mesures/eval.md`). La
  première cible (≥ 85 %) est atteinte une fois sur deux ; la seconde (≥ 95 %)
  n'est pas atteinte.
- **La recette rejouable** (`npx vite-node scripts/recette/recette.ts`)
  exécute les 14 points du cahier : 12 verts, 1 rouge documenté (l'écart de
  l'exemple 7.13), 1 hors périmètre (la vidéo).

## 2. Les trois familles de travail qui restent

### 2.1 La passe lecteur d'écran (humaine, ~une demi-journée)

L'automatique est déjà là : `apps/web/test/a11y.test.ts` — axe-core, WCAG 2.2
AA, sept écrans, plus un parcours clavier de bout en bout (17 tests). Il a déjà
trouvé un vrai défaut, un champ de fichier caché sans libellé, corrigé depuis.

**Ce qui manque** : un humain avec un vrai lecteur d'écran, sur les sept
écrans, dans l'ordre du parcours : étagère → carte (mode Jouer) → carte (mode
Fabriquer) → journal → réception → réglages → espion → preuves. Ce que la
passe doit couvrir, et que l'automatique ne couvre pas : l'ordre de
prononciation des libellés, le passage du focus aux changements de contenu
(l'agent écrit dans un champ : le lecteur l'annonce-t-il ?), les messages
d'erreur des trois défenses de l'éditeur de phrase, et le comportement du
journal à l'annulation.

**Comment le noter** : une colonne ajoutée au tableau de `docs/recette.md` —
point 12 passe de « contrôle automatique » à « contrôle automatique + passe
humaine », avec la date, le lecteur d'écran et sa version. C'est la seule
chose qui manque pour que la case soit honnête.

### 2.2 La vidéo (montage, ~une journée)

Exclue du lot de construction par le demandeur, donc jamais filmée. Le script
minuté est déjà livré : `docs/video-script.md` (2:58). Il reste à tourner les
écrans sur le code mergé et monter la voix off, sans marque de tiers ni musique
protégée.

Points d'attention, tous vérifiables : le site public ne charge aucune
ressource distante (donc l'écran filmé n'appellera rien), le mode enregistré
donne des réponses sans clé (donc le tournage ne coûte rien), et les trois
défenses de l'éditeur (relecture, essai à blanc, diff) se voient à l'écran —
c'est le meilleur plan de la vidéo.

### 2.3 La seconde cible du jeu d'évaluation (le plus long, ~une semaine)

Cible du cahier : ≥ 95 % des 40 tâches réussies après **une** réparation. On
est à 88 % et 85 %. La réparation aide — elle transforme trois à cinq échecs
en réussites — mais elle ne comble pas l'écart.

Les familles faibles sont connues et nommées : `agents` (3/6 puis 4/6) et
`loops` (3/6 puis 4/6), contre 6/6 pour `calcul` et `conditions`. Ce sont les
deux familles qui demandent au modèle de construire une boucle
(`repeat for each`) ou de faire parler un agent par un outil.

Trois pistes, par ordre de rapport effort/résultat :

1. **Éclairer le modèle sur la syntaxe des boucles.** La référence du langage
   contient déjà le motif ; voir si un extrait ciblé dans la consigne de
   rédaction (et non dans le langage lui-même) change le taux de `loops`.
2. **Réduire le nombre d'appels par tâche.** Un tour d'agent qui rappelle le
   modèle après ses appels d'outils double le coût et le taux d'erreur ; voir
   `docs/mesures/eval.md` pour le compte exact par famille.
3. **Fixer le fournisseur pendant la mesure.** `combo/cheap` est routé : la
   variance entre deux passages (85 % puis 78 %) vient de là. Un modèle fixé
   rend la mesure reproductible — mais le cahier demande de mesurer le
   produit réel, donc publie les deux : la fourchette en routé, et le score
   d'un modèle fixé quand il y en a un.

**La règle** : ne jamais publier un seul chiffre. La fourchette (78–85 %) est
la donnée honnête ; si un passage donne 92 %, il faut publier l'autre aussi.

## 3. Les pièges déjà payés

Six pièges que j'ai payés. Chacun a coûté une heure ou plus.

**3.1 Le banc peut mentir — et c'est lui, pas le modèle.** Le premier passage
du jeu d'évaluation a noté 70 %. Huit « échecs » étaient des défauts du
lanceur : les piles du jeu portent un champ *et* un bouton du même nom
(`Average`, `Label`, `Total`), le lanceur prenait le premier élément trouvé —
le champ — y installait le script, puis cliquait le bouton, qui n'a pas de
script. Le modèle écrivait des scripts justes. Le même lancer, le même
modèle, après correction : 85 %.
*Leçon :* compare toujours le script rendu à la pile finale avant de croire un
chiffre. Une pile vide avec un script juste, c'est un harnais, pas un modèle.

**3.2 La sortie structurée tronquée.** La référence du langage est longue ; un
plafond de 2 000 jetons coupait la réponse en pleine phrase et forçait une
réparation (deux appels au lieu d'un). Le défaut est désormais de 4 000 jetons,
**dans le produit comme dans le banc** (`DEFAULT_MAX_OUTPUT_TOKENS` dans
`packages/agent/src/write-script.ts`). Un banc qui tourne sur des réglages que
le produit n'a pas ne mesure pas le produit.

**3.3 Le modèle est routé.** `combo/cheap` change de fournisseur d'un appel à
l'autre. La variation de 85 % à 78 % vient de là, pas du harnais. Sur une
cible de 85 %, un modèle routé est un mauvais instrument : publie la
fourchette.

**3.4 La référence doit rester synchrone.** `docs/language.md` est *le même
fichier* que `.kiro/steering/language.md`, à une ligne de commentaire près. Le
test `packages/lang/test/language-sync.test.ts` échoue à la première
divergence. Modifier la référence sans copier la modification dans le steering
casse la CI ; modifier le produit sans modifier la référence casse la
promesse.

**3.5 Les empreintes de cassettes bougent quand la consigne change.** Une
cassette est indexée par l'empreinte SHA-256 canonique de la requête
(`fingerprint()` dans `packages/agent/src/gateway/canon.ts`), et cette
empreinte inclut la consigne, le message et le schéma d'outils. Donc :
**changer le persona d'un agent, ou la consigne du modèle, périme tous les
enregistrements correspondants.** Symptôme : `cassette verify` liste des
enregistrements périmés, et la démo répond `The card did not answer.` à la
place de la réponse enregistrée.
*Ce qu'il faut faire :* après toute modification de consigne, reconstruire les
cassettes (`npx vite-node scripts/cassettes/build.ts -- write` — les réponses
sont écrites à la main, sans réseau ni clé), puis vérifier
(`cardwake cassette verify`) et relire `docs/recette.md`, dont le point 3
rejoue les trois piles sans réseau. Noter que `cardwake cassette record` est
**refusé** par la CLI, à dessein : enregistrer costs de l'argent réel et reste
une action humaine.
L'outillage a déjà menti une fois (il déclarait périmés treize cassettes à
jour, parce que la liste des situations attendues était vide) : c'est
`stackSituations`, dans le paquet `agent`, qui fait foi.

**3.6 La file de merge et les runners.** Deux choses à savoir, qui ne se
devinent pas :

- *La file native de GitHub est indisponible* : elle exige un dépôt public
  possédé par une organisation, et l'API refuse la règle (`422`). C'est
  Mergify qui tient la file, avec trois checks requis (`ci`, `ci-budget`,
  `couche0`). La commande habituelle est `@mergifyio queue` ; ne fusionne
  jamais à la main.
- *Les deux runners auto-hébergés du projet sont hors ligne.* Vérifiable :
  `gh api repos/Tradoooo/cardwake/actions/runners --jq '.runners[] | {name,
  status}'` → `r630-cardwake-01` et `r630-cardwake-02` sont `offline`. Or
  `pr-auto-merge.yml` et `triage-rouge.yml` demandent encore
  `[self-hosted, linux, x64, cardwake-worker]` : ces deux workflows ne
  démarrent pas. C'est pourquoi la CI est passée sur `ubuntu-latest` (PR #54)
  et pourquoi la file de merge native est inutilisable. Le groupe de runners
  `cardwake` côté organisation existe, en visibilité `selected`, mais il ne
  contient aucun runner utile à ce dépôt : c'est un groupe vide, pas une
  réserve.

*Leçon :* avant de diagnostiquer une CI qui ne démarre pas, demander au
gestionnaire de runners qui tourne — pas à la CI.

## 4. Comment reprendre sans repartir de zéro

```bash
npm ci                                   # reproductible : le verrou contient tous les workspaces
npm run typecheck                        # 0 erreur attendue
npm run test:ci                          # 542 tests, 0 échec
python3 scripts/guards/run_all.py        # 378 fichiers, 0 problème
npx vite-node scripts/recette/recette.ts # les 14 points du cahier
npx vite-node scripts/bench/bench.ts     # les mesures de performance
npm run preuves                          # les 29 preuves exécutables
```

Pour le jeu d'évaluation (dépense de l'argent, jamais en CI) :

```bash
npm run relay --workspace @cardwake/relay        # terminal 1 : détient la clé
npx vite-node evals/run.ts --relay http://127.0.0.1:8787/v1 --out docs/mesures/eval.json
```

## 5. Les règles de la maison

Elles sont écrites, dans `.kiro/steering/` : `tech.md` (tailles, duplication,
imports), `agent-safety.md` (les règles non négociables), `trademarks.md`
(aucune marque de tiers hors `README.md` et `docs/`), `testing.md`.

En résumé, pour une PR :

- un fichier de code sous 500 lignes, une fonction sous 50, aucune logique
  dupliquée ;
- toute opération passe par `model/authorize`, tout appel au modèle par la
  passerelle ;
- un changement de comportement arrive avec le test qui le prouve ;
- le corps de la PR déclare son périmètre dans une section `## Scope` (une
  puce par fichier) — sans quoi la garde `couche0` refuse la PR ;
- messages de commit en français, petite taille, une idée par commit.

## 6. Ce qu'il ne faut pas casser

Trois engagements écrits dans le README et vérifiables :

1. **Le site reste public et gratuit à son adresse actuelle jusqu'au
   29 janvier 2027 au moins** (`.github/workflows/pages.yml`). Si le
   déploiement s'arrête, l'engagement est rompu — c'est le seul point qui
   engage le projet envers un tiers.
2. **Le site ne charge aucune ressource distante.** La garde de publication
   refuse un `index.html` qui pointe ailleurs ; c'est ce qui permet au mode
   enregistré de fonctionner hors ligne.
3. **Aucune donnée d'utilisateur côté serveur.** Le site est un paquet
   statique : ni compte, ni télémétrie, ni cookie. Une pile construite reste
   dans le navigateur et dans le fichier exporté ; une clé d'API n'entre ni
   dans une pile, ni dans un export, ni dans le contexte d'un agent
   (`CAR-P-22`).
