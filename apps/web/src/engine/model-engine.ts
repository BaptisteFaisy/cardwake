/**
 * Le moteur réel du site, construit sur `@cardwake/model` (11.1, 11.8).
 *
 * Trois règles le tiennent :
 * - chaque action humaine ouvre une transaction (`begin`/`record`/`commit`)
 *   avec l'acteur `{kind:"human", mode}` et une cause en anglais ;
 * - toute opération passe par `authorizeOp` : en mode Jouer, la structure est
 *   refusée avec la raison (CAR-F-05) et un champ verrouillé refuse la saisie
 *   humaine (CAR-F-06) ;
 * - l'horloge est **injectée** et la graine fournie : ni `Date.now()` ni
 *   `Math.random()` n'apparaissent ici, le moteur reste déterministe en test.
 *
 * L'exécution des scripts n'existe pas encore (`host.ts`/`dispatch.ts` sont en
 * cours d'écriture par un autre lot) : un clic sur un bouton à script ne
 * l'exécute pas, il pose l'état « script not wired yet ».
 */

import { ActionBudgetTracker, SessionBudgetTracker } from "@cardwake/agent";
import type { Actor } from "@cardwake/lang";
import {
  Journal,
  applyOps,
  authorizeOp,
  createBackground,
  createButton,
  createCard,
  createField,
  currentInk,
  currentText,
} from "@cardwake/model";
import type { Card, Op, Part, Rect, Stack, Verdict } from "@cardwake/model";
import type { BudgetView, CardwakeEngine, EngineEvent, JournalView, Mode, Refusal } from "./types";

export type ModelEngineOptions = {
  /** Horloge injectée : rend un horodatage ISO (CAR-F-17). */
  clock: () => string;
  /** Graine de la session : les graines des transactions en découlent. */
  seed: number;
};

/** Cible d'un champ sur une carte : propre à la carte, ou champ de son fond. */
type FieldTarget = { backgroundId?: number; locked: boolean; part: Part };

/** Générateur linéaire congruentiel : déterministe, sans `Math.random()`. */
function stepSeed(seed: number): number {
  return (Math.imul(seed, 1103515245) + 12345) >>> 0;
}

class ModelEngine implements CardwakeEngine {
  private stack: Stack | null = null;
  private currentMode: Mode = "play";
  private journalInstance = new Journal();
  private session: SessionBudgetTracker | null = null;
  private action: ActionBudgetTracker | null = null;
  private refusal: Refusal | null = null;
  private notice: string | null = null;
  private redoable = false;
  private seed: number;
  private readonly clock: () => string;
  private readonly listeners = new Set<(event: EngineEvent) => void>();

  constructor(options: ModelEngineOptions) {
    this.clock = options.clock;
    this.seed = options.seed >>> 0;
  }

  // ------------------------------------------------------------------
  // Ouverture et lecture
  // ------------------------------------------------------------------

  openStack(stack: Stack): void {
    this.stack = stack;
    this.journalInstance = new Journal();
    this.session = new SessionBudgetTracker(stack.settings);
    this.action = new ActionBudgetTracker(stack.settings);
    this.refusal = null;
    this.notice = null;
    this.redoable = false;
    this.emit({ type: "opened", stack });
  }

  state(): Stack | null {
    return this.stack;
  }

  currentCard(): Card | null {
    if (this.stack === null) return null;
    const id = this.stack.currentCardId;
    return this.stack.cards.find((card) => card.id === id) ?? null;
  }

  mode(): Mode {
    return this.currentMode;
  }

  setMode(mode: Mode): void {
    if (this.currentMode === mode) return;
    this.currentMode = mode;
    this.refusal = null;
    this.emit({ type: "mode-changed", mode });
  }

  // ------------------------------------------------------------------
  // Actions humaines
  // ------------------------------------------------------------------

  navigate(cardId: number | null): void {
    if (this.stack === null) return;
    const before = this.stack.currentCardId;
    if (before === cardId) return;
    this.applyAuthorized(`human navigation to card ${cardId ?? "(none)"}`, [
      { kind: "navigate", before, after: cardId },
    ]);
  }

  click(partId: number): void {
    const card = this.currentCard();
    if (this.stack === null || card === null) return;
    // Une action humaine ouvre un nouveau compteur de sauts (7.6).
    this.action = new ActionBudgetTracker(this.stack.settings);
    const part = this.findPart(card, partId);
    this.emit({ type: "clicked", partId });
    if (part === undefined || part.kind !== "button") return;
    if (part.script.trim() === "") return;
    // Le script existe mais l'exécution n'est pas encore branchée (lot C6).
    this.say("script not wired yet");
    this.emit({ type: "script-not-wired", partId });
  }

  editField(partId: number, text: string): void {
    const card = this.currentCard();
    if (this.stack === null || card === null) return;
    const target = this.fieldTarget(card, partId);
    if (target === null || target.part.kind !== "field") return;
    const before = currentText(this.stack, card.id, partId);
    if (before === text) return;
    const op: Op = {
      kind: "setText",
      cardId: card.id,
      partId,
      ...(target.backgroundId !== undefined ? { backgroundId: target.backgroundId } : {}),
      before,
      after: text,
      // Un humain écrit à l'encre noire : l'encre d'agent tombe (CAR-F-42).
      inkBefore: currentInk(this.stack, card.id, partId),
      inkAfter: null,
    };
    this.applyAuthorized(`human edit of field "${target.part.name}"`, [op]);
  }

