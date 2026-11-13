import { createModelEngine, settled } from "../apps/web/src/engine/model-engine";
import type { ModelEngineApi } from "../apps/web/src/engine/model-engine";
import type { LlmGateway } from "@cardwake/agent";
import type { Part, Stack } from "@cardwake/model";
import type { EvalTask } from "./schema";

/**
 * La partie : jouer les événements d'une tâche sur le **vrai moteur du site**.
 *
 * Le moteur est celui qui sert les écrans (`createModelEngine`) : le jeu
 * mesure donc l'application, pas une reconstitution. Un clic, une saisie, une
 * phrase à l'agent — dans l'ordre de la tâche, sur la carte affichée.
 */

/** Ce qu'une partie laisse : la pile finale, et les erreurs rencontrées. */
export type Played = { stack: Stack; errors: string[] };

/** Attend la fin d'une action du moteur, sans jamais attendre plus de 30 s. */
async function waitFor(engine: ModelEngineApi, action: () => void): Promise<void> {
  const done = settled(engine);
  action();
  await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 30_000))]);
}

/**
 * L'élément d'une carte, par nom et par nature. La nature compte : une pile
 * de démonstration porte souvent un champ et un bouton du même nom
 * (« Average », « Total ») ; cliquer le champ ne déclenche pas le script du
 * bouton, et le jeu mesurerait alors le silence au lieu du modèle.
 */
function partNamed(card: { parts: Part[] }, name: string, kind?: "button" | "field"): Part | undefined {
  const matches = card.parts.filter((part) => part.name.toLowerCase() === name.toLowerCase());
  if (kind === undefined) return matches[0];
  return matches.find((part) => part.kind === kind);
}

/** Les erreurs d'exécution que le moteur a rencontrées pendant une action. */
function errorsOf(engine: ModelEngineApi): string[] {
  return engine.spy().trace.filter((line) => line.includes("failed on"));
}

/** Joue un événement : un clic, une saisie, ou une phrase à l'agent. */
async function playEvent(engine: ModelEngineApi, event: EvalTask["events"][number]): Promise<string | null> {
  const card = engine.currentCard();
  if (!card) return "no card is shown";
  if (event.click !== undefined) {
    const part = partNamed(card, event.click, "button") ?? partNamed(card, event.click);
    if (!part) return `no element named "${event.click}" on card "${card.name}"`;
    if (part.kind !== "button") return `"${event.click}" is a ${part.kind}, not a button`;
    // Un bouton sans script ne produit aucun changement : le moteur ne dit
    // rien, et attendre serait mentir sur ce que le jeu mesure.
    if (part.script.trim() === "") return `the button "${part.name}" carries no script`;
    await waitFor(engine, () => engine.click(part.id));
    return null;
  }
  if (event.type !== undefined) {
    const part = partNamed(card, event.type.field, "field");
    if (!part) return `no field named "${event.type.field}" on card "${card.name}"`;
    engine.editField(part.id, event.type.text);
    return null;
  }
  if (event.chat !== undefined) {
    await waitFor(engine, () => engine.chat(event.chat as string));
    return null;
  }
  return "the event says nothing to do";
}

/** Joue tous les événements d'une tâche, dans l'ordre. */
export async function playEvents(
  stack: Stack,
  events: EvalTask["events"],
  options: { gateway: LlmGateway; seed: number; clock: () => string },
): Promise<Played> {
  const engine = createModelEngine({
    clock: options.clock,
    seed: options.seed,
    gatewayOf: () => options.gateway,
    relayExpected: () => options.gateway.mode === "relay",
  });
  engine.openStack(stack);
  const errors: string[] = [];
  for (const event of events) {
    const failure = await playEvent(engine, event);
    if (failure !== null) {
      errors.push(failure);
      break;
    }
    errors.push(...errorsOf(engine));
  }
  return { stack: engine.state() ?? stack, errors };
}

