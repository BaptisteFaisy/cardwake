#!/usr/bin/env node
/**
 * Garde 5 — les propriétés du langage restent vertes (14.3).
 *
 * Déclencheur : enregistrement dans `packages/lang/**`. Lance les propriétés
 * CAR-P-01 à CAR-P-06 du paquet `lang` ; un échec bloque l'enregistrement et
 * renvoie les noms des propriétés cassées à l'agent.
 *
 * `CARDWAKE_HOOK_CMD` remplace la commande lancée : c'est la couture de test,
 * elle évite de payer une suite complète à chaque garde.
 */

import { allow, deny, guard, hookInput, inScope, pathOf, relPath, repoRoot, runBounded } from "./lib.mjs";

const SCOPE = ["packages/lang/**"];
const DEFAULT_ARGS = ["vitest", "run", "--dir", "packages/lang", "--reporter=basic", "-t", "CAR-P-0"];

/** Lignes qui nomment une propriété en échec, pour un message utile. */
function failingLines(output) {
  return output
    .split("\n")
    .filter((line) => /CAR-P-0[1-6]/.test(line) && /(×|✗|FAIL|failed)/i.test(line))
    .slice(0, 6);
}

await guard(async () => {
  const input = await hookInput();
  const root = repoRoot(input);
  if (!inScope(relPath(root, pathOf(input)), SCOPE)) allow();
  const override = process.env.CARDWAKE_HOOK_CMD;
  const [command, ...args] = override ? override.split(" ") : ["npx", ...DEFAULT_ARGS];
  const run = runBounded(command, args, { cwd: root, timeoutMs: 180_000 });
  if (run.status === 0) allow();
  const detail = failingLines(`${run.out}\n${run.err}`);
  deny("Refusé : les propriétés du langage ne passent plus.", [
    ...(detail.length > 0 ? detail : ["la suite de propriétés a échoué"]),
    `Commande : ${command} ${args.join(" ")}`,
    "Corrige la propriété cassée avant d'enregistrer ; une propriété rouge est un contrat rompu, pas un test capricieux.",
  ]);
});
