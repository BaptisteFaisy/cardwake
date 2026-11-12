/**
 * Le pont entre le moteur du site et le `Dispatcher` de `@cardwake/model`.
 *
 * C'est ici — et seulement ici — que sont construits les `Guards` et le
 * `Determinism` d'une exécution de script :
 * - les garde-fous viennent des réglages de la pile, recadrés sous les
 *   plafonds de l'application (`clampSettings`) et `APP_LIMITS` ;
 * - le générateur pseudo-aléatoire découle de la **graine du moteur**
 *   (mulberry32, jamais `Math.random()`) et l'horloge découle de l'**horloge
 *   injectée du moteur** (jamais `Date.now()`) : une même graine rejoue la
 *   même exécution (CAR-F-17).
 *
 * Aucun `onAgentTurn` n'est fourni : sans enregistrement, un agent ne répond
 * pas et ne consomme aucun saut ni tour — c'est le comportement attendu du
 * `Dispatcher` tant qu'aucune passerelle réelle n'est branchée.
 */

import type { Determinism, Guards } from "@cardwake/lang";
import { APP_LIMITS, Dispatcher, clampSettings } from "@cardwake/model";
import type { DispatchResult, Journal, Message, Stack, StackSettings } from "@cardwake/model";

/** Action humaine à exécuter : clic sur un élément, discussion ou message brut. */
export type DispatchRequest =
  | { kind: "click"; cardId: number; partId: number }
  | { kind: "chat"; cardId: number; text: string }
  | { kind: "message"; message: Message };

/** Générateur linéaire congruentiel : déterministe, sans `Math.random()`. */
export function stepSeed(seed: number): number {
  return (Math.imul(seed, 1103515245) + 12345) >>> 0;
}

export type DispatchAdapterOptions = {
  /** La pile à exécuter : l'adaptateur construit son `Dispatcher` dessus. */
  stack: Stack;
  /** Le journal du moteur : les transactions du script y entrent aussi. */
  journal: Journal;
  /** Graine du moteur : le générateur pseudo-aléatoire en découle. */
  seed: number;
  /** Horloge injectée du moteur : rend un horodatage ISO. */
  clock: () => string;
  /** Réglages de la pile, recadrés sous `APP_LIMITS` à la construction. */
  settings?: Partial<StackSettings>;
};

export type DispatchAdapter = {
  click(cardId: number, partId: number): Promise<DispatchResult>;
  chat(cardId: number, text: string): Promise<DispatchResult>;
  emit(message: Message): Promise<DispatchResult>;
  /** La pile courante : le moteur s'y resynchronise après chaque action. */
  readonly current: Stack;
};

/** Noms en anglais des jours et des mois, pour `the long date`. */
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Mulberry32 : tirages reproductibles depuis une graine, sans `Math.random`. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Les quatre horloges du langage, dérivées d'un instant UTC (jamais `Date.now`). */
function clockFields(epochMs: number): ReturnType<Determinism["now"]> {
  const moment = new Date(epochMs);
  const hours = moment.getUTCHours();
  const half = hours % 12 === 0 ? 12 : hours % 12;
  return {
    date: `${moment.getUTCMonth() + 1}/${moment.getUTCDate()}/${moment.getUTCFullYear() % 100}`,
    time: `${half}:${String(moment.getUTCMinutes()).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`,
    longDate: `${DAYS[moment.getUTCDay()]}, ${MONTHS[moment.getUTCMonth()]} ${moment.getUTCDate()}, ${moment.getUTCFullYear()}`,
    epochMs,
  };
}

/** `the date`/`the time`/`the long date` lisent l'horloge injectée du moteur. */
function nowOf(clock: () => string): Determinism["now"] {
  return () => {
    const parsed = new Date(clock()).getTime();
    return clockFields(Number.isNaN(parsed) ? 0 : parsed);
  };
}

/** Garde-fous d'exécution (7.3) : réglages de la pile sous plafonds applicatifs. */
export function guardsOf(settings: StackSettings): Guards {
  return {
    maxSteps: settings.maxSteps,
    maxMessageDepth: settings.maxMessageDepth,
    maxWaitMs: settings.maxWaitMs,
    maxTextChars: APP_LIMITS.maxFieldChars,
  };
}

/** Fabrique du pont : un `Dispatcher` prêt à exécuter les scripts d'une pile. */
export function createDispatchAdapter(options: DispatchAdapterOptions): DispatchAdapter {
  const settings = clampSettings(options.settings ?? options.stack.settings);
  const seed = options.seed >>> 0;
  const dispatcher = new Dispatcher({
    stack: options.stack,
    journal: options.journal,
    guards: guardsOf(settings),
    determinism: { seed, random: prng(seed), now: nowOf(options.clock) },
    settings,
    clock: options.clock,
  });
  return {
    click: (cardId, partId) => dispatcher.click(cardId, partId),
    chat: (cardId, text) => dispatcher.chat(cardId, text),
    emit: (message) => dispatcher.emit(message),
    get current() {
      return dispatcher.current;
    },
  };
}

/** Aiguille une demande humaine vers la bonne méthode du `Dispatcher`. */
export function runDispatch(adapter: DispatchAdapter, request: DispatchRequest): Promise<DispatchResult> {
  if (request.kind === "click") return adapter.click(request.cardId, request.partId);
  if (request.kind === "chat") return adapter.chat(request.cardId, request.text);
  return adapter.emit(request.message);
}

/** Lignes de trace qui expliquent pourquoi personne n'a répondu. */
const SILENCE_MARKERS = ["no recording", "hops exhausted", "no turn left"];

/**
 * L'avis lisible (en anglais) d'un résultat de dispatch : la réponse d'un
 * agent s'il y en a une, sinon la raison de son silence, sinon rien — un
 * script qui a tourné n'a pas besoin d'avis.
 */
export function noticeOf(result: DispatchResult): string | null {
  if (result.reply !== null) return result.reply;
  const silence = result.trace.find((line) => SILENCE_MARKERS.some((mark) => line.includes(mark)));
  if (silence !== undefined) return silence;
  if (result.handledBy === null) return "Nothing handled this message.";
  return null;
}
