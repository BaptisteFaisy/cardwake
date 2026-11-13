/**
 * Installation d'un script et retour exact (CAR-P-08, et la promesse de
 * l'atelier : ce que l'auteur accepte est exactement ce qui s'installe, et
 * refuser revient à n'avoir rien fait).
 *
 * `setScript` est la seule opération qui change un script ; elle existe sur
 * quatre cibles (élément, carte, fond, pile). Pour chacune, l'aller-retour
 * `applyOps` puis inverses doit rendre la pile de départ **à l'octet près** —
 * c'est ce qui rend l'annulation et le rejeu gratuits (CAR-P-20).
 */

import { describe, expect, it } from "vitest";
import { serializeStack } from "../src/file";
import { applyOps, invertOps } from "../src/ops";
import type { Op, Stack } from "../src/types";
import { IDS, buildStack } from "./generators-auth";

function stack(): Stack {
  return buildStack({ level: 5, awake: true, provenance: { kind: "created" } });
}

const INSTALLED = 'on mouseUp\n  put "bonjour" into field "Notes"\nend mouseUp\n';

/** Les quatre cibles d'un script installé, avec un contenu d'avant non vide. */
function cases(base: Stack): { label: string; op: Op }[] {
  return [
    {
      label: "script d'un élément",
      op: { kind: "setScript", target: { kind: "part", cardId: IDS.agentCard, partId: IDS.ownField }, before: "", after: INSTALLED },
    },
    {
      label: "script d'une carte",
      op: { kind: "setScript", target: { kind: "card", cardId: IDS.agentCard }, before: "", after: INSTALLED },
    },
    {
      label: "script d'un fond",
      op: { kind: "setScript", target: { kind: "background", backgroundId: IDS.background }, before: "", after: INSTALLED },
    },
    {
      label: "script de la pile",
      op: { kind: "setScript", target: { kind: "stack" }, before: base.script, after: INSTALLED },
    },
  ];
}

describe("script installé — l'inverse rend exactement la pile de départ", () => {
  it("pour les quatre cibles", () => {
    for (const { label, op } of cases(stack())) {
      const before = stack();
      const after = applyOps(before, [op]);
      const back = applyOps(after, invertOps(before, [op]));
      expect(serializeStack(back), `${label} : l'inverse doit rendre la pile de départ`).toBe(serializeStack(before));
      expect(serializeStack(after), `${label} : installer change bien la pile`).not.toBe(serializeStack(before));
    }
  });

  it("et le script installé est bien celui qu'on relit", () => {
    for (const { label, op } of cases(stack())) {
      const after = applyOps(stack(), [op]);
      const installed = readScript(after, op);
      expect(installed, `${label} : le script en place`).toBe(INSTALLED);
    }
  });

  it("s'annule au milieu d'une suite, sans toucher aux autres opérations", () => {
    const before = stack();
    const ops: Op[] = [
      { kind: "setText", cardId: IDS.agentCard, partId: IDS.ownField, before: "", after: "en cours", inkBefore: null, inkAfter: null },
      cases(before)[3].op,
      { kind: "navigate", before: IDS.agentCard, after: IDS.otherCard },
    ];
    const after = applyOps(before, ops);
    const back = applyOps(after, invertOps(before, ops));
    expect(serializeStack(back)).toBe(serializeStack(before));
  });
});

/** Relit le script que l'opération vient d'installer, sur sa cible. */
function readScript(stack: Stack, op: Op): string {
  if (op.kind !== "setScript") return "";
  const target = op.target;
  if (target.kind === "stack") return stack.script;
  if (target.kind === "card") return stack.cards.find((card) => card.id === target.cardId)?.script ?? "";
  if (target.kind === "background") {
    return stack.backgrounds.find((background) => background.id === target.backgroundId)?.script ?? "";
  }
  const own = stack.cards.find((card) => card.id === target.cardId)?.parts.find((part) => part.id === target.partId);
  const shared = stack.backgrounds.flatMap((background) => background.parts).find((part) => part.id === target.partId);
  return (own ?? shared)?.script ?? "";
}
