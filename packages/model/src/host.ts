/**
 * `ModelHost` : le seul endroit où un effet de script devient une opération.
 *
 * Le paquet `lang` est pur et ne connaît pas la pile : il décrit ce qu'il veut
 * faire via l'interface `Host`. Ici, chaque effet est traduit en `Op`, **validé
 * par `authorize`**, consigné par le `Journal`, puis appliqué. Un refus ne lève
 * jamais d'exception : la pile reste inchangée et le refus est tracé avec sa
 * raison — c'est ce qui rend les droits opposables sans casser l'exécution.
 */

import type { Actor, ChunkBounds, Determinism, Guards, Host, ResolvedRef, TraceEntry } from "@cardwake/lang";
import type { ScriptError } from "@cardwake/lang";
import { writeChunk } from "@cardwake/lang";
import type { MessageTarget, Op, Part, Stack, Verdict } from "./types";
import type { StackSettings } from "./limits";
import { APP_LIMITS } from "./limits";
import { applyOp, currentText } from "./ops";
import type { Journal } from "./journal";
import { authorizeOp } from "./authorize";
import { nextRect } from "./factory";
import {
  findTextCards,
  locatePart,
  partNameIn,
  readResolvedProp,
  readResolvedText,
  resolveObjRef,
  type LocatedPart,
} from "./host-read";
import { sortFieldText, setTextOp, targetOf } from "./host-write";
import type { ChunkType, PropName } from "@cardwake/lang";

export type HostContext = {
  stack: Stack;
  journal: Journal;
  actor: Actor;
  /** Carte de l'acteur : la seule où un agent peut écrire (CAR-F-35). */
  cardId: number;
  guards: Guards;
  determinism: Determinism;
  settings: StackSettings;
  /** Identifiant de la transaction en cours : sert de marque d'encre. */
  txId?: number;
  ask?: (prompt: string) => string;
  consult?: (cardId: number, text: string) => string | Promise<string>;
  onMessage?: (name: string, args: string[], target: MessageTarget) => void;
  /** `pass` fait volontairement monter le message d'un cran (7.2). */
  onPass?: (message: string) => void;
};

function isScriptError(value: unknown): value is ScriptError {
  return typeof value === "object" && value !== null && "category" in value;
}

/** Le mode d'écriture tel qu'il s'écrit dans le langage : `into`, `before`, `after`. */
function intoWord(mode: "replace" | "before" | "after"): string {
  return mode === "replace" ? "into" : mode;
}

export class ModelHost implements Host {
  private current: Stack;
  private readonly lines: TraceEntry[] = [];
  private readonly refusals: Verdict[] = [];
  private steps = 0;

  constructor(private readonly ctx: HostContext) {
    this.current = ctx.stack;
  }

  get actor(): Actor {
    return this.ctx.actor;
  }

  get guards(): Guards {
    return this.ctx.guards;
  }

  get determinism(): Determinism {
    return this.ctx.determinism;
  }

  get trace(): TraceEntry[] {
    return this.lines;
  }

  /** État courant de la pile : l'appelant le récupère après exécution. */
  get stack(): Stack {
    return this.current;
  }

  /** Refus rencontrés, pour les afficher à l'auteur au lieu de les deviner. */
  get lastRefusals(): Verdict[] {
    return this.refusals;
  }

  stepsUsed(): number {
    return this.steps;
  }

  private log(text: string): void {
    this.steps += 1;
    this.lines.push({ step: this.steps, line: 0, text });
  }

  /** Marque d'encre : seul un agent marque le texte qu'il écrit (CAR-P-23). */
  private ink(): number | null {
    return this.ctx.actor.kind === "agent" ? (this.ctx.txId ?? 1) : null;
  }

  /** Valide, journalise, applique. Rend `false` si le point de passage refuse. */
  private commit(op: Op, line: string): boolean {
    const verdict = authorizeOp({ stack: this.current, actor: this.ctx.actor, cardId: this.ctx.cardId }, op);
    if (!verdict.allow) {
      this.refusals.push(verdict);
      this.log(`refused (${verdict.rule}): ${verdict.reason}`);
      return false;
    }
    this.ctx.journal.record(op);
    this.current = applyOp(this.current, op);
    this.log(line);
    return true;
  }

  // ---------------------------------------------------------------- lecture

  resolve(ref: Parameters<Host["resolve"]>[0]): ResolvedRef | ScriptError {
    return resolveObjRef(this.current, this.ctx.cardId, ref);
  }

  readText(ref: ResolvedRef): string | ScriptError {
    return readResolvedText(this.current, ref);
  }

  readProp(ref: ResolvedRef, prop: PropName): string | ScriptError {
    return readResolvedProp(this.current, ref, prop);
  }

