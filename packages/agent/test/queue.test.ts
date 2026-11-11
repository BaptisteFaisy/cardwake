/**
 * File des tours (7.5) : ordre d'arrivée, plafond, refus sans exception.
 */

import { describe, expect, it } from "vitest";
import { TurnQueue } from "../src/queue";
import type { QueuedTurn } from "../src/queue";

function turn(cardId: number, trigger: QueuedTurn["trigger"] = "message"): QueuedTurn {
  return { cardId, trigger, text: `turn ${cardId}`, sender: "human", hops: 3 };
}

describe("TurnQueue", () => {
  it("rend les tours dans l'ordre d'arrivée", () => {
    const queue = new TurnQueue(3);
    queue.push(turn(1, "consult"));
    queue.push(turn(2, "tell"));
    queue.push(turn(3, "chat"));
    expect(queue.size).toBe(3);
    expect(queue.shift()?.cardId).toBe(1);
    expect(queue.shift()?.trigger).toBe("tell");
    expect(queue.shift()?.cardId).toBe(3);
    expect(queue.shift()).toBeUndefined();
  });

  it("refuse au-delà du réglage, et garde les premiers", () => {
    const queue = new TurnQueue(2);
    expect(queue.push(turn(1))).toBe(true);
    expect(queue.push(turn(2))).toBe(true);
    expect(queue.push(turn(3))).toBe(false);
    expect(queue.size).toBe(2);
    expect(queue.shift()?.cardId).toBe(1);
    expect(queue.push(turn(4))).toBe(true);
  });

  it("n'accepte rien avec une longueur nulle", () => {
    const queue = new TurnQueue(0);
    expect(queue.push(turn(1))).toBe(false);
    expect(queue.size).toBe(0);
  });

  it("se vide d'un geste", () => {
    const queue = new TurnQueue(5);
    queue.push(turn(1));
    queue.push(turn(2));
    queue.clear();
    expect(queue.size).toBe(0);
    expect(queue.shift()).toBeUndefined();
  });

  it("garde le tour tel qu'il a été déposé", () => {
    const queue = new TurnQueue(1);
    const depot: QueuedTurn = { cardId: 7, trigger: "message", text: "hi", sender: "Cook", hops: 1 };
    queue.push(depot);
    expect(queue.shift()).toEqual(depot);
  });

  it("traite un plafond absurde comme zéro", () => {
    const queue = new TurnQueue(Number.NaN);
    expect(queue.push(turn(1))).toBe(false);
  });
});
