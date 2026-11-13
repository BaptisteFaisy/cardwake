/**
 * La matrice des droits, exhaustive et dérivée d'une seule table.
 *
 * Pour **chaque** acteur de `rights-table.ts` (deux humains, un script,
 * dix-sept agents — cinq niveaux éveillés, endormis, reçus non fiables, plus
 * deux cas limites) et **chaque** variante d'`Op` ou d'outil de
 * `rights-cases.ts`, on demande le verdict réel puis on le compare à celui que
 * la table dérive. Rien n'est recopié : les verdicts attendus viennent tous de
 * `rights-expected.ts`, qui ne lit que la table.
 *
 * Exigences portées : CAR-F-05 (deux modes), CAR-F-06 (verrou), CAR-F-35
 * (portée), CAR-P-12 (aucune élévation), CAR-P-13 (plafond de 2), CAR-P-17
 * (jeton). Un test qui rougit ici dit soit que le code a changé, soit que la
 * table est fausse — et c'est la table qu'on relit d'abord.
 *
 * Rapide par construction : aucune génération, aucune application d'opération,
 * seulement des appels à `authorizeOp` / `authorize`.
 */

import type { Actor } from "@cardwake/lang";
import { describe, expect, it } from "vitest";
import { acceptanceToken, authorize, authorizeOp, effectiveLevel } from "../src/authorize";
import type { AgentAction, ActorContext } from "../src/authorize";
import type { Stack, Verdict } from "../src/types";
import { IDS, buildStack } from "./generators-auth";
import { actionCases, opCases } from "./rights-cases";
import { expectedAction, expectedOp, type Bench, type Expected } from "./rights-expected";
import { rightsTable, type Rights } from "./rights-table";

/** La pile d'essai d'un profil : mêmes identifiants, autre état (CAR-P-13). */
function stackOf(rights: Rights): Stack {
  return buildStack({
    level: rights.declared ?? 1,
    awake: rights.awake,
    provenance: rights.provenance,
  });
}

/** L'acteur tel que `authorize` le reçoit. */
function actorOf(rights: Rights): Actor {
  if (rights.regime === "browse" || rights.regime === "author") {
    return { kind: "human", mode: rights.regime };
  }
  if (rights.regime === "script") return { kind: "script", objectId: IDS.ownField };
  return { kind: "agent", cardId: rights.cardId, level: rights.claims ?? rights.level ?? 1 };
}

function contextOf(rights: Rights, stack: Stack): ActorContext {
  return { stack, actor: actorOf(rights), cardId: rights.cardId };
}

/** Compare un verdict réel au verdict attendu, avec le cas dans le message. */
function expectVerdict(got: Verdict, expected: Expected, label: string): void {
  if (expected.allow) {
    expect(got.allow, `${label} : attendu allow, reçu ${JSON.stringify(got)}`).toBe(true);
    return;
  }
  expect(got.allow, `${label} : attendu refus « ${expected.rule} », reçu allow`).toBe(false);
  if (!got.allow) expect(got.rule, `${label} : mauvaise règle de refus`).toBe(expected.rule);
}

/** Un jeton neuf par proposition, et seulement pour les acteurs qui en ont un. */
function withToken(rights: Rights, action: AgentAction): AgentAction {
  if (action.kind !== "propose_script" || !rights.token) return action;
  return { ...action, acceptanceToken: acceptanceToken() };
}

describe("matrice des droits — le niveau opposable", () => {
  it("est le plus petit de la carte, de l'annonce et du plafond de réception", () => {
    for (const rights of rightsTable()) {
      if (rights.regime !== "agent") continue;
      const stack = stackOf(rights);
      const card = stack.cards.find((item) => item.id === rights.cardId);
      // Carte absente : il ne reste rien à opposer, donc le niveau 1.
      expect(effectiveLevel(stack, card), `${rights.id} : niveau opposable`).toBe(rights.level);
    }
  });
});

describe("matrice des droits — opérations du journal", () => {
  it("suit la table pour toute variante et toute cible", () => {
    const cases = opCases(buildStack({ level: 3, awake: true, provenance: { kind: "created" } }));
    for (const rights of rightsTable()) {
      const stack = stackOf(rights);
      const bench: Bench = { stack };
      const ctx = contextOf(rights, stack);
      for (const { label, op } of cases) {
        expectVerdict(authorizeOp(ctx, op), expectedOp(rights, bench, op), `${rights.id} — ${label}`);
      }
    }
  });
});

describe("matrice des droits — outils d'agent", () => {
  it("suit la table pour tout outil et toute cible", () => {
    const cases = actionCases();
    for (const rights of rightsTable()) {
      const stack = stackOf(rights);
      const bench: Bench = { stack };
      const ctx = contextOf(rights, stack);
      for (const { label, action } of cases) {
        const called = withToken(rights, action);
        expectVerdict(authorize(ctx, called), expectedAction(rights, bench, action), `${rights.id} — ${label}`);
      }
    }
  });
});

describe("matrice des droits — exhaustivité", () => {
  it("couvre toutes les combinaisons acteur × variante × cible", () => {
    const ops = opCases(buildStack({ level: 1, awake: true, provenance: { kind: "created" } }));
    const actions = actionCases();
    const profiles = rightsTable();
    // Les quatorze variantes d'`Op` sont toutes présentes.
    const kinds = new Set(ops.map(({ op }) => op.kind));
    expect(kinds.size).toBe(14);
    // Et les neuf outils aussi.
    const tools = new Set(actions.map(({ action }) => action.kind));
    expect(tools.size).toBe(9);
    // Vingt acteurs de référence, plus d'un millier de cellules.
    expect(profiles.length).toBeGreaterThanOrEqual(20);
    expect(profiles.length * (ops.length + actions.length)).toBeGreaterThan(1000);
  });

  it("n'a aucun acteur sans régime ni agent sans niveau", () => {
    for (const rights of rightsTable()) {
      if (rights.regime === "agent") expect(rights.level, `${rights.id} : niveau manquant`).not.toBeNull();
      else expect(rights.level, `${rights.id} : un non-agent n'a pas de niveau`).toBeNull();
    }
  });
});
