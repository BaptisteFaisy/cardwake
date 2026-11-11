/**
 * Faux `Host` pour les tests de l'interpréteur : une petite pile en mémoire,
 * une horloge et un générateur à graine fixes, et le journal de tous les effets.
 * Aucune dépendance à `packages/model` : le paquet `lang` reste pur et testable
 * seul (CAR-N-09).
 */

import type { ChunkType, ObjRef, PropName, ScriptError } from "../src/ast";
import type { Actor, ChunkBounds, Determinism, Guards, Host, ResolvedRef, TraceEntry } from "../src/host";
import { runtimeError } from "../src/errors";
import { readChunk, writeChunk } from "../src/chunks";

export type FakeField = { id: number; kind: "field"; name: string; text: string; locked: boolean; visible: boolean; multiline: boolean };
export type FakeButton = { id: number; kind: "button"; name: string; label: string; script: string; visible: boolean; enabled: boolean; hilite: boolean };
export type FakePart = FakeField | FakeButton;
export type FakeCard = { id: number; name: string; parts: FakePart[]; script: string };

export type FakeWorld = {
  cards: FakeCard[];
  currentCardId: number;
  backgrounds: { id: number; name: string }[];
};

export type FakeOptions = {
  seed?: number;
  maxSteps?: number;
  maxWaitMs?: number;
  consultReply?: string;
  askReply?: string;
  now?: { date: string; time: string; longDate: string };
};

/** Générateur à graine (mulberry32) : même graine, même suite (CAR-F-17). */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function field(id: number, name: string, text = "", extra: Partial<FakeField> = {}): FakeField {
  return { id, kind: "field", name, text, locked: false, visible: true, multiline: false, ...extra };
}

export function button(id: number, name: string, script = "", extra: Partial<FakeButton> = {}): FakeButton {
  return { id, kind: "button", name, label: name, script, visible: true, enabled: true, hilite: false, ...extra };
}

export class FakeHost implements Host {
  readonly actor: Actor = { kind: "script", objectId: 1 };
  readonly guards: Guards;
  readonly determinism: Determinism;
  readonly trace: TraceEntry[] = [];
  readonly messages: { name: string; args: string[]; to: string }[] = [];
  readonly passed: string[] = [];
  readonly told: { to: string; text: string }[] = [];
  readonly answers: string[] = [];
  readonly found: string[] = [];
  deleted: string[] = [];
  created: string[] = [];
  waits: number[] = [];
  private steps = 0;
  private readonly random: () => number;
  private readonly clock: { date: string; time: string; longDate: string; epochMs: number };
  private readonly consultReply: string;
  private readonly askReply: string;

  constructor(readonly world: FakeWorld, opts: FakeOptions = {}) {
    const seed = opts.seed ?? 7;
    this.random = seededRandom(seed);
    this.guards = {
      maxSteps: opts.maxSteps ?? 100_000,
      maxMessageDepth: 50,
      maxWaitMs: opts.maxWaitMs ?? 5_000,
      maxTextChars: 100_000,
    };
    this.clock = {
      date: opts.now?.date ?? "11/11/26",
      time: opts.now?.time ?? "19:45",
      longDate: opts.now?.longDate ?? "Wednesday, November 11, 2026",
      epochMs: 0,
    };
    this.determinism = { random: () => this.random(), now: () => this.clock, seed };
    this.consultReply = opts.consultReply ?? "Where did you get that?";
    this.askReply = opts.askReply ?? "typed";
  }

  stepsUsed(): number {
    return this.steps;
  }

  private log(text: string): void {
    this.steps += 1;
    this.trace.push({ step: this.steps, line: 0, text });
  }

  private card(id: number): FakeCard | undefined {
    return this.world.cards.find((item) => item.id === id);
  }

  private partOf(ref: ResolvedRef): { part: FakePart; card: FakeCard } | undefined {
    if (ref.kind !== "part") return undefined;
    const card = this.card(ref.cardId);
    const part = card?.parts.find((item) => item.id === ref.id);
    return card && part ? { part, card } : undefined;
  }

  resolve(ref: ObjRef): ResolvedRef | ScriptError {
    const currentId = ref.kind === "part" && ref.ref.of ? this.cardIdOf(ref.ref.of) : this.world.currentCardId;
    if (ref.kind === "me" || ref.kind === "target") {
      return { kind: "part", id: 1, partKind: "button", cardId: currentId };
    }
    if (ref.kind === "thisStack") return { kind: "stack" };
    if (ref.kind === "thisBackground") return { kind: "background", id: this.world.backgrounds[0]?.id ?? 0 };
    if (ref.kind === "agent") {
      const cardId = ref.ref.of ? this.cardIdOf(ref.ref.of) : currentId;
      return { kind: "agent", cardId };
    }
    if (ref.kind === "card") return { kind: "card", id: this.cardIdOf(ref.ref) };
    const part = this.findPart(currentId, ref.ref.partKind, ref.ref.by);
    if (!part) return runtimeError(`There is no ${ref.ref.partKind} by that name here.`, undefined, undefined, ref.ref.partKind);
    return { kind: "part", id: part.id, partKind: part.kind, cardId: currentId };
  }

