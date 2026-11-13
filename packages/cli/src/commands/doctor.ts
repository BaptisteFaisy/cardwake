/**
 * `cardwake doctor` : l'état de l'atelier, d'un coup d'œil.
 *
 * Cinq contrôles, tous **hors réseau** sauf celui du relais — et celui-là
 * n'a lieu que si on lui donne une adresse :
 * 1. les piles de `stacks/` se relisent-elles (format `cardwake/1`) ;
 * 2. leurs cassettes sont-elles encore celles que ces piles demandent
 *    (le même verdict que `cassette verify`, une seule implémentation) ;
 * 3. `docs/language.md` et `.kiro/steering/language.md` sont-ils identiques
 *    (la consigne unique qui instruit les deux IA) ;
 * 4. les gardes du dépôt passent-elles ;
 * 5. le relais répond-il, si on en donne un.
 *
 * Chaque ligne dit son verdict : `ok`, `warn` (à savoir, pas bloquant) ou
 * `ko` (à réparer). La commande sort en 1 s'il y a un `ko`.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseStackFile } from "@cardwake/model";
import { probeRelayClient } from "@cardwake/agent";
import { checkStack, stacksHere } from "./cassette";
import type { CliArgs, CliIO } from "../args";

/** Le verdict d'un contrôle. */
type Verdict = "ok" | "warn" | "ko";

/** Un contrôle : son nom, son verdict, et la ligne que l'humain lit. */
type Check = { name: string; verdict: Verdict; detail: string };

/** Une ligne de commentaire HTML : le seul écart autorisé entre les copies. */
const COMMENT_LINE = /^<!--.*-->$/;

/**
 * Le corps d'un texte, sans les lignes de commentaire HTML de tête : c'est
 * la règle que le test de synchronisation du dépôt applique déjà (la copie
 * de steering porte une ligne d'en-tête).
 */
function bodyOf(text: string): string {
  const lines = text.split("\n");
  let index = 0;
  while (index < lines.length && COMMENT_LINE.test(lines[index].trim())) index += 1;
  return lines.slice(index).join("\n");
}

/** Les deux copies de la référence du langage, et leur verdict. */
function languageReferenceCheck(): Check {
  const main = "docs/language.md";
  const copy = ".kiro/steering/language.md";
  if (!existsSync(main)) return { name: "language reference", verdict: "ko", detail: `${main} is missing` };
  if (!existsSync(copy)) return { name: "language reference", verdict: "ko", detail: `${copy} is missing` };
  const same = bodyOf(readFileSync(main, "utf8")) === bodyOf(readFileSync(copy, "utf8"));
  if (!same) return { name: "language reference", verdict: "ko", detail: `${copy} differs from ${main}` };
  return { name: "language reference", verdict: "ok", detail: "both copies say the same thing" };
}

/** Les piles de `stacks/` : se relisent-elles ? */
function stacksCheck(): Check {
  const paths = stacksHere();
  if (paths === null) return { name: "stacks", verdict: "warn", detail: "no stacks directory here" };
  if (paths.length === 0) return { name: "stacks", verdict: "warn", detail: "no stack found" };
  const broken: string[] = [];
  for (const path of paths) {
    try {
      const parsed = parseStackFile(readFileSync(path, "utf8"));
      if (!parsed.ok) broken.push(`${path}: ${parsed.errors[0]}`);
    } catch (error) {
      broken.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (broken.length > 0) {
    return { name: "stacks", verdict: "ko", detail: `${broken.length} unreadable: ${broken[0]}` };
  }
  return { name: "stacks", verdict: "ok", detail: `${paths.length} stack(s) read back` };
}

/** Les cassettes : sont-elles encore celles que les piles demandent ? */
async function cassettesCheck(): Promise<Check> {
  const paths = stacksHere();
  if (paths === null) return { name: "cassettes", verdict: "warn", detail: "no stacks directory here" };
  const problems: string[] = [];
  let unchecked = 0;
  for (const path of paths) {
    const check = await checkStack(path);
    if (check.state === "ok") continue;
    if (check.state === "unchecked") {
      unchecked += 1;
      continue;
    }
    problems.push(`${path}: ${check.lines[0] ?? check.state}`);
  }
  if (problems.length > 0) {
    return { name: "cassettes", verdict: "ko", detail: `${problems.length} stale: ${problems[0]}` };
  }
  if (unchecked > 0) {
    return { name: "cassettes", verdict: "warn", detail: `${unchecked} stack(s) with no scenario to compare` };
  }
  return { name: "cassettes", verdict: "ok", detail: "every recording matches what the stacks ask for" };
}

/** Les gardes du dépôt : passent-elles ? */
function guardsCheck(): Check {
  if (!existsSync("scripts/guards/run_all.py")) {
    return { name: "guards", verdict: "warn", detail: "the guard script is not here" };
  }
  const run = spawnSync("python3", ["scripts/guards/run_all.py"], { encoding: "utf8" });
  if (run.error !== undefined) {
    return { name: "guards", verdict: "warn", detail: `python3 is not available (${run.error.message})` };
  }
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`.trim();
  const last = output.split("\n").filter((line) => line.trim() !== "").pop() ?? "";
  if (run.status === 0) return { name: "guards", verdict: "ok", detail: last };
  return { name: "guards", verdict: "ko", detail: last };
}

/** Le relais : répond-il ? (seulement si on lui donne une adresse) */
async function relayCheck(relay: string | null): Promise<Check | null> {
  if (relay === null || relay === undefined) return null;
  const probe = await probeRelayClient(relay);
  if (!probe.available) {
    return { name: "relay", verdict: "warn", detail: probe.reason ?? "unreachable" };
  }
  return { name: "relay", verdict: "ok", detail: `${probe.models.length} model(s) available` };
}

/** Le rapport : une ligne par contrôle, dans l'ordre. */
export function reportLines(checks: Check[]): string[] {
  return checks.map((check) => `${check.verdict.padEnd(4)} ${check.name.padEnd(20)} ${check.detail}`);
}

export async function doctorCommand(args: CliArgs, io: CliIO): Promise<number> {
  const checks: Check[] = [stacksCheck(), languageReferenceCheck(), guardsCheck()];
  checks.push(await cassettesCheck());
  const relay = await relayCheck(args.relay ?? null);
  if (relay !== null) checks.push(relay);
  for (const line of reportLines(checks)) io.out(line);
  const broken = checks.filter((check) => check.verdict === "ko").length;
  if (broken > 0) io.err(`doctor: ${broken} problem(s) to fix`);
  return broken === 0 ? 0 : 1;
}
