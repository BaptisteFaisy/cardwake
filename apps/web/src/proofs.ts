/**
 * Les sept preuves recalculées dans le navigateur : chaque démonstration
 * tourne sur le moteur réel du site (`createModelEngine` et son adaptateur de
 * dispatch), sans modèle, sans réseau, sans clé (CAR-N-09). Le modèle scripté
 * (`FakeModel`) n'est qu'une liste de réponses jouée dans l'ordre — c'est le
 * moteur qui exécute vraiment les scripts, les outils, les messages et les
 * droits, et c'est lui qui décide du verdict.
 *
 * La septième preuve vise le relais local : elle se **saute** quand aucun
 * relais n'est configuré ou quand le navigateur ne peut pas l'atteindre —
 * une absence n'est pas un échec.
 *
 * Chaque démo rend `{ ok, lines }` : le verdict, et les étapes intermédiaires
 * telles que le moteur les a calculées. Comme la trace de l'espion, ces
 * lignes sont des données calculées, en anglais, affichées telles quelles par
 * l'écran ; seule la chrome de l'écran passe par `t()`.
 *
 * Horloge injectée et graine fixe : aucun `Date.now()` ni `Math.random()`
 * ici, deux exécutions sont donc comparables octet à octet (CAR-F-17).
 */
import { FakeModel, textResponse, toolUseResponse } from "@cardwake/agent";
import type { LlmGateway } from "@cardwake/agent";
import { authorizeOp, currentText, serializeStack } from "@cardwake/model";
import type { Op, Stack, Verdict } from "@cardwake/model";
import { demoStack } from "./data";
import { createModelEngine, settled } from "./engine/model-engine";
import type { ModelEngineApi } from "./engine/model-engine";
import { accessSettings } from "./engine/model-access";
import { probeRelay } from "./engine/relay-probe";
import type { SpyView } from "./engine/types";

/** Le verdict d'une preuve et ses étapes intermédiaires, en anglais. */
export type ProofDemo = {
  /** La preuve tient-elle ? `false` quand elle est sautée. */
  ok: boolean;
  /** La preuve a-t-elle été sautée ? Une absence n'est pas un échec. */
  skipped?: boolean;
  /** Les lignes d'étapes, en anglais, affichées telles quelles. */
  lines: string[];
};

/** Horloge fixe injectée dans chaque moteur de preuve (jamais `Date.now()`). */
const PROOF_CLOCK = () => "2026-11-12T12:00:00.000Z";

/** Graine fixe : deux courses identiques ne peuvent pas diverger. */
const PROOF_SEED = 42;

/** Identifiants de la pile de démonstration « quotes ». */
const QUOTES = { card: 10, subtotal: 6, vat: 7, total: 8, totalButton: 12 };

/** Identifiants de la pile de démonstration « manor » (fond partagé). */
const MANOR = { guard: 10, cook: 20, mood: 3, background: 2 };

/** Copie neuve d'une pile de démonstration : chaque démo part d'un état neuf. */
function freshStack(slug: string): Stack {
  const demo = demoStack(slug);
  if (demo === undefined) throw new Error(`no demo stack "${slug}"`);
  return structuredClone(demo.stack);
}

/** Un moteur réel sur une copie de pile ; `gatewayOf` branche le faux modèle. */
function engineFor(slug: string, gatewayOf?: (stack: Stack) => LlmGateway | null): ModelEngineApi {
  const engine = createModelEngine({
    clock: PROOF_CLOCK,
    seed: PROOF_SEED,
    ...(gatewayOf === undefined ? {} : { gatewayOf }),
  });
  engine.openStack(freshStack(slug));
  return engine;
}

/** La pile ouverte du moteur, ou une erreur claire si la démo l'a perdue. */
function stateOf(engine: ModelEngineApi): Stack {
  const stack = engine.state();
  if (stack === null) throw new Error("the proof engine lost its stack");
  return stack;
}

/** Empreinte FNV-1a sur 32 bits : courte, lisible, sans `Math.random()`. */
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Un montant de champ est-il celui attendu ? `150` accepte `150.0`. */
function isAmount(text: string, expected: number): boolean {
  return Number(text) === expected;
}

/**
 * Le modèle scripté du manoir : cinq réponses jouées dans l'ordre par les
 * tours du garde puis du cuisinier. Rien ne sort de la machine : `FakeModel`
 * n'est qu'une liste de réponses, sans réseau ni clé.
 */
function manorScript(): FakeModel {
  return new FakeModel({
    responses: [
      toolUseResponse("write_field", { field: "Mood", text: "alarmed", mode: "replace" }, "call-1"),
      toolUseResponse("send_message", { to_card: "Cook", text: "A stranger is at the door." }, "call-2"),
      textResponse("The house is warned."),
      toolUseResponse("write_field", { field: "Mood", text: "nervous", mode: "replace" }, "call-3"),
      textResponse("I stay in the kitchen."),
    ],
  });
}

/** Ce que la situation du manoir produit, une fois jouée par le moteur. */
type ManorRun = {
  guardMood: string;
  cookMood: string;
  spy: SpyView;
  serialized: string;
};

/**
 * La situation du manoir, jouée par le moteur réel : le garde écrit dans son
 * champ, envoie un message au cuisinier, et le cuisinier écrit à son tour.
 * Une seule implémentation pour trois preuves (manoir, espion, rejeu).
 */
async function runManor(): Promise<ManorRun> {
  const model = manorScript();
  const engine = engineFor("manor", () => model);
  engine.navigate(MANOR.guard);
  const done = settled(engine);
  engine.chat("A stranger knocks at the front door.");
  await done;
  const stack = stateOf(engine);
  return {
    guardMood: currentText(stack, MANOR.guard, MANOR.mood),
    cookMood: currentText(stack, MANOR.cook, MANOR.mood),
    spy: engine.spy(),
    serialized: serializeStack(stack),
  };
}

