# Recette — verdict point par point

Rejouée le **2026-11-13** sur le commit `6c5eb50d8b7d` (branche `feat/recette`).

Chaque point est **exécuté**, pas relu : le tableau recopie ce que la commande a constaté. 10 point(s) vert(s), 3 rouge(s), 1 hors périmètre — sur 14 point(s).

## Tableau des points

| # | Point | Verdict | Résumé |
|---|---|---|---|
| 1 | Les 23 propriétés passent, graines consignées | **KO** | 1 propriété(s) sans identifiant dans les tests (CAR-P-09) |
| 2 | `cassette verify` : aucun enregistrement périmé | **KO** | 13 enregistrement(s) périmé(s), 0 manquant(s) |
| 3 | Les trois piles en mode enregistré, sans requête réseau | **OK** | les trois piles se jouent en mode enregistré, sans requête réseau |
| 4 | L'exemple 7.13 : transactions, appels, Mood, annulations | **KO** | Mood « alarmed » puis « nervous » ; l'état de départ est restauré ; écart(s) : appels : 4 au lieu de 3 ; transactions : 3 au lieu de 2 ; annulations : 3 au lieu de 2 |
| 5 | Faux modèle adversaire : 10 000 séquences, zéro dépassement | **OK** | faux modèle adversaire : 10 000 tirages, aucun dépassement de droits |
| 6 | Pile piégée : pas d'écriture hors carte, boucle bornée | **OK** | l'agent n'écrit pas hors de sa carte, la boucle est bornée, aucune requête distante |
| 7 | Recherche d'`eval`, de `new Function` et d'`innerHTML` dans le site construit | **OK** | aucun appel à `eval` ni à `new Function` dans le site construit ; les `innerHTML` relevés viennent du runtime React minifié, 0 dans le code du projet |
| 8 | Marques de tiers dans le site construit et les piles | **OK** | aucune marque de tiers dans le site construit ni dans les piles |
| 9 | Motif de clé dans le dépôt, les exports et le journal | **OK** | aucun motif de clé dans le dépôt, l'export ni le journal |
| 10 | Budget épuisé : la passerelle ne reçoit plus d'appel | **OK** | budget épuisé : plus aucun appel à la passerelle |
| 11 | Export puis import : mêmes fichiers canoniques | **OK** | export puis import : même pile, mise en forme canonique identique |
| 12 | Accessibilité des sept écrans et parcours P2 au clavier | **OK** | 17 test(s) d'accessibilité verts (sept écrans + parcours P2 au clavier) |
| 13 | `/.kiro`, licence, README, adresse en ligne | **OK** | `.kiro`, README et l'adresse en ligne sont conformes ; LICENSE absent (à créer — hors de ce lot) |
| 14 | Vidéo de moins de trois minutes | hors périmètre | vidéo exclue par le demandeur : aucun tournage ni montage dans ce lot |

## Détail par point

### 1. Les 23 propriétés passent, graines consignées

**Verdict : KO** — 1 propriété(s) sans identifiant dans les tests (CAR-P-09)

Commande : `CARDWAKE_PROP_RUNS=2000 npx vitest run packages --reporter=basic`

```text
tests de propriétés : verts
identifiants couverts : CAR-P-01, CAR-P-02, CAR-P-03, CAR-P-04, CAR-P-05, CAR-P-06, CAR-P-07, CAR-P-08, CAR-P-10, CAR-P-11, CAR-P-12, CAR-P-13, CAR-P-14, CAR-P-15, CAR-P-16, CAR-P-17, CAR-P-18, CAR-P-19, CAR-P-20, CAR-P-21, CAR-P-22, CAR-P-23
identifiants absents des tests : CAR-P-09
  CAR-P-09 : aucune occurrence dans un fichier *.test.ts
  CAR-P-09 est pourtant approchée par packages/model/test/dispatch.test.ts (« hiérarchie des messages ») : le parcours cible→carte→fond→pile y est joué, mais ni `pass` ni une propriété fast-check sur le placement des handlers n'y figurent.
```


### 2. `cassette verify` : aucun enregistrement périmé

**Verdict : KO** — 13 enregistrement(s) périmé(s), 0 manquant(s)

Commande : `npx vite-node packages/cli/src/main.ts cassette verify`

