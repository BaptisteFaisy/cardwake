/**
 * `cardwake cassette record <pile> --relay <url> --yes [--max-calls n]` : le
 * seul chemin par lequel la CLI enregistre, et il ne s'ouvre pas tout seul.
 *
 * Trois verrous, dans cet ordre :
 * 1. **sans `--relay`**, la commande refuse comme avant (code 2) : c'est le
 *    refus d'origine, celui que le hook `no-live-model-guard` protège ;
 * 2. **avec un relais mais sans `--yes`**, elle s'arrête (code 3) : le geste
 *    coûte de l'argent, un humain le décide ;
 * 3. **une fois lancée**, elle plafonne : au plus `--max-calls` appels
 *    (10 par défaut), compteur affiché avant chaque appel.
 *
 * La clé reste au relais : ce module ne lit aucun secret, n'imprime ni l'URL
 * du relais, ni un en-tête, ni une réponse. Le parcours de démonstration garde
 * ses réponses écrites (CAR-P-20) : le relais ne sert qu'à combler les
 * situations que la cassette ne porte pas encore, et chaque réponse reçue est
 * rangée sous l'empreinte exacte de la requête qui l'a demandée.
 */

import { writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import {
  cassetteFrom,
  createLocalRelayGateway,
  describeAction,
  draftText,
  replayScenario,
  scenariosFor,
  textResponse,
} from "@cardwake/agent";
import type { CassetteGateway } from "@cardwake/agent";
import type { LlmGateway, LlmRequest, LlmResponse } from "@cardwake/agent";
import type { ScenarioStep } from "@cardwake/agent";
import { readStack, type CliArgs, type CliIO } from "../args";
import { cassettePathFor, cassetteRecordRefusal, loadCassette } from "./cassette";

/** Le plafond par défaut : dix appels, jamais plus sans le dire explicitement. */
export const DEFAULT_MAX_CALLS = 10;

/** Le compteur d'appels, partagé par toute l'invocation. */
type Budget = { calls: number; max: number };

/** Le plafond est atteint : on s'arrête net, sans appeler une onzième fois. */
class CeilingReached extends Error {
  constructor(max: number) {
    super(`the --max-calls ceiling of ${max} relay call(s) is spent`);
    this.name = "CeilingReached";
  }
}

/** Les réponses écrites d'un parcours : celles du scénario, jamais le réseau. */
function handwritten(step: ScenarioStep): LlmResponse[] {
  if (step.action.kind === "draft") return [textResponse(draftText(step.action.response))];
  return [...(step.responses ?? [])];
}

/**
 * La passerelle d'un parcours : elle rend les réponses écrites, dans l'ordre,
 * et ne dépense un appel au relais que pour une situation absente de la
 * cassette. Une réponse déjà enregistrée n'est jamais redemandée.
 */
class GapFillingGateway implements LlmGateway {
  readonly mode = "relay" as const;
  private readonly queue: LlmResponse[];
  private readonly cassette: CassetteGateway;
  private readonly relay: LlmGateway;
  private readonly budget: Budget;
  private readonly io: CliIO;
  private readonly label: string;
  private filled = 0;

  constructor(
    answers: readonly LlmResponse[],
    cassette: CassetteGateway,
    relay: LlmGateway,
    budget: Budget,
    io: CliIO,
    label: string,
  ) {
    this.queue = [...answers];
    this.cassette = cassette;
    this.relay = relay;
    this.budget = budget;
    this.io = io;
    this.label = label;
  }

  /** Les enregistrements que cette passerelle a réellement ajoutés. */
  get recorded(): number {
    return this.filled;
  }

  async call(request: LlmRequest, signal: AbortSignal): Promise<LlmResponse> {
    const answer = this.queue.shift();
    if (answer === undefined) throw new Error(`the demo flow of "${this.label}" asked more turns than it wrote`);
    if (!this.cassette.has(this.cassette.fingerprintOf(request))) await this.fill(request, signal);
    return answer;
  }

  /** Une situation absente : un appel au relais, compté et affiché avant. */
  private async fill(request: LlmRequest, signal: AbortSignal): Promise<void> {
    if (this.budget.calls >= this.budget.max) throw new CeilingReached(this.budget.max);
    this.budget.calls += 1;
    this.io.out(`relay call ${this.budget.calls}/${this.budget.max} — ${this.label}`);
    const response = await this.relay.call(request, signal);
    this.cassette.record(request, response);
    this.filled += 1;
  }
}

/**
 * Rejoue les parcours d'une pile de démonstration, en comblant les situations
 * absentes, puis réécrit la cassette — seulement si elle a grandi.
 */
async function recordStack(stackPath: string, relay: LlmGateway, budget: Budget, io: CliIO): Promise<number> {
  const name = basename(dirname(stackPath));
  const steps = scenariosFor(name);
  if (steps === null) {
    io.err(`cassette record: no demo scenario for "${name}" — recording needs the flows a demo stack ships`);
    return 2;
  }
  const read = loadCassette(stackPath);
  if ("error" in read) {
    io.err(`cassette record: ${read.error}`);
    return 1;
  }
  const loaded = readStack(stackPath);
  if (!loaded.ok) {
    io.err(`cassette record: ${loaded.error}`);
    return 1;
  }
  const cassette = cassetteFrom(read.entries);
  const before = cassette.size;
  let current = loaded.stack;
  let added = 0;
  for (const step of steps) {
    const gateway = new GapFillingGateway(handwritten(step), cassette, relay, budget, io, describeAction(step.action));
    current = (await replayScenario(current, [step.action], gateway)).stack;
    added += gateway.recorded;
  }
  if (cassette.size > before) writeFileSync(cassettePathFor(stackPath), `${JSON.stringify(cassette.toJSON(), null, 2)}\n`);
  io.out(`${stackPath}: ${added} new recording(s), ${budget.calls}/${budget.max} relay call(s) used`);
  return 0;
}

export type RecordDeps = {
  /** La passerelle du relais ; les tests injectent un faux modèle, sans réseau. */
  gateway?: (relayBaseUrl: string) => LlmGateway;
};

/** La commande : les trois verrous, puis l'enregistrement plafonné. */
export async function cassetteRecordCommand(args: CliArgs, io: CliIO, deps: RecordDeps = {}): Promise<number> {
  const relayUrl = (args.relay ?? "").trim();
  if (relayUrl === "") return cassetteRecordRefusal(io);
  if (!args.yes) {
    io.err("cassette record: --yes missing.");
    io.err("Recording asks a real model through the relay: it costs real money, and only a human decides it.");
    io.err("Nothing was called. Add --yes when you mean it.");
    return 3;
  }
  const stackPath = args.positionals[0];
  if (stackPath === undefined) {
    io.err("cassette record: needs the path of a stack file");
    return 3;
  }
  const budget: Budget = { calls: 0, max: args.maxCalls ?? DEFAULT_MAX_CALLS };
  const relay = deps.gateway ? deps.gateway(relayUrl) : createLocalRelayGateway({ baseUrl: relayUrl });
  try {
    return await recordStack(stackPath, relay, budget, io);
  } catch (error) {
    io.err(`cassette record: ${error instanceof Error ? error.message : String(error)}`);
    io.err(`${budget.calls} relay call(s) were made; the ceiling is ${budget.max}.`);
    return 1;
  }
}
