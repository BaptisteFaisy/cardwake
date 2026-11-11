/**
 * Budgets d'un agent de carte (cahier des charges 7.5 et 7.6, CAR-P-15).
 *
 * Deux compteurs distincts, jamais confondus :
 * - `SessionBudgetTracker` : tours et jetons d'entrée par session **et par
 *   pile**. À l'épuisement, les agents s'endorment et les scripts continuent.
 * - `ActionBudgetTracker` : sauts et tours d'agent par **action humaine**. Une
 *   chaîne de bavardage entre agents s'arrête donc toujours.
 *
 * Règle tenue ici (CAR-P-15) : une fois un compteur épuisé, `verdict()` refuse,
 * et **aucun compteur ne bouge plus**. On ne consomme jamais ce qu'on n'a pas.
 */

import type { StackSettings } from "@cardwake/model";
import type { ActionBudget, BudgetVerdict, SessionBudget } from "./types";

/** Un compteur borné : ce qui reste, ce qui était accordé, et si c'est fini. */
type Counter = { used: number; max: number };

/** Compteur neuf, borné par le réglage ; une valeur absurde vaut zéro. */
function counter(max: number): Counter {
  return { used: 0, max: Math.max(0, Math.trunc(max)) };
}

/** Un compteur a-t-il encore de la place ? */
function hasRoom(value: Counter): boolean {
  return value.used < value.max;
}

/**
 * Consomme une unité si la place existe. Rend `true` si l'appel est accepté ;
 * sinon le compteur reste intact — on ne paie pas un tour qu'on refuse.
 */
function take(value: Counter): boolean {
  if (!hasRoom(value)) return false;
  value.used += 1;
  return true;
}

/**
 * Verdict d'une consommation : `{ ok: true }` veut dire « ce tour est
 * accordé ». Un appelant qui reçoit `ok` exécute le tour ; s'il reçoit un
 * refus, il n'a rien dépensé. Le budget peut être épuisé *par* ce tour : c'est
 * `verdict()` qui le dira au suivant.
 */
const GRANTED: BudgetVerdict = { ok: true };

export class SessionBudgetTracker {
  private readonly turns: Counter;
  private readonly tokens: Counter;

  constructor(settings: StackSettings) {
    this.turns = counter(settings.agentTurnsPerSession);
    this.tokens = counter(settings.agentInputTokensPerSession);
  }

  /** Ce qui empêche encore un tour, ou `{ ok: true }`. */
  verdict(): BudgetVerdict {
    if (!hasRoom(this.turns)) return { ok: false, reason: "turns-session" };
    if (!hasRoom(this.tokens)) return { ok: false, reason: "tokens-session" };
    return { ok: true };
  }

  /** Prend un tour d'agent, si les deux budgets le permettent encore. */
  consumeTurn(): BudgetVerdict {
    const before = this.verdict();
    if (!before.ok) return before;
    take(this.turns);
    return GRANTED;
  }

  /** Ajoute les jetons d'entrée d'un appel ; plafonné au réglage. */
  addInputTokens(n: number): void {
    const added = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
    this.tokens.used = Math.min(this.tokens.max, this.tokens.used + added);
  }

  /** Copie des compteurs, pour la jauge et le journal. */
  snapshot(): SessionBudget {
    return {
      turnsUsed: this.turns.used,
      turnsMax: this.turns.max,
      inputTokensUsed: this.tokens.used,
      inputTokensMax: this.tokens.max,
    };
  }
}

export class ActionBudgetTracker {
  private readonly hops: Counter;
  private readonly turns: Counter;

  constructor(settings: StackSettings) {
    this.hops = counter(settings.hopBudget);
    this.turns = counter(settings.agentTurnsPerAction);
  }

  verdict(): BudgetVerdict {
    if (!hasRoom(this.hops)) return { ok: false, reason: "hops" };
    if (!hasRoom(this.turns)) return { ok: false, reason: "turns-action" };
    return { ok: true };
  }

  /** Un saut : le message réveille un agent, ou il est remis aux scripts seuls. */
  consumeHop(): BudgetVerdict {
    const before = this.verdict();
    if (!before.ok) return before;
    take(this.hops);
    return GRANTED;
  }

  /** Un tour d'agent consommé par cette action humaine. */
  consumeTurn(): BudgetVerdict {
    const before = this.verdict();
    if (!before.ok) return before;
    take(this.turns);
    return GRANTED;
  }

  /** Ce qui reste de cette action, pour la jauge. */
  snapshot(): ActionBudget {
    return { hopsLeft: this.hops.max - this.hops.used, turnsLeft: this.turns.max - this.turns.used };
  }
}
