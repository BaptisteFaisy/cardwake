# De la phrase au script, et la relecture en clair — Conception

**Parcours.** Exigences d'abord

**But.** Transformer une phrase de l'auteur en script Murmur vérifié, puis en phrases relues par un module sans modèle, puis en essai à blanc des effets, avant toute installation.

## Contrats

- Réponse du modèle : `{ script, summary, assumptions, questions }`, en schéma strict, sans clé supplémentaire.
- `check(script, stack): CheckError[]` ne prend aucun modèle et ne rend que des erreurs lisibles.
- `paraphrase(stmt): string` est total : toute instruction a un gabarit, jamais de trou.
- L'essai à blanc rend une liste de différences `{ object, before, after }`.

## Décisions

- Un seul appel, puis au plus un appel de réparation : le coût est borné et la latence aussi.
- La relecture est produite par un module, pas par le modèle : une erreur du modèle a une chance d'être vue.
- Le brouillon n'écrase jamais le script en service : la comparaison se fait entre deux textes.
- Les hypothèses sont traitées comme des questions muettes : affichées, pas devinées.

## Flux

- phrase + objet + résumé → appel → brouillon → analyse → contrôles → relecture → essai à blanc → Accepter / Modifier / Abandonner.
- échec d'analyse ou de contrôle → une réparation → si nouvel échec, brouillon et erreurs montrés à l'auteur.

## Erreurs et messages

- « The field “Total” is not on this card. »
- « A line holds one command only, at line 4. »
- Réparation épuisée : « Two attempts; here is what remains wrong. »

## Vérification

- Propriété 03
- Quarante tâches de `evals/compile/` jugées sur le comportement, jamais sur le texte du script
- Aucun appel réel dans les tests : faux modèle ou cassette

## Alternatives écartées

- Plusieurs appels au modèle enchaînés : coût et latence non bornés.
- Relecture produite par le modèle : le modèle ne se relit pas lui-même.

## Points de risque

- Un second point d'écriture, introduit « pour aller vite », est refusé en relecture.
- Une erreur qui ferait sortir une trace technique est un défaut, pas un détail.
- Un contrat modifié sans modifier `ast.ts`, `types.ts` ou `limits.ts` d'abord est refusé.
