/**
 * La passerelle du relais local, côté navigateur (7.11).
 *
 * Le navigateur ne détient **aucune clé** : il appelle un relais de la
 * machine locale, et c'est le relais qui détient la clé et parle au
 * fournisseur. Le site envoie la même requête OpenAI qu'il enverrait à un
 * fournisseur — sans en-tête d'authentification, sans secret dans le
 * navigateur (CAR-N-09, CAR-P-22).
 *
 * Le relais expose `POST {baseUrl}/v1/chat/completions` ; sa configuration
 * se lit sur `GET {baseUrl}/config` (voir `relay-probe`).
 *
 * Trois échecs sont distingués, pour que l'avis lisible dise la vérité :
 * le relais est **injoignable**, il a atteint son **plafond**, ou il a
 * **refusé** la requête.
 */

import { GatewayError, callOpenAiCompatible, toOpenAiBody } from "@cardwake/agent";
import type { FetchLike, LlmGateway, LlmRequest, LlmResponse } from "@cardwake/agent";

/** Pourquoi le relais n'a pas pu servir la requête. */
export type RelayFailure = "unreachable" | "limit" | "refused";

/** La passerelle du relais : une `LlmGateway` qui sait dire comment elle a échoué. */
export type RelayGateway = LlmGateway & {
  readonly mode: "relay";
  /** L'adresse du relais, sans barre oblique finale. */
  readonly baseUrl: string;
  /** La dernière cause d'échec ; `null` quand le dernier appel a réussi. */
  readonly lastFailure: RelayFailure | null;
};

/** Les options de la passerelle du relais. */
export type RelayGatewayOptions = {
  /** L'adresse du relais, sans barre oblique finale. */
  baseUrl: string;
  /** Le `fetch` injectable : les tests n'ouvrent jamais de connexion. */
  fetchImpl?: FetchLike;
};

/**
 * La cause d'échec d'une erreur de passerelle : réseau, plafond, refus.
 *
 * Le relais répond 502 quand le fournisseur, lui, est injoignable : pour le
 * visiteur, le relais ne répond pas non plus, donc c'est « injoignable ».
 * 503 et 504 disent la même chose (service indisponible, délai dépassé).
 * 429 est le plafond du relais (session ou journée), 403 est un refus
 * (modèle non autorisé) ; tout autre statut est un refus aussi.
 */
export function failureOf(error: unknown): RelayFailure {
  if (error instanceof GatewayError) {
    if (error.status === 429) return "limit";
    if (error.status === 502 || error.status === 503 || error.status === 504) {
      return "unreachable";
    }
    if (error.status !== undefined) return "refused";
  }
  return "unreachable";
}

/** La cause d'échec d'une passerelle, si elle en a une (`null` sinon). */
export function relayFailureOf(gateway: LlmGateway): RelayFailure | null {
  const candidate = gateway as Partial<RelayGateway>;
  if (candidate.mode !== "relay") return null;
  return candidate.lastFailure ?? null;
}

/**
 * La passerelle du relais : un appel OpenAI sans clé, vers la machine
 * locale. Elle retient sa dernière cause d'échec, pour que le pont puisse
 * dire au visiteur ce qui s'est passé.
 */
export function createRelayGateway(options: RelayGatewayOptions): RelayGateway {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  let lastFailure: RelayFailure | null = null;
  return {
    mode: "relay",
    baseUrl,
    get lastFailure(): RelayFailure | null {
      return lastFailure;
    },
    async call(request: LlmRequest, signal: AbortSignal): Promise<LlmResponse> {
      try {
        const response = await callOpenAiCompatible({
          url: `${baseUrl}/v1/chat/completions`,
          body: toOpenAiBody(request),
          signal,
          ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
        });
        lastFailure = null;
        return response;
      } catch (error) {
        lastFailure = failureOf(error);
        throw error;
      }
    },
  };
}
