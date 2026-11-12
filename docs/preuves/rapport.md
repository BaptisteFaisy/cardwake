# Rapport des preuves

Une preuve verte est une affirmation vérifiable, pas une promesse : chaque ligne renvoie à une commande qu'un tiers relance lui-même (voir [README.md](README.md)).

| id | étape | ce que ça prouve | commande | verdict | durée |
|---|---|---|---|---|---|
| P-01 | aller-retour du langage | imprimer puis analyser redonne le même arbre | `npx vitest run packages/lang/test/print.test.ts` | vert | 1.1 s |
| P-02 | robustesse de l'analyse | tout texte rend un arbre ou des erreurs positionnées | `npx vitest run packages/lang/test/print.test.ts` | vert | 935 ms |
| P-03 | relecture en clair | au moins une phrase par instruction, chaque objet cité | `npx vitest run packages/lang/test/paraphrase.test.ts` | vert | 982 ms |
| P-04 | déterminisme | même graine, exactement la même suite d'effets | `npx vitest run packages/lang/test/interpreter.test.ts` | vert | 1.0 s |
| P-05 | morceaux de texte | écrire puis lire rend ce qui a été écrit | `npx vitest run packages/lang/test/values-chunks.test.ts` | vert | 859 ms |
| P-06 | garde-fous | une boucle sans fin s'arrête sous maxSteps | `npx vitest run packages/lang/test/interpreter.test.ts` | vert | 1.4 s |
| P-07 | tout ou rien | une transaction avortée ne laisse aucune trace | `npx vitest run packages/model/test/ops-journal.test.ts` | vert | 1.0 s |
| P-08 | inverse | suite d'opérations puis inverses redonne la pile | `npx vitest run packages/model/test/ops-journal.test.ts` | vert | 1.0 s |
| P-09 | hiérarchie des messages | le chemin parcouru est visible | `npx vitest run packages/model/test/dispatch.test.ts` | vert | 998 ms |
| P-10 | identifiants | uniques, jamais réalloués | `npx vitest run packages/model/test/ops-journal.test.ts` | vert | 992 ms |
| P-11 | aucun dépassement | le faux modèle adversaire ne passe pas | `npx vitest run packages/agent/test/loop-adversary.test.ts` | vert | 2.8 s |
| P-12 | aucune élévation | ni niveau, ni consigne, ni budget ne bougent | `npx vitest run packages/agent/test/loop-adversary.test.ts` | vert | 1.9 s |
| P-13 | pile reçue | niveau plafonné à 2 sans confiance | `npx vitest run packages/model/test/properties-authorize.test.ts` | vert | 1.3 s |
| P-14 | fin des bavardages | le compteur de sauts borne les tours | `npx vitest run packages/model/test/dispatch.test.ts` | vert | 1.2 s |
| P-15 | budgets | épuisés, plus aucun appel à la passerelle | `npx vitest run packages/agent/test/loop.test.ts` | vert | 1.4 s |
| P-16 | contexte borné | ni clé, ni autre carte, ni journal | `npx vitest run packages/agent/test/properties-agent.test.ts` | vert | 1.3 s |
| P-17 | scripts sous accord | aucun script d'agent sans jeton humain | `npx vitest run packages/model/test/properties-authorize.test.ts` | vert | 1.2 s |
| P-18 | fichier | exporter puis importer redonne la même pile | `npx vitest run packages/model/test/schema-file.test.ts` | vert | 838 ms |
| P-19 | empreinte | indépendante de l'ordre des clés | `npx vitest run packages/agent/test/properties-gateway.test.ts` | vert | 1.0 s |
| P-20 | rejeu | le mode enregistré donne le même état final | `npx vitest run packages/agent/test/cassette-record.test.ts` | vert | 16 ms |
| P-21 | nombres | 0.1 + 0.2 s'affiche 0.3 | `npx vitest run packages/lang/test/values-chunks.test.ts` | vert | 918 ms |
| P-22 | rien de secret | ni clé ni compteur dans un export | `npx vitest run packages/agent/test/properties-gateway.test.ts` | vert | 1.0 s |
| P-23 | encre | un texte d'agent reste marqué, une écriture humaine l'efface | `npx vitest run packages/model/test/ops-journal.test.ts` | vert | 932 ms |
| P-24 | le devis | 150 / 15 / 165 dans le navigateur | `npx vitest run apps/web/test/dispatch-adapter.test.ts` | vert | 3 ms |
| P-25 | le manoir | le garde alerte, la cuisinière sait déjà | `npx vitest run apps/web/test/agent-bridge.test.ts` | vert | 1 ms |
| P-26 | l'espion | le chemin et les refus sont visibles | `npx vitest run apps/web/test/spy.test.ts` | vert | 0 ms |
| P-27 | phrase vers script | brouillon contrôlé, relu, essai à blanc | `npx vitest run packages/agent/test/write-script.test.ts` | vert | 1.1 s |
| P-28 | les 40 tâches | six familles, attentes atteignables | `npx vitest run evals` | vert | 1.2 s |
| P-29 | sans clé | la démo se joue sans réseau ni clé | `npx vitest run apps/web/test/agent-bridge.test.ts` | vert | 1.3 s |

29 preuve(s) verte(s) sur 29.
