# Piles reçues — Conception

**Parcours.** Quick Spec

**But.** Ouvrir une pile qui vient d'ailleurs sans lui donner les droits d'une pile maison : agents endormis, niveau plafonné, réglages recadrés, provenance visible.

## Contrats

- `Provenance = created | received { trusted, receivedAt }` : trois états lisibles, pas de booléen ambigu.
- Le plafond de niveau effectif s'applique dans `authorize`, pas dans l'interface.

## Décisions

- La confiance se déclare par un geste explicite et se journalise : elle ne se déduit de rien.
- Les agents sont endormis à l'ouverture : un premier clic ne réveille pas quatorze agents d'un coup.
- Le recadrage est silencieux quand il ne change rien, signalé quand il change quelque chose.

## Flux

- fichier → vérification → provenance reçue → recadrage → agents endormis → bandeau de provenance
- déclaration de confiance → provenance mise à jour → journal

## Erreurs et messages

- « This stack came from a file. Its agents stay at level 2 until you trust it. »
- Réglage recadré : valeur demandée et valeur retenue affichées

## Vérification

- Propriété 13
- Ouverture d'une pile reçue : aucun agent réveillé
- Tentative d'agent de niveau 4 sur pile reçue : refus

## Alternatives écartées

- Confiance implicite après un délai : une décision humaine ne se déduit pas du temps.
- Blocage total des piles reçues : le produit doit s'essayer, pas se méfier au point de se fermer.

## Points de risque

- Un second point d'écriture, introduit « pour aller vite », est refusé en relecture.
- Une erreur qui ferait sortir une trace technique est un défaut, pas un détail.
- Un contrat modifié sans modifier `ast.ts`, `types.ts` ou `limits.ts` d'abord est refusé.
