/**
 * File des tours d'agent (cahier des charges 7.5).
 *
 * Un seul tour s'exécute à la fois dans une pile, dans l'ordre d'arrivée. La
 * file borne ce qui attend ; au-delà de `agentQueueLength`, `push` refuse, et
 * c'est l'appelant qui journalise le refus. Le refus est un booléen, pas une
 * exception : une file pleine est un cas normal, pas une panne.
 */

export type QueuedTurn = {
  cardId: number;
  trigger: "consult" | "tell" | "chat" | "message";
  text: string;
  sender: string;
  hops: number;
};

export class TurnQueue {
  private readonly max: number;
  private readonly pending: QueuedTurn[] = [];

  constructor(maxLength: number) {
    this.max = Number.isFinite(maxLength) ? Math.max(0, Math.trunc(maxLength)) : 0;
  }

  /** Met un tour en attente ; `false` si la file est pleine. */
  push(turn: QueuedTurn): boolean {
    if (this.pending.length >= this.max) return false;
    this.pending.push(turn);
    return true;
  }

  /** Retire le plus ancien tour, ou `undefined` si la file est vide. */
  shift(): QueuedTurn | undefined {
    return this.pending.shift();
  }

  get size(): number {
    return this.pending.length;
  }

  /** Vide la file : nouvelle session, ou arrêt de la pile. */
  clear(): void {
    this.pending.length = 0;
  }
}
