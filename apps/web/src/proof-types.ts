/**
 * Le type des verdicts de preuve, partagé par les démos (`proofs.ts`) et les
 * contrôles par feature (`proof-live.ts`) — un seul type, une seule fabrique :
 * la preuve par feature a une seule forme, quel que soit le scénario.
 */

/** Le verdict d'une feature, recalculé dans le navigateur. */
export type FeatureVerdict = {
  /** Identifiant de la feature (`FR-01`…). */
  featureId: string;
  /** Le verdict tient-il ? `false` = la preuve a échoué, à dire honnêtement. */
  ok: boolean;
  /** Les lignes de résultat, en anglais, à afficher telles quelles. */
  lines: string[];
};

/** Fabrique de verdict : la seule façon de produire un verdict dans le site. */
export function verdict(featureId: string, ok: boolean, lines: string[]): FeatureVerdict {
  return { featureId, ok, lines };
}
