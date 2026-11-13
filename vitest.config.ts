import { defineConfig } from "vitest/config";

/**
 * Configuration unique pour tout le monorepo : les paquets purs (`lang`,
 * `model`, `agent`) et le site partagent le même lanceur. Aucune étape de
 * build n'est nécessaire : les imports entre paquets passent par les
 * `exports` de chaque package.json, qui pointent vers les sources TS.
 *
 * `CARDWAKE_PROP_RUNS` borne le nombre de tirages fast-check : la CI reste
 * sous les 5 minutes avec peu de tirages, le passage complet (10 000) se
 * lance en local ou dans le job de nuit.
 */
export default defineConfig({
  test: {
    include: [
      "packages/*/test/**/*.test.ts",
      "apps/*/test/**/*.test.ts",
      "evals/**/*.test.ts",
      // Le banc de mesure vit sous `scripts/` : son test vérifie la forme des
      // mesures, pas les durées (voir `scripts/bench/bench.test.ts`).
      "scripts/bench/**/*.test.ts",
    ],
    environment: "node",
    pool: "threads",
    testTimeout: 20_000,
    hookTimeout: 20_000,
    reporters: process.env.CI ? ["basic"] : ["default"],
  },
});
