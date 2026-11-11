# Droits des agents — le point de passage unique — Exigences

**Parcours.** Exigences d'abord — c'est la spec où l'analyse des exigences doit trouver des contradictions

**But.** Décider, en un seul endroit, qui peut faire quoi. Aucun module n'applique une opération sans être passé par `authorize` : un agent ne dépasse jamais son niveau, et un humain n'a jamais besoin d'aucun droit.

## Modules concernés

- `packages/model/src/authorize.ts`
- `packages/agent/src/tools.ts`
- `packages/model/src/dispatch.ts`

## Exigences (EARS)

1. **CAR-F-34** — Quand un agent demande une opération, le système doit l'autoriser si et seulement si son niveau atteint le niveau minimal de cette opération et si la cible est sa propre carte.
2. **CAR-F-35** — Quand un agent tente d'écrire dans un champ verrouillé, le système doit refuser, quel que soit son niveau.
3. **CAR-F-36** — Quand un agent de niveau 4 change la carte affichée, le système doit l'autoriser, et le journaliser comme une opération de la carte de l'agent.
4. **CAR-F-37** — Aucun outil d'agent ne doit pouvoir modifier un niveau, une consigne, un état d'éveil ou un réglage de budget.
5. **CAR-F-52** — Quand une pile reçue n'est pas déclarée digne de confiance, le système doit plafonner à 2 le niveau effectif de tout agent, et laisser les agents endormis.
6. **CAR-F-34** — Quand un script écrit dans un champ verrouillé, le système doit l'autoriser : le verrou vise l'agent, pas l'auteur.
7. **CAR-F-36** — Quand une opération est refusée, le système doit rendre un refus lisible nommant le niveau requis et le niveau effectif.

## Cas limites à couvrir

- Champ verrouillé écrit par un script : autorisé ; par un agent : refusé.
- Agent de niveau 4 qui change la carte affichée : autorisé et journalisé.
- Agent de niveau 5 qui propose un script : proposition, jamais installation.
- Pile reçue non fiable : niveau effectif 2 quel que soit le niveau écrit.
- Demande portant sur une autre carte : refus, quel que soit le niveau.

## Hors périmètre

- Répartir les droits entre plusieurs modules
- Accorder un droit par un réglage de pile
- Laisser un agent agir sur une autre carte, même en lecture d'écriture

## Propriétés visées

- CAR-P-11
- CAR-P-12
- CAR-P-13
- CAR-P-17

## Acceptation

- Chaque exigence a au moins un test nommé dans `tasks.md`.
- Aucune exigence n'est contredite par une autre ; une contradiction trouvée est notée dans le journal de bord.