```text
stacks/dashboard/stack.json: stale 844082402c7ccaad827e0751b4138c011ac0d864050c20ed417908ebb8bfba9e
stacks/manor/stack.json: stale 0ea0f3ee95066b3fff1a327a166c272649a431a6b6ef7da8b51fe5c0bcc65f11
stacks/manor/stack.json: stale 21e0b92ac4813d713fd86dc57218d10fa74393d82412db52d33662710eac5e80
stacks/manor/stack.json: stale 2d1557b23b3d48e6e57a97668177fcd0612ba66a3ee2760f47a3688bb523098e
stacks/manor/stack.json: stale 71c53d5849b860cc9743bca102687b203ad431aeefeb990b593fa0a81524c187
stacks/manor/stack.json: stale a1e3a50c7de9d84928f8a2caa205824ce64a65abfe5423b88f2e23a17a1a25c6
stacks/manor/stack.json: stale abd94fe3149dd1463bffba3d64975c0fd7c971358584e93cd95a26f374af58e4
stacks/manor/stack.json: stale ccfa35d14ede2497c84af5c18209b6f0f0ca2d41e01dc82bcc6890ef6a1da05e
stacks/manor/stack.json: stale da31d337e4d514010d2ea28630e529d3376332258b24b80397ca0d7438f098a9
stacks/manor/stack.json: stale e47a3f59712574efd8cf4a5c235b32ef89f4703ba6938c6eb1eefe9b02c72efd
stacks/manor/stack.json: stale ee4b8dc7e6dfbfe0b6278a1322be9c2c4b9ed5568534e79bf45cf502aaee4d44
stacks/quotes/stack.json: stale 3573185cec9330c96f109b2327b8112203fe9b582004e8eec5ced58364e44c7c
stacks/quotes/stack.json: stale 72dbec760839c51b34660ec2e23ef1b5bcf9612107b0f491ad7691f72faa0737
diagnostic : `stackSituations` n'est pas exporté par @cardwake/agent : la liste des situations attendues est vide, donc tout enregistrement est vu comme périmé
```


### 3. Les trois piles en mode enregistré, sans requête réseau

**Verdict : OK** — les trois piles se jouent en mode enregistré, sans requête réseau

Commande : `cardwake run + rejeu de cassette`

```text
cardwake run manor --click "Guard/Show the amulet" → code 0
    click on button "Show the amulet" of card "Guard" (seed 1) — 1 operation(s)
      write into part 5 of card 10: "" becomes "The card did not answer."
cardwake run quotes --click "Dupont/Total" → code 0
    click on button "Total" of card "Dupont" (seed 1) — 3 operation(s)
      write into part 6 of card 10: "" becomes "150"
      write into part 7 of card 10: "" becomes "15"
      write into part 8 of card 10: "" becomes "165"
cardwake run dashboard --click "Week/Summarise my week" → code 0
    click on button "Summarise my week" of card "Week" (seed 1) — 2 operation(s)
      write into part 14 of card 10: "" becomes "The card did not answer."
      write into part 15 of card 10: "" becomes "1/1/70"
rejeu enregistré manor → 4 réponse(s) : Let the master see it, then. The key stays where it sleeps. | The silver key opens the pantry, and the pantry keeps its own secrets. | Nobody is expected on a night like this. Give a name the house remembers. | Bread for
rejeu enregistré quotes → 2 réponse(s) : Dear Mr Dupont, thank you for your request. I will confirm the tap replacement and pipe joint prices tomorrow morning. | Dear Mr Martin, thank you for your enquiry. I will confirm the boiler service price tomorrow mornin
rejeu enregistré dashboard → 1 réponse(s) : On Monday you made two calls and finished one repair. Wednesday brought a late delivery from the supplier. Friday went to paperwork.
imports réseau (node:http/https/net/tls/dgram) dans packages/lang, packages/model et packages/agent : aucun
accès réseau direct hors mode enregistré (2), jamais instanciés au rejeu :
    packages/agent/src/gateway/http.ts:366 — const doFetch: FetchLike = options.fetchImpl ?? globalThis.fetch;
    packages/agent/src/gateway/relay-local.ts:80 — const doFetch: FetchLike = fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
tentatives de requête réseau pendant la recette : 0
```


### 4. L'exemple 7.13 : transactions, appels, Mood, annulations

**Verdict : KO** — Mood « alarmed » puis « nervous » ; l'état de départ est restauré ; écart(s) : appels : 4 au lieu de 3 ; transactions : 3 au lieu de 2 ; annulations : 3 au lieu de 2

