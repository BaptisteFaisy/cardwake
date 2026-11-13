/**
 * Les fixtures partagées des tests du site : la pile du manoir, une horloge
 * contrôlée, et le moyen d'attendre qu'une action asynchrone soit finie.
 *
 * Un seul exemplaire pour tous les fichiers de test : deux copies
 * divergeraient, et c'est là que les tests mentent.
 */
import { parseStackFile } from "@cardwake/model";
import type { Stack } from "@cardwake/model";
import type { LlmGateway } from "@cardwake/agent";
import manorRaw from "../../../stacks/manor/stack.json";
import { createModelEngine } from "../src/engine/model-engine";
import type { ModelEngineApi } from "../src/engine/model-engine";
import type { EngineEvent } from "../src/engine/types";
import type { StorageLike } from "../src/data/storage";

/** La pile du manoir, validée par le schéma comme le fait le site. */
export function demoStack(): Stack {
  const parsed = parseStackFile(JSON.stringify(manorRaw));
  if (!parsed.ok) throw new Error(`manor stack refused: ${parsed.errors.join(", ")}`);
  return parsed.stack;
}

/** Un stockage en mémoire : le navigateur tel que la persistance le voit. */
export type MemoryStorage = StorageLike & { entries: Map<string, string> };

/** Le stockage d'un appareil qui répond : un `Map`, ni plus ni moins. */
export function memoryStorage(seed: Record<string, string> = {}): MemoryStorage {
  const entries = new Map<string, string>(Object.entries(seed));
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
}

/** L'erreur d'un navigateur en navigation privée : elle porte son nom. */
export function namedError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

/**
 * Un stockage qui refuse tout : navigation privée, quota atteint, cookies
 * bloqués. C'est ce que le site doit dire, pas ce devant quoi il tombe.
 */
export function refusingStorage(name = "QuotaExceededError"): StorageLike {
  const refuse = (): never => {
    throw namedError(name);
  };
  return { getItem: refuse, setItem: refuse, removeItem: refuse };
}

/** Horloge contrôlée : chaque appel avance d'une seconde fictive. */
export function fakeClock(): { clock: () => string; now: () => string } {
  let ticks = 0;
  return {
    clock: () => `2026-11-11T12:00:${String(ticks++).padStart(2, "0")}Z`,
    now: () => `2026-11-11T12:00:${String(Math.max(0, ticks - 1)).padStart(2, "0")}Z`,
  };
}

/** Ce qu'un moteur de test rend : le moteur, ses événements, son horloge. */
export type TestEngine = {
  engine: ModelEngineApi;
  events: EngineEvent[];
  clock: () => string;
  now: () => string;
};

/** Les options du moteur de test : une passerelle scriptée, pour les refus. */
export type TestEngineOptions = {
  /** La passerelle des tours d'agent ; par défaut, la cassette du manoir. */
  gatewayOf?: (stack: Stack) => LlmGateway | null;
  /** La cassette de repli, jouée quand le relais ne répond pas. */
  fallbackOf?: (stack: Stack) => LlmGateway | null;
  /** Le relais était-il attendu pour ce tour ? */
  relayExpected?: (stack: Stack) => boolean;
};

/** Un moteur réel, branché sur une pile, avec les événements collectés. */
export function makeEngine(stack?: Stack, options: TestEngineOptions = {}): TestEngine {
  const { clock, now } = fakeClock();
  const engine = createModelEngine({ clock, seed: 42, ...options });
  const events: EngineEvent[] = [];
  engine.subscribe((event) => events.push(event));
  if (stack) engine.openStack(stack);
  return { engine, events, clock, now };
}

/**
 * Attend la fin d'une action asynchrone : le moteur émet `changed` quand le
 * dispatch est réglé. À appeler AVANT l'action. L'implémentation vit dans le
 * moteur (`model-engine`), partagée avec les preuves du site.
 */
export { settled } from "../src/engine/model-engine";

/** Le texte courant d'un champ, lu dans la pile (fond ou carte). */
export function textOf(stack: Stack, cardId: number, partId: number): string {
  const card = stack.cards.find((item) => item.id === cardId);
  if (!card) throw new Error("no such card");
  const own = card.parts.find((part) => part.id === partId);
  if (own && own.kind === "field") return own.text;
  return card.content[String(partId)] ?? "";
}

/** Le script d'un élément de la carte, lu dans la pile (les éléments de la carte). */
export function scriptOf(stack: Stack, cardId: number, partId: number): string {
  const card = stack.cards.find((item) => item.id === cardId);
  return card?.parts.find((part) => part.id === partId)?.script ?? "";
}
