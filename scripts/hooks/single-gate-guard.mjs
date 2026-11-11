#!/usr/bin/env node
/**
 * Garde 4 — un seul point de passage des droits (14.3, `.kiro/steering/agent-safety.md`).
 *
 * Déclencheur : enregistrement dans `packages/**`. Le module qui applique les
 * opérations (`model/ops`) n'est importé que par `model/dispatch` et
 * `model/authorize` : partout ailleurs, une opération passerait à côté des droits.
 */

import { allow, contentOf, deny, findMatches, guard, hookInput, inScope, pathOf, relPath, repoRoot } from "./lib.mjs";

const SCOPE = ["packages/**"];
const GATE_FILES = ["packages/model/src/dispatch.ts", "packages/model/src/authorize.ts"];

/** Un import du module des opérations, sous ses formes relatives ou par paquet. */
const GATE_IMPORTS = [
  { re: /from\s+["'][^"']*\bops["']/, message: "import du module qui applique les opérations" },
  { re: /import\s*\(\s*["'][^"']*\bops["']\s*\)/, message: "chargement du module qui applique les opérations" },
  { re: /from\s+["']@cardwake\/model\/ops["']/, message: "import du module qui applique les opérations" },
];

await guard(async () => {
  const input = await hookInput();
  const root = repoRoot(input);
  const rel = relPath(root, pathOf(input));
  if (rel === "" || !inScope(rel, SCOPE) || GATE_FILES.includes(rel)) allow();
  const content = contentOf(input, root);
  if (content === null) allow();
  const hits = findMatches(content, GATE_IMPORTS);
  if (hits.length === 0) allow();
  deny(`Refusé : ${rel} importe le module qui applique les opérations.`, [
    ...hits.map((hit) => `ligne ${hit.line} : ${hit.message}`),
    "Seuls `model/dispatch` et `model/authorize` y ont droit : c'est le point de passage unique des droits.",
    "Passe par `authorize` (décision) ou `dispatch` (application), jamais par une opération directe.",
  ]);
});