Commande : `scripts/recette/exemples/manoir-713.ts`

```text
appels au modèle : 4 (le cahier en attend 3)
transactions au journal : 3 (le cahier en attend 2)
humeur du garde : "alarmed" (attendu "alarmed")
humeur de la cuisinière : "nervous" (attendu "nervous")
annulations pour revenir à l'état de départ : 3 (le cahier en attend 2)
état de départ restauré : oui
  #1 agent — agent turn on card "Guard" — 2 opération(s)
  #2 script — mouseUp on button "Show the amulet" — 1 opération(s)
  #3 agent — agent turn on card "Cook" — 2 opération(s)
écart 1 : la boucle d'agent rappelle le modèle une fois de plus après une réponse à outils (Mood « nervous » puis un dernier appel pour la phrase finale).
écart 2 : chaque tour d'agent est sa propre transaction du journal ; le `put it into field "Says"` du script en ouvre une troisième.
écart 3 : conséquence des deux précédents, il faut trois annulations pour revenir à l'état de départ.
```


### 5. Faux modèle adversaire : 10 000 séquences, zéro dépassement

**Verdict : OK** — faux modèle adversaire : 10 000 tirages, aucun dépassement de droits

Commande : `CARDWAKE_PROP_RUNS=10000 npx vitest run packages/agent/test/loop-adversary.test.ts`

```text
tirages : CARDWAKE_PROP_RUNS=10000 par propriété, 1 propriété(s) fast-check
code de sortie 0 — 3 test(s) vert(s), 0 échec(s)
  ✓ aucune suite de coups ne sort du niveau ni ne change les droits
  ✓ un appel hors niveau reçoit une raison en anglais et n'est pas exécuté
  ✓ adversaire intégré au faux modèle : arguments farfelus, garde solide quand même
```


### 6. Pile piégée : pas d'écriture hors carte, boucle bornée

**Verdict : OK** — l'agent n'écrit pas hors de sa carte, la boucle est bornée, aucune requête distante

Commande : `npx vitest run packages/agent/test/loop.test.ts`

```text
code de sortie 0 — 16 test(s) vert(s), 0 échec(s)
  ✓ envoie un message à une autre carte via host.tell
  ✓ le plafond d'itérations est respecté
  ✓ un champ verrouillé refuse l'écriture
  ✓ un champ d'une autre carte n'est pas atteint, même au niveau 5
  ✓ la requête ne porte que les quatre blocs
aucune requête distante : la requête d'agent ne porte que les quatre blocs (test « la requête ne porte que les quatre blocs »)
```


### 7. Recherche d'`eval`, de `new Function` et d'`innerHTML` dans le site construit

**Verdict : OK** — aucun appel à `eval` ni à `new Function` dans le site construit ; les `innerHTML` relevés viennent du runtime React minifié, 0 dans le code du projet

Commande : `npm run build --workspace @cardwake/web`

```text
commande : npm run build --workspace @cardwake/web (code 0)
fichiers du site construit : 3 (css, html, js)
-- site construit (apps/web/dist) --
eval() — aucun texte n'est exécuté comme code : 0
new Function() — aucun texte n'est exécuté : 0
innerHTML — aucun rendu HTML depuis le contenu d'une pile : 4
dangerouslySetInnerHTML — injection HTML : 18
document.write — injection HTML : 0
innerHTML (motif large, toute occurrence) : 10
-- sources du projet (apps/, packages/, hors dist) --
eval() — aucun texte n'est exécuté comme code : 0
new Function() — aucun texte n'est exécuté : 0
innerHTML — aucun rendu HTML depuis le contenu d'une pile : 0
dangerouslySetInnerHTML — injection HTML : 0
document.write — injection HTML : 0
```


### 8. Marques de tiers dans le site construit et les piles

**Verdict : OK** — aucune marque de tiers dans le site construit ni dans les piles

Commande : `python3 scripts/guards/run_all.py`

```text
garde : verte — gardes : 348 fichier(s) contrôlé(s), 0 problème
HyperCard : 0
HyperTalk : 0
\bApple\b : 0
Macintosh : 0
piles copiées dans le site construit : non
```


### 9. Motif de clé dans le dépôt, les exports et le journal

**Verdict : OK** — aucun motif de clé dans le dépôt, l'export ni le journal

Commande : `python3 scripts/guards/run_all.py`

```text
garde « secrets » : verte — gardes : 348 fichier(s) contrôlé(s), 0 problème
```


