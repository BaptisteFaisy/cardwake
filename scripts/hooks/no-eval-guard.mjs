#!/usr/bin/env node
/**
 * Garde 3 — aucune sortie de modèle exécutée comme du code (CAR-N-01, 14.3).
 *
 * Déclencheur : enregistrement dans `apps/**` ou `packages/**`. Refuse
 * l'évaluation d'un texte, la construction d'une fonction depuis un texte et
 * toute injection de HTML. Ce que produit un modèle est du texte : analysé,
 * contrôlé, relu, puis accepté par un humain.
 */

import { allow, contentOf, DANGEROUS_CODE, deny, findMatches, guard, hookInput, inScope, pathOf, relPath, repoRoot } from "./lib.mjs";

const SCOPE = ["apps/**", "packages/**"];

await guard(async () => {
  const input = await hookInput();
  const root = repoRoot(input);
  const rel = relPath(root, pathOf(input));
  if (rel === "" || !inScope(rel, SCOPE)) allow();
  const content = contentOf(input, root);
  if (content === null) allow();
  const hits = findMatches(content, DANGEROUS_CODE);
  if (hits.length === 0) allow();
  deny(`Refusé : ${rel} exécute du texte comme du code.`, [
    ...hits.map((hit) => `ligne ${hit.line} : ${hit.message}`),
    "Un script Murmur passe par l'analyseur, les contrôles statiques et la relecture : jamais par une évaluation.",
    "Pour afficher du contenu, écris du texte dans un champ ; le rendu est celui de la page, pas du HTML injecté.",
  ]);
});
