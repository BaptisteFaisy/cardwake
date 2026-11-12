/**
 * Le mode d'accès au modèle : la cassette, le relais, ou l'un puis l'autre.
 *
 * Trois modes, et une seule règle de repli :
 * - `recorded` : la cassette de la pile, comme toujours — le défaut, celui qui
 *   marche partout, sans réseau et sans clé (CAR-N-09) ;
 * - `live` : le relais, et la cassette si le relais ne répond pas ;
 * - `auto` : le relais s'il répond, la cassette sinon.
 *
 * Dans les deux derniers modes, **aucune clé n'est demandée ni conservée** :
 * la clé reste sur la machine qui fait tourner le relais. Le navigateur ne
 * connaît qu'une adresse.
 *
 * Les réglages vivent dans ce module (une page = une session) : l'écran des
 * réglages les écrit, le moteur les lit, l'écran des preuves les vise.
 */

import type { LlmGateway } from "@cardwake/agent";
import type { Stack } from "@cardwake/model";
import { cassetteForStack } from "../data/cassettes";
import { createRelayGateway } from "./relay-gateway";
import type { RelayGateway } from "./relay-gateway";
import { DEFAULT_RELAY_BASE_URL, normalizeBaseUrl } from "./relay-probe";
import type { RelayProbeResult } from "./relay-probe";

/** Les trois modes d'accès au modèle. */
export type ModelAccessMode = "recorded" | "live" | "auto";

/** Les réglages d'accès : le mode choisi et l'adresse du relais. */
export type AccessSettings = {
  /** Le mode d'accès choisi par le visiteur. */
  mode: ModelAccessMode;
  /** L'adresse du relais, telle qu'il l'a tapée. */
  baseUrl: string;
};

/** Le plan de passerelle d'un tour : ce qu'on appelle, et ce qu'on garde. */
export type AccessPlan = {
  /** La passerelle principale : le relais, ou la cassette. */
  primary: LlmGateway | null;
  /** La cassette de repli, quand la principale est le relais. */
  fallback: LlmGateway | null;
  /** Le relais était-il attendu pour ce tour ? */
  relayExpected: boolean;
};

let settings: AccessSettings = { mode: "recorded", baseUrl: DEFAULT_RELAY_BASE_URL };
let probe: RelayProbeResult | null = null;
let gateway: RelayGateway | null = null;

/** Les réglages d'accès courants (une copie : personne ne les change en douce). */
export function accessSettings(): AccessSettings {
  return { ...settings };
}

/** Change les réglages d'accès ; une nouvelle adresse reconstruit le relais. */
export function setAccessSettings(next: Partial<AccessSettings>): void {
  settings = { ...settings, ...next };
  gateway = null;
}

/** Le dernier résultat de sonde, ou `null` si la sonde n'a jamais tourné. */
export function accessProbe(): RelayProbeResult | null {
  return probe;
}

/** Note le résultat de la sonde : l'écran des réglages l'appelle. */
export function setAccessProbe(result: RelayProbeResult | null): void {
  probe = result;
}

/** La passerelle du relais, une seule instance par adresse. */
export function relayGatewayOf(baseUrl: string): RelayGateway {
  if (gateway === null || gateway.baseUrl !== baseUrl) {
    gateway = createRelayGateway({ baseUrl });
  }
  return gateway;
}

/** La sonde parle-elle de l'adresse actuellement configurée ? */
function probeMatches(baseUrl: string): boolean {
  if (probe === null) return false;
  return normalizeBaseUrl(probe.baseUrl) === normalizeBaseUrl(baseUrl);
}

/**
 * Le plan de passerelle d'une pile, selon le mode choisi.
 *
 * - `recorded` : la cassette, et rien d'autre à dire ;
 * - `live` : le relais, la cassette en repli ;
 * - `auto` : le relais quand la sonde l'a vu répondre, la cassette sinon.
 */
export function planFor(stack: Stack): AccessPlan {
  const cassette = cassetteForStack(stack);
  if (settings.mode === "recorded") {
    return { primary: cassette, fallback: null, relayExpected: false };
  }
  if (settings.mode === "auto" && probeMatches(settings.baseUrl) && probe?.available === false) {
    return { primary: cassette, fallback: null, relayExpected: true };
  }
  return {
    primary: relayGatewayOf(settings.baseUrl),
    fallback: cassette,
    relayExpected: true,
  };
}