### 10. Budget épuisé : la passerelle ne reçoit plus d'appel

**Verdict : OK** — budget épuisé : plus aucun appel à la passerelle

Commande : `npx vitest run packages/agent/test/budget.test.ts packages/agent/test/loop.test.ts`

```text
code de sortie 0 — 28 test(s) vert(s), 0 échec(s)
  ✓ part avec tout son budget
  ✓ compte les tours et refuse au-delà du réglage
  ✓ refuse dès que les jetons d'entrée sont épuisés
  ✓ plafonne les jetons au réglage, jamais au-delà
  ✓ ne bouge plus une fois épuisé
  ✓ ignore un nombre de jetons absurde
  ✓ s'endort avec un réglage à zéro
  ✓ accorde les sauts et les tours de l'action
  ✓ remet le message aux scripts quand les sauts sont épuisés
  ✓ borne la largeur d'un tour : huit tours d'agent au plus par action
  ✓ ne consomme plus rien une fois épuisé
  ✓ refuse un tour quand les sauts sont déjà épuisés
  ✓ le plafond d'itérations est respecté
  ✓ budget de session épuisé : plus AUCUN appel à la passerelle
  ✓ budget de session en cours de tour : la passerelle n'est plus rappelée
```


### 11. Export puis import : mêmes fichiers canoniques

**Verdict : OK** — export puis import : même pile, mise en forme canonique identique

Commande : `npx vitest run packages/model/test/schema-file.test.ts`

```text
code de sortie 0 — 15 test(s) vert(s), 0 échec(s)
  ✓ sérialise de façon canonique, quel que soit l'ordre des clés
  ✓ exporter puis importer redonne la même pile (CAR-P-18)
```


### 12. Accessibilité des sept écrans et parcours P2 au clavier

**Verdict : OK** — 17 test(s) d'accessibilité verts (sept écrans + parcours P2 au clavier)

Commande : `npx vitest run apps/web/test/a11y.test.ts --reporter=verbose`

```text
code de sortie 0 — 17 test(s) vert(s), 0 échec(s)
  ✓ Étagère : aucun écart
  ✓ Carte, mode Jouer : aucun écart
  ✓ Carte, mode Fabriquer : aucun écart
  ✓ Journal : aucun écart
  ✓ Réception : aucun écart
  ✓ Réglages : aucun écart
  ✓ Espion : aucun écart
  ✓ Preuves : aucun écart
  ✓ Étagère : ordre de tabulation et libellés
  ✓ Carte, mode Jouer : ordre de tabulation et libellés
  ✓ Carte, mode Fabriquer : ordre de tabulation et libellés
  ✓ Journal : ordre de tabulation et libellés
  ✓ Réception : ordre de tabulation et libellés
  ✓ Réglages : ordre de tabulation et libellés
  ✓ Espion : ordre de tabulation et libellés
  ✓ Preuves : ordre de tabulation et libellés
  ✓ parcours P2 : créer un champ puis un bouton depuis la palette
```


### 13. `/.kiro`, licence, README, adresse en ligne

**Verdict : OK** — `.kiro`, README et l'adresse en ligne sont conformes ; LICENSE absent (à créer — hors de ce lot)

Commande : `curl -s -o /dev/null -w "%{http_code}" https://tradoooo.github.io/cardwake/`

```text
.kiro/ présent : oui
.kiro/ ignoré par git : non
.kiro/ suivi par git : oui (47 fichier(s))
LICENSE à la racine : ABSENT — à créer (hors de ce lot)
README.md : présent
GET https://tradoooo.github.io/cardwake/ → HTTP 200
```


### 14. Vidéo de moins de trois minutes

**Verdict : HORS PERIMETRE** — vidéo exclue par le demandeur : aucun tournage ni montage dans ce lot

```text
la recette coche « hors périmètre » et ne fait rien d'autre
```


## Comment la relancer

```bash
npx vite-node scripts/recette/recette.ts
```

Le script est idempotent et sans réseau (sauf le `HEAD` du point 13). Il rend un
code de sortie non nul dès qu'un point obligatoire est rouge.

## Ce que le rapport ne prouve pas

- Le taux du jeu d'évaluation (cahier 7.7) : hors de ce lot, à mesurer avec une clé réelle.
- Les mesures de performance de CAR-N-04 et CAR-N-05 : hors de ce lot.
- La vidéo de moins de trois minutes : hors périmètre par décision du demandeur.
