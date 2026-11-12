/**
 * Écriture du monde pour le pont `ModelHost` (lot C4a).
 *
 * Ce module construit les opérations réversibles (texte, propriété, script,
 * création, suppression, navigation, tri) à partir de l'état courant, sans
 * jamais muter la pile : la validation (`authorizeOp`), la consignation
 * (`journal.record`) et l'application (`applyOp`) restent dans `host.ts`, seul
 * point de passage.
 *
 * Le tri réutilise le découpage de `@cardwake/lang` : aucune seconde
 * implémentation des morceaux de texte.
 */

import type { ChunkType, PropName, ResolvedRef } from "@cardwake/lang";
import { joinChunk, splitChunk } from "@cardwake/lang";
import type { Op, OpTarget, Stack } from "./types";
import { currentInk, currentText } from "./ops";
import { locatePart, type LocatedPart } from "./host-read";

/** Construit un `setText` réversible en lisant l'avant et l'encre courants. */
export function setTextOp(stack: Stack, loc: LocatedPart, after: string, inkAfter: number | null): Op {
  const op: Extract<Op, { kind: "setText" }> = {
    kind: "setText",
    cardId: loc.cardId,
    partId: loc.part.id,
    before: currentText(stack, loc.cardId, loc.part.id),
    after,
    inkBefore: currentInk(stack, loc.cardId, loc.part.id),
    inkAfter,
  };
  if (loc.backgroundId !== undefined) op.backgroundId = loc.backgroundId;
  return op;
}

/** Cible d'une opération de propriété ou de script, depuis une référence résolue. */
export function targetOf(stack: Stack, ref: ResolvedRef): OpTarget | undefined {
  if (ref.kind === "part") {
    const loc = locatePart(stack, ref);
    if (!loc) return undefined;
    const target: Extract<OpTarget, { kind: "part" }> = { kind: "part", cardId: loc.cardId, partId: loc.part.id };
    if (loc.backgroundId !== undefined) target.backgroundId = loc.backgroundId;
    return target;
  }
  if (ref.kind === "card") return { kind: "card", cardId: ref.id };
  if (ref.kind === "background") return { kind: "background", backgroundId: ref.id };
  return { kind: "stack" };
}

/**
 * Trie le texte d'un champ. Les lignes (ou les éléments, séparés par des
 * virgules) sont les unités triées ; `index` désigne la cellule-clé d'une ligne
 * (« label,quantité,prix »), `numeric` compare en nombres, `descending` inverse.
 */
export function sortFieldText(
  text: string,
  chunkType: ChunkType | undefined,
  index: number | undefined,
  numeric: boolean,
  descending: boolean,
): string {
  const type: ChunkType = chunkType === "item" ? "item" : "line";
  const units = splitChunk(text, type);
  const key = (unit: string): string | number => {
    const subject = index === undefined ? unit : unit.split(",")[index - 1] ?? "";
    return numeric ? Number(subject) : subject;
  };
  units.sort((a, b) => {
    const left = key(a);
    const right = key(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  if (descending) units.reverse();
  return joinChunk(units, type);
}

/** Texte à guillemets, ramassé sur une ligne : les traces restent lisibles. */
export function quoted(text: string, limit = 40): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const clipped = flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
  return `"${clipped.replace(/"/g, "'")}"`;
}

/** Nom d'un élément localisé, pour les traces. */
export function partLabel(loc: LocatedPart): string {
  return loc.part.kind === "button" ? "button" : "field";
}

/** Nom d'une propriété, tel qu'il s'écrit dans le langage. */
export function propLabel(prop: PropName): string {
  return prop;
}