  cardCount(): number {
    return this.current.cards.length;
  }

  currentCardId(): number {
    return this.current.currentCardId ?? this.ctx.cardId;
  }

  cardName(id: number): string {
    return this.current.cards.find((card) => card.id === id)?.name ?? "";
  }

  partName(id: number): string {
    return partNameIn(this.current, id);
  }

  // --------------------------------------------------------------- écriture

  writeText(ref: ResolvedRef, text: string, mode: "replace" | "before" | "after"): void {
    const loc = locatePart(this.current, ref);
    if (!loc || loc.part.kind !== "field") return void this.log("refused: not a writable field");
    const before = currentText(this.current, loc.cardId, loc.part.id);
    const after = mode === "replace" ? text : mode === "before" ? text + before : before + text;
    const line = `put ${JSON.stringify(text)} ${intoWord(mode)} field "${loc.part.name}"`;
    this.commit(setTextOp(this.current, loc, after, this.ink()), line);
  }

  writeChunk(ref: ResolvedRef, chunkType: ChunkType, text: string, mode: "replace" | "before" | "after", bounds: ChunkBounds): void {
    const loc = locatePart(this.current, ref);
    if (!loc || loc.part.kind !== "field") return void this.log("refused: not a writable field");
    const before = currentText(this.current, loc.cardId, loc.part.id);
    const after = writeChunk(before, chunkType, text, mode, bounds.ordinal, bounds.from, bounds.to);
    const line = `put ${JSON.stringify(text)} ${intoWord(mode)} ${chunkType} ${bounds.ordinal ?? `${bounds.from} to ${bounds.to}`} of field "${loc.part.name}"`;
    this.commit(setTextOp(this.current, loc, after, this.ink()), line);
  }

  writeProp(ref: ResolvedRef, prop: PropName, value: string): void {
    const target = targetOf(this.current, ref);
    if (!target) return void this.log("refused: unknown object");
    const before = readResolvedProp(this.current, ref, prop);
    if (isScriptError(before)) return void this.log(`refused: ${before.message}`);
    this.commit({ kind: "setProp", target, prop, before, after: value }, `set the ${prop} of ${this.nameOf(ref)} to ${value}`);
  }

  setScript(ref: ResolvedRef, script: string): void {
    const target = targetOf(this.current, ref);
    if (!target) return;
    const before = target.kind === "part" ? (locatePart(this.current, ref)?.part.script ?? "") : "";
    this.commit({ kind: "setScript", target, before, after: script }, `set the script of ${this.nameOf(ref)}`);
  }

  createCard(name?: string, background?: string): number {
    const id = this.current.nextId;
    const backgroundId = this.backgroundIdByName(background);
    const content: Record<string, string> = {};
    for (const part of this.current.backgrounds.find((item) => item.id === backgroundId)?.parts ?? []) {
      if (part.kind === "field") content[String(part.id)] = "";
    }
    const card = {
      id,
      name: name ?? `Card ${id}`,
      background: backgroundId,
      content,
      agent: null,
      script: "",
      parts: [],
      ink: {},
    };
    this.commit({ kind: "createCard", card, index: this.current.cards.length }, `create card "${card.name}"`);
    return id;
  }

  createBackground(name?: string): number {
    const id = this.current.nextId;
    const background = { id, name: name ?? `Background ${id}`, persona: "", script: "", parts: [] };
    this.commit({ kind: "createBackground", background }, `create background "${background.name}"`);
    return id;
  }

  createPart(partKind: "field" | "button", name: string | undefined, cardId: number): number {
    const card = this.current.cards.find((item) => item.id === cardId);
    if (!card) return 0;
    const id = this.current.nextId;
    const rect = nextRect(card.parts);
    const label = name ?? `${partKind} ${id}`;
    const part: Part =
      partKind === "field"
        ? { id, kind: "field", name: label, rect, visible: true, style: "plain", script: "", text: "", locked: false, multiline: false }
        : { id, kind: "button", name: label, rect, visible: true, style: "plain", script: "", label, enabled: true, hilite: false };
    this.commit(
      { kind: "createPart", cardId, part, index: card.parts.length },
      `create ${partKind} "${label}"`,
    );
    return id;
  }

  delete(ref: ResolvedRef): void {
    if (ref.kind === "part") {
      const loc = locatePart(this.current, ref);
      if (!loc) return;
      const index = this.indexOfPart(loc);
      this.commit(
        { kind: "deletePart", cardId: loc.cardId, backgroundId: loc.backgroundId, part: loc.part, index },
        `delete ${loc.part.kind} "${loc.part.name}"`,
      );
      return;
    }
    if (ref.kind === "card") {
      const index = this.current.cards.findIndex((card) => card.id === ref.id);
      const card = this.current.cards[index];
      if (!card) return;
      this.commit({ kind: "deleteCard", card, index }, `delete card "${card.name}"`);
      return;
    }
    if (ref.kind === "background") {
      const background = this.current.backgrounds.find((item) => item.id === ref.id);
      if (background) this.commit({ kind: "deleteBackground", background }, `delete background "${background.name}"`);
    }
  }