  // ------------------------------------------------------------------
  // Construction (mode Fabriquer seulement, CAR-F-02, CAR-F-05)
  // ------------------------------------------------------------------

  addCard(name: string): void {
    const pre = this.stack;
    if (pre === null) return;
    const built = createCard(pre, { name });
    const ops: Op[] = [{ kind: "createCard", card: built.card, index: pre.cards.length }];
    if (pre.currentCardId === null) {
      ops.push({ kind: "navigate", before: null, after: built.card.id });
    }
    this.applyAuthorized(`human creation of card "${name}"`, ops, built.stack.nextId);
  }

  addPart(kind: "button" | "field", name: string): void {
    const pre = this.stack;
    const card = this.currentCard();
    if (pre === null || card === null) {
      this.say("Create a card first: the palette adds to the current card.");
      return;
    }
    const built =
      kind === "field"
        ? createField(pre, { name, cardId: card.id })
        : createButton(pre, { name, cardId: card.id });
    const op: Op = { kind: "createPart", cardId: card.id, part: built.part, index: card.parts.length };
    this.applyAuthorized(`human creation of ${kind} "${name}"`, [op], built.stack.nextId);
  }

  addBackground(name: string): void {
    const pre = this.stack;
    if (pre === null) return;
    const built = createBackground(pre, name);
    const op: Op = { kind: "createBackground", background: built.background };
    this.applyAuthorized(`human creation of background "${name}"`, [op], built.stack.nextId);
  }

  setPartRect(partId: number, rect: Rect): void {
    const card = this.currentCard();
    if (this.stack === null || card === null) return;
    const part = this.findPart(card, partId);
    if (part === undefined) return;
    const op: Op = {
      kind: "setProp",
      target: { kind: "part", cardId: card.id, partId },
      prop: "rect",
      before: part.rect.join(","),
      after: rect.join(","),
    };
    this.applyAuthorized(`human resize of "${part.name}"`, [op]);
  }

  deletePart(partId: number): void {
    const card = this.currentCard();
    if (this.stack === null || card === null) return;
    const part = this.findPart(card, partId);
    if (part === undefined) return;
    const onBackground = !card.parts.some((item) => item.id === partId);
    const op: Op = {
      kind: "deletePart",
      cardId: card.id,
      ...(onBackground && card.background !== null ? { backgroundId: card.background } : {}),
      part,
      index: onBackground ? 0 : card.parts.findIndex((item) => item.id === partId),
    };
    this.applyAuthorized(`human deletion of "${part.name}"`, [op]);
  }

  // ------------------------------------------------------------------
  // Réception (7.10, CAR-F-52)
  // ------------------------------------------------------------------

  /**
   * Réveille les agents d'une pile reçue. Le niveau n'est pas touché : c'est
   * `effectiveLevel` du modèle qui le plafonne à 2 tant que la pile n'est pas
   * déclarée fiable. L'opération passe par `authorizeOp`, donc elle n'aboutit
   * qu'en mode Fabriquer — l'écran de réception bascule dans ce mode.
   */
  wakeAgents(): void {
    if (this.stack === null) return;
    const ops: Op[] = this.stack.cards
      .filter((card) => card.agent !== null && !card.agent.awake)
      .map((card) => ({
        kind: "setAgent",
        cardId: card.id,
        before: card.agent,
        after: card.agent === null ? null : { ...card.agent, awake: true },
      }));
    if (ops.length === 0) {
      this.say("Every agent is already awake.");
      return;
    }
    this.applyAuthorized("human wakes the agents of a received stack", ops);
  }

  /**
   * « Je fais confiance à cette pile » : second geste, distinct du réveil.
   * La provenance n'a pas d'opération réversible dans le modèle : ce geste
   * n'entre donc pas dans le journal, il change seulement la confiance.
   */
  trustStack(): void {
    const stack = this.stack;
    if (stack === null || stack.provenance.kind !== "received") return;
    this.stack = { ...stack, provenance: { ...stack.provenance, trusted: true } };
    this.say("You declared that you trust this stack.");
    this.emit({ type: "changed", stack: this.stack });
  }

  // ------------------------------------------------------------------
  // Journal et budget
  // ------------------------------------------------------------------

  undo(): void {
    if (this.stack === null) return;
    const result = this.journalInstance.undo(this.stack);
    if (result === null) {
      this.say("Nothing left to undo.");
      return;
    }
    this.stack = result.stack;
    this.redoable = true;
    this.emit({ type: "undone", stack: this.stack });
  }

  redo(): void {
    if (this.stack === null) return;
    const result = this.journalInstance.redo(this.stack);
    if (result === null) {
      this.say("Nothing left to redo.");
      return;
    }
    this.stack = result.stack;
    this.redoable = false;
    this.emit({ type: "redone", stack: this.stack });
  }

