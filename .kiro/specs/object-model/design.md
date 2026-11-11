# Modèle d'objet et format de pile — Conception

**Parcours.** Exigences d'abord — le format est figé avant toute opération

**But.** Décrire une pile comme un document JSON versionné, sérialisable, sans fonction ni référence circulaire. Tout ce qui n'est pas dans le format n'existe pas : pas d'état caché, pas d'historique secret.

## Contrats

- `Stack` (types.ts) est la seule description du document ; les schémas Zod en sont la vérification, pas une deuxième vérité.
- `Op` porte `before` et `after` : l'inverse d'une opération est calculable sans historique.
- `APP_LIMITS` plafonne, `DEFAULT_SETTINGS` propose, `clampSettings` recadre — trois rôles, jamais confondus.
- `nextId` ne décroît jamais ; un identifiant supprimé n'est jamais rendu.

## Décisions

- Un seul type `Part` discriminé par `kind` : champ et bouton partagent ce qu'ils partagent, et rien de plus.
- Le contenu des champs de fond vit dans `card.content` indexé par identifiant : c'est ce qui rend un fond partagé et un contenu propre.
- Les opérations sont des données, pas des fonctions : elles se relisent, se comparent et s'inversent.
- Migration par version : `migrate` transforme un document ancien, ne devine jamais un document cassé.

## Flux

- fichier → `parse` (JSON) → `migrate` → `StackSchema` → `clampSettings` → pile utilisable.
- modification → `Op[]` → `journal` → nouveau document ; l'ancien reste lisible pour l'annulation.

## Erreurs et messages

- Champ fautif nommé, chemin JSON indiqué
- Réglage hors plafond : recadré et signalé, pas refusé
- Version inconnue : refus explicite, jamais de chargement partiel

## Vérification

- Propriétés 07, 08, 10, 18
- Aller-retour sérialisation sur les trois piles d'exemple
- Recadrage des réglages sous les plafonds

## Alternatives écartées

- Fonctions stockées dans le document : un fichier de pile ne doit pas pouvoir exécuter du code.
- Identifiants textuels : plus longs à comparer, et tentation de les réutiliser.

## Points de risque

- Un second point d'écriture, introduit « pour aller vite », est refusé en relecture.
- Une erreur qui ferait sortir une trace technique est un défaut, pas un détail.
- Un contrat modifié sans modifier `ast.ts`, `types.ts` ou `limits.ts` d'abord est refusé.
