# Journal et annulation — Conception

**Parcours.** Quick Spec

**But.** Chaque traitement devient une transaction : cause lisible, opérations réversibles, état avant et après. L'humain voit tout ce qui a été fait et annule d'un geste.

## Contrats

- `Transaction = { id, actor, cause, ops, seed, clock, usage? }` — la graine et l'horloge sont consignées pour rejouer.
- `undo(transaction, stack): Stack` applique l'inverse dans l'ordre décroissant.
- Chaque `Op` porte `before` et `after` : aucune inférence au moment d'annuler.

## Décisions

- Une transaction par traitement : c'est l'unité que l'humain annule, pas l'opération.
- L'encre d'agent (`ink`) est consignée dans l'opération : annuler rend aussi la piste de qui a écrit.
- Journal borné à 200 transactions par défaut, valeur réglable vers le bas seulement.

## Flux

- traitement → transaction ouverte → opérations → commit → journal
- annulation → inverse des opérations → transaction marquée annulée

## Erreurs et messages

- « This step cannot be undone because it is older than the journal. »
- Annulation impossible : l'état actuel diffère, refus explicite plutôt qu'un état faux

## Vérification

- Propriétés 08 et 23
- Annuler le dernier geste d'un agent rend l'état d'avant, encre comprise
- Journal plein : les plus anciennes transactions partent entières

## Alternatives écartées

- Historique complet non borné : une pile reçue pourrait exiger une mémoire sans limite.
- Annulation par opération : l'unité que l'humain annule est le geste, pas l'opération.

## Points de risque

- Un second point d'écriture, introduit « pour aller vite », est refusé en relecture.
- Une erreur qui ferait sortir une trace technique est un défaut, pas un détail.
- Un contrat modifié sans modifier `ast.ts`, `types.ts` ou `limits.ts` d'abord est refusé.
