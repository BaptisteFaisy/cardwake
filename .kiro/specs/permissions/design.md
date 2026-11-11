# Droits des agents — le point de passage unique — Conception

**Parcours.** Exigences d'abord — c'est la spec où l'analyse des exigences doit trouver des contradictions

**But.** Décider, en un seul endroit, qui peut faire quoi. Aucun module n'applique une opération sans être passé par `authorize` : un agent ne dépasse jamais son niveau, et un humain n'a jamais besoin d'aucun droit.

## Contrats

- `authorize(actor, op, stack): Decision` — `allow`, ou `deny` avec `requiredLevel`, `effectiveLevel` et un message.
- `TOOL_LEVEL: Record<ToolName, AgentLevel>` est la seule table des niveaux minimaux, partagée par l'agent et par le journal.
- `Actor` distingue humain (browse, author), script (objet) et agent (carte, niveau) : trois sortes de demandeurs, trois règles.

## Décisions

- Le refus est une valeur, pas une exception : l'appelant décide quoi en faire, le journal le garde.
- Un niveau effectif se calcule (`min(level, 2)` pour une pile reçue non fiable) et ne s'écrit jamais dans le document.
- La cible est vérifiée en premier : une opération autorisée sur la mauvaise carte reste refusée.
- Les contradictions relevées par l'analyse des exigences sont notées dans le journal de bord, pas contournées.

## Flux

- demande → `authorize` → allow : opération appliquée ; deny : refus rendu, état inchangé.
- pile reçue → provenance non fiable → niveau effectif plafonné → agents endormis jusqu'à déclaration de confiance.

## Erreurs et messages

- « This needs level 3. This agent has level 2. »
- « This field is locked. »
- « An agent can only change its own card. »

## Vérification

- Propriétés 11, 12, 13, 17
- Faux modèle adversaire : il demande tout, rien ne passe au-delà du niveau
- Champ verrouillé, carte affichée, champ de fond depuis une autre carte

## Alternatives écartées

- Droits vérifiés dans chaque module : un oubli suffit, et il est invisible.
- Droits portés par la pile reçue : une pile dirait alors ce qu'elle a le droit de faire.

## Points de risque

- Un second point d'écriture, introduit « pour aller vite », est refusé en relecture.
- Une erreur qui ferait sortir une trace technique est un défaut, pas un détail.
- Un contrat modifié sans modifier `ast.ts`, `types.ts` ou `limits.ts` d'abord est refusé.
