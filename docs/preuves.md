# Preuves — Cardwake

Une **preuve**, ici, est une affirmation rendue vérifiable par une commande qu'un tiers peut relancer : le code qui l'exécute vit dans le dépôt, pas dans un document.
La règle du projet tient en une ligne : **une preuve verte est une affirmation vérifiable, pas une promesse** — verte tant que sa commande sort en code 0, rouge dès qu'elle ne le fait plus, et rien ne la déclare verte à sa place.
Les 29 preuves P-01 à P-29 couvrent les vingt-trois propriétés d'acceptation du cahier des charges (CAR-P-01 à CAR-P-23) et six scénarios de bout en bout.
**Tout tourne sans clé d'API et sans réseau** : les réponses du modèle viennent de cassettes enregistrées et d'un faux modèle local — vérifié en relançant la suite entière avec le réseau bloqué (426 tests, 0 échec).
Pour tout relancer : `npm run preuves` — le registre exécute les 29 commandes et écrit le compte rendu dans `docs/preuves/rapport.md` (lisible) et `docs/preuves/rapport.json` (outillage).
La colonne « verdict » du tableau ci-dessous reprend celle du rapport ; les libellés et les commandes sont repris mot pour mot de la source de vérité.

## Le tableau des 29 preuves

| id | étape | ce que ça prouve | commande | verdict |
|---|---|---|---|---|
| P-01 | aller-retour du langage | imprimer puis analyser redonne le même arbre | `npx vitest run packages/lang/test/print.test.ts` | vert |
| P-02 | robustesse de l'analyse | tout texte rend un arbre ou des erreurs positionnées | `npx vitest run packages/lang/test/print.test.ts` | vert |
| P-03 | relecture en clair | au moins une phrase par instruction, chaque objet cité | `npx vitest run packages/lang/test/paraphrase.test.ts` | vert |
| P-04 | déterminisme | même graine, exactement la même suite d'effets | `npx vitest run packages/lang/test/interpreter.test.ts` | vert |
| P-05 | morceaux de texte | écrire puis lire rend ce qui a été écrit | `npx vitest run packages/lang/test/values-chunks.test.ts` | vert |
| P-06 | garde-fous | une boucle sans fin s'arrête sous maxSteps | `npx vitest run packages/lang/test/interpreter.test.ts` | vert |
| P-07 | tout ou rien | une transaction avortée ne laisse aucune trace | `npx vitest run packages/model/test/ops-journal.test.ts` | vert |
| P-08 | inverse | suite d'opérations puis inverses redonne la pile | `npx vitest run packages/model/test/ops-journal.test.ts` | vert |
| P-09 | hiérarchie des messages | le chemin parcouru est visible | `npx vitest run packages/model/test/dispatch.test.ts` | vert |
| P-10 | identifiants | uniques, jamais réalloués | `npx vitest run packages/model/test/ops-journal.test.ts` | vert |
| P-11 | aucun dépassement | le faux modèle adversaire ne passe pas | `npx vitest run packages/agent/test/loop-adversary.test.ts` | vert |
| P-12 | aucune élévation | ni niveau, ni consigne, ni budget ne bougent | `npx vitest run packages/agent/test/loop-adversary.test.ts` | vert |
| P-13 | pile reçue | niveau plafonné à 2 sans confiance | `npx vitest run packages/model/test/properties-authorize.test.ts` | vert |
| P-14 | fin des bavardages | le compteur de sauts borne les tours | `npx vitest run packages/model/test/dispatch.test.ts` | vert |
| P-15 | budgets | épuisés, plus aucun appel à la passerelle | `npx vitest run packages/agent/test/loop.test.ts` | vert |
| P-16 | contexte borné | ni clé, ni autre carte, ni journal | `npx vitest run packages/agent/test/properties-agent.test.ts` | vert |
| P-17 | scripts sous accord | aucun script d'agent sans jeton humain | `npx vitest run packages/model/test/properties-authorize.test.ts` | vert |
| P-18 | fichier | exporter puis importer redonne la même pile | `npx vitest run packages/model/test/schema-file.test.ts` | vert |
| P-19 | empreinte | indépendante de l'ordre des clés | `npx vitest run packages/agent/test/properties-gateway.test.ts` | vert |
| P-20 | rejeu | le mode enregistré donne le même état final | `npx vitest run packages/agent/test/cassette-record.test.ts` | vert |
| P-21 | nombres | 0.1 + 0.2 s'affiche 0.3 | `npx vitest run packages/lang/test/values-chunks.test.ts` | vert |
| P-22 | rien de secret | ni clé ni compteur dans un export | `npx vitest run packages/agent/test/properties-gateway.test.ts` | vert |
| P-23 | encre | un texte d'agent reste marqué, une écriture humaine l'efface | `npx vitest run packages/model/test/ops-journal.test.ts` | vert |
| P-24 | le devis | 150 / 15 / 165 dans le navigateur | `npx vitest run apps/web/test/dispatch-adapter.test.ts` | vert |
| P-25 | le manoir | le garde alerte, la cuisinière sait déjà | `npx vitest run apps/web/test/agent-bridge.test.ts` | vert |
| P-26 | l'espion | le chemin et les refus sont visibles | `npx vitest run apps/web/test/spy.test.ts` | vert |
| P-27 | phrase vers script | brouillon contrôlé, relu, essai à blanc | `npx vitest run packages/agent/test/write-script.test.ts` | vert |
| P-28 | les 40 tâches | six familles, attentes atteignables | `npx vitest run evals` | vert |
| P-29 | sans clé | la démo se joue sans réseau ni clé | `npx vitest run apps/web/test/agent-bridge.test.ts` | vert |

