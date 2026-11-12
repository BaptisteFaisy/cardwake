/**
 * L'espion de messages (CAR-F-19) : la dernière action humaine, décrite.
 *
 * Le `Dispatcher` rend déjà la trace de ce qu'il a traversé, qui l'a pris et
 * ce qui a été refusé ; il ne rend pas le **message** ni sa **cible**, qui
 * sont connus de l'appelant. Ce fichier reconstitue les deux, puis assemble
 * la vue que l'écran affiche — sans aucun état propre : tout vient du
 * résultat du dispatch et de la pile.
 *
 * Les noms sont rendus comme le `Dispatcher` les rend (`button "…`,
 * `card "…"`, `background "…"`, `stack "…"`), pour que la trace et l'espion
 * parlent la même langue.
 */
import type { DispatchResult, MessageTarget, Stack } from "@cardwake/model";
import type { DispatchRequest } from "./dispatch-adapter";
import type { Refusal, SpyView } from "./types";

/** Le message parti et sa cible, en anglais lisible. */
export type SpyRequest = { message: string; target: string | null };

/** Un élément de la pile : celui de la carte, ou celui de son fond. */
type FoundPart = { kind: string; name: string } | null;

/** L'élément visé par un identifiant, où qu'il vive (CAR-F-03). */
function partOf(stack: Stack, cardId: number, partId: number): FoundPart {
  const card = stack.cards.find((item) => item.id === cardId);
  if (card === undefined) return null;
  const own = card.parts.find((item) => item.id === partId);
  if (own !== undefined) return { kind: own.kind, name: own.name };
  const background = stack.backgrounds.find((item) => item.id === card.background);
  const shared = background?.parts.find((item) => item.id === partId);
  if (shared === undefined) return null;
  return { kind: shared.kind, name: shared.name };
}

/** Le nom d'une carte, ou `null` si elle n'existe plus. */
function cardName(stack: Stack, cardId: number): string | null {
  return stack.cards.find((item) => item.id === cardId)?.name ?? null;
}

/** Le libellé d'une cible de message, comme le `Dispatcher` le nomme. */
export function targetLabel(stack: Stack | null, target: MessageTarget): string | null {
  if (stack === null) return null;
  if (target.kind === "part") {
    const part = partOf(stack, target.cardId, target.partId);
    return part === null ? null : `${part.kind} "${part.name}"`;
  }
  if (target.kind === "card") {
    const name = cardName(stack, target.cardId);
    return name === null ? null : `card "${name}"`;
  }
  if (target.kind === "background") {
    const name = stack.backgrounds.find((item) => item.id === target.backgroundId)?.name ?? null;
    return name === null ? null : `background "${name}"`;
  }
  return `stack "${stack.name}"`;
}

/**
 * Le message et la cible d'une demande humaine : un clic part en `mouseUp`
 * vers l'élément, une discussion part en `message` vers la carte.
 */
export function describeRequest(stack: Stack | null, request: DispatchRequest): SpyRequest {
  if (request.kind === "click") {
    const part = stack === null ? null : partOf(stack, request.cardId, request.partId);
    return {
      message: "mouseUp",
      target: part === null ? null : `${part.kind} "${part.name}"`,
    };
  }
  if (request.kind === "chat") {
    const name = stack === null ? null : cardName(stack, request.cardId);
    return { message: "message", target: name === null ? null : `card "${name}"` };
  }
  return { message: request.message.name, target: targetLabel(stack, request.message.target) };
}

/** Les refus rencontrés : ceux qui ont bloqué, avec la règle qui les motive. */
function refusalsOf(result: DispatchResult): Refusal[] {
  return result.refusals
    .filter((verdict): verdict is { allow: false; reason: string; rule: string } => !verdict.allow)
    .map((verdict) => ({ reason: verdict.reason, rule: verdict.rule }));
}

/**
 * La vue de l'espion : le message, sa cible, et ce que le dispatch en dit.
 * `hopsLeft` vient de la jauge du moteur : les tours partis sans
 * enregistrement rendent leur saut, l'espion doit le dire comme la jauge.
 */
export function spyView(request: SpyRequest, result: DispatchResult, hopsLeft: number): SpyView {
  return {
    message: request.message,
    target: request.target,
    path: [...result.path],
    handledBy: result.handledBy,
    hopsLeft,
    trace: [...result.trace],
    refusals: refusalsOf(result),
  };
}

/** L'espion vide : aucune action n'a encore eu lieu. */
export function emptySpy(): SpyView {
  return {
    message: null,
    target: null,
    path: [],
    handledBy: null,
    hopsLeft: 0,
    trace: [],
    refusals: [],
  };
}
