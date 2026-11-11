# L'agent d'une carte — Conception

**Parcours.** Exigences d'abord

**But.** Faire d'un tour d'agent une transaction bornée : une vue de sa carte, des outils bornés par son niveau, un budget compté, et aucune mémoire hors des champs de sa carte.

## Contrats

- `AgentContext = { rules, personas, view, message }` — quatre blocs, jamais cinq.
- `CardView` ne contient aucun champ d'une autre carte : la contrainte est dans le type.
- `SessionBudget` n'est jamais exporté avec une pile (CAR-P-22) : c'est un compteur de session, pas un réglage.

## Décisions

- La boucle d'outils est faite par l'appelant, la passerelle ne fait qu'un appel : une seule boucle dans le produit.
- Un tour d'agent est une transaction : l'annulation d'un tour est un seul clic dans le journal.
- La file d'agents est bornée et partagée par pile ; au-delà, le message est refusé et journalisé.
- Le niveau effectif vient d'`authorize`, jamais de la vue : la vue montre, elle n'autorise pas.

## Flux

- message → file → réveil → vue de la carte → appel au modèle → appels d'outils → `authorize` → opérations → journal → réponse écrite.
- budget épuisé → arrêt → transaction close → erreur lisible pour l'humain.

## Erreurs et messages

- « This agent has used its turn budget for this click. »
- « The queue for this agent is full. »
- Délai de tour : « The model did not answer in time; nothing was changed. »

## Vérification

- Propriétés 15 et 16
- Faux modèle qui demande un niveau supérieur : refus, journal, pas d'écriture
- Budget de tours épuisé au milieu d'une série d'outils

## Alternatives écartées

- Historique de conversation conservé à part : un état que l'utilisateur ne voit pas.
- Outils illimités bornés par une consigne : une consigne n'est pas une contrainte.

## Points de risque

- Un second point d'écriture, introduit « pour aller vite », est refusé en relecture.
- Une erreur qui ferait sortir une trace technique est un défaut, pas un détail.
- Un contrat modifié sans modifier `ast.ts`, `types.ts` ou `limits.ts` d'abord est refusé.