Les 29 commandes ont été exécutées sur ce dépôt : chacune sort en code 0 (verdict vert) ; le rapport garde le détail par preuve.

## Ce que chaque preuve démontre, en une phrase

- **CAR-P-11 (aucun agent ne dépasse son niveau) — P-11** : face à un faux modèle adversaire qui répond avec des outils interdits ou sur la carte d'un autre agent, aucune opération validée n'échappe au niveau de l'agent — tout ce qui passe est permis à ce niveau et porte sur sa propre carte.
- **CAR-P-12 (aucune élévation) — P-12** : aucun enchaînement d'appels d'outils ni de commandes de script ne change un niveau, une consigne, un état d'éveil ou un budget — les droits d'un agent sont figés.
- **CAR-P-14 (les bavardages s'arrêtent) — P-14** : des agents qui s'écrivent sans cesse s'arrêtent quand même, le compteur de sauts borne les tours, et aucun message n'est remis à un agent avec un compteur de sauts négatif.
- **CAR-P-20 (le rejeu est identique) — P-20** : en mode enregistré, la même suite d'actions sur la même pile donne les mêmes transactions — la démo est reproductible et vérifiable sans clé.
- **CAR-P-08 (l'inverse restaure la pile) — P-08** : appliquer une suite d'opérations puis ses inverses en ordre contraire redonne la pile de départ — l'annulation est un aller-retour exact, pas une approximation.
- **CAR-P-18 (l'export et l'import redonnent la même pile) — P-18** : exporter puis importer redonne la même pile, et un fichier altéré est refusé en entier plutôt qu'à moitié chargé.

## Du cahier des charges à la preuve

Chacune des vingt-trois propriétés d'acceptation du cahier des charges a sa preuve, de un pour un :

| Propriété du cahier | Preuve |
|---|---|
| CAR-P-01 — Aller-retour du langage | P-01 |
| CAR-P-02 — Robustesse de l'analyse | P-02 |
| CAR-P-03 — Relecture totale | P-03 |
| CAR-P-04 — Déterminisme | P-04 |
| CAR-P-05 — Morceaux de texte | P-05 |
| CAR-P-06 — Arrêt | P-06 |
| CAR-P-07 — Tout ou rien | P-07 |
| CAR-P-08 — Inverse | P-08 |
| CAR-P-09 — Hiérarchie | P-09 |
| CAR-P-10 — Identifiants | P-10 |
| CAR-P-11 — Pas de dépassement | P-11 |
| CAR-P-12 — Pas d'élévation | P-12 |
| CAR-P-13 — Pile reçue | P-13 |
| CAR-P-14 — Fin des bavardages | P-14 |
| CAR-P-15 — Budgets | P-15 |
| CAR-P-16 — Contexte borné | P-16 |
| CAR-P-17 — Scripts sous accord | P-17 |
| CAR-P-18 — Fichier | P-18 |
| CAR-P-19 — Empreinte | P-19 |
| CAR-P-20 — Rejeu | P-20 |
| CAR-P-21 — Nombres | P-21 |
| CAR-P-22 — Rien de secret dans l'export | P-22 |
| CAR-P-23 — Encre | P-23 |

P-24 à P-29 sont des preuves de bout en bout, sans identifiant de propriété : elles couvrent les scénarios d'acceptation du cahier — le devis (P-24), le manoir (P-25), l'espion (P-26), la phrase vers script (P-27), le jeu des 40 tâches (P-28) et la démo sans clé (P-29).

## Ce qui n'est pas encore prouvé

| Point | Ce qu'il faudrait |
|---|---|
| **La vidéo** | Le script minuté est livré (`docs/video-script.md`, 2:58) mais le tournage et le montage restent à faire : filmer les écrans sur le code mergé et monter la voix off, sans marque de tiers ni musique protégée. |
| **Le nom de marque vérifié** | À vérifier : la disponibilité du nom du produit et du nom du langage n'a jamais été contrôlée — registre npm, nom de domaine, organisation GitHub, bases de marques (cahier des charges, annexe D). |
| **L'hébergement au-delà du 29 janvier 2027** | L'engagement va jusqu'au 29 janvier 2027 (CAR-N-14) ; au-delà, il faudrait une décision d'hébergement (reconduction ou migration) et un contrôle de disponibilité. |
| **Le délai médian d'un tour d'agent** | À mesurer : chronométrer les tours de la boucle d'agent sur les scénarios des cassettes, sur un nombre donné de tours, puis calculer la médiane. |
| **Le taux du jeu d'évaluation (40 tâches)** | À mesurer avec une vraie clé : le jeu reste hors CI, un passage complet est estimé (estimation du cahier) à ≈ 2,40 $, coût réel à mesurer. |
| **L'audit d'accessibilité** | À mesurer : les attributs `aria-*` et `role` sont en place dans les écrans, mais il manque l'audit complet et le passage lecteur d'écran. |
| **Les mesures de performance** | À mesurer : ouverture d'une pile, opérations par seconde, chargement du site — aucun script de mesure n'existe encore. |

Aucun de ces points n'est déclaré prouvé ailleurs dans ce document ; « à mesurer » veut dire exactement cela.

## Un exemple de preuve, exécutée : le devis (P-24)

La pile de démonstration `Quotes` porte un devis : les lignes saisies donnent 1 × 85 + 2 × 32,5 = 150, la TVA est de 10 %, et le bouton « Total » de la carte « Dupont » porte le script qui calcule et écrit le résultat. La preuve clique sur ce bouton et lit la pile :

```sh
npx vitest run apps/web/test/dispatch-adapter.test.ts
```

Sortie attendue (verdict vert) :

```text
✓ apps/web/test/dispatch-adapter.test.ts (7 tests)
  « Total » écrit 150 / 15 / 165 dans Subtotal, VAT et Total
Test Files  1 passed (1)
     Tests  7 passed (7)
```

Le test exige **150 / 15 / 165** dans les champs Subtotal, VAT et Total. Ce que ça démontre : le clic n'affiche pas une promesse, il exécute réellement le script du bouton à travers le même moteur que le site ; le résultat est écrit dans la pile, journalisé comme une transaction unique sous l'acteur « script », et l'annulation de ce clic restaure la pile à l'octet près.
