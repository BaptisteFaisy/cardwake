/**
 * Le rapport des preuves : une table lisible et un JSON lisible par machine.
 *
 * `rapport.md` reprend les colonnes de la table source — identifiant, étape,
 * ce que ça prouve, commande — plus le verdict et la durée mesurée. Le
 * `rapport.json` porte les mêmes lignes, enrichies du résumé : c'est lui
 * qu'un tiers ou qu'un autre programme relit sans rien relancer.
 *
 * `writeReport` sans résultats régénère le markdown depuis le JSON existant :
 * c'est le mode `preuves:rapport`, sans aucun test relancé.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { proofById } from "./registry";
import type { ProofResult } from "./runner";

/** Les verdicts du rapport : vert, rouge, ou absent (fichier cité manquant). */
type Verdict = "vert" | "rouge" | "absent";

/** Une ligne de rapport : le résultat enrichi des mots de la table. */
export type ReportRow = ProofResult & { step: string; claim: string; command: string; file?: string };

/** Le verdict d'un résultat : « absent » se lit au début du résumé. */
function verdictOf(result: ProofResult): Verdict {
  if (result.summary.startsWith("absent")) return "absent";
  return result.ok ? "vert" : "rouge";
}

/** Enrichit des résultats avec les mots de la table source. */
export function buildRows(results: readonly ProofResult[]): ReportRow[] {
  return results.map((result) => {
    const proof = proofById(result.id);
    return { ...result, step: proof.step, claim: proof.claim, command: proof.command, file: proof.file };
  });
}

/** Une durée dite en clair : millisecondes sous la seconde, secondes sinon. */
function durationLabel(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** La table markdown : une ligne par preuve, dans l'ordre de la table. */
export function renderMarkdown(rows: readonly ReportRow[]): string {
  const lines = [
    "# Rapport des preuves",
    "",
    "Une preuve verte est une affirmation vérifiable, pas une promesse : chaque ligne renvoie à une commande qu'un tiers relance lui-même (voir [README.md](README.md)).",
    "",
    "| id | étape | ce que ça prouve | commande | verdict | durée |",
    "|---|---|---|---|---|---|",
  ];
  for (const row of rows) {
    const command = row.command.replaceAll("|", "\\|");
    const claim = row.claim.replaceAll("|", "\\|");
    lines.push(`| ${row.id} | ${row.step} | ${claim} | \`${command}\` | ${verdictOf(row)} | ${durationLabel(row.durationMs)} |`);
  }
  const green = rows.filter((row) => verdictOf(row) === "vert").length;
  lines.push("", `${green} preuve(s) verte(s) sur ${rows.length}.`);
  return `${lines.join("\n")}\n`;
}

/** Le JSON machine : les mêmes lignes, avec verdict, résumé et durée. */
export function renderJson(rows: readonly ReportRow[]): string {
  const payload = {
    proofs: rows.map((row) => ({
      id: row.id,
      step: row.step,
      claim: row.claim,
      command: row.command,
      file: row.file,
      verdict: verdictOf(row),
      ok: row.ok,
      durationMs: Math.round(row.durationMs),
      summary: row.summary,
    })),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/** Relit des lignes depuis un `rapport.json` existant. */
function readRows(dir: string): ReportRow[] {
  const raw = JSON.parse(readFileSync(join(dir, "rapport.json"), "utf8")) as {
    proofs: Array<{ id: string; ok: boolean; durationMs: number; summary: string; step: string; claim: string; command: string; file?: string }>;
  };
  return raw.proofs.map((entry) => ({ ...entry }));
}

/** Écrit le markdown et le JSON ; rend les deux chemins écrits. */
export async function writeReport(dir: string, results?: readonly ProofResult[]): Promise<{ markdown: string; json: string }> {
  const rows = results ? buildRows(results) : readRows(dir);
  mkdirSync(dir, { recursive: true });
  const markdown = join(dir, "rapport.md");
  const json = join(dir, "rapport.json");
  writeFileSync(markdown, renderMarkdown(rows));
  writeFileSync(json, renderJson(rows));
  return { markdown, json };
}
