#!/usr/bin/env node
/**
 * Garde 2 — marques d'un tiers (5.4, `.kiro/steering/trademarks.md`).
 *
 * Déclencheur : enregistrement dans `apps/**`, `packages/**`, `stacks/**`,
 * `evals/**`. Le produit, ses libellés, ses piles et son jeu d'évaluation ne
 * portent jamais le nom du logiciel d'origine, de son langage, de son éditeur ou
 * de sa machine. `README.md`, `docs/` et `.kiro/` restent hors de cette garde :
 * ils peuvent dire d'où vient l'idée, en une phrase factuelle.
 */

import { allow, contentOf, deny, findMatches, guard, hookInput, inScope, pathOf, relPath, repoRoot, THIRD_PARTY_WORDS } from "./lib.mjs";

const SCOPE = ["apps/**", "packages/**", "stacks/**", "evals/**"];
const ALLOWED = ["README.md", "docs/", ".kiro/"];

const WORD_RULES = THIRD_PARTY_WORDS.map((word) => ({
  re: new RegExp(`\\b${word}\\b`, "i"),
  message: `marque d'un tiers : « ${word.slice(0, 2)}… »`,
}));

await guard(async () => {
  const input = await hookInput();
  const root = repoRoot(input);
  const rel = relPath(root, pathOf(input));
  if (rel === "" || !inScope(rel, SCOPE) || ALLOWED.some((prefix) => rel.includes(prefix))) allow();
  const content = contentOf(input, root);
  if (content === null) allow();
  const hits = findMatches(content, WORD_RULES);
  if (hits.length === 0) allow();
  deny(`Refusé : ${rel} porte une marque d'un tiers (5.4).`, [
    ...hits.map((hit) => `ligne ${hit.line} : ${hit.message}`),
    "Le langage Murmur est écrit à partir de zéro : il ressemble à son ancêtre par ses tournures, pas par son texte.",
    "Dire d'où vient l'idée se fait dans `README.md` ou `docs/`, en une phrase factuelle sans nom de tiers.",
  ]);
});
