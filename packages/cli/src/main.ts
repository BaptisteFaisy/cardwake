#!/usr/bin/env node
/**
 * Point d'entrée de la ligne de commande `cardwake` (11.7).
 *
 * Aiguillage des sous-commandes et codes de sortie :
 * 0 succès · 1 pile ou script invalide · 2 fonction non disponible · 3 usage.
 *
 * Les imports internes du dépôt sont sans extension (règle du projet) : pour
 * que `node packages/cli/src/main.ts …` fonctionne, un crochet de résolution
 * est enregistré avant tout import de module interne (d'où les imports
 * dynamiques ci-dessous). Sous Vitest/Vite, le crochet est inoffensif.
 */

import * as nodeModule from "node:module";
import { pathToFileURL } from "node:url";

/** Rend à Node la résolution des imports relatifs sans extension (.ts). */
function enableExtensionlessImports(): void {
  const hooks = nodeModule as { registerHooks?: (options: unknown) => unknown };
  if (typeof hooks.registerHooks !== "function") return;
  hooks.registerHooks({
    resolve(specifier: string, context: unknown, nextResolve: (s: string, c: unknown) => unknown) {
      if (!specifier.startsWith(".") || /\.[A-Za-z0-9]+$/.test(specifier)) return nextResolve(specifier, context);
      for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        try {
          return nextResolve(candidate, context);
        } catch {
          /* on essaie la forme suivante */
        }
      }
      return nextResolve(specifier, context);
    },
  });
}

enableExtensionlessImports();

import type { CliIO } from "./args";

/** La sortie par défaut : stdout pour les résultats, stderr pour les erreurs. */
export const defaultIo: CliIO = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

/** Exécute la commande demandée et rend le code de sortie. */
export async function main(argv: readonly string[], io: CliIO = defaultIo): Promise<number> {
  const { parseArgs, usage, COMMANDS } = await import("./args");
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    io.err(`cardwake: ${parsed.error}`);
    io.err(usage());
    return 3;
  }
  const args = parsed.args;
  if (args.help || args.command === "" || args.command === "help") {
    io.out(usage());
    return args.command === "" && !args.help ? 3 : 0;
  }
  if (!(COMMANDS as readonly string[]).includes(args.command)) {
    io.err(`cardwake: unknown command "${args.command}"`);
    io.err(usage());
    return 3;
  }
  if (args.command === "validate") return (await import("./commands/validate")).validateCommand(args, io);
  if (args.command === "paraphrase") return (await import("./commands/paraphrase")).paraphraseCommand(args, io);
  if (args.command === "cassette") return (await import("./commands/cassette")).cassetteCommand(args, io);
  if (args.command === "mcp") return (await import("./commands/mcp")).mcpCommand(args, io);
  if (args.command === "live") {
    const { liveCommand } = await import("./commands/live");
    const { LOCAL_RELAY_BASE_URL } = await import("@cardwake/agent");
    const stackPath = args.positionals[0];
    if (stackPath === undefined || !args.card || !args.say) {
      io.err("cardwake live needs <stack> --card <Name> --say <text>");
      return 3;
    }
    const result = await liveCommand(
      { stackPath, card: args.card, say: args.say, relayBaseUrl: args.relay ?? LOCAL_RELAY_BASE_URL },
      io,
    );
    return result.code;
  }
  return (await import("./commands/run")).runCommand(args, io);
}

/**
 * Lancement direct : `node packages/cli/src/main.ts …` (bin `cardwake`), ou
 * via le petit wrapper `npx vite-node packages/cli/src/main.ts …` — nécessaire
 * tant que `node` seul refuse le strip-only d'un paquet voisin (paramètre de
 * constructeur dans `lang/lexer.ts`). Sous `vite-node`, argv[1] vaut le binaire
 * `vite-node` ; sous Vitest (qui importe aussi ce module), argv[1] vaut
 * `vitest` : l'égalité stricte sur le nom évite toute exécution parasite.
 */
const argv1 = process.argv[1] === undefined ? "" : process.argv[1].split("/").pop() ?? "";
const entry = process.argv[1] === undefined ? "" : pathToFileURL(process.argv[1]).href;
const invokedDirectly = (entry !== "" && import.meta.url === entry) || argv1 === "vite-node";
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(`cardwake: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    },
  );
}
