/**
 * Primitives de mesure du banc : médiane, percentile 95, et le cycle
 * « échauffement puis mesure ».
 *
 * L'horloge est `performance.now()` (monotone, en millisecondes) : le cœur
 * mesuré ne lit jamais `Date.now()` et ne touche jamais au réseau (CAR-N-04).
 * L'échauffement sert à laisser le moteur JavaScript compiler les fonctions
 * chaudes avant de compter, sinon les premiers tours paient la mise en route.
 */

import { performance } from "node:perf_hooks";

/** Médiane d'une liste non vide : le milieu d'une copie triée. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** 95e percentile : la valeur sous laquelle 95 % des tours se trouvent. */
export function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[Math.min(index, sorted.length - 1)];
}

/**
 * Échauffe `warmup` tours, puis laisse `fn` rendre lui-même sa durée sur
 * `rounds` tours mesurés. Sert quand la mesure démarre à un instant précis
 * à l'intérieur du tour (le clic, par exemple), et non autour de lui.
 */
export async function collectRounds(
  rounds: number,
  warmup: number,
  fn: (round: number) => Promise<number>,
): Promise<number[]> {
  for (let index = 0; index < warmup; index += 1) await fn(index);
  const samples: number[] = [];
  for (let index = 0; index < rounds; index += 1) samples.push(await fn(index));
  return samples;
}

/** Échauffe `warmup` tours, puis rend la durée de chacun des `rounds` mesurés. */
export function measureRounds(
  rounds: number,
  warmup: number,
  fn: (round: number) => void | Promise<void>,
): Promise<number[]> {
  return collectRounds(rounds, warmup, async (round) => {
    const start = performance.now();
    await fn(round);
    return performance.now() - start;
  });
}