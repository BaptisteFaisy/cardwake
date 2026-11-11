/**
 * Limites et réglages (cahier des charges 7.1, 7.12).
 *
 * Deux étages, jamais confondus :
 * - `APP_LIMITS` : plafonds de l'application, non négociables. Une pile reçue
 *   ne peut pas s'accorder un million d'étapes.
 * - `DEFAULT_SETTINGS` : valeurs par défaut d'une pile neuve, que l'auteur
 *   peut baisser mais jamais monter au-delà des plafonds.
 */

/** Plafonds de l'application (portée : application entière). */
export const APP_LIMITS = {
  maxCardsPerStack: 500,
  maxPartsPerCard: 100,
  maxFieldChars: 100_000,
  maxScriptChars: 20_000,
  maxStackFileBytes: 5 * 1024 * 1024,
  maxPersonaChars: 2_000,
  maxSteps: 100_000,
  maxMessageDepth: 50,
  maxWaitMs: 5_000,
  historyLength: 200,
  receivedLevelCap: 2,
  agentLevelMin: 1,
  agentLevelMax: 5,
} as const;

/** Réglages d'une pile, avec leur valeur par défaut. */
export const DEFAULT_SETTINGS: StackSettings = {
  maxSteps: 100_000,
  maxMessageDepth: 50,
  maxWaitMs: 5_000,
  hopBudget: 3,
  agentTurnsPerAction: 8,
  agentTurnsPerSession: 60,
  agentInputTokensPerSession: 400_000,
  agentMaxIterations: 6,
  agentMaxOutputTokens: 2_000,
  agentTimeoutMs: 30_000,
  agentQueueLength: 20,
  fieldViewChars: 2_000,
  cardViewChars: 8_000,
  tickSeconds: 0,
};

export type StackSettings = {
  maxSteps: number;
  maxMessageDepth: number;
  maxWaitMs: number;
  /** Sauts accordés par action humaine (7.6). */
  hopBudget: number;
  agentTurnsPerAction: number;
  agentTurnsPerSession: number;
  agentInputTokensPerSession: number;
  agentMaxIterations: number;
  agentMaxOutputTokens: number;
  agentTimeoutMs: number;
  agentQueueLength: number;
  fieldViewChars: number;
  cardViewChars: number;
  /** 0 = `tick` désactivé ; sinon la période en secondes (1 au minimum). */
  tickSeconds: number;
};

/**
 * Recadre des réglages sous les plafonds de l'application. À appeler sur
 * toute pile importée avant usage (CAR-P-13, 7.12).
 */
export function clampSettings(input: Partial<StackSettings> | undefined): StackSettings {
  const merged: StackSettings = { ...DEFAULT_SETTINGS, ...(input ?? {}) };
  const clampInt = (value: number, min: number, max: number): number => {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, Math.trunc(value)));
  };
  return {
    maxSteps: clampInt(merged.maxSteps, 1, APP_LIMITS.maxSteps),
    maxMessageDepth: clampInt(merged.maxMessageDepth, 1, APP_LIMITS.maxMessageDepth),
    maxWaitMs: clampInt(merged.maxWaitMs, 0, APP_LIMITS.maxWaitMs),
    hopBudget: clampInt(merged.hopBudget, 0, 10),
    agentTurnsPerAction: clampInt(merged.agentTurnsPerAction, 0, 64),
    agentTurnsPerSession: clampInt(merged.agentTurnsPerSession, 0, 10_000),
    agentInputTokensPerSession: clampInt(merged.agentInputTokensPerSession, 0, 100_000_000),
    agentMaxIterations: clampInt(merged.agentMaxIterations, 1, 24),
    agentMaxOutputTokens: clampInt(merged.agentMaxOutputTokens, 1, 8_000),
    agentTimeoutMs: clampInt(merged.agentTimeoutMs, 1_000, 120_000),
    agentQueueLength: clampInt(merged.agentQueueLength, 0, 200),
    fieldViewChars: clampInt(merged.fieldViewChars, 0, APP_LIMITS.maxFieldChars),
    cardViewChars: clampInt(merged.cardViewChars, 0, APP_LIMITS.maxFieldChars),
    tickSeconds: clampInt(merged.tickSeconds, 0, 3_600),
  };
}
