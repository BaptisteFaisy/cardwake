/**
 * Point d'entrée du serveur MCP Cardwake : assemble le transport JSON-RPC
 * (`rpc.ts`) et les outils du moteur (`tools.ts`), puis sert sur stdio.
 *
 * Aucune dépendance au-delà des paquets purs du dépôt, aucun réseau : le
 * serveur lit des lignes JSON sur l'entrée standard et répond une ligne
 * par demande sur la sortie standard. Lancer depuis la racine du dépôt :
 * `npx vite-node apps/mcp/src/server.ts`.
 */

import { createInterface } from "node:readline";
import { createRpc } from "./rpc";
import { mcpTools, rpcApi } from "./tools";

/** Les outils, une seule fois : l'aiguillage ne fait que les chercher. */
const tools = mcpTools();

/** Écrit une réponse : une ligne JSON sur la sortie standard. */
function writeToStdout(text: string): void {
  process.stdout.write(text);
}

const rpc = createRpc(rpcApi(tools), writeToStdout);

/**
 * Les demandes sont traitées dans l'ordre d'arrivée : la file garantit
 * qu'une réponse lente ne laisse pas une réponse rapide la doubler.
 */
let queue: Promise<void> = Promise.resolve();

const input = createInterface({ input: process.stdin, terminal: false });
input.on("line", (line) => {
  queue = queue.then(() => rpc.handleLine(line));
});
