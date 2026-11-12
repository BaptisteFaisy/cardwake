/**
 * Passerelle vers un relais **local** : le relais détient la clé, le client
 * n'a qu'une URL. C'est le mode « relais » du cahier des charges (7.11).
 *
 * Deux états-merveilles, pour que l'appelant décide proprement :
 * - `RelayLimitReached` : le relais a atteint son plafond du jour → on peut
 *   retomber sur le mode enregistré ;
 * - `RelayUnreachable` : le relais ne répond pas (le site public ne peut pas
 *   joindre `127.0.0.1`) → même repli.
 */

import type { LlmGateway, LlmRequest, LlmResponse } from "../types";
import { callOpenAiCompatible, toOpenAiBody, type FetchLike } from "./http";

/** Adresse du relais lancé sur le poste (`npm run relay`). */
export const LOCAL_RELAY_BASE_URL = "http://127.0.0.1:8787/v1";

/** Le relais a atteint son plafond : le repli sur l'enregistrement est possible. */
export class RelayLimitReached extends Error {
  constructor(readonly detail = "the relay reached its daily limit") {
    super(detail);
    this.name = "RelayLimitReached";
  }
}

/** Le relais ne répond pas : le repli sur l'enregistrement est possible. */
export class RelayUnreachable extends Error {
  constructor(readonly detail = "the relay is not reachable") {
    super(detail);
    this.name = "RelayUnreachable";
  }
}

export type LocalRelayOptions = {
  /** Base du relais, se terminant par `/v1`. */
  baseUrl?: string;
  /**
   * Modèle demandé au relais. Par défaut `combo/cheap` : le relais ne parle
   * qu'aux modèles de sa liste fermée, et un nom de modèle inconnu de la part
   * du client serait refusé par le fournisseur.
   */
  model?: string;
  /** `fetch` injectable : les tests n'ouvrent jamais de connexion. */
  fetchImpl?: FetchLike;
};

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

/** La passerelle locale : elle relaie la requête, la clé reste au relais. */
export function createLocalRelayGateway(options: LocalRelayOptions = {}): LlmGateway {
  const baseUrl = options.baseUrl ?? LOCAL_RELAY_BASE_URL;
  return {
    mode: "relay",
    async call(request: LlmRequest, signal: AbortSignal): Promise<LlmResponse> {
      const body = toOpenAiBody(request, { model: options.model ?? "combo/cheap" });
      try {
        return await callOpenAiCompatible({
          url: joinUrl(baseUrl, "/chat/completions"),
          body,
          signal,
          fetchImpl: options.fetchImpl,
        });
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        if (text.includes("429")) throw new RelayLimitReached(text);
        throw new RelayUnreachable(text);
      }
    },
  };
}

/** Interroge `GET /config` du relais : la démo sait ainsi s'il peut parler. */
export async function probeRelayClient(
  baseUrl: string,
  fetchImpl?: FetchLike,
  timeoutMs = 1500,
): Promise<{ available: boolean; models: string[]; reason?: string }> {
  const doFetch: FetchLike = fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await doFetch(joinUrl(baseUrl.replace(/\/v1$/, ""), "/config"), {
      method: "GET",
      headers: {},
      body: "",
      signal: controller.signal,
    });
    if (response.status !== 200) {
      return { available: false, models: [], reason: `the relay answered ${response.status}` };
    }
    const json = JSON.parse(await response.text()) as { models?: string[] };
    return { available: true, models: json.models ?? [] };
  } catch (error) {
    return { available: false, models: [], reason: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}