  goToCard(id: number): void {
    this.commit({ kind: "navigate", before: this.current.currentCardId, after: id }, `go to card "${this.cardName(id)}"`);
  }

  sort(ref: ResolvedRef, numeric: boolean, descending: boolean, chunkType?: ChunkType, index?: number): void {
    const loc = locatePart(this.current, ref);
    if (!loc || loc.part.kind !== "field") return void this.log("refused: sort needs a field");
    const before = currentText(this.current, loc.cardId, loc.part.id);
    const after = sortFieldText(before, chunkType, index, numeric, descending);
    this.commit(setTextOp(this.current, loc, after, this.ink()), `sort field "${loc.part.name}"`);
  }

  // ------------------------------------------------------------ effets hors pile

  answer(text: string): void {
    this.log(`answer ${JSON.stringify(text)}`);
  }

  ask(prompt: string): string {
    this.log(`ask ${JSON.stringify(prompt)}`);
    return this.ctx.ask ? this.ctx.ask(prompt) : "";
  }

  sendMessage(name: string, args: string[], to: ResolvedRef): void {
    this.log(`send "${name}" to ${this.describe(to)}`);
    this.ctx.onMessage?.(name, args, this.asTarget(to));
  }

  pass(message: string): void {
    this.log(`pass ${message}`);
    this.ctx.onPass?.(message);
  }

  consult(agent: ResolvedRef, text: string): string | Promise<string> {
    const cardId = agent.kind === "agent" ? agent.cardId : this.ctx.cardId;
    this.log(`consult agent of card "${this.cardName(cardId)}"`);
    if (!this.ctx.consult) return "The card did not answer.";
    return this.ctx.consult(cardId, text);
  }

  tell(agent: ResolvedRef, text: string): void {
    const cardId = agent.kind === "agent" ? agent.cardId : this.ctx.cardId;
    this.log(`tell agent of card "${this.cardName(cardId)}" ${JSON.stringify(text)}`);
    this.ctx.onMessage?.("message", [text], { kind: "card", cardId });
  }

  wait(ms: number): void {
    this.log(`wait ${ms}`);
  }

  find(text: string): number[] {
    const hits = findTextCards(this.current, text);
    this.log(`find ${JSON.stringify(text)}`);
    return hits;
  }

  // ------------------------------------------------------------------ aides

  /**
   * Rang de l'élément dans la liste où `applyOp` le replace à l'annulation :
   * les éléments du fond pour un champ partagé, ceux de la carte sinon.
   */
  private indexOfPart(loc: LocatedPart): number {
    const owner = loc.fromBackground
      ? this.current.backgrounds.find((item) => item.id === loc.backgroundId)?.parts
      : this.current.cards.find((item) => item.id === loc.cardId)?.parts;
    return Math.max(0, owner?.findIndex((part) => part.id === loc.part.id) ?? 0);
  }

  private backgroundIdByName(name?: string): number | null {
    if (!name) return null;
    const wanted = name.toLowerCase();
    return this.current.backgrounds.find((item) => item.name.toLowerCase() === wanted)?.id ?? null;
  }

  private nameOf(ref: ResolvedRef): string {
    if (ref.kind === "part") return `${ref.partKind} "${this.partName(ref.id)}"`;
    if (ref.kind === "card") return `card "${this.cardName(ref.id)}"`;
    if (ref.kind === "agent") return `agent of card "${this.cardName(ref.cardId)}"`;
    return ref.kind === "background" ? "this background" : "this stack";
  }

  private describe(ref: ResolvedRef): string {
    return this.nameOf(ref);
  }

  private asTarget(ref: ResolvedRef): MessageTarget {
    if (ref.kind === "part") return { kind: "part", cardId: ref.cardId, partId: ref.id };
    if (ref.kind === "background") return { kind: "background", backgroundId: ref.id };
    if (ref.kind === "agent") return { kind: "card", cardId: ref.cardId };
    return ref.kind === "card" ? { kind: "card", cardId: ref.id } : { kind: "stack" };
  }

  /** Plafond de texte de la pile, pour que l'appelant le borne avant écriture. */
  get maxTextChars(): number {
    return Math.min(this.ctx.guards.maxTextChars, APP_LIMITS.maxFieldChars);
  }
}
