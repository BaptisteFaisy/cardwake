# Passerelle vers les modèles — Conception

**Parcours.** Conception d'abord — un seul point parle à un modèle

**But.** Traiter un refus avant le contenu, choisir le mode (enregistrement, clé, relais) sans changer les appelants, et ne jamais laisser une clé entrer dans une pile, un journal, un contexte ou un message d'erreur.

## Contrats

- `LlmRequest` et `LlmResponse` sont les types du projet : chaque mode traduit vers son fournisseur, l'appelant ne voit qu'eux.
- `usage` (entrée, sortie) accompagne toute réponse : le budget se compte sur des faits.
- `CassetteMiss` porte l'empreinte : l'erreur dit quelle situation manque.

## Décisions

- L'empreinte d'une cassette est le hachage de la requête normalisée : même demande, même enregistrement.
- Le refus est un `stop: "refusal"` traité en premier, avant tout accès aux blocs.
- Les modes sont interchangeables au démarrage, pas au milieu d'un tour.
- Aucun modèle imposé par la passerelle : l'appelant demande un usage et une vitesse.

## Flux

- demande → choix du mode → enregistrement trouvé : réponse rejouée ; sinon clé ou relais → réponse structurée → usage compté.

## Erreurs et messages

- « No recording for this situation. Add a key to go further. »
- « The model refused this request. »
- Délai : « The model did not answer in time. »

## Vérification

- Propriétés 19, 20 et 22
- Aucun appel réseau dans un test
- Refus traité avant lecture du contenu

## Alternatives écartées

- Un appel direct depuis l'interface : un second point qui connaît un fournisseur.
- Clé lue dans la pile : la clé ne voyage jamais avec un document.

## Points de risque

- Un second point d'écriture, introduit « pour aller vite », est refusé en relecture.
- Une erreur qui ferait sortir une trace technique est un défaut, pas un détail.
- Un contrat modifié sans modifier `ast.ts`, `types.ts` ou `limits.ts` d'abord est refusé.
