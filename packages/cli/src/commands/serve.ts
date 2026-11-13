/**
 * `cardwake serve` : sert le site construit, en local.
 *
 * Le site est une application statique (Vite → `apps/web/dist`). Cette
 * commande la sert sur `http://127.0.0.1:<port>` (5173 par défaut), avec le
 * repli « index.html » pour les routes de l'application (une application à
 * une page : `/card` et `/journal` doivent rendre la même page que `/`).
 *
 * Aucune clé, aucun réseau : le site joue en mode enregistré par défaut.
 * Si `dist` manque, la commande **construit** le site (`npm run build
 * --workspace @cardwake/web`) et le dit — c'est long, alors le dit aussi.
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { extname, join, normalize } from "node:path";
import type { CliArgs, CliIO } from "../args";

/** Où se trouve le site construit. */
export const DIST_DIR = "apps/web/dist";

/** Les types servis, et leur type MIME. */
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/**
 * Le fichier servi pour une URL : le fichier lui-même s'il existe, sinon
 * `index.html` (le repli d'une application à une page).
 *
 * Une URL qui remonte (`/../../etc/passwd`) ne sort **jamais** du dossier de
 * publication : `path.join` garde le second argument relatif, et le repli
 * sert `index.html`.
 */
export function resolveRequest(root: string, url: string): { file: string; status: number } {
  const clean = normalize(decodeURIComponent(url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(root, clean);
  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return { file: candidate, status: 200 };
  }
  return { file: join(root, "index.html"), status: 200 };
}

/** Le type MIME d'un fichier, d'après son extension. */
function mimeOf(file: string): string {
  return MIME[extname(file)] ?? "application/octet-stream";
}

/** Construit le site s'il n'est pas là ; dit ce que ça a coûté. */
export function buildIfMissing(io: CliIO): boolean {
  if (existsSync(join(DIST_DIR, "index.html"))) return true;
  io.out("serve: the site is not built yet — building it (this takes a moment)");
  const run = spawnSync("npm", ["run", "build", "--workspace", "@cardwake/web"], { encoding: "utf8" });
  if (run.status !== 0) {
    const detail = (run.stderr ?? "").trim().split("\n").pop() ?? "the build failed";
    io.err(`serve: the build failed — ${detail}`);
    return false;
  }
  return existsSync(join(DIST_DIR, "index.html"));
}

/** Ouvre le navigateur, si on sait le faire sur cette machine. */
function openBrowser(url: string): void {
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(opener, [url], { stdio: "ignore", detached: true });
  child.on("error", () => {
    /* le navigateur n'est pas là : l'adresse est affichée, ce suffit */
  });
  child.unref();
}

export function serveCommand(args: CliArgs, io: CliIO): number {
  if (!buildIfMissing(io)) return 1;
  const port = args.port ?? 5173;
  const root = join(process.cwd(), DIST_DIR);
  const server = createServer((request, response) => {
    const target = resolveRequest(root, request.url ?? "/");
    const type = mimeOf(target.file);
    response.writeHead(target.status, { "content-type": type });
    createReadStream(target.file).pipe(response);
  });
  const address = `http://127.0.0.1:${port}/`;
  server.listen(port, "127.0.0.1", () => {
    io.out(`serve: the site is on ${address} — Ctrl+C to stop`);
    if (args.open === true) openBrowser(address);
  });
  server.on("error", (error: NodeJS.ErrnoException) => {
    io.err(`serve: cannot listen on port ${port} — ${error.message}`);
    process.exit(1);
  });
  return 0;
}
