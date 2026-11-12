/**
 * La sonde du relais local (7.11) : le navigateur demande au relais ce qu'il
 * sait servir, et il répond vite — ou pas du tout.
 *
 * Trois règles :
 * - **aucun secret** : la sonde ne demande qu'une adresse, jamais une clé ;
 * - **une seule requête** : `GET {baseUrl}/config`, rien d'autre ;
 * - **jamais d'exception** : un relais muet, une adresse fausse ou un délai
 *   dépassé rendent tous la même chose : `available: false`.
 *
 * Le site est statique : depuis une page publique, `http://127.0.0.1:8787`
 * n'est pas joignable — le relais est sur la machine du visiteur, pas sur
 * Internet. La sonde le dit franchement au lieu de laisser croire à un
 * modèle.
 */

/** L'adresse du relais par défaut : le relais local de la machine. */
export const DEFAULT_RELAY_BASE_URL = "http://127.0.0.1:8787";

/** Le délai maximal de la sonde, en millisecondes : court, mais pas nul. */
export const RELAY_PROBE_TIMEOUT_MS = 1_200;

/** Ce que la sonde apprend du relais. */
export type RelayProbeResult = {
  /** Le relais a-t-il répondu ? */
  available: boolean;
  /** L'adresse interrogée, sans barre oblique finale. */
  baseUrl: string;
  /** Les modèles que le relais sert ; vide s'il n'a pas répondu. */
  models: string[];
};

/** La réponse minimale dont la sonde a besoin. */
export type ProbeResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};

/** Un `fetch` minimal : la sonde ne fait qu'un GET, jamais un POST. */
export type ProbeFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; signal: AbortSignal },
) => Promise<ProbeResponse>;

/** Les options de la sonde. */
export type RelayProbeOptions = {
  /** Le `fetch` injectable : les tests n'ouvrent jamais de connexion. */
  fetchImpl?: ProbeFetch;
  /** Le délai maximal de la sonde, en millisecondes. */
  timeoutMs?: number;
  /** Le signal de l'appelant : son annulation coupe la sonde. */
  signal?: AbortSignal;
};

/** L'adresse normalisée : sans barre oblique finale, telle qu'on l'a demandée. */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

/** Une adresse est-elle utilisable ? Seuls `http` et `https` le sont. */
function isUsable(baseUrl: string): boolean {
  return baseUrl.startsWith("http://") || baseUrl.startsWith("https://");
}

/**
 * Les modèles lus dans la réponse de `/config`. `null` quand le corps n'est
 * pas du JSON : le relais n'a pas parlé le langage attendu, donc il n'est pas
 * joignable pour nos besoins.
 */
function readModels(body: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const models = (parsed as { models?: unknown }).models;
  if (models === undefined) return [];
  if (!Array.isArray(models)) return null;
  return models.filter((model): model is string => typeof model === "string");
}

/** Le seul `fetch` de la sonde : `GET {baseUrl}/config`, et rien d'autre. */
function fetchConfig(
  baseUrl: string,
  signal: AbortSignal,
  fetchImpl: ProbeFetch | undefined,
): Promise<ProbeResponse> {
  const doFetch = fetchImpl ?? globalThis.fetch;
  return doFetch(`${baseUrl}/config`, {
    method: "GET",
    headers: { accept: "application/json" },
    signal,
  });
}

/** Le signal de la sonde : celui du délai, coupé aussi par l'appelant. */
function linkedSignal(controller: AbortController, external: AbortSignal | undefined): AbortSignal {
  if (external === undefined) return controller.signal;
  if (external.aborted) {
    controller.abort();
    return controller.signal;
  }
  external.addEventListener("abort", () => controller.abort(), { once: true });
  return controller.signal;
}

/**
 * Sonde le relais : `GET {baseUrl}/config`, avec un délai court.
 *
 * Ne lève jamais — un relais muet rend `available: false`, et c'est tout.
 * L'adresse demandée est rendue telle qu'elle a été normalisée, pour que
 * l'appelant sache exactement ce qui a été interrogé.
 */
export async function probeRelay(
  baseUrl: string,
  options: RelayProbeOptions = {},
): Promise<RelayProbeResult> {
  const target = normalizeBaseUrl(baseUrl);
  if (!isUsable(target)) return { available: false, baseUrl: target, models: [] };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? RELAY_PROBE_TIMEOUT_MS);
  try {
    const response = await fetchConfig(target, linkedSignal(controller, options.signal), options.fetchImpl);
    if (!response.ok) return { available: false, baseUrl: target, models: [] };
    const models = readModels(await response.text());
    if (models === null) return { available: false, baseUrl: target, models: [] };
    return { available: true, baseUrl: target, models };
  } catch {
    return { available: false, baseUrl: target, models: [] };
  } finally {
    clearTimeout(timer);
  }
}
