/**
 * Le journal : transactions, annulation, rétablissement (7.9).
 *
 * Tout traitement — action humaine, exécution de script, tour d'agent — est une
 * transaction : une liste d'opérations, qui l'a faite, pourquoi, avec quelle
 * graine et à quelle heure. Annuler porte sur une transaction entière, donc un
 * tour d'agent s'annule d'un geste. Une transaction interrompue ne laisse
 * aucune trace (CAR-P-07).
 */

import type { Op, OpTarget, Stack, TokenUsage, Transaction, TransactionActor } from "./types";
import { APP_LIMITS } from "./limits";
import { applyOps, invertOps } from "./ops";

type Pending = { actor: TransactionActor; cause: string; seed: number; ops: Op[] };

/**
 * Les transactions s'empilent : un script qui consulte un agent ouvre un tour
 * d'agent **à l'intérieur** de sa propre transaction. Chacune reste annulable
 * d'un geste, et l'annulation se fait dans l'ordre inverse de la validation.
 */

/** Une ligne lisible par opération, pour le panneau du journal et son export. */
export function describeOp(op: Op): string {
  switch (op.kind) {
    case "setText":
      return `write into part ${op.partId} of card ${op.cardId}: "${clip(op.before)}" becomes "${clip(op.after)}"`;
    case "setProp":
      return `set ${op.prop} of ${describeTarget(op.target)} to "${clip(op.after)}"`;
    case "setScript":
      return `replace the script of ${describeTarget(op.target)}`;
    case "createPart":
      return `create ${op.part.kind} "${op.part.name}"`;
    case "deletePart":
      return `delete ${op.part.kind} "${op.part.name}"`;
    case "createCard":
      return `create card "${op.card.name}"`;
    case "deleteCard":
      return `delete card "${op.card.name}"`;
    case "moveCard":
      return `move card ${op.cardId} from rank ${op.from + 1} to rank ${op.to + 1}`;
    case "navigate":
      return `show card ${op.after ?? "(none)"}`;
    case "createBackground":
      return `create background "${op.background.name}"`;
    case "deleteBackground":
      return `delete background "${op.background.name}"`;
    case "setAgent":
      return op.after ? `set the agent of card ${op.cardId} to level ${op.after.level}` : `remove the agent of card ${op.cardId}`;
    case "setStackProp":
      return `set the stack ${op.prop} to "${clip(op.after)}"`;
    case "setSettings":
      return "change the stack settings";
  }
}

function clip(text: string): string {
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

function describeTarget(target: OpTarget): string {
  if (target.kind === "part") return `part ${target.partId} of card ${target.cardId}`;
  if (target.kind === "card") return `card ${target.cardId}`;
  if (target.kind === "background") return `background ${target.backgroundId}`;
  return "the stack";
}

export function describeActor(actor: TransactionActor): string {
  if (actor.kind === "human") return actor.mode === "author" ? "you (building)" : "you (playing)";
  if (actor.kind === "script") return `a script (object ${actor.objectId})`;
  return `the agent of card ${actor.cardId} (level ${actor.level})`;
}

export class Journal {
  private history: Transaction[] = [];
  private undone: Transaction[] = [];
  private pending: Pending[] = [];
  private nextId = 1;
  private snapshot: { stack: Stack; uptoTransactionId: number } | null = null;
  private readonly historyLength: number;

  constructor(opts?: { historyLength?: number }) {
    this.historyLength = opts?.historyLength ?? APP_LIMITS.historyLength;
  }

  get length(): number {
    return this.history.length;
  }

  /** Ouvre une transaction, éventuellement à l'intérieur d'une autre. */
  begin(actor: TransactionActor, cause: string, seed: number): void {
    this.pending.push({ actor, cause, seed, ops: [] });
  }

  record(op: Op): void {
    const top = this.pending[this.pending.length - 1];
    if (!top) throw new Error("record() outside a transaction: call begin() first");
    top.ops.push(op);
  }

  /**
   * Fige la transaction. Une transaction sans opération n'entre pas dans
   * l'historique : un clic qui ne change rien ne doit pas pouvoir être annulé.
   */
  commit(stack: Stack, clock: string, usage?: TokenUsage): Transaction {
    const pending = this.pending.pop() ?? null;
    const empty: Transaction = {
      id: this.nextId,
      actor: pending?.actor ?? { kind: "human", mode: "browse" },
      cause: pending?.cause ?? "",
      ops: [],
      seed: pending?.seed ?? 0,
      clock,
    };
    if (!pending || pending.ops.length === 0) return empty;
    const transaction: Transaction = {
      id: this.nextId++,
      actor: pending.actor,
      cause: pending.cause,
      ops: pending.ops,
      seed: pending.seed,
      clock,
      ...(usage ? { usage } : {}),
    };
    this.history.push(transaction);
    this.undone = [];
    this.foldOldTransactions(stack);
    return transaction;
  }

  /** Jette la transaction en cours : aucune trace (CAR-P-07). */
  abort(): void {
    this.pending.pop();
  }

  /** Nombre de transactions ouvertes : 0 au repos, 2 pendant un `consult`. */
  get depth(): number {
    return this.pending.length;
  }

  entries(): Transaction[] {
    return [...this.history].reverse();
  }

  byActor(kind: TransactionActor["kind"]): Transaction[] {
    return this.entries().filter((transaction) => transaction.actor.kind === kind);
  }

  /** Annule la dernière transaction : rend la pile restaurée. */
  undo(stack: Stack): { stack: Stack; transaction: Transaction } | null {
    const transaction = this.history.pop();
    if (!transaction) return null;
    const restored = applyOps(stack, invertOps(stack, transaction.ops));
    this.undone.push(transaction);
    return { stack: restored, transaction };
  }

  /** Rétablit la dernière transaction annulée. */
  redo(stack: Stack): { stack: Stack; transaction: Transaction } | null {
    const transaction = this.undone.pop();
    if (!transaction) return null;
    const restored = applyOps(stack, transaction.ops);
    this.history.push(transaction);
    return { stack: restored, transaction };
  }

  /** Au-delà de la longueur d'historique, les plus anciennes fondent dans un instantané. */
  private foldOldTransactions(stack: Stack): void {
    if (this.history.length <= this.historyLength) return;
    const overflow = this.history.splice(0, this.history.length - this.historyLength);
    const last = overflow[overflow.length - 1];
    this.snapshot = { stack, uptoTransactionId: last.id };
  }

  /** L'instantané qui remplace les transactions les plus anciennes. */
  currentSnapshot(): { stack: Stack; uptoTransactionId: number } | null {
    return this.snapshot;
  }

  exportText(): string {
    const lines = this.entries().flatMap((transaction) => [
      `#${transaction.id} ${transaction.clock} — ${describeActor(transaction.actor)} — ${transaction.cause}`,
      ...transaction.ops.map((op) => `    ${describeOp(op)}`),
    ]);
    return lines.length === 0 ? "The journal is empty." : `${lines.join("\n")}\n`;
  }
}
