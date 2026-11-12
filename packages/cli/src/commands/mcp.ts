/**
 * `cardwake mcp` : lance le serveur MCP du projet (11.7) — les outils
 * `validate_script`, `simulate`, `paraphrase`, `read_stack`… pour un agent de
 * codage, sans navigateur, sans clé, sans appel réseau.
 *
 * Le serveur (`apps/mcp`) est chargé par **import dynamique**, comme le pont
 * modèle de `run` : s'il n'est pas encore câblé dans un checkout donné, la
 * commande imprime la commande à taper et sort en code 2 — jamais d'échec de
 * build ni d'import statique cassé. Importer le module serveur LANCE la
 * boucle : il branche lui-même la lecture de l'entrée standard, et le
 * processus reste vivant tant qu'elle est ouverte, comme tout serveur MCP.
 * Rien n'est imprimé sur la sortie standard en cas de succès : ce canal
 * appartient au protocole JSON-RPC.
 *
 * Déterminisme et injectabilité : le chargeur est un paramètre, pour que les
 * tests n'importent jamais le vrai serveur (qui peut être en cours d'écriture).
 */

import type { CliArgs, CliIO } from "../args";

/** Ce que la commande attend du module serveur, sans importer son type. */
export type McpModule = Record<string, unknown>;

/** Un chargeur de module serveur : le module, ou `null` s'il manque. */
export type McpLoader = () => Promise<McpModule | null>;

/** Repli hors résolution de paquet : le fichier source, depuis ce module. */
const SERVER_URL = new URL("../../../../apps/mcp/src/server.ts", import.meta.url).href;

/**
 * Import dynamique du serveur MCP : d'abord le paquet `@cardwake/mcp`, puis
 * le fichier `apps/mcp/src/server.ts`. Rend `null` si aucune forme ne charge.
 * Le spécificateur est une variable : TypeScript ne résout pas le paquet tant
 * que `apps/mcp` n'est pas installé, et Vite ne le pré-analyse pas.
 */
export const loadMcpModule: McpLoader = async () => {
  for (const specifier of ["@cardwake/mcp", SERVER_URL]) {
    try {
      return (await import(/* @vite-ignore */ specifier)) as McpModule;
    } catch {
      /* on essaie la forme suivante */
    }
  }
  return null;
};

/** La commande à taper quand le serveur manque : celle du module lui-même. */
const LAUNCH_COMMAND = "npx vite-node apps/mcp/src/server.ts";

/**
 * La commande complète : importer le serveur suffit à lancer sa boucle stdio.
 * Succès sans un seul mot sur stdout (canal du protocole), code 2 avec la
 * commande à taper sinon — même sémantique que `run` sans son pont modèle.
 */
export async function mcpCommand(_args: CliArgs, io: CliIO, loadMcp: McpLoader = loadMcpModule): Promise<number> {
  const server = await loadMcp();
  if (server === null) {
    io.out(`mcp: the MCP server is not available yet — start it with: ${LAUNCH_COMMAND}`);
    return 2;
  }
  return 0;
}