  private cardIdOf(ref: { kind: string; by?: { kind: string; name?: string; index?: unknown; id?: unknown } }): number {
    const cards = this.world.cards;
    if (ref.kind === "this") return this.world.currentCardId;
    if (ref.kind === "next") return cards[(cards.findIndex((c) => c.id === this.world.currentCardId) + 1) % cards.length]?.id ?? 0;
    if (ref.kind === "previous") {
      const index = cards.findIndex((c) => c.id === this.world.currentCardId);
      return cards[(index - 1 + cards.length) % cards.length]?.id ?? 0;
    }
    if (ref.kind === "first") return cards[0]?.id ?? 0;
    if (ref.kind === "last") return cards[cards.length - 1]?.id ?? 0;
    const by = ref.by;
    if (!by) return 0;
    if (by.kind === "name") return cards.find((c) => c.name.toLowerCase() === String(by.name).toLowerCase())?.id ?? 0;
    if (by.kind === "id") return cards.find((c) => c.id === Number((by.id as { value?: number })?.value ?? by.id))?.id ?? 0;
    const index = Number((by.index as { value?: number })?.value ?? by.index);
    return cards[index - 1]?.id ?? 0;
  }

  private findPart(cardId: number, kind: "field" | "button", by: { kind: string; name?: string; index?: unknown; id?: unknown }): FakePart | undefined {
    const parts = this.card(cardId)?.parts ?? [];
    if (by.kind === "name") return parts.find((p) => p.kind === kind && p.name.toLowerCase() === String(by.name).toLowerCase());
    if (by.kind === "id") return parts.find((p) => p.id === Number((by.id as { value?: number })?.value ?? by.id));
    const index = Number((by.index as { value?: number })?.value ?? by.index);
    return parts.filter((p) => p.kind === kind)[index - 1];
  }

  readText(ref: ResolvedRef): string | ScriptError {
    const found = this.partOf(ref);
    if (!found) return runtimeError("No such field here.");
    return found.part.kind === "field" ? found.part.text : found.part.label;
  }

  readProp(ref: ResolvedRef, prop: PropName): string | ScriptError {
    const found = this.partOf(ref);
    if (ref.kind === "card") return this.card(ref.id)?.name ?? "";
    if (!found) return runtimeError("No such part here.");
    const part = found.part;
    if (prop === "name") return part.name;
    if (prop === "visible") return String(part.visible);
    if (part.kind === "field") {
      if (prop === "locked") return String(part.locked);
      if (prop === "text") return part.text;
      return "";
    }
    if (prop === "label") return part.label;
    if (prop === "enabled") return String(part.enabled);
    if (prop === "hilite") return String(part.hilite);
    return "";
  }

  cardCount(): number {
    return this.world.cards.length;
  }

  currentCardId(): number {
    return this.world.currentCardId;
  }

  cardName(id: number): string {
    return this.card(id)?.name ?? "";
  }

  partName(id: number): string {
    for (const card of this.world.cards) {
      const part = card.parts.find((item) => item.id === id);
      if (part) return part.name;
    }
    return "";
  }

  writeText(ref: ResolvedRef, text: string, mode: "replace" | "before" | "after"): void {
    const found = this.partOf(ref);
    if (!found || found.part.kind !== "field") return;
    const before = found.part.text;
    found.part.text = mode === "replace" ? text : mode === "before" ? text + before : before + text;
    this.log(`put into field "${found.part.name}"`);
  }

  writeChunk(ref: ResolvedRef, chunkType: ChunkType, text: string, mode: "replace" | "before" | "after", bounds: ChunkBounds): void {
    const found = this.partOf(ref);
    if (!found || found.part.kind !== "field") return;
    found.part.text = writeChunk(found.part.text, chunkType, text, mode, bounds.ordinal, bounds.from, bounds.to);
    this.log(`put into ${chunkType} of field "${found.part.name}"`);
  }

  writeProp(ref: ResolvedRef, prop: PropName, value: string): void {
    const found = this.partOf(ref);
    if (!found) return;
    const part = found.part;
    const flag = value.trim().toLowerCase() === "true";
    if (prop === "visible") part.visible = flag;
    else if (part.kind === "field" && prop === "locked") part.locked = flag;
    else if (part.kind === "button" && prop === "enabled") part.enabled = flag;
    else if (part.kind === "button" && prop === "hilite") part.hilite = flag;
    else if (part.kind === "button" && prop === "label") part.label = value;
    else if (prop === "name") part.name = value;
    this.log(`set the ${prop} of "${part.name}"`);
  }

