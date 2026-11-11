/**
 * Logique partagée des gardes Kiro (`.kiro/hooks/hooks.json`).
 *
 * Contrat d'une garde : elle lit sur stdin le JSON fourni par Kiro
 * (`hook_event_name`, `cwd`, `session_id`, `tool_name`, `tool_input`), sort 0
 * si l'action est autorisée, et sort avec un code non nul plus un message sur
 * stderr sinon — Kiro bloque alors l'outil et transmet le message à l'agent.
 *
 * Aucune garde ne fait d'appel réseau ni ne consomme de crédits : ce sont des
 * commandes locales (14.3).
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

/** Marques d'un tiers (5.4), écrites en morceaux : le dépôt ne les porte jamais
 *  littéralement, pas même dans le code qui les cherche. */
export const THIRD_PARTY_WORDS = ["Hyper" + "Card", "Hyper" + "Talk", "App" + "le", "Macin" + "tosh"];

/** Constructions interdites (CAR-N-01) : aucune sortie de modèle n'est du code.
 *  Les motifs sont écrits avec `\s*` pour ne pas se déclencher eux-mêmes. */
export const DANGEROUS_CODE = [
  { re: /\beval\s*\(/, message: "évaluation d'un texte comme code" },
  { re: /\bnew\s+Function\s*\(/, message: "construction d'une fonction depuis un texte" },
  { re: /\.innerHTML\s*=/, message: "écriture de HTML depuis du contenu" },
  { re: /dangerouslySet[\s]*InnerHTML/, message: "injection de HTML" },
  { re: /\bdocument\.write\s*\(/, message: "injection de HTML" },
];

/** Formes de clé (CAR-N-03). Un dépôt, un export ou un journal n'en porte aucune. */
export const SECRET_SHAPES = [
  { re: /sk-[A-Za-z0-9_-]{24,}/, message: "clé de fournisseur en clair" },
  { re: /sk_[a-f0-9]{32}/, message: "clé courte en clair" },
  { re: /ghp_[A-Za-z0-9]{36}/, message: "jeton de forge en clair" },
  { re: /github_pat_[A-Za-z0-9_]{40,}/, message: "jeton fin de forge en clair" },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, message: "clé privée en clair" },
];

/** Lit le JSON de Kiro sur stdin ; un stdin vide ou invalide n'est pas une faute. */
export async function readHookInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (raw === "") return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { _unparsed: raw };
  }
}

/** Entrée de la garde : `argv[2]` pour un essai manuel, sinon stdin (Kiro). */
export async function hookInput() {
  const arg = process.argv[2];
  if (typeof arg === "string" && arg.trim() !== "") {
    try {
      return JSON.parse(arg);
    } catch {
      return { _unparsed: arg };
    }
  }
  return readHookInput();
}

/** Première valeur définie parmi des chemins de champs candidats. */
export function firstDefined(source, names) {
  for (const name of names) {
    const value = name.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), source);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

export const toolInput = (input) => input.tool_input ?? input.toolInput ?? input.input ?? {};

/** La commande shell demandée. Le nom exact du champ est à confirmer au premier
 *  déclenchement (14.3) : on accepte les variantes connues. */
export function commandOf(input) {
  const found = firstDefined(input, ["tool_input.command", "tool_input.cmd", "tool_input.shell", "tool_input.input.command"]);
  return typeof found === "string" ? found : "";
}

/** Le chemin du fichier concerné par l'enregistrement. */
export function pathOf(input) {
  const found = firstDefined(input, ["tool_input.file_path", "tool_input.path", "tool_input.filePath", "tool_input.target_file"]);
  return typeof found === "string" ? found : "";
}

export function repoRoot(input) {
  return typeof input.cwd === "string" && input.cwd !== "" ? input.cwd : process.cwd();
}

/** Chemin relatif au dépôt, séparateur `/`, jamais absolu. */
export function relPath(root, target) {
  if (target === "") return "";
  const full = isAbsolute(target) ? target : resolve(root, target);
  return relative(root, full).split(/[\\/]/).join("/");
}

/** Vrai si le chemin relatif commence par l'un des préfixes (globs `dir/**`). */
export function inScope(rel, prefixes) {
  return prefixes.some((prefix) => rel === prefix.replace(/\/\*\*$/, "") || rel.startsWith(prefix.replace(/\*\*$/, "")));
}

export function readIfExists(root, rel) {
  const full = resolve(root, rel);
  return existsSync(full) ? readFileSync(full, "utf8") : null;
}

/** Contenu à contrôler : celui de la demande, sinon celui du disque. */
export function contentOf(input, root) {
  const inline = firstDefined(input, ["tool_input.content", "tool_input.text", "tool_input.new_string"]);
  if (typeof inline === "string") return inline;
  const rel = relPath(root, pathOf(input));
  return rel === "" ? null : readIfExists(root, rel);
}

/** Lignes fautives : [{ line, message }] pour un message de refus utile. */
export function findMatches(text, patterns) {
  const found = [];
  text.split("\n").forEach((line, index) => {
    for (const pattern of patterns) {
      if (pattern.re.test(line)) found.push({ line: index + 1, message: pattern.message });
    }
  });
  return found;
}

/** Autorisé : sortie 0, sans bruit. */
export function allow() {
  process.exit(0);
}

/** Refusé : sortie non nulle, message sur stderr pour l'agent et pour Kiro. */
export function deny(title, details = []) {
  process.stderr.write(`${title}\n`);
  for (const detail of details) process.stderr.write(`  - ${detail}\n`);
  process.exit(1);
}

/** Lance une commande bornée ; rend code, sortie et erreur. */
export function runBounded(command, args, { cwd, timeoutMs = 120_000 } = {}) {
  const result = spawnSync(command, args, { cwd, timeout: timeoutMs, encoding: "utf8" });
  return { status: result.status ?? 1, out: result.stdout ?? "", err: result.stderr ?? "" };
}

/** Exécute le corps d'une garde ; toute exception devient un refus lisible. */
export async function guard(body) {
  try {
    await body();
  } catch (error) {
    deny(`La garde a échoué : ${error.message}`, ["Une garde en panne bloque l'outil : corriger la garde, pas le contournement."]);
  }
}
