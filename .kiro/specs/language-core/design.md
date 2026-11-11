# Cœur du langage Murmur — Conception

**Parcours.** Conception d'abord — la grammaire de 7.3 entre en entrée, la conception la traduit en contrats

**But.** Transformer un texte Murmur en arbre syntaxique, ou en erreurs positionnées, sans jamais produire les deux. Le langage est la seule couche que l'auteur lit vraiment : sa précision vaut mieux que sa richesse.

## Contrats

- `parseScript(source: string): ParseResult` — jamais d'exception qui sorte de l'analyse.
- `ParseResult = ParseOk | ParseErr` — un arbre ou des erreurs, jamais les deux : c'est le type qui l'impose, pas la discipline.
- `ScriptError.span` et `line/col` toujours remplis ; `hint` rempli pour toute erreur de syntaxe.
- `Cursor` porte la position, `ParseAbort` la remonte : aucune erreur n'est fabriquée sans token.

## Décisions

- Analyse descendante récursive, un mot-clé par instruction dans une table `parsers` : ajouter une commande = une entrée et une fonction.
- `expressions.ts` traite les priorités en cascade (ou → et → comparaison → concaténation → additive → multiplicative → unaire → primaire).
- Les morceaux de texte n'ouvrent un morceau que si un mot de type est suivi d'une borne : `char 2`, `line 3 to 5`, `item -1`.
- `end` seul sur sa ligne ferme un bloc ; `end if` et `end repeat` ne ferment jamais un handler.
- Plafond de huit erreurs : au-delà, l'auteur corrige d'abord le début, le reste est du bruit.

## Flux

- texte → `lex()` → jetons → `parseScript` → un `Handler` par `on`, une `FunctionDef` par `function`.
- Erreur rencontrée → `ParseAbort` → erreur ajoutée → `skipToNextBlock` → l'analyse continue pour montrer plusieurs erreurs.

## Erreurs et messages

- Message toujours en anglais simple, orienté correction : « Expected "end if" to close the condition. »
- La piste montre une ligne copiable : « One command per line. »

## Vérification

- Propriétés 01, 02, 04, 05, 06, 21 sous fast-check
- Les exemples de `docs/language.md` sont analysés par un test
- Aller-retour analyse → impression → analyse stable

## Alternatives écartées

- Générateur d'analyseur depuis une grammaire : un outil de plus, et des erreurs moins lisibles.
- Correction automatique d'une forme fausse : deviner l'intention produit un script qui n'est pas celui demandé.

## Points de risque

- Un second point d'écriture, introduit « pour aller vite », est refusé en relecture.
- Une erreur qui ferait sortir une trace technique est un défaut, pas un détail.
- Un contrat modifié sans modifier `ast.ts`, `types.ts` ou `limits.ts` d'abord est refusé.
