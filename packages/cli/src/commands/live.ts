/**
 * `cardwake live` : la preuve que ça marche **en vrai**.
 *
 * La commande charge une pile, appelle un VRAI modèle par le relais local
 * (la clé reste sur le poste, jamais dans le navigateur ni dans le dépôt), et
 * montre ce que l'agent a répondu, ce qu'il a écrit, et le journal de
 * l'action. C'est le chemin réel : le même `Dispatcher`, le même `ModelHost`,
 * la même boucle d'agent que le site — seule la passerelle change.
 */

import { APP_LIMITS, Dispatcher, Journal, ModelHost, parseStackFile } from "@cardwake/model";
import type { Stack } from "@cardwake/model";
import { ActionBudgetTracker, SessionBudgetTracker, runAgentTurn } from "@cardwake/agent";
import type { LlmGateway } from "@cardwake/agent";
import { createLocalRelayGateway, RelayLimitReached, RelayUnreachable } from "@cardwake/agent";
import type { CliIO } from "../args";

export type LiveOptions = {
  /** Pile à ouvrir (chemin d'un fichier `stack.json`). */
  stackPath: string;
  /** Carte à qui parler. */
  card: string;
  /** Ce qu'on lui dit. */
  say: string;
  /** Base du relais. */
  relayBaseUrl: string;
  /** `fetch` injectable : les tests n'ouvrent jamais de connexion. */
  fetchImpl?: typeof fetch;
  /** Horloge injectée : jamais `Date.now()`. */
  clock?: () => string;
};

export type LiveResult = {
  code: number;
  reply: string;
  trace: string[];
  wrote: string[];
  reason?: string;
};

/** Charge une pile par son fichier : refus en bloc, jamais en partie. */
async function loadStack(path: string): Promise<{ ok: true; stack: Stack } | { ok: false; reason: string }> {
  const { readFileSync } = await import("node:fs");
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    const parsed = parseStackFile(JSON.stringify(raw));
    if (!parsed.ok) return { ok: false, reason: parsed.errors[0] };
    return { ok: true, stack: parsed.stack };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Trouve la carte par son nom, sans confondre la casse. */
function findCardId(stack: Stack, name: string): number | null {
  const wanted = name.toLowerCase();
  return stack.cards.find((card) => card.name.toLowerCase() === wanted)?.id ?? null;
}

/** Ce que l'agent a écrit, relu depuis la pile finale. */
function collectWrites(stack: Stack, cardId: number): string[] {
  const card = stack.cards.find((item) => item.id === cardId);
  if (!card) return [];
  const background = stack.backgrounds.find((item) => item.id === card.background);
  const lines: string[] = [];
  for (const part of [...(background?.parts ?? []), ...card.parts]) {
    if (part.kind !== "field") continue;
    const text = card.content[String(part.id)] ?? part.text;
    if (text !== "") lines.push(`${part.name}: ${text}`);
  }
  return lines;
}

/** Le relais est-il joignable ? Non : le dire, avec la commande qui le lance. */
function relayUnavailable(detail: string, io: CliIO): LiveResult {
  io.out(`live: ${detail} — start the relay with: npm run relay --workspace @cardwake/relay`);
  return { code: 2, reply: "", trace: [], wrote: [], reason: detail };
}

/** Le Dispatcher avec la boucle d'agent branchée sur le relais. */
function buildDispatcher(
  stack: Stack,
  gateway: LlmGateway,
  clock: () => string,
  journal: Journal,
  state: { refusal?: string },
): Dispatcher {
  return new Dispatcher({
    stack,
    journal,
    guards: {
      maxSteps: APP_LIMITS.maxSteps,
      maxMessageDepth: APP_LIMITS.maxMessageDepth,
      maxWaitMs: APP_LIMITS.maxWaitMs,
      maxTextChars: APP_LIMITS.maxFieldChars,
    },
    determinism: {
      seed: 1,
      random: () => 0.5,
      now: () => ({ date: "12/12/26", time: "22:00", longDate: "Friday, December 12, 2026", epochMs: 0 }),
    },
    settings: stack.settings,
    clock,
    onAgentTurn: async (request, host: ModelHost) => {
      const turn = await runAgentTurn(request, {
        stack: host.stack,
        cardId: request.cardId,
        gateway,
        host,
        session: new SessionBudgetTracker(stack.settings),
        action: new ActionBudgetTracker(stack.settings),
        settings: stack.settings,
      });
      state.refusal = turn.refusal;
      return turn.reply;
    },
  });
}

export async function liveCommand(options: LiveOptions, io: CliIO): Promise<LiveResult> {
  const loaded = await loadStack(options.stackPath);
  if (!loaded.ok) return { code: 1, reply: "", trace: [], wrote: [], reason: loaded.reason };
  const stack = loaded.stack;
  const cardId = findCardId(stack, options.card);
  if (cardId === null) {
    return { code: 1, reply: "", trace: [], wrote: [], reason: `no card named "${options.card}" in this stack` };
  }

  const journal = new Journal();
  const gateway = createLocalRelayGateway({ baseUrl: options.relayBaseUrl, fetchImpl: options.fetchImpl as never });
  const clock = options.clock ?? (() => "1970-01-01T00:00:00.000Z");

  const state: { refusal?: string } = {};
  const dispatcher = buildDispatcher(stack, gateway, clock, journal, state);

  try {
    const result = await dispatcher.chat(cardId, options.say);
    const failed = state.refusal ?? result.trace.find((line) => /fail|error|unreachable|limit/i.test(line));
    if (!result.reply && failed) return relayUnavailable(failed, io);
    io.out(`reply: ${result.reply ?? "(no answer)"}`);
    for (const line of result.trace) io.out(`  ${line}`);
    const wrote = collectWrites(result.stack, cardId);
    for (const line of wrote) io.out(`  wrote ${line}`);
    return { code: 0, reply: result.reply ?? "", trace: result.trace, wrote };
  } catch (error) {
    if (error instanceof RelayUnreachable || error instanceof RelayLimitReached) {
      return relayUnavailable(error.message, io);
    }
    throw error;
  }
}
