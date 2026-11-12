/**
 * Outillage partagé des tests de la CLI : sortie capturable, chemins des piles
 * de démonstration (résolus depuis `import.meta.url`), fichiers temporaires.
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CliArgs, CliIO } from "../src/args";

/** Racine du monorepo, résolue depuis ce fichier (jamais depuis `process.cwd()`). */
export const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

export function stackPath(name: string): string {
  return join(repoRoot, "stacks", name, "stack.json");
}

/** Une sortie capturée ligne à ligne, pour assertions sans console. */
export function capture(): { io: CliIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (line) => out.push(line), err: (line) => err.push(line) }, out, err };
}

/** Des `CliArgs` complets à partir de quelques champs utiles. */
export function cliArgs(partial: Partial<CliArgs>): CliArgs {
  return {
    command: "", sub: null, positionals: [],
    click: null, object: null, seed: null, json: false, help: false,
    ...partial,
  };
}

/** Copie la pile `manor` dans un dossier temporaire, la modifie, la réécrit. */
export function tempStack(mutate?: (json: Record<string, unknown>) => void, cassette?: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "cardwake-cli-"));
  const json = JSON.parse(readFileSync(stackPath("manor"), "utf8")) as Record<string, unknown>;
  mutate?.(json);
  const stackFile = join(dir, "stack.json");
  writeFileSync(stackFile, JSON.stringify(json, null, 2));
  if (cassette !== undefined) writeFileSync(join(dir, "cassette.json"), JSON.stringify(cassette, null, 2));
  return stackFile;
}

/** Un enregistrement de cassette fabriqué : empreinte arbitraire, réponse valide. */
export function fakeEntry(fingerprint: string) {
  return {
    fingerprint,
    purpose: "agent-turn",
    response: { stop: "end", blocks: [], usage: { inputTokens: 12, outputTokens: 7 } },
  };
}
