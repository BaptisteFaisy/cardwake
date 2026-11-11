/**
 * Le choix de la passerelle selon les réglages (7.11).
 *
 * Le mode enregistré est le repli par défaut : sans clé, sans relais, ou dès
 * qu'un garde-fou du relais bloque, on retombe sur la cassette. Quand aucune
 * cassette ne répond, `CassetteMiss` remonte avec son message lisible en
 * anglais : « No recording for this situation. Add an API key to go further. »
 */

import type { CassetteEntry } from "@cardwake/model";
import { CassetteGateway } from "./cassette";
import type { FetchLike, ModelChoice } from "./http";
import { KeyGateway } from "./key";
import { RelayGateway } from "./relay";
import type { RelayLimits } from "./relay";
import { CassetteMiss } from "../types";
import type { LlmGateway, LlmRequest, LlmResponse } from "../types";

export type GatewayMode = "cassette" | "key" | "relay";

export type RouterSettings = {
  /** Défaut : mode enregistré. */
  mode?: GatewayMode;
  apiKey?: string;
  baseUrl?: string;
  models?: ModelChoice;
  relayLimits?: Partial<RelayLimits>;
  allowedModels?: readonly string[];
  headers?: Record<string, string>;
  fetchImpl?: FetchLike;
  now?: () => number;
};

/** Ce qu'on peut exporter : ni clé, ni compteur de session (CAR-P-22). */
export type RouterExport = { mode: GatewayMode; cassette: CassetteEntry[] };

/** Construit la passerelle primaire ; sans clé, c'est la cassette. */
function buildPrimary(
  mode: GatewayMode,
  settings: RouterSettings,
  cassette: CassetteGateway,
): LlmGateway {
  if (mode === "cassette" || !settings.apiKey) return cassette;
  const shared = {
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    models: settings.models,
    headers: settings.headers,
    fetchImpl: settings.fetchImpl,
  };
  if (mode === "key") return new KeyGateway(shared);
  return new RelayGateway({
    ...shared,
    limits: settings.relayLimits,
    allowedModels: settings.allowedModels,
    now: settings.now,
  });
}

export class GatewayRouter implements LlmGateway {
  readonly mode: GatewayMode;

  readonly cassette: CassetteGateway;

  private readonly primary: LlmGateway;

  constructor(
    settings: RouterSettings = {},
    cassette: CassetteGateway = new CassetteGateway(),
    primary?: LlmGateway,
  ) {
    this.mode = settings.mode ?? "cassette";
    this.cassette = cassette;
    this.primary = primary ?? buildPrimary(this.mode, settings, cassette);
  }

  /** Vrai quand la cassette répond directement (réglage par défaut). */
  get usesCassetteOnly(): boolean {
    return this.primary === this.cassette;
  }

  /** Un appel : passerelle primaire, puis repli cassette si besoin. */
  async call(request: LlmRequest, signal: AbortSignal): Promise<LlmResponse> {
    if (this.primary === this.cassette) return this.cassette.call(request, signal);
    try {
      return await this.primary.call(request, signal);
    } catch (error) {
      if (error instanceof CassetteMiss) return this.cassette.call(request, signal);
      throw error;
    }
  }

  /** Export sans secret et sans compteur (CAR-P-22). */
  exportState(): RouterExport {
    return { mode: this.mode, cassette: this.cassette.entries() };
  }
}

/** Raccourci : un routeur et sa cassette, bâtis à partir d'enregistrements. */
export function createRouter(
  settings: RouterSettings = {},
  entries: readonly CassetteEntry[] = [],
): GatewayRouter {
  return new GatewayRouter(settings, new CassetteGateway({ entries }));
}
