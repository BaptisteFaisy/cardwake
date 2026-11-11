/**
 * La passerelle par clé personnelle (7.11) : l'appel part du navigateur vers
 * le fournisseur, avec la clé de l'utilisateur.
 *
 * La traduction est celle de `http.ts` : une seule implémentation, partagée
 * avec le relais. La clé reste dans un champ privé et n'apparaît jamais dans
 * une erreur, un export ni un journal.
 */

import { resolveModel } from "./canon";
import {
  callOpenAiCompatible,
  toOpenAiBody,
  type FetchLike,
  type ModelChoice,
} from "./http";
import type { LlmGateway, LlmRequest, LlmResponse } from "../types";

/** Adresse par défaut d'un fournisseur OpenAI-compatible. */
export const DEFAULT_KEY_BASE_URL = "https://api.openai.com/v1";

export type KeyGatewayOptions = {
  apiKey: string;
  /** Racine de l'API, sans `/chat/completions`. */
  baseUrl?: string;
  models?: ModelChoice;
  headers?: Record<string, string>;
  fetchImpl?: FetchLike;
};

/** Ce qu'un export peut contenir : ni clé, ni compteur (CAR-P-22). */
export type KeyExport = {
  mode: "key";
  baseUrl: string;
  models: Record<string, string>;
};

export class KeyGateway implements LlmGateway {
  readonly mode = "key" as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly models: ModelChoice | undefined;
  private readonly headers: Record<string, string> | undefined;
  private readonly fetchImpl: FetchLike | undefined;

  constructor(options: KeyGatewayOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? DEFAULT_KEY_BASE_URL;
    this.models = options.models;
    this.headers = options.headers;
    this.fetchImpl = options.fetchImpl;
  }

  /** Un appel au fournisseur avec la clé de l'utilisateur. */
  async call(request: LlmRequest, signal: AbortSignal): Promise<LlmResponse> {
    const model = resolveModel(request, this.models);
    return callOpenAiCompatible({
      url: `${this.baseUrl}/chat/completions`,
      body: toOpenAiBody(request, { model }),
      apiKey: this.apiKey,
      headers: this.headers,
      signal,
      fetchImpl: this.fetchImpl,
    });
  }

  /** Export sans secret. */
  exportState(): KeyExport {
    return {
      mode: this.mode,
      baseUrl: this.baseUrl,
      models: { ...this.models },
    };
  }
}
