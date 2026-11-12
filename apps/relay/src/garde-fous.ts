/**
 * Les garde-fous du relais (7.11) : la liste fermée des modèles, les trois
 * plafonds et leurs compteurs.
 *
 * Les compteurs sont tenus en mémoire, dans le processus : le compteur du jour
 * repart de zéro au changement de jour, celui d'une session repart de zéro
 * au changement d'heure.
 */

/** Un `fetch` minimal ; le `fetch` natif de Node est compatible. */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** Les trois plafonds du relais. */
export type RelayLimits = {
  /** Longueur maximale d'une requête, en caractères. */
  maxRequestChars: number;
  /** Requêtes par heure pour un identifiant de session. */
  sessionRequestsPerHour: number;
  /** Requêtes par jour, toutes sessions confondues. */
  dailyRequests: number;
};

/** Les valeurs par défaut des plafonds. */
export const RELAY_LIMITS: RelayLimits = {
  maxRequestChars: 100_000,
  sessionRequestsPerHour: 60,
  dailyRequests: 500,
};

/** La liste fermée des modèles que le relais sert. */
export const ALLOWED_MODELS: readonly string[] = ["combo/cheap", "ag/claude-sonnet-4-6"];

/** Les origines autorisées à appeler le relais, par défaut. */
export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

/** Le fournisseur, en amont du relais. */
export const DEFAULT_UPSTREAM_BASE_URL = "https://api.inferhub.dev/v1";

/** L'attente maximale du fournisseur, en millisecondes. */
export const UPSTREAM_TIMEOUT_MS = 60_000;

/** Les compteurs, en mémoire seulement. */
export type Counters = {
  day: number;
  daily: number;
  sessions: Map<string, { hour: number; count: number }>;
};

/** Ce qu'il faut pour compter. */
export type Budget = {
  limits: RelayLimits;
  counters: Counters;
  now: () => number;
};

/** Une requête de session passe-t-elle sous le plafond horaire ? */
export function takeSession(budget: Budget, sessionId: string): boolean {
  const hour = Math.floor(budget.now() / 3_600_000);
  const bucket = budget.counters.sessions.get(sessionId);
  if (bucket === undefined || bucket.hour !== hour) {
    budget.counters.sessions.set(sessionId, { hour, count: 1 });
    return true;
  }
  if (bucket.count >= budget.limits.sessionRequestsPerHour) return false;
  bucket.count += 1;
  return true;
}

/** Une requête passe-t-elle sous le plafond du jour ? */
export function takeDaily(budget: Budget): boolean {
  const day = Math.floor(budget.now() / 86_400_000);
  if (day !== budget.counters.day) {
    budget.counters.day = day;
    budget.counters.daily = 0;
  }
  if (budget.counters.daily >= budget.limits.dailyRequests) return false;
  budget.counters.daily += 1;
  return true;
}

/** Combien de requêtes restent aujourd'hui, toutes sessions confondues. */
export function remainingToday(budget: Budget): number {
  const day = Math.floor(budget.now() / 86_400_000);
  if (day !== budget.counters.day) return budget.limits.dailyRequests;
  return Math.max(0, budget.limits.dailyRequests - budget.counters.daily);
}
