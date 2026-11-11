# Cœur du langage Murmur — Exigences

**Parcours.** Conception d'abord — la grammaire de 7.3 entre en entrée, la conception la traduit en contrats

**But.** Transformer un texte Murmur en arbre syntaxique, ou en erreurs positionnées, sans jamais produire les deux. Le langage est la seule couche que l'auteur lit vraiment : sa précision vaut mieux que sa richesse.

## Modules concernés

- `packages/lang/src/lexer.ts`
- `packages/lang/src/parser.ts`
- `packages/lang/src/parsing/cursor.ts`
- `packages/lang/src/parsing/statements.ts`
- `packages/lang/src/parsing/expressions.ts`
- `packages/lang/src/ast.ts`

## Exigences (EARS)

1. **CAR-F-12** — Le système doit analyser tout script Murmur en un arbre conforme à `ast.ts` : handlers et fonctions, dans l'ordre du texte, chaque nœud portant un `Span`.
2. **CAR-F-12** — Quand une analyse réussit, le système doit rendre `{ ok: true, script }` sans avertissement ni nœud partiel.
3. **CAR-F-14** — Quand une analyse échoue, le système doit rendre au plus huit erreurs, chacune avec une position comprise dans le texte source.
4. **CAR-F-15** — Le système doit rendre chaque erreur lisible : catégorie, message en langage simple, piste de correction, objet concerné quand il est identifiable — jamais de trace technique.
5. **CAR-F-17** — L'analyse doit être déterministe : deux analyses du même texte rendent des arbres identiques, sans horloge, sans aléa, sans langue de la machine.
6. **CAR-F-12** — Le système doit accepter les mots-clés sans tenir compte de la casse et refuser toute forme absente de la référence.

## Cas limites à couvrir

- Script vide, script de commentaires seulement : arbre vide, aucune erreur.
- Handler sans `end` : erreur positionnée sur la dernière ligne, script en service inchangé.
- Instruction inconnue au milieu d'un bloc : l'analyse continue et rend les erreurs suivantes.
- Morceau à borne négative et plage inversée (`line 5 to 2`).
- Chaîne non fermée en fin de fichier.

## Hors périmètre

- Exécuter un script (c'est `interpreter`)
- Deviner une intention : une forme fausse est une erreur, pas une correction
- Accepter deux instructions sur une ligne

## Propriétés visées

- CAR-P-01
- CAR-P-02
- CAR-P-04
- CAR-P-05
- CAR-P-06
- CAR-P-21

## Acceptation

- Chaque exigence a au moins un test nommé dans `tasks.md`.
- Aucune exigence n'est contredite par une autre ; une contradiction trouvée est notée dans le journal de bord.
