# Recette — état case par case au 11 novembre 2026

Chaque case de la recette du cahier, avec la commande ou le fichier qui la
prouve, ou ce qui manque. Preuves vérifiées sur ce dépôt le **11 novembre
2026** (run de propriétés à 10 000 tirages : voir
`docs/rapport-proprietes.md` ; suite complète : 262 tests verts).

**Bilan : 8 cases cochées sur 18**, 10 non cochées (dont 3 partiellement
prouvées au niveau des paquets, en attente du branchement applicatif).

| # | Case | État | Preuve / manque |
|---|---|---|---|
| 1 | Les 23 propriétés | **non cochée** (20/23) | `CARDWAKE_PROP_RUNS=10000 npx vitest run packages --reporter=basic` : 239 tests, 0 échec, 66,56 s. Manquent CAR-P-03 (`paraphrase.ts`), CAR-P-09 et CAR-P-14 (`dispatch.ts`) — détail dans `docs/rapport-proprietes.md`. |
| 2 | `cassette verify` | **non cochée** | La fonction `verify()` existe et est testée (`packages/agent/src/gateway/cassette.ts`, `cassette.test.ts`, 10 tests) et le hook `scripts/hooks/cassette-verify.mjs` liste les enregistrements périmés. Manquent : la commande CLI (`packages/cli/src/index.ts` est une ébauche de 2 lignes) et les cassettes des piles. |
| 3 | Les trois piles en mode enregistré sans requête réseau | **non cochée** | Les trois piles sont livrées et passent la validation telle quelle (`packages/model/test/schema-file.test.ts`, boucle sur `manor`/`quotes`/`dashboard`), et le site publié ne charge aucune ressource distante (garde de `.github/workflows/pages.yml`). Manque : `stacks/*/cassette.json` (lot C8 fin) — sans enregistrements, le mode enregistré n'a rien à rejouer. |
| 4 | L'exemple du manoir : deux transactions et trois appels | **non cochée** | La pile est livrée : fond « Character » (Mood/Memory/Says verrouillé), cartes Guard et Cook avec agents éveillés de niveau 2, bouton « Show the amulet » dont le script fait `consult agent`. L'exécution réelle (les deux transactions, les trois appels enregistrés) attend `host.ts`, `dispatch.ts`, `loop.ts` et la cassette du manoir. |
| 5 | Le taux du jeu d'évaluation | **non cochée** | `evals/compile/` est vide ; les 40 tâches et leur harnais attendent `write-script.ts` (lot C7). Taux : TO MEASURE (un passage complet avec clé réelle est estimé ≈ 2,40 $, coût réel TO MEASURE). |
| 6 | Le faux modèle adversaire à 10 000 séquences | **cochée** | `packages/model/test/properties-authorize.test.ts` (« CAR-P-11 … résiste à un faux modèle adversaire ») et le générateur adversaire de `packages/agent/test/properties-gateway.test.ts` (« faux modèle adversaire (outils pour CAR-P-11/12) »), verts à `CARDWAKE_PROP_RUNS=10000` (run du 11/11/2026 : 1 184 ms et 2 988 ms, 0 contre-exemple). |
| 7 | La pile piégée | **non cochée** | Les fondations sont prouvées : CAR-P-16 (le contexte ne contient ni clé, ni autre carte, ni journal — 4 tests verts à 10 000 tirages) et `view.test.ts` (« le contenu de la carte est une donnée »). Manque : le scénario de bout en bout — une pile reçue dont un champ contient des ordres, face à un agent réel — qui attend `loop.ts` (lot C6 fin). |
| 8 | Recherche de `eval(` / `new Function` / `innerHTML` dans le site construit | **cochée** (avec nuance honnête) | Sources : `python3 scripts/guards/run_all.py` (garde `no-eval` du job `ci`) → 0 problème. Sur `apps/web/dist/assets/*.js` : `grep -oE` trouve 13 `dangerouslySetInnerHTML` et 5 `innerHTML` — motifs **internes au paquet React minifié**, aucun dans le code de l'application ; cas documenté dans `pages.yml`, qui garde le site publié sur ce qui le concerne : 0 ressource distante (`grep -Eo 'src="https?://\|href="https?://'` sur `dist/index.html` → vide). |
| 9 | Recherche des marques et des motifs de clé | **cochée** | Gardes `trademarks` et `secrets` de `scripts/guards/run_all.py` (job `ci`) : 0 problème sur l'arbre. Vérification du site construit le 11/11/2026 : recherche insensible à la casse, sur `apps/web/dist/*`, des mots de la liste `THIRD_PARTY_WORDS` du garde (`scripts/hooks/lib.mjs`) → 0 occurrence ; `grep -cE` sur les motifs de clé du garde `secrets` (formes `sk-`, jetons GitHub, clés privées) → 0. Hooks équivalents côté agent : `trademark-guard.mjs`, `secret-guard.mjs`. |
| 10 | Le budget épuisé | **cochée** | `packages/agent/test/budget.test.ts` (12 tests) et CAR-P-15 : « ne dépasse jamais les tours ni les jetons accordés », « gèle les compteurs de session une fois épuisés », « gèle les compteurs d'une action une fois épuisés » — verts à 10 000 tirages (run du 11/11/2026). |
| 11 | L'export/import identique | **cochée** | CAR-P-18 dans `packages/model/test/schema-file.test.ts` : « exporter puis importer redonne la même pile », tout fichier altéré refusé en entier — vert à 10 000 tirages. Complété par CAR-P-22 (ni clé ni compteurs de session dans l'export, `properties-gateway.test.ts`). |
| 12 | L'accessibilité | **non cochée** (partielle) | Attributs `aria-*`/`role` en place dans les écrans (`apps/web/src/App.tsx`, `screens/CardPlay.tsx`, `screens/Reception.tsx`, etc.) et règles dans le steering `two-inks.md`. Manquent : l'audit complet, le passage lecteur d'écran et les tests dédiés. Résultat d'audit : TO MEASURE. |
| 13 | Les mesures de performance | **non cochée** | Aucun test ni script de performance dans le dépôt aujourd'hui. Mesures (ouverture d'une pile, opérations/seconde, chargement du site) : TO MEASURE. |
| 14 | La présence de `.kiro` | **cochée** | `.kiro/specs/` (12 specs), `.kiro/hooks/hooks.json` (9 hooks), `.kiro/agents/` (3 agents), `.kiro/steering/`. Le garde `limits`/présence de `scripts/guards/run_all.py` vérifie `.kiro/` en CI. |
| 15 | La licence | **non cochée** | Aucun fichier `LICENSE` à la racine du dépôt (`ls LICENSE*` → vide). Choix de licence à faire, puis fichier à ajouter. |
| 16 | Le README | **cochée** | `README.md` à la racine, en anglais, avec la promesse du produit (« every card can host an AI agent, and that agent can never do more than the level a human gave it »). |
| 17 | L'adresse en ligne | **cochée** | Site publié sur GitHub Pages : `https://baptistefaisy.github.io/cardwake/`, déployé à chaque push sur `main` par `.github/workflows/pages.yml` (build + artefact + garde « aucune ressource distante »). |
| 18 | La vidéo | **non cochée** | Le script minuté est livré (`docs/video-script.md`, 2:58, plans + voix off, contraintes marques/musique respectées). Le tournage et le montage restent à faire ; les plans « manoir », « journal » et « phrase → script » attendent `dispatch.ts`/`loop.ts`/`write-script.ts` pour être filmés en vrai. |

## Commandes de vérification utilisées

```bash
cd /home/baptiste/Bureau/cardwake
CARDWAKE_PROP_RUNS=10000 npx vitest run packages --reporter=basic   # cases 1, 6, 10, 11
npx vitest run --reporter=basic                                     # 262 tests, 2,81 s
python3 scripts/guards/run_all.py                                   # cases 8, 9, 14
grep -oE 'src="https?://|href="https?://' apps/web/dist/index.html  # case 8 (vide)
```

## Rappel des trous (TO MEASURE)

Taux du jeu d'évaluation (case 5), coût réel d'un passage d'évaluation,
audit d'accessibilité (case 12), mesures de performance (case 13), choix de
licence (case 15). Aucun chiffre de ce document n'est inventé : chaque valeur
vient d'une commande exécutée le 11 novembre 2026 ou d'un fichier du dépôt.
