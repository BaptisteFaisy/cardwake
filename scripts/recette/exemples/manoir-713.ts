/**
 * L'exemple 7.13 du cahier, rejoué pour de vrai : le manoir, l'amulette, et
 * la cuisinière déjà informée.
 *
 * Le cahier décrit une suite précise : le garde consulte son agent, l'agent
 * écrit « alarmed » puis prévient la cuisinière, la cuisinière écrit
 * « nervous », et le tout s'annule. Le dépôt livre la pile du manoir et sa
 * cassette, mais l'enregistrement livré ne suit pas exactement le texte du
 * cahier (l'agent de la cuisine écrit dans `Memory`, pas dans `Mood`, et son
 * tour prend deux appels). On rejoue donc le scénario **écrit à la main**,
 * d'après les étapes 3, 5 et 8 du § 7.13, sur la pile livrée.
 *
 * Aucune clé, aucun réseau : les réponses du modèle sont écrites à la main,
 * comme dans `scripts/cassettes/build.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_LIMITS, Dispatcher, Journal, clampSettings, cloneStack, parseStackFile, serializeStack } from "@cardwake/model";
import type { AgentTurnRequest, ModelHost, Stack } from "@cardwake/model";
import type { Determinism, Guards } from "@cardwake/lang";
import { ActionBudgetTracker, SessionBudgetTracker, runAgentTurn } from "@cardwake/agent";
import type { LlmBlock, LlmGateway, LlmRequest, LlmResponse } from "@cardwake/agent";
import { ROOT } from "../outils";

/** Graine et horloge figées : le rejeu est identique à chaque fois. */
const DETERMINISM: Determinism = {
  seed: 7,
  random: () => 0.5,
  now: () => ({ date: "11/12/26", time: "00:00", longDate: "Thursday, November 12, 2026", epochMs: 0 }),
};
const HORLOGE = "2026-11-12T00:00:00.000Z";

/** Les garde-fous : les plafonds de l'application, rien d'autre. */
const GARDE_FOUS: Guards = {
  maxSteps: APP_LIMITS.maxSteps,
  maxMessageDepth: 50,
  maxWaitMs: APP_LIMITS.maxWaitMs,
  maxTextChars: APP_LIMITS.maxFieldChars,
};

/** Ce que le rejeu constate, point par point. */
export type Bilan = {
  /** Entrées du journal : une par tour d'agent et par script. */
  transactions: number;
  /** Appels au modèle, tous tours confondus. */
  appels: number;
  /** Tours d'agent réveillés. */
  tours: number;
  /** Sauts restants à la fin de l'action. */
  sautsRestants: number;
  /** L'humeur de chaque carte, lisible après le rejeu. */
  humeurs: { carte: string; valeur: string }[];
  /** Ce que chaque carte a répondu. */
  reponses: string[];
  /** Annulations nécessaires pour revenir à l'état de départ. */
  annulations: number;
  /** L'état de départ est-il revenu, octet pour octet. */
  etatDeDepartRestaure: boolean;
  /** Les entrées du journal, en clair. */
  journal: string[];
  /** Le journal exporté en texte : ce que le point 11 de la recette relit. */
  journalTexte: string;
};

/** Une réponse qui demande des outils : la boucle enchaîne. */
function avecOutils(...blocs: LlmBlock[]): LlmResponse {
  return { stop: "tool_use", blocks: blocs, usage: { inputTokens: 1, outputTokens: 1 } };
}

/** Une réponse qui termine le tour : le personnage parle. */
function reponse(texte: string): LlmResponse {
  return { stop: "end", blocks: [{ type: "text", text: texte }], usage: { inputTokens: 1, outputTokens: 1 } };
}

/** Un appel d'outil nommé, avec son identifiant. */
function outil(id: string, nom: string, input: Record<string, unknown>): LlmBlock {
  return { type: "tool_use", id, name: nom, input };
}

/** Les réponses du cahier : étapes 3 et 5 pour le garde, étape 8 pour la cuisine. */
export function reponsesDuCahier(): LlmResponse[] {
  return [
    avecOutils(
      outil("t1", "write_field", { field: "Mood", text: "alarmed", mode: "replace" }),
      outil("t2", "write_field", { field: "Memory", text: "A visitor showed a silver amulet.", mode: "append" }),
      outil("t3", "send_message", { to_card: "Cook", text: "A stranger carries the silver amulet. Hide the key." }),
    ),
    reponse("Where did you get that? Put it away, quickly."),
    avecOutils(
      outil("t4", "write_field", { field: "Mood", text: "nervous", mode: "replace" }),
      outil("t5", "write_field", { field: "Memory", text: "The cook heard about the silver amulet.", mode: "append" }),
    ),
    reponse("The key is under the floorboards. Not a word to the master."),
  ];
}