  journal(): JournalView {
    return {
      entries: this.journalInstance.entries(),
      exportText: this.journalInstance.exportText(),
      canUndo: this.journalInstance.length > 0,
      canRedo: this.redoable,
    };
  }

  budget(): BudgetView {
    const session = this.session?.snapshot();
    const turnsUsed = session?.turnsUsed ?? 0;
    const turnsMax = session?.turnsMax ?? 0;
    const inputTokensUsed = session?.inputTokensUsed ?? 0;
    const inputTokensMax = session?.inputTokensMax ?? 0;
    const hopsLeft = this.action?.snapshot().hopsLeft ?? 0;
    return {
      turnsUsed,
      turnsMax,
      inputTokensUsed,
      inputTokensMax,
      hopsLeft,
      exhausted: (turnsMax > 0 && turnsUsed >= turnsMax) || (inputTokensMax > 0 && inputTokensUsed >= inputTokensMax),
      hopsExhausted: this.action !== null && hopsLeft <= 0,
    };
  }

  lastRefusal(): Refusal | null {
    return this.refusal;
  }

  lastNotice(): string | null {
    return this.notice;
  }

  // ------------------------------------------------------------------
  // Abonnements
  // ------------------------------------------------------------------

  subscribe(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.listeners.clear();
    this.stack = null;
    this.emit({ type: "disposed" });
  }

  // ------------------------------------------------------------------
  // Mécanique interne
  // ------------------------------------------------------------------

  /** Le mode humain, dans le vocabulaire du modèle (`browse`/`author`). */
  private humanMode(): "browse" | "author" {
    return this.currentMode === "play" ? "browse" : "author";
  }

  /** L'acteur humain du moment, pour le point de passage des droits. */
  private actor(): Actor {
    return { kind: "human", mode: this.humanMode() };
  }

  /** Verdict du point de passage unique des droits pour une opération. */
  private authorize(op: Op): Verdict {
    if (this.stack === null) return { allow: false, reason: "No stack is open.", rule: "no-stack" };
    const cardId = this.stack.currentCardId ?? 0;
    return authorizeOp({ stack: this.stack, actor: this.actor(), cardId }, op);
  }

  /**
   * Autorise puis applique : chaque opération passe par `authorizeOp`, la
   * première refusée arrête tout et sa raison est affichée (CAR-F-05/06).
   * `nextIdAfter` garde le compteur d'identifiants avancé même en cas de
   * refus : un identifiant alloué n'est jamais réutilisé (CAR-F-04).
   */
  private applyAuthorized(cause: string, ops: Op[], nextIdAfter?: number): void {
    if (this.stack === null || ops.length === 0) return;
    for (const op of ops) {
      const verdict = this.authorize(op);
      if (!verdict.allow) {
        if (nextIdAfter !== undefined) this.stack = { ...this.stack, nextId: nextIdAfter };
        this.refuse(verdict.reason, verdict.rule);
        return;
      }
    }
    const pre = this.stack;
    this.journalInstance.begin({ kind: "human", mode: this.humanMode() }, cause, this.nextSeed());
    for (const op of ops) this.journalInstance.record(op);
    this.stack = applyOps(pre, ops);
    this.journalInstance.commit(this.stack, this.clock());
    this.redoable = false;
    this.refusal = null;
    this.emit({ type: "changed", stack: this.stack });
    if (ops.some((op) => op.kind === "navigate")) {
      this.emit({ type: "navigated", cardId: this.stack.currentCardId });
    }
  }

  private nextSeed(): number {
    this.seed = stepSeed(this.seed);
    return this.seed;
  }

  private refuse(reason: string, rule: string): void {
    this.refusal = { reason, rule };
    this.notice = reason;
    this.emit({ type: "refused", reason, rule });
  }

  /** Pose un état lisible, sans transaction (rien n'a changé). */
  private say(notice: string): void {
    this.notice = notice;
    this.refusal = null;
  }

  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  /** Élément visé : propre à la carte, ou champ de son fond (CAR-F-03). */
  private findPart(card: Card, partId: number): Part | undefined {
    const own = card.parts.find((part) => part.id === partId);
    if (own !== undefined) return own;
    if (this.stack === null || card.background === null) return undefined;
    const background = this.stack.backgrounds.find((item) => item.id === card.background);
    return background?.parts.find((part) => part.id === partId);
  }

  /** Cible d'un champ, avec son fond éventuel et son verrou. */
  private fieldTarget(card: Card, partId: number): FieldTarget | null {
    const own = card.parts.find((part) => part.id === partId);
    if (own !== undefined) return { locked: own.kind === "field" && own.locked, part: own };
    if (this.stack === null || card.background === null) return null;
    const background = this.stack.backgrounds.find((item) => item.id === card.background);
    const part = background?.parts.find((item) => item.id === partId);
    if (part === undefined || background === undefined) return null;
    return { backgroundId: background.id, locked: part.kind === "field" && part.locked, part };
  }
}

/** Fabrique du moteur réel : c'est elle que le site et les tests utilisent. */
export function createModelEngine(options: ModelEngineOptions): CardwakeEngine {
  return new ModelEngine(options);
}