/** Le devis : le script du bouton « Total » calcule 150, 15 et 165. */
export async function demoQuote(): Promise<ProofDemo> {
  const engine = engineFor("quotes");
  engine.navigate(QUOTES.card);
  const done = settled(engine);
  engine.click(QUOTES.totalButton);
  await done;
  const stack = stateOf(engine);
  const subtotal = currentText(stack, QUOTES.card, QUOTES.subtotal);
  const vat = currentText(stack, QUOTES.card, QUOTES.vat);
  const total = currentText(stack, QUOTES.card, QUOTES.total);
  return {
    ok: isAmount(subtotal, 150) && isAmount(vat, 15) && isAmount(total, 165),
    lines: [
      'button "Total" ran its script on a copy of "Dupont"',
      `field "Subtotal" = ${subtotal}`,
      `field "VAT" = ${vat}`,
      `field "Total" = ${total}`,
      `Subtotal ${subtotal} · VAT ${vat} · Total ${total}`,
    ],
  };
}

/** Le manoir : le garde s'alarme, parle au cuisinier, le cuisinier s'énerve. */
export async function demoManor(): Promise<ProofDemo> {
  const run = await runManor();
  const told =
    run.spy.trace.find((line) => line.startsWith("tell agent of card")) ??
    "no message was sent to the cook";
  return {
    ok: run.guardMood === "alarmed" && run.cookMood === "nervous",
    lines: [
      `field "Mood" of "Guard" = ${run.guardMood}`,
      `path of the message: ${told}`,
      `field "Mood" of "Cook" = ${run.cookMood}`,
    ],
  };
}

/** L'espion : le chemin du message, son handler et les sauts restants. */
export async function demoSpy(): Promise<ProofDemo> {
  const spy = (await runManor()).spy;
  return {
    ok: spy.handledBy === 'agent of card "Guard"' && spy.hopsLeft === 1,
    lines: [
      `message: ${spy.message ?? "none"} → ${spy.target ?? "nowhere"}`,
      `path: ${spy.path.join(" → ")}`,
      `handled by: ${spy.handledBy ?? "nobody"}`,
      `hops left: ${spy.hopsLeft}`,
    ],
  };
}

/** Les droits : l'écriture d'un agent de niveau 1 est refusée, sans trace. */
export async function demoRights(): Promise<ProofDemo> {
  const stack = freshStack("manor");
  const before = serializeStack(stack);
  const write: Op = {
    kind: "setText",
    cardId: MANOR.guard,
    partId: MANOR.mood,
    backgroundId: MANOR.background,
    before: "",
    after: "alarmed",
    inkBefore: null,
    inkAfter: null,
  };
  const verdict: Verdict = authorizeOp(
    { stack, actor: { kind: "agent", cardId: MANOR.guard, level: 1 }, cardId: MANOR.guard },
    write,
  );
  const after = serializeStack(stack);
  return {
    ok: !verdict.allow && verdict.rule === "level-too-low" && before === after,
    lines: [
      'agent of card "Guard" (level 1) writes field "Mood"',
      verdict.allow ? "allowed" : `refused: ${verdict.rule}`,
      ...(verdict.allow ? [] : [verdict.reason]),
      `stack unchanged: ${digest(before)} = ${digest(after)}`,
    ],
  };
}

/** Le rejeu : la même situation deux fois redonne le même état final. */
export async function demoReplay(): Promise<ProofDemo> {
  const first = await runManor();
  const second = await runManor();
  return {
    ok: first.serialized === second.serialized,
    lines: [
      `run 1: ${digest(first.serialized)}`,
      `run 2: ${digest(second.serialized)}`,
      `identical: ${first.serialized === second.serialized ? "yes" : "no"}`,
    ],
  };
}

/** L'annulation : une écriture puis son inverse rendent la pile identique. */
export async function demoUndo(): Promise<ProofDemo> {
  const engine = engineFor("quotes");
  engine.navigate(QUOTES.card);
  const beforeText = serializeStack(stateOf(engine));
  const done = settled(engine);
  engine.click(QUOTES.totalButton);
  await done;
  const writtenText = serializeStack(stateOf(engine));
  const subtotal = currentText(stateOf(engine), QUOTES.card, QUOTES.subtotal);
  engine.undo();
  const afterText = serializeStack(stateOf(engine));
  return {
    ok: beforeText !== writtenText && beforeText === afterText,
    lines: [
      `before: ${digest(beforeText)}`,
      `after the write: Subtotal = ${subtotal} (${digest(writtenText)})`,
      `after undo: ${digest(afterText)}`,
      `identical: ${beforeText === afterText ? "yes" : "no"}`,
    ],
  };
}

/**
 * Le relais répond vraiment : la preuve vise le relais configuré dans les
 * réglages. Quand aucun relais n'est configuré, ou quand le navigateur ne
 * peut pas l'atteindre, elle est **sautée**, avec la raison : une absence
 * n'est pas un échec, et la démo enregistrée joue toujours.
 */
export async function demoRelay(): Promise<ProofDemo> {
  const settings = accessSettings();
  if (settings.mode === "recorded") {
    return {
      ok: false,
      skipped: true,
      lines: ["no relay is configured: the site runs in recorded mode"],
    };
  }
  const probe = await probeRelay(settings.baseUrl);
  if (!probe.available) {
    return {
      ok: false,
      skipped: true,
      lines: [`the relay at ${probe.baseUrl} did not answer this browser`],
    };
  }
  return {
    ok: true,
    lines: [
      `relay: ${probe.baseUrl}`,
      "GET /config answered",
      `models: ${probe.models.join(", ") || "none listed"}`,
    ],
  };
}
