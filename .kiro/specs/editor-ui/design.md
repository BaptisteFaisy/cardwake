# Le site : étagère, carte, éditeur, journal — Conception

**Parcours.** Conception d'abord

**But.** Deux modes seulement, Jouer et Fabriquer. Des éléments de page ordinaires, accessibles au clavier, et une mise en page qui laisse la carte au centre.

## Contrats

- Les composants ne parlent jamais à un modèle : ils appellent le paquet `agent`.
- Toute écriture passe par les opérations de `model` : aucun état local qui double la pile.
- Les erreurs affichées viennent de `ScriptError` : objet, ligne, message simple, piste.

## Décisions

- Éléments de page ordinaires, pas de canevas : la sélection, le focus et la saisie restent ceux du navigateur.
- Deux encres : encre d'auteur et encre d'agent, réglées par des variables de style, jamais par une couleur écrite en dur.
- L'étagère est une liste, pas une grille d'images : elle se lit au clavier.
- Le journal est un panneau, pas une fenêtre : il ne cache jamais la carte qu'il explique.

## Flux

- clic sur un bouton → message → distribution → opérations → journal → rendu
- phrase → relecture → essai → Accepter → script installé

## Erreurs et messages

- Erreur de script affichée dans le panneau, avec la ligne surlignée
- Refus d'un agent affiché comme une phrase, pas comme une alerte technique

## Vérification

- Parcours de trois clics : étagère → The Manor → Show the amulet → journal
- Navigation clavier complète
- Aucun contenu essentiel porté par la seule couleur

## Alternatives écartées

- Canevas de dessin : la sélection, le focus et la saisie devraient être réécrits, au prix de l'accessibilité.
- Troisième mode intermédiaire : deux modes lisibles valent mieux que trois ambigus.

## Points de risque

- Un second point d'écriture, introduit « pour aller vite », est refusé en relecture.
- Une erreur qui ferait sortir une trace technique est un défaut, pas un détail.
- Un contrat modifié sans modifier `ast.ts`, `types.ts` ou `limits.ts` d'abord est refusé.
