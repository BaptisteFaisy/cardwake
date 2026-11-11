# Produit — Cardwake

**Pour qui.** Indépendants et petites équipes qui veulent un outil à leur main ;
enseignants et élèves ; créateurs de petits jeux narratifs ; personnes qui ont
connu les piles de cartes de 1987.

**En une phrase.** Des piles de cartes programmables en langage naturel, où
chaque carte peut héberger un agent IA borné par son niveau, pour fabriquer de
petites applications sans coder.

**Idée centrale.** L'objet, son comportement et sa mémoire au même endroit,
visibles et modifiables par celui qui s'en sert.

## Les cinq décisions qui structurent tout

1. L'IA n'écrit jamais de JavaScript : elle écrit en **Murmur**, un petit
   langage interprété pas à pas avec un compteur d'étapes. Le script est
   visible, modifiable, relu en clair par le système, et fonctionne ensuite
   sans IA.
2. On ressuscite la **hiérarchie des messages** (élément → carte → fond →
   pile) et elle sert aussi de réseau aux agents.
3. Les **cinq niveaux** d'utilisateur de 1987 deviennent les cinq niveaux de
   droits d'un agent.
4. **La carte est toute la mémoire de l'agent** : pas d'historique caché.
5. **Essai sans clé** : les piles d'exemple livrent leurs échanges enregistrés.

## Objectifs

- O1 — fabriquer une petite application utile en moins de dix minutes sans coder.
- O2 — tout ce que l'IA produit est lisible, modifiable, et fonctionne sans IA.
- O3 — un agent ne peut jamais faire plus que son niveau, aucun état caché.
- O4 — le produit s'essaie sans compte ni clé ; une pile est un fichier à toi.
- O5 — les idées de 1987 respectées, sans rien copier d'un tiers.

## Non-objectifs

Pas d'émulation de fichiers d'origine, pas d'atelier de peinture point par
point, pas de travail à plusieurs en temps réel, pas d'accès réseau ni fichiers
depuis un script ou un agent, pas de place de marché ni de comptes, pas
d'application mobile native, pas d'orchestrateur d'agents généraliste.
