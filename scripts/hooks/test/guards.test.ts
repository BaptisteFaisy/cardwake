import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Les neuf gardes de `.kiro/hooks/hooks.json`, une par une.
 *
 * Contrat testé : la garde lit le JSON de Kiro, sort 0 quand l'action est
 * autorisée, et sort avec un code non nul plus un message sur stderr quand elle
 * est refusée. Chaque garde a ici un cas autorisé et un cas refusé.
 *
 * Les textes interdits sont construits par morceaux : ce fichier de test ne doit
 * pas déclencher les gardes du dépôt (`scripts/guards/run_all.py`).
 */

const HOOKS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES: string[] = [];

/** Mot interdit écrit en morceaux, pour ne pas le porter littéralement ici. */
const THIRD_PARTY = ["Hyper", "Card"].join("");
const EVAL_CALL = ["ev", "al(", "1 + 1)"].join("");
const KEY_SHAPE = `sk-${"a".repeat(30)}`;

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "cardwake-hook-"));
  FIXTURES.push(root);
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  return root;
}

type Run = { status: number | null; stderr: string };

/** Lance une garde avec le JSON de Kiro en argument, comme le fait le hook. */
function runGuard(name: string, input: unknown, env: Record<string, string> = {}): Run {
  const result = spawnSync(process.execPath, [join(HOOKS_DIR, `${name}.mjs`), JSON.stringify(input)], {
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, ...env },
  });
  return { status: result.status, stderr: result.stderr ?? "" };
}

/** Enregistrement d'un fichier, tel que Kiro le décrit à la garde. */
function save(cwd: string, filePath: string, content: string) {
  return { hook_event_name: "PreToolUse", cwd, session_id: "test", tool_name: "fsWrite", tool_input: { file_path: filePath, content } };
}

afterAll(() => {
  for (const root of FIXTURES) rmSync(root, { recursive: true, force: true });
});

describe("no-live-model-guard", () => {
  const shell = (command: string) => ({
    hook_event_name: "PreToolUse",
    cwd: process.cwd(),
    tool_name: "shell",
    tool_input: { command },
  });

  it("autorise une commande de test", () => {
    expect(runGuard("no-live-model-guard", shell("npm run test:ci")).status).toBe(0);
  });

  it("refuse une commande qui appellerait un vrai modèle", () => {
    const run = runGuard("no-live-model-guard", shell("cardwake cassette record --stack manor"));
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("vrai modèle");
  });
});

describe("trademark-guard", () => {
  it("autorise un fichier de paquet sans marque", () => {
    const root = fixture({});
    expect(runGuard("trademark-guard", save(root, "packages/lang/src/a.ts", "export const x = 1;\n")).status).toBe(0);
  });

  it("refuse une marque d'un tiers dans un paquet", () => {
    const root = fixture({});
    const run = runGuard("trademark-guard", save(root, "packages/lang/src/a.ts", `// ${THIRD_PARTY}\n`));
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("marque");
  });
});

describe("no-eval-guard", () => {
  it("autorise du code ordinaire", () => {
    const root = fixture({});
    expect(runGuard("no-eval-guard", save(root, "apps/web/src/a.ts", "export const y = 2;\n")).status).toBe(0);
  });

  it("refuse un texte exécuté comme du code", () => {
    const root = fixture({});
    const run = runGuard("no-eval-guard", save(root, "apps/web/src/a.ts", `const z = ${EVAL_CALL};\n`));
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("code");
  });
});

describe("single-gate-guard", () => {
  const importing = 'import { apply } from "./ops";\n';

  it("autorise le point de passage des droits", () => {
    const root = fixture({});
    expect(runGuard("single-gate-guard", save(root, "packages/model/src/dispatch.ts", importing)).status).toBe(0);
  });

  it("refuse un autre module qui importerait les opérations", () => {
    const root = fixture({});
    const run = runGuard("single-gate-guard", save(root, "packages/lang/src/check.ts", importing));
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("droits");
  });
});

describe("lang-properties", () => {
  const input = (root: string) => save(root, "packages/lang/src/parser.ts", "export {};\n");

  it("autorise quand les propriétés passent", () => {
    const root = fixture({});
    expect(runGuard("lang-properties", input(root), { CARDWAKE_HOOK_CMD: "true" }).status).toBe(0);
  });

  it("refuse quand une propriété casse", () => {
    const root = fixture({});
    const run = runGuard("lang-properties", input(root), { CARDWAKE_HOOK_CMD: "false" });
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("propriétés");
  });
});

describe("language-sync", () => {
  const BODY = "# The Murmur Language\n\nput 1 into x\n";
  const HEADER = "<!-- identical below this line -->\n";
  const parserFile = (root: string) => save(root, "packages/lang/src/parsing/statements.ts", "export {};\n");

  it("autorise deux copies identiques sous l'en-tête", () => {
    const root = fixture({ "docs/language.md": BODY, ".kiro/steering/language.md": HEADER + BODY });
    expect(runGuard("language-sync", parserFile(root)).status).toBe(0);
  });

  it("refuse des copies qui divergent", () => {
    const root = fixture({ "docs/language.md": BODY, ".kiro/steering/language.md": HEADER + `${BODY}\nextra\n` });
    const run = runGuard("language-sync", parserFile(root));
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("divergent");
  });
});

describe("cassette-verify", () => {
  const input = (root: string) => save(root, "stacks/manor/stack.json", "{}\n");

  it("autorise une pile sans enregistrement", () => {
    const root = fixture({ "stacks/manor/stack.json": "{}\n" });
    expect(runGuard("cassette-verify", input(root)).status).toBe(0);
  });

  it("refuse un enregistrement plus ancien que sa pile", () => {
    const root = fixture({
      "stacks/manor/stack.json": "{}\n",
      "stacks/manor/cassettes/a.json": "{}\n",
    });
    const past = new Date(Date.now() - 60_000);
    utimesSync(join(root, "stacks/manor/cassettes/a.json"), past, past);
    const run = runGuard("cassette-verify", input(root));
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("périmé");
  });
});

describe("secret-guard", () => {
  it("autorise un texte sans clé", () => {
    const root = fixture({});
    expect(runGuard("secret-guard", save(root, "docs/a.md", "no key here\n")).status).toBe(0);
  });

  it("refuse un texte en forme de clé", () => {
    const root = fixture({});
    const run = runGuard("secret-guard", save(root, "docs/a.md", `token = "${KEY_SHAPE}"\n`));
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("clé");
  });
});

describe("journal-reminder", () => {
  const stop = (root: string, task: string) => ({
    hook_event_name: "Stop",
    cwd: root,
    session_id: "test-session",
    tool_input: { content: task },
  });

  it("ajoute une ligne au journal, une seule fois", () => {
    const root = fixture({ "docs/journal.md": "# Journal\n" });
    expect(runGuard("journal-reminder", stop(root, "task one")).status).toBe(0);
    expect(runGuard("journal-reminder", stop(root, "task one")).status).toBe(0);
    const text = readFileSync(join(root, "docs/journal.md"), "utf8");
    expect(text.split("\n").filter((line) => line.includes("task one"))).toHaveLength(1);
  });

  it("refuse quand le journal de bord est absent", () => {
    const root = fixture({});
    const run = runGuard("journal-reminder", stop(root, "task two"));
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("journal");
  });
});
