/**
 * La passerelle par relais (7.11) : une fonction sans serveur détient la clé.
 *
 * Quatre garde-fous, appliqués avant l'appel :
 * - **liste fermée de modèles** : le relais ne sert que les modèles prévus ;
 * - **plafond de longueur** : `max_tokens` est ramené sous le plafond ;
 * - **budget de session** : tours et jetons d'entrée par session ;
 * - **plafond journalier** : jetons d'entrée par jour, toutes sessions.
 *
 * Un garde-fou qui bloque ne produit pas une erreur : il lève `CassetteMiss`,
 * ce qui fait replier proprement sur le mode enregistré. Rien n'est journalisé.
 */

import { fingerprint, resolveModel } from "./canon";
import {
  callOpenAiCompatible,
  throwIfAborted,
  toOpenAiBody,
  type FetchLike,
  type ModelChoice,
} from "./http";
import { CassetteMiss } from "../types";
import type { LlmGateway, LlmRequest, LlmResponse } from "../types";

/** Adresse par défaut d'un relais OpenAI-compatible. */
export const DEFAULT_RELAY_BASE_URL = "https://relay.cardwake.example/v1";

/** Modèles que le relais accepte de servir. */
export const RELAY_ALLOWED_MODELS: readonly string[] = [
  "claude-haiku-5-5",
  "claude-sonnet-5-5",
  "claude-opus-5-5",
];

export type RelayLimits = {
  /** Plafond de longueur d'une réponse, en jetons. */
  maxOutputTokens: number;
  /** Budget de session : nombre de tours. */
  sessionTurns: number;
  /** Budget de session : jetons d'entrée cumulés. */
  sessionInputTokens: number;
  /** Plafond journalier : jetons d'entrée, toutes sessions. */
  dailyInputTokens: number;
};

/** Plafonds par défaut, alignés sur les réglages de pile (7.12). */
export const RELAY_LIMITS: RelayLimits = {
  maxOutputTokens: 2_000,
  sessionTurns: 60,
  sessionInputTokens: 400_000,
  dailyInputTokens: 4_000_000,
};

export type RelayOptions = {
  apiKey: string;
  baseUrl?: string;
  limits?: Partial<RelayLimits>;
  models?: ModelChoice;
  allowedModels?: readonly string[];
  headers?: Record<string, string>;
  fetchImpl?: FetchLike;
  /** Horloge injectable : les tests ne lisent jamais l'heure réelle. */
  now?: () => number;
};

/** Compteurs internes, jamais exportés (CAR-P-22). */
export type RelayCounters = {
  sessionTurns: number;
  sessionInputTokens: number;
  dailyInputTokens: number;
};

export type RelayExport = {
  mode: "relay";
  baseUrl: string;
  models: Record<string, string>;
};

const MS_PER_DAY = 86_400_000;

export class RelayGateway implements LlmGateway {
  readonly mode = "relay" as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly limits: RelayLimits;
  private readonly models: ModelChoice | undefined;
  private readonly allowedModels: readonly string[];
  private readonly headers: Record<string, string> | undefined;
  private readonly fetchImpl: FetchLike | undefined;
  private readonly now: () => number;

  private sessionTurns = 0;
  private sessionInputTokens = 0;
  private dailyInputTokens = 0;
  private day = 0;

  constructor(options: RelayOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? DEFAULT_RELAY_BASE_URL;
    this.limits = { ...RELAY_LIMITS, ...options.limits };
    this.models = options.models;
    this.allowedModels = options.allowedModels ?? RELAY_ALLOWED_MODELS;
    this.headers = options.headers;
    this.fetchImpl = options.fetchImpl;
    this.now = options.now ?? Date.now;
  }

  /** Compteurs actuels : lecture seule, jamais dans un export. */
  counters(): RelayCounters {
    this.rollDay();
    return {
      sessionTurns: this.sessionTurns,
      sessionInputTokens: this.sessionInputTokens,
      dailyInputTokens: this.dailyInputTokens,
    };
  }

  /** Remet à zéro le budget de la session (nouvelle pile ouverte). */
  resetSession(): void {
    this.sessionTurns = 0;
    this.sessionInputTokens = 0;
  }

  /** Le jour a changé : le compteur journalier repart de zéro. */
  private rollDay(): void {
    const today = Math.floor(this.now() / MS_PER_DAY);
    if (today !== this.day) {
      this.day = today;
      this.dailyInputTokens = 0;
    }
  }

  /** Le garde-fou qui bloque dit « pas d'enregistrement » : repli cassette. */
  private blocked(request: LlmRequest): CassetteMiss {
    return new CassetteMiss(fingerprint(request));
  }

  /** Un appel, après les quatre garde-fous. */
  async call(request: LlmRequest, signal: AbortSignal): Promise<LlmResponse> {
    throwIfAborted(signal);
    this.rollDay();
    const model = resolveModel(request, this.models);
    if (!this.allowedModels.includes(model)) throw this.blocked(request);
    if (this.sessionTurns >= this.limits.sessionTurns) throw this.blocked(request);
    if (this.sessionInputTokens >= this.limits.sessionInputTokens) {
      throw this.blocked(request);
    }
    if (this.dailyInputTokens >= this.limits.dailyInputTokens) throw this.blocked(request);
    const maxTokens = Math.min(request.maxOutputTokens, this.limits.maxOutputTokens);
    const response = await callOpenAiCompatible({
      url: `${this.baseUrl}/chat/completions`,
      body: toOpenAiBody(request, { model, maxTokens }),
      apiKey: this.apiKey,
      headers: this.headers,
      signal,
      fetchImpl: this.fetchImpl,
    });
    this.sessionTurns += 1;
    this.sessionInputTokens += response.usage.inputTokens;
    this.dailyInputTokens += response.usage.inputTokens;
    return response;
  }

  /** Export sans secret, sans compteur ni plafond de session (CAR-P-22). */
  exportState(): RelayExport {
    return {
      mode: this.mode,
      baseUrl: this.baseUrl,
      models: { ...this.models },
    };
  }
}
