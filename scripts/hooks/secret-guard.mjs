#!/usr/bin/env node
/**
 * Garde 8 — la clé ne voyage pas (CAR-N-03, 14.3).
 *
 * Déclencheur : enregistrement de tout fichier. Refuse un texte qui a la forme
 * d'une clé : ni dans le dépôt, ni dans une pile, ni dans un journal, ni dans un
 * message d'erreur.
 */

import { allow, contentOf, deny, findMatches, guard, hookInput, pathOf, relPath, repoRoot, SECRET_SHAPES } from "./lib.mjs";

/** Fichiers où chercher une forme de clé n'a pas de sens (binaires, images). */
const SKIP_EXT = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".woff", ".woff2", ".ttf", ".ico", ".zip", ".gz"];

await guard(async () => {
  const input = await hookInput();
  const root = repoRoot(input);
  const rel = relPath(root, pathOf(input));
  if (rel === "" || SKIP_EXT.some((ext) => rel.toLowerCase().endsWith(ext))) allow();
  const content = contentOf(input, root);
  if (content === null) allow();
  const hits = findMatches(content, SECRET_SHAPES);
  if (hits.length === 0) allow();
  deny(`Refusé : ${rel} contient un texte en forme de clé.`, [
    ...hits.map((hit) => `ligne ${hit.line} : ${hit.message}`),
    "Une clé ne s'écrit dans aucun fichier du dépôt : elle reste dans l'environnement de l'humain.",
    "Pour un test, utilise le faux modèle ou un enregistrement ; jamais une clé, même invalide.",
  ]);
});
