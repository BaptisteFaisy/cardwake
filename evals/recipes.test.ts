/**
 * Les recettes publiées font passer les tâches faibles (7.7).
 *
 * La section « Recipes » de `docs/language.md` est la réponse que le modèle
 * reçoit quand il ne sait pas écrire une boucle ou faire parler un agent.
 * Ce test ne mesure pas le modèle — il vérifie que la **forme** enseignée
 * est juste : pour chaque tâche des deux familles faibles, le script écrit
 * selon la recette passe le vérificateur du jeu, sur le vrai moteur.
 *
 * Sans ce test, une recette fausse resterait dans la consigne jusqu'au
 * prochain passage du jeu d'évaluation — qui coûte de l'argent. Ici, le
 * défaut se voit dans la CI, pour rien.
 *
 * Les scripts ci-dessous sont les recettes de la référence, pas des solutions
 * magiques : ils utilisent les formes que la consigne enseigne.
 */

import { describe, expect, it } from "vitest";
import { textResponse, toolUseResponse } from "@cardwake/agent";
import type { LlmGateway } from "@cardwake/agent";
import { targetOf, installScript } from "./runner";
import { checkTask, loadTasks } from "./check";
import { playEvents } from "./play";
import { validateTask, type EvalTask } from "./schema";

/** Le script de la recette, par identifiant de tâche. */
const RECIPES: Record<string, string> = {
  // --- Recipe 1 : walk the lines of a field and add up a column ---
  "loops-01": [
    "on mouseUp",
    "  put 0 into total",
    '  repeat for each line row in field "Lines"',
    "    add item 2 of row * item 3 of row to total",
    "  end repeat",
    '  put round(total, 2) into field "Subtotal"',
    '  put round(total * 0.1, 2) into field "VAT"',
    '  put round(total * 1.1, 2) into field "Total"',
    "end mouseUp",
  ].join("\n"),
  // --- Recipe 2 : one value per line ---
  "loops-02": [
    "on mouseUp",
    "  put empty into table",
    "  repeat with n = 1 to 5",
    "    if n = 1 then",
    '      put (n & " x 5 = " & (n * 5)) into table',
    "    else",
    '      put table & return & (n & " x 5 = " & (n * 5)) into table',
    "    end if",
    "  end repeat",
    '  put table into field "Table"',
    "end mouseUp",
  ].join("\n"),
  "loops-03": [
    "on mouseUp",
    "  put 0 into total",
    '  repeat for each line row in field "Entries"',
    "    add row to total",
    "  end repeat",
    '  put total into field "Sum"',
    "end mouseUp",
  ].join("\n"),
  "loops-04": [
    "on mouseUp",
    "  put 0 into wordCount",
    '  repeat for each word currentWord in field "Text"',
    "    if length(currentWord) > 4 then",
    "      add 1 to wordCount",
    "    end if",
    "  end repeat",
    '  put wordCount into field "Long"',
    "end mouseUp",
  ].join("\n"),
  "loops-05": [
    "on mouseUp",
    "  put empty into countdown",
    "  repeat with n = 5 to 1 step -1",
    "    if n = 5 then",
    "      put n into countdown",
    "    else",
    "      put countdown & return & n into countdown",
    "    end if",
    "  end repeat",
    '  put countdown into field "Countdown"',
    "end mouseUp",
  ].join("\n"),
  "loops-06": [
    "on mouseUp",
    "  put empty into result",
    '  repeat for each line amount in field "Amounts"',
    "    if result is empty then",
    "      put (amount * 2) into result",
    "    else",
    "      put result & return & (amount * 2) into result",
    "    end if",
    "  end repeat",
    '  put result into field "Doubled"',
    "end mouseUp",
  ].join("\n"),
  // --- Recipe 4 : make the card's agent speak ---
  "agents-01": [
    "on mouseUp",
    '  consult agent with "Write a short thank-you note about this order: " & field "Notes"',
    '  put it into field "Follow-up"',
    "end mouseUp",
  ].join("\n"),
  // The chat goes to the agent: the script must not answer in its place.
  "agents-02": [
    "on mouseUp",
    "  -- the chat is handled by the card's agent; nothing to do here",
    "end mouseUp",
  ].join("\n"),
  "agents-03": [
    "on mouseUp",
    '  tell agent of card "Kitchen" "ORDER " & field "Order"',
    '  put "Sent." into field "Log"',
    "end mouseUp",
  ].join("\n"),
  "agents-04": [
    "on mouseUp",
    '  consult agent with "In one sentence, summarise the following minutes: " & field "Minutes"',
    '  put it into field "Summary"',
    "end mouseUp",
  ].join("\n"),
  "agents-05": [
    "on mouseUp",
    "  -- the chat is handled by the card's agent; nothing to do here",
    "end mouseUp",
  ].join("\n"),
  "agents-06": [
    "on mouseUp",
    '  tell agent of card "Oracle" field "Word"',
    "end mouseUp",
  ].join("\n"),
};

