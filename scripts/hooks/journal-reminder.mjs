#!/usr/bin/env node
/**
 * Garde 9 — le journal de bord porte une ligne par tâche de spec (14.3).
 *
 * Déclencheur : après une tâche de spec. Ajoute une ligne à `docs/journal.md`.
 * La ligne est idempotente : la même tâche de la même session n'est pas écrite
 * deux fois.
 */

import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { allow, deny, guard, hookInput, readIfExists, repoRoot, toolInput } from "./lib.mjs";

const JOURNAL = "docs/journal.md";

/** Identifiant court de la tâche : ce que l'agent annonce, sinon l'événement. */
function taskLabel(input) {
  const found = toolInput(input);
  const candidate = found.content ?? found.task ?? found.description ?? found.file_path ?? input.hook_event_name ?? "tâche";
  return String(candidate).replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Ligne du journal : date ISO, session, tâche. Jamais de donnée sensible. */
function journalLine(input, now) {
  const session = String(input.session_id ?? "session").slice(0, 40);
  return `- ${now.toISOString().slice(0, 10)} — ${session} : ${taskLabel(input)}`;
}

await guard(async () => {
  const input = await hookInput();
  const root = repoRoot(input);
  const path = join(root, JOURNAL);
  if (!existsSync(path)) {
    deny("Refusé : le journal de bord est absent.", [
      `${JOURNAL} doit exister : chaque tâche de spec y laisse une ligne, et les mesures du récit y sont notées.`,
    ]);
  }
  const line = journalLine(input, new Date());
  const current = readIfExists(root, JOURNAL) ?? "";
  if (current.split("\n").includes(line)) allow();
  appendFileSync(path, `${current.endsWith("\n") || current === "" ? "" : "\n"}${line}\n`, "utf8");
  allow();
});