/** La passerelle scriptée : elle sert les réponses écrites à la main. */
class PasserelleScriptée implements LlmGateway {
  readonly mode = "cassette" as const;
  /** Le nombre d'appels really faits au modèle. */
  appels = 0;
  private readonly file: LlmResponse[];

  constructor(reponses: readonly LlmResponse[]) {
    this.file = [...reponses];
  }

  async call(_requete: LlmRequest, _signal: AbortSignal): Promise<LlmResponse> {
    this.appels += 1;
    const suivante = this.file.shift();
    if (suivante === undefined) throw new Error("the handwritten answers ran out");
    return suivante;
  }
}

/** La pile du manoir, telle qu'elle est livrée. */
export function pileDuManoir(): Stack {
  const brut = readFileSync(join(ROOT, "stacks", "manor", "stack.json"), "utf8");
  const lue = parseStackFile(brut);
  if (!lue.ok) throw new Error(`the manor stack is refused: ${lue.errors.join(", ")}`);
  return lue.stack;
}

/** Le rejeu memoïsé : les points 4 et 9 partagent le même bilan. */
let bilanMemo: Promise<Bilan> | null = null;

/** Rejoue l'exemple 7.13 une seule fois, pour toute la recette. */
export function bilanManoir(): Promise<Bilan> {
  bilanMemo ??= jouerManoir713();
  return bilanMemo;
}

/** Le monde d'un rejeu : le journal, la passerelle et le dispatcher branché. */
function construireMonde(pile: Stack, reponses: string[]) {
  const journal = new Journal();
  const reglages = clampSettings(pile.settings);
  const session = new SessionBudgetTracker(reglages);
  const action = new ActionBudgetTracker(reglages);
  const passerelle = new PasserelleScriptée(reponsesDuCahier());
  let dispatcher: Dispatcher | undefined;
  dispatcher = new Dispatcher({
    stack: cloneStack(pile),
    journal,
    guards: GARDE_FOUS,
    determinism: DETERMINISM,
    settings: reglages,
    clock: () => HORLOGE,
    onAgentTurn: async (requete: AgentTurnRequest, host: ModelHost) => {
      const issue = await runAgentTurn(requete, {
        stack: dispatcher!.current,
        cardId: requete.cardId,
        gateway: passerelle,
        host,
        session,
        action,
        settings: reglages,
      });
      reponses.push(issue.reply);
      return issue.reply;
    },
  });
  return { journal, passerelle, dispatcher };
}

/** Rejoue l'exemple 7.13 et rend ce qui a été constaté. */
export async function jouerManoir713(): Promise<Bilan> {
  const pile = pileDuManoir();
  const depart = serializeStack(pile);
  const reponses: string[] = [];
  const monde = construireMonde(pile, reponses);
  const garde = pile.cards.find((item) => item.name === "Guard");
  const bouton = garde?.parts.find((item) => item.name === "Show the amulet");
  if (!garde || !bouton) throw new Error("the manor stack has no Guard card with the amulet button");
  const resultat = await monde.dispatcher.click(garde.id, bouton.id);
  const entrees = monde.journal.entries().reverse();
  const journalTexte = monde.journal.exportText();
  const annulation = await annulerJusquAuDepart(monde.journal, resultat.stack, depart);
  return {
    reponses,
    transactions: entrees.length,
    appels: monde.passerelle.appels,
    tours: resultat.agentTurns,
    sautsRestants: resultat.hopsLeft,
    humeurs: [
      { carte: "Guard", valeur: humeur(resultat.stack, "Guard") },
      { carte: "Cook", valeur: humeur(resultat.stack, "Cook") },
    ],
    annulations: annulation.nombre,
    etatDeDepartRestaure: annulation.restaure,
    journal: entrees.map((tx) => `#${tx.id} ${tx.actor.kind} — ${tx.cause} — ${tx.ops.length} opération(s)`),
    journalTexte,
  };
}

/** Le contenu du champ `Mood` d'une carte, après le rejeu. */
function humeur(stack: Stack, nomCarte: string): string {
  const carte = stack.cards.find((item) => item.name === nomCarte);
  const champ = stack.backgrounds.find((item) => item.id === carte?.background)?.parts.find((p) => p.name === "Mood");
  if (!carte || !champ) return "";
  return carte.content[String(champ.id)] ?? "";
}

/** Annule jusqu'à revenir à l'état de départ ; rend le nombre d'annulations. */
async function annulerJusquAuDepart(
  journal: Journal,
  pile: Stack,
  depart: string,
): Promise<{ nombre: number; restaure: boolean }> {
  let courante = pile;
  let nombre = 0;
  while (serializeStack(courante) !== depart && nombre < 20) {
    const annulee = journal.undo(courante);
    if (annulee === null) break;
    courante = annulee.stack;
    nombre += 1;
  }
  return { nombre, restaure: serializeStack(courante) === depart };
}