/**
 * Un agent faux : il écrit dans le champ qu'on lui donne (`write`), ou il
 * répond en texte (`reply`). Une réponse en texte est ce que ramène
 * `consult agent` ; une écriture est ce que fait l'agent qu'on laisse parler.
 */
function fakeAgent(field: string, text: string, mode: "write" | "reply"): LlmGateway {
  let turn = 0;
  return {
    mode: "cassette",
    async call() {
      turn += 1;
      if (mode === "write") {
        return toolUseResponse("write_field", { field, text, mode: "replace" }, `call-${turn}`);
      }
      return textResponse(text);
    },
  };
}

/** Ce que l'agent de la carte fait, et ce qu'il dit, pour chaque tâche. */
const AGENT_ANSWERS: Record<string, { field: string; text: string; mode: "write" | "reply" }> = {
  "agents-01": { field: "Follow-up", text: "Thanks for your order, it is on its way.", mode: "reply" },
  "agents-02": { field: "Says", text: "Welcome! Come in and sit down.", mode: "write" },
  "agents-03": { field: "Ticket", text: "ORDER Two soups", mode: "write" },
  "agents-04": { field: "Summary", text: "The launch moves to March, it is over to you now.", mode: "reply" },
  "agents-05": { field: "Answer", text: "Soup of the day: pumpkin", mode: "write" },
  "agents-06": { field: "Heard", text: "amber", mode: "write" },
};

const loaded = loadTasks("evals/compile");
const tasks = loaded.ok ? loaded.tasks : [];

/** La tâche, validée, avec sa pile. */
function taskOf(id: string): EvalTask {
  const task = tasks.find((item) => item.id === id);
  if (task === undefined) throw new Error(`no task named "${id}"`);
  const validated = validateTask(JSON.parse(JSON.stringify(task)));
  if (!validated.ok) throw new Error(`${id}: ${validated.errors.join("; ")}`);
  return validated.task;
}

/** Joue une tâche avec le script de la recette et juge la pile finale. */
async function playWithRecipe(id: string): Promise<string[]> {
  const task = taskOf(id);
  const target = targetOf(task.stack as never, task.object);
  if (typeof target === "string") throw new Error(`${id}: ${target}`);
  const answer = AGENT_ANSWERS[id];
  const gateway: LlmGateway = answer === undefined
    ? { mode: "cassette", async call() { throw new Error("no model call expected"); } }
    : fakeAgent(answer.field, answer.text, answer.mode);
  const installed = installScript(task.stack as never, target, RECIPES[id]);
  const played = await playEvents(installed, task.events, {
    gateway,
    seed: 2026,
    clock: () => "1970-01-01T00:00:00.000Z",
  });
  return checkTask(task, played.stack).failures;
}

describe("les recettes de la référence font passer les tâches faibles", () => {
  for (const id of Object.keys(RECIPES)) {
    it(`${id} passe avec le script écrit selon la recette`, async () => {
      expect(await playWithRecipe(id)).toEqual([]);
    });
  }
});
