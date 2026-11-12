# Les preuves exécutables

Le dépôt fait 29 affirmations (P-01 à P-29). Chacune est **exécutable** : un
tiers la vérifie lui-même, sans clé, sans réseau, sans navigateur.

```
npm run preuves           # tout vérifier, écrire le rapport, code de sortie honnête
npm run preuves:rapport   # régénérer rapport.md depuis rapport.json, sans relancer les tests
```

## Où regarder

- `rapport.md` — la table des preuves : identifiant, étape, ce que ça prouve,
  commande, verdict (`vert` / `rouge` / `absent`), durée mesurée.
- `rapport.json` — les mêmes lignes, plus le résumé de chaque preuve :
  c'est la version lisible par machine.

## Comment une preuve est vérifiée

- **Commande** (la plupart) : le coureur exécute la commande de la table
  (`npx vitest run …`) et ne juge verte qu'une sortie dont le code vaut 0
  **et** où le fichier de test cité apparaît. Chaque preuve tourne toute
  seule, avec un plafond de deux minutes.
- **Démonstration locale** (P-20, P-24, P-25, P-26) : une assertion dédiée
  rejoue la situation sur le moteur réel (`Dispatcher`, boucle de cassette),
  réponses d'agent écrites à la main — pas de navigateur, pas de modèle,
  pas de réseau. Le devis est calculé sur la pile livrée `stacks/quotes`,
  le manoir et l'espion sur `stacks/manor`, le rejeu passe deux fois par la
  cassette enregistrée et compare les états finaux.

Une preuve dont le fichier cité manque est marquée **absente** : jamais
comptée verte par silence. Le code de sortie de `npm run preuves` vaut 0
seulement si les 29 preuves sont vertes.

## Le registre

Le registre vit dans `packages/proofs/` : la table (`registry.ts`, reprise
mot pour mot), le coureur (`runner.ts`), les démonstrations (`demos.ts`), le
rapport (`report.ts`) et ses propres tests (`proofs.test.ts`). Les sources
de la table sont les 29 entrées de `/tmp/proofs-table.md` ; si la table
change, le registre change avec elle.

**Une preuve verte est une affirmation vérifiable, pas une promesse.**
