# Hiérarchie des messages et distribution — Conception

**Parcours.** Exigences d'abord — petit, borné, plein de cas limites (candidat à la comparaison spec contre code improvisé)

**But.** Faire monter un message d'un cran à la fois, élément → carte → fond → pile, avec des sauts comptés, une file ordonnée et aucune boucle infinie possible.

## Contrats

- `Message = { name, params, target, sender, hops }` — les sauts sont dans le message, pas dans un compteur global.
- `dispatch(target, message)` rend `handledBy` ou `null` : l'appelant sait toujours qui a répondu.
- Le compteur d'étapes est celui du traitement entier, tout ce qu'il déclenche compris.

## Décisions

- Les quatre niveaux sont une liste ordonnée, pas une récursion : la remontée est une boucle, donc pas de pile qui explose.
- Un saut consommé n'est pas rendu quand le message redescend : sinon un aller-retour serait gratuit.
- `pass` sans nom repasse le message en cours ; la forme nommée sert aux cas explicites.
- La file de la pile est la seule file : un agent réveillé par un message passe par elle, pas par un canal parallèle.

## Flux

- envoi → file de la pile → distribution (élément → carte → fond → pile) → handler, ou `pass`, ou abandon.
- dépassement de profondeur → arrêt → remise de l'état → erreur lisible.

## Erreurs et messages

- « The message went too far: 50 hops is the limit. »
- Carte supprimée : « This card is gone; the message was dropped. »

## Vérification

- Propriétés 09 et 14
- Cas limites : handler absent, `pass` au dernier niveau, carte supprimée, message réenvoyé à soi-même
- Ordre de la file sous plusieurs envois successifs

## Alternatives écartées

- Diffusion à tous les objets : plus de hiérarchie, plus de `pass`, et des effets en cascade incontrôlables.
- Récursion pour la remontée : une pile d'appels qui dépend de la profondeur, donc un plafond implicite.

## Points de risque

- Un second point d'écriture, introduit « pour aller vite », est refusé en relecture.
- Une erreur qui ferait sortir une trace technique est un défaut, pas un détail.
- Un contrat modifié sans modifier `ast.ts`, `types.ts` ou `limits.ts` d'abord est refusé.
