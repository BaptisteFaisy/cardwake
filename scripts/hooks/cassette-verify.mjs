#!/usr/bin/env node
/**
 * Garde 7 — enregistrements périmés (14.3).
 *
 * Déclencheur : enregistrement dans `packages/agent/**` ou `stacks/**`. Liste les
 * enregistrements plus anciens que la pile ou le code qu'ils rejouent : ils
 * rendraient une réponse d'un autre état, donc un parcours de démonstration faux.
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { allow, deny, guard, hookInput, inScope, pathOf, relPath, repoRoot } from "./lib.mjs";

const SCOPE = ["packages/agent/**", "stacks/**"];

/** Tous les fichiers d'enregistrement, sous `<pile>/cassettes/`. */
function cassettes(root) {
  const stacksDir = join(root, "stacks");
  let names = [];
  try {
    names = readdirSync(stacksDir);
  } catch {
    return [];
  }
  const found = [];
  for (const name of names) {
    const dir = join(stacksDir, name, "cassettes");
    let files = [];
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (file.endsWith(".json")) found.push({ stack: join(stacksDir, name, "stack.json"), file: join(dir, file) });
    }
  }
  return found;
}

/** Un enregistrement est périmé s'il est plus ancien que sa pile. */
function stale(root) {
  return cassettes(root)
    .filter((entry) => {
      try {
        return statSync(entry.stack).mtimeMs > statSync(entry.file).mtimeMs;
      } catch {
        return false;
      }
    })
    .map((entry) => relative(root, entry.file).split(/[\\/]/).join("/"));
}

await guard(async () => {
  const input = await hookInput();
  const root = repoRoot(input);
  if (!inScope(relPath(root, pathOf(input)), SCOPE)) allow();
  const found = stale(root);
  if (found.length === 0) allow();
  deny(`Refusé : ${found.length} enregistrement(s) périmé(s).`, [
    ...found.slice(0, 8),
    "Un enregistrement se rejoue à partir de la pile actuelle : régénère-le (commande humaine, elle coûte des crédits).",
  ]);
});
