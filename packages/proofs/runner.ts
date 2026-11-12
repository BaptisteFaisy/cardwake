/**
 * Le coureur de preuves : il exécute, il ne croit sur parole personne.
 *
 * Une preuve `vitest` ou `property` est vérifiée en **exécutant sa commande**
 * (`npx vitest run …`) : verdict vert seulement si le code de sortie vaut 0
 * **et** que le fichier de test cité apparaît dans la sortie (un `npx` qui
 * ne testerait rien ne prouve rien). Une preuve `demo` est vérifiée par sa
 * démonstration locale dédiée (voir `demos.ts`), jamais par sa commande.
 *
 * Chaque preuve tourne indépendamment, avec un plafond de deux minutes ;
 * une preuve dont le fichier cité manque est marquée « absent », jamais
 * verte par silence.
 */

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runDemo } from "./demos";
import { PROOFS } from "./registry";
import type { Proof } from "./registry";

/** La racine du dépôt, déduite de ce fichier et non du répertoire courant. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Plafond d'une preuve : au-delà, elle est tuée et jugée rouge. */
const TIMEOUT_MS = 120_000;

/** Le produit d'une preuve : verdict, durée, phrase, sortie tronquée. */
export type ProofResult = {
  id: string;
  ok: boolean;
  durationMs: number;
  summary: string;
  output?: string;
};

export type RunOptions = { cwd?: string };

/** La sortie gardée pour le rapport : assez pour diagnostiquer, pas un journal. */
const OUTPUT_LIMIT = 4_000;

/** Le marqueur attendu dans la sortie : le test cité, ou un test du dossier. */
function markerFor(cwd: string, file: string): string {
  if (file.endsWith(".test.ts")) return basename(file);
  const inside = readdirSync(join(cwd, file)).filter((name) => name.endsWith(".test.ts"));
  if (inside.length === 0) throw new Error(`no test file inside ${file}`);
  return inside[0];
}

/** Exécute la commande et capture tout : code de sortie, sortie, plafond. */
function execCommand(args: readonly string[], cwd: string): Promise<{ code: number | null; output: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    let output = "";
    let timedOut = false;
    const child = spawn("npx", [...args], { cwd, env: process.env });
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, TIMEOUT_MS);
    child.on("error", (error) => {
      output += `\n${error.message}`;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output, timedOut });
    });
  });
}

/** Le verdict d'une preuve commande : vert seulement si code 0 et marqueur vu. */
async function runCommand(proof: Proof, cwd: string): Promise<ProofResult> {
  const started = process.hrtime.bigint();
  const finish = (result: Omit<ProofResult, "id" | "durationMs">): ProofResult => ({
    id: proof.id,
    durationMs: Number(process.hrtime.bigint() - started) / 1e6,
    ...result,
  });
  const args = proof.command.trim().split(/\s+/).slice(1); // « npx » départi.
  const { code, output, timedOut } = await execCommand(args, cwd);
  const clipped = output.length > OUTPUT_LIMIT ? `${output.slice(0, OUTPUT_LIMIT)}\n…` : output;
  if (timedOut) return finish({ ok: false, summary: `timed out after ${TIMEOUT_MS / 1000} s`, output: clipped });
  let marker: string;
  try {
    marker = markerFor(cwd, proof.file ?? "");
  } catch (error) {
    return finish({ ok: false, summary: error instanceof Error ? error.message : String(error), output: clipped });
  }
  if (code !== 0) return finish({ ok: false, summary: `exit code ${code}`, output: clipped });
  if (!output.includes(marker)) return finish({ ok: false, summary: `output lacks ${marker}: nothing ran`, output: clipped });
  return finish({ ok: true, summary: `exit 0, ${marker} ran`, output: clipped });
}

/** Vérifie une preuve : démonstration locale, commande exécutée, ou absent. */
export async function runProof(proof: Proof, options?: RunOptions): Promise<ProofResult> {
  const started = process.hrtime.bigint();
  const durationMs = () => Number(process.hrtime.bigint() - started) / 1e6;
  if (proof.kind === "demo") {
    const outcome = await runDemo(proof.id);
    return { id: proof.id, ok: outcome.ok, durationMs: durationMs(), summary: outcome.summary };
  }
  const cwd = options?.cwd ?? ROOT;
  const target = join(cwd, proof.file ?? "");
  if (!existsSync(target)) {
    return { id: proof.id, ok: false, durationMs: durationMs(), summary: `absent: no file at ${proof.file}` };
  }
  return runCommand(proof, cwd);
}

/** Vérifie les 29 preuves, dans l'ordre de la table, l'une après l'autre. */
export async function runAllProofs(options?: RunOptions): Promise<ProofResult[]> {
  const results: ProofResult[] = [];
  for (const proof of PROOFS) results.push(await runProof(proof, options));
  return results;
}
