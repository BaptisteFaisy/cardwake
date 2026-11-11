#!/usr/bin/env node
/**
 * Garde 6 — une seule référence pour deux IA (14.2, 14.3).
 *
 * Déclencheur : enregistrement dans `packages/lang/src/parser/**`. Deux contrôles :
 * les deux copies de la référence sont identiques sous leur en-tête, et les
 * exemples de la référence s'analysent encore. Un écart demande de mettre à jour
 * la référence **et** les gabarits de relecture.
 */

import { allow, deny, guard, hookInput, inScope, pathOf, readIfExists, relPath, repoRoot, runBounded } from "./lib.mjs";

const SCOPE = ["packages/lang/src/parser/**", "packages/lang/src/parsing/**"];
const REFERENCE = "docs/language.md";
const STEERING = ".kiro/steering/language.md";
const EXAMPLES_TEST = "packages/lang/test/reference-examples.test.ts";
const COMMENT = /^<!--[^\n]*-->\n/;

/** Corps de la copie de steering : la ligne de commentaire de tête en moins. */
function body(text) {
  return text.replace(COMMENT, "");
}

await guard(async () => {
  const input = await hookInput();
  const root = repoRoot(input);
  if (!inScope(relPath(root, pathOf(input)), SCOPE)) allow();
  const reference = readIfExists(root, REFERENCE);
  const steering = readIfExists(root, STEERING);
  if (reference === null || steering === null) {
    deny("Refusé : la référence du langage est absente.", [
      `${REFERENCE} et ${STEERING} doivent exister ensemble : c'est le même texte pour deux lecteurs.`,
    ]);
  }
  if (reference !== body(steering)) {
    deny("Refusé : les deux copies de la référence divergent.", [
      `${STEERING} doit être ${REFERENCE} précédé d'une seule ligne de commentaire HTML.`,
      "Un test la vérifie : packages/lang/test/language-sync.test.ts.",
    ]);
  }
  if (readIfExists(root, EXAMPLES_TEST) !== null) {
    const override = process.env.CARDWAKE_HOOK_CMD;
    const [command, ...args] = override ? override.split(" ") : ["npx", "vitest", "run", EXAMPLES_TEST, "--reporter=basic"];
    const run = runBounded(command, args, { cwd: root, timeoutMs: 120_000 });
    if (run.status !== 0) {
      deny("Refusé : un exemple de la référence ne s'analyse plus.", [
        run.err.split("\n").filter((line) => line.trim() !== "").slice(0, 5).join(" | "),
        "Mets à jour la référence, l'analyseur et les gabarits de relecture ensemble.",
      ]);
    }
  }
  allow();
});
