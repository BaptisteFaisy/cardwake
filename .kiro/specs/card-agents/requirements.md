# L'agent d'une carte — Exigences

**Parcours.** Exigences d'abord

**But.** Faire d'un tour d'agent une transaction bornée : une vue de sa carte, des outils bornés par son niveau, un budget compté, et aucune mémoire hors des champs de sa carte.

## Modules concernés

- `packages/agent/src/view.ts`
- `packages/agent/src/tools.ts`
- `packages/agent/src/loop.ts`
- `packages/agent/src/budget.ts`
- `packages/agent/src/queue.ts`

## Exigences (EARS)

1. **CAR-F-30** — Quand un agent est réveillé, le système doit lui donner exactement quatre blocs de contexte : règles, consignes (pile, fond, carte), vue de sa carte, message reçu.
2. **CAR-F-31** — Le système doit limiter la vue d'un agent à sa carte : ses champs, ses boutons, les noms des autres cartes, et rien des autres contenus.
3. **CAR-F-32** — Quand un tour produit des appels d'outils, le système doit les appliquer par `authorize` et les enregistrer dans le journal, en une transaction annulable d'un geste.
4. **CAR-F-33** — Quand le budget de tours, de jetons ou de temps est épuisé, le système doit arrêter proprement, écrire ce qui a été fait et le dire à l'humain.
5. **CAR-F-38** — Le système doit conserver la mémoire d'un agent uniquement dans les champs de sa carte : aucun historique de conversation, aucune base de souvenirs.
6. **CAR-F-39** — Quand l'agent répond, le système doit écrire sa réponse là où le message l'attend, et rendre la main au traitement en cours.
7. **CAR-F-41** — Quand deux messages arrivent pour le même agent, le système doit les traiter dans l'ordre, dans une file bornée, sans en perdre silencieusement.
8. **CAR-F-43** — Quand la vitesse est « fast » ou « careful », le système doit choisir le modèle correspondant via la passerelle, sans changer les droits.

## Cas limites à couvrir

- Budget de tours épuisé au milieu d'une série d'appels d'outils.
- Deux messages pour le même agent : ordre conservé, file bornée.
- Agent endormi qui reçoit un message : réveil compté, pas gratuit.
- Réponse d'agent vide ou trop longue pour le champ visé.
- Délai de tour dépassé : rien n'est écrit, l'humain est prévenu.

## Hors périmètre

- Donner un historique de conversation à l'agent
- Laisser un agent écrire hors de sa carte
- Faire attendre l'interface sans fin : chaque tour a un délai

## Propriétés visées

- CAR-P-15
- CAR-P-16

## Acceptation

- Chaque exigence a au moins un test nommé dans `tasks.md`.
- Aucune exigence n'est contredite par une autre ; une contradiction trouvée est notée dans le journal de bord.
