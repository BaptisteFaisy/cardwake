# Piles d'exemple et enregistrements — Conception

**Parcours.** Quick Spec

**But.** Livrer trois piles qui se tiennent : The Manor (le parcours de trois clics), la liste de tâches, le devis. Chaqu'une avec ses échanges enregistrés, pour que le produit s'essaie sans clé.

## Contrats

- Un exemple = une pile `cardwake/1` + ses enregistrements, versions ensemble.
- L'empreinte d'un enregistrement dérive de la requête normalisée : la modifier serait mentir.

## Décisions

- Trois piles, trois usages : narrative, liste de tâches, calcul.
- Les scripts d'exemple restent lisibles à voix haute : c'est la vitrine du langage.
- Les enregistrements sont traités comme du code : ils se vérifient, ils ne se réécrivent pas à la main.

## Flux

- ouverture d'un exemple → pile valide → échanges rejoués → parcours sans clé

## Erreurs et messages

- « Recording is out of date for this stack; regenerate it. » (développement seulement)

## Vérification

- Les trois piles s'ouvrent et leur parcours se déroule
- Le parcours de trois clics fonctionne sans clé
- Empreinte vérifiée à chaque enregistrement

## Alternatives écartées

- Piles d'exemple générées : une vitrine doit être écrite et relue, pas produite.
- Démonstration dépendante d'une clé : le produit doit s'essayer sans compte ni clé.

## Points de risque

- Un second point d'écriture, introduit « pour aller vite », est refusé en relecture.
- Une erreur qui ferait sortir une trace technique est un défaut, pas un détail.
- Un contrat modifié sans modifier `ast.ts`, `types.ts` ou `limits.ts` d'abord est refusé.