  createCard(name?: string): number {
    const id = 1000 + this.world.cards.length;
    this.world.cards.push({ id, name: name ?? `Card ${id}`, parts: [], script: "" });
    this.created.push(`card ${name ?? id}`);
    this.log(`create card "${name ?? id}"`);
    return id;
  }

  createBackground(name?: string): number {
    const id = 900 + this.world.backgrounds.length;
    this.world.backgrounds.push({ id, name: name ?? `Background ${id}` });
    this.created.push(`background ${name ?? id}`);
    return id;
  }

  createPart(partKind: "field" | "button", name: string | undefined, cardId: number): number {
    const card = this.card(cardId);
    const id = 2000 + (card?.parts.length ?? 0);
    const part = partKind === "field" ? field(id, name ?? "field") : button(id, name ?? "button");
    card?.parts.push(part);
    this.created.push(`${partKind} ${name ?? id}`);
    this.log(`create ${partKind} "${name ?? id}"`);
    return id;
  }

  delete(ref: ResolvedRef): void {
    const found = this.partOf(ref);
    if (found) {
      found.card.parts = found.card.parts.filter((part) => part.id !== found.part.id);
      this.deleted.push(found.part.name);
      this.log(`delete "${found.part.name}"`);
      return;
    }
    if (ref.kind === "card") {
      this.world.cards = this.world.cards.filter((card) => card.id !== ref.id);
      this.deleted.push(`card ${ref.id}`);
    }
  }

  setScript(ref: ResolvedRef, script: string): void {
    const found = this.partOf(ref);
    if (found && found.part.kind === "button") found.part.script = script;
    this.log("set script");
  }

  goToCard(id: number): void {
    this.world.currentCardId = id;
    this.log(`go to card ${this.cardName(id)}`);
  }

  sort(ref: ResolvedRef, numeric: boolean, descending: boolean, chunkType?: ChunkType, index?: number): void {
    const found = this.partOf(ref);
    if (!found || found.part.kind !== "field") return;
    const type = chunkType ?? "line";
    const lines = found.part.text.split(type === "item" ? "," : "\n");
    const key = (line: string): string | number => {
      if (index === undefined) return line;
      const cell = line.split(",")[index - 1] ?? "";
      return numeric ? Number(cell) : cell;
    };
    lines.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
    if (descending) lines.reverse();
    found.part.text = lines.join(type === "item" ? "," : "\n");
    this.log("sort");
  }

  answer(text: string): void {
    this.answers.push(text);
    this.log(`answer "${text}"`);
  }

  ask(): string {
    this.log("ask");
    return this.askReply;
  }

  sendMessage(name: string, args: string[], to: ResolvedRef): void {
    this.messages.push({ name, args, to: this.describe(to) });
    this.log(`send "${name}" to ${this.describe(to)}`);
  }

  pass(message: string): void {
    this.passed.push(message);
    this.log(`pass ${message}`);
  }

  consult(): string {
    this.log("consult agent");
    return this.consultReply;
  }

  tell(agent: ResolvedRef, text: string): void {
    this.told.push({ to: this.describe(agent), text });
    this.log(`tell agent "${text}"`);
  }

  wait(ms: number): void {
    this.waits.push(ms);
    this.log(`wait ${ms}`);
  }

  find(text: string): number[] {
    const hits = this.world.cards.filter((card) =>
      card.parts.some((part) => part.kind === "field" && part.text.includes(text)),
    );
    this.found.push(text);
    return hits.map((card) => card.id);
  }

  private describe(ref: ResolvedRef): string {
    if (ref.kind === "card") return `card "${this.cardName(ref.id)}"`;
    if (ref.kind === "agent") return `agent of card "${this.cardName(ref.cardId)}"`;
    if (ref.kind === "part") return `${ref.partKind} "${this.partName(ref.id)}"`;
    return ref.kind;
  }
}

/** Une pile de test : deux cartes, des champs et des boutons nommés. */
export function fakeWorld(fields: Record<string, string> = {}): FakeWorld {
  const parts: FakePart[] = Object.entries(fields).map(([name, text], index) => field(index + 1, name, text));
  return {
    cards: [
      { id: 10, name: "One", parts: [...parts, button(90, "Go")], script: "" },
      { id: 20, name: "Two", parts: [field(2, "Note", ""), button(91, "Back")], script: "" },
    ],
    currentCardId: 10,
    backgrounds: [],
  };
}

/** Lit un morceau, pour les tests qui vérifient une écriture ciblée. */
export function readField(world: FakeWorld, cardName: string, fieldName: string, type: ChunkType = "line", index = 1): string {
  const card = world.cards.find((item) => item.name === cardName);
  const part = card?.parts.find((item) => item.name === fieldName);
  if (!part || part.kind !== "field") return "";
  return readChunk(part.text, type, index);
}
