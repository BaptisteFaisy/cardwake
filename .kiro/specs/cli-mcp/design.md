# Ligne de commande et serveur d'outils (option) — Conception

**Parcours.** Quick Spec (option)

**But.** Vérifier une pile sans navigateur : valider un script, exécuter une pile en mode sans interface, la relire en clair, lancer le jeu d'évaluation. Le même code, une autre porte.

## Contrats

- Chaque commande : une entrée texte ou un fichier, une sortie texte structurée, un code de sortie.
- Les outils exposés sont en lecture seule par construction : ils rendent des erreurs, jamais des opérations.

## Décisions

- Le paquet `cli` dépend des trois paquets purs et n'ajoute aucune logique : il assemble.
- Les commandes qui coûtent de l'argent ne partent jamais d'un défaut.
- Le serveur d'outils sert à vérifier une pile sans navigateur : c'est un outil de construction.

## Flux

- commande → lecture → appel du paquet concerné → compte rendu → code de sortie

## Erreurs et messages

- « 3 errors in field “Total” button script. » + code 1
- Argument manquant : usage court, code 2

## Vérification

- Propriété 21
- Chaque commande testée sur une pile d'exemple
- Aucun appel modèle dans la suite de tests

## Alternatives écartées

- Outils exposés capables d'écrire : une porte d'écriture sans `authorize` serait une faille.
- Évaluation payante lancée par défaut : une commande qui coûte de l'argent reste un geste explicite.

## Points de risque

- Un second point d'écriture, introduit « pour aller vite », est refusé en relecture.
- Une erreur qui ferait sortir une trace technique est un défaut, pas un détail.
- Un contrat modifié sans modifier `ast.ts`, `types.ts` ou `limits.ts` d'abord est refusé.
