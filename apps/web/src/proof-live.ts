// Les contrôles « recalculés en direct », feature par feature, hors démos.
// Chaque fonction rejoue la preuve dans le navigateur, en pur : horloge fixe,
// graine fixe, aucune requête réseau, aucun `Date.now` ni `Math.random`.
import { currentInk, describeActor, parseStackFile, serializeStack, DEFAULT_SETTINGS } from "@cardwake/model";
import { formatNumber, joinChunk, parseScript, paraphraseScript, printScript, splitChunk } from "@cardwake/lang";
import type { Script } from "@cardwake/lang";
import { ActionBudgetTracker, SessionBudgetTracker, fingerprint, makeRequest } from "@cardwake/agent";
import { createModelEngine } from "./engine/model-engine";
import { DEMO_STACKS } from "./data/index";
import { cassetteFor } from "./data/cassettes";
import { t } from "./i18n";
import { verdict, type FeatureVerdict } from "./proof-types";
import { SCENE_CLOCK, SCENE_SEED, demoStackOf, runManor } from "./proof-scenes";

/** Une ligne de verdict traduite, la seule façon d'écrire un résultat ici. */
function line(key: string, params?: Record<string, string | number>): string[] {
  return [t(key, params)];
}

/** Un moteur de démonstration, horloge et graine figées (CAR-F-17). */
function sceneEngine() {
  return createModelEngine({ clock: () => SCENE_CLOCK, seed: SCENE_SEED });
}

/** FR-01 : trois piles de démo, une cassette enregistrée par pile (P-29, P-28). */
export function checkShelf(): FeatureVerdict {
  const recordings = DEMO_STACKS.reduce((total, demo) => total + cassetteFor(demo.slug).length, 0);
  return verdict("FR-01", DEMO_STACKS.length === 3 && recordings >= 3,
    line("proof.shelf", { stacks: DEMO_STACKS.length, recordings }));
}

/** FR-04 : chaque action humaine est journalisée « you (playing) » (P-07, P-10). */
export function checkJournal(): FeatureVerdict {
  const engine = sceneEngine();
  engine.openStack(demoStackOf("quotes"));
  engine.navigate(10);
  engine.editField(3, "Dupont & fils");
  const entries = engine.journal().entries.filter((entry) => describeActor(entry.actor) === "you (playing)");
  return verdict("FR-04", entries.length >= 2, line("proof.journal", { entries: entries.length }));
}

/** FR-07 : l'encre d'agent disparaît à la première écriture humaine (P-23). */
export async function checkInk(): Promise<FeatureVerdict> {
  const run = await runManor();
  const mark = currentInk(run.stack, run.world.guardId, run.world.fields.mood);
  const engine = sceneEngine();
  engine.openStack(run.stack);
  engine.navigate(run.world.guardId);
  engine.editField(run.world.fields.mood, "calm");
  const after = currentInk(engine.state() ?? run.stack, run.world.guardId, run.world.fields.mood);
  return verdict("FR-07", mark !== null && after === null,
    line("proof.ink", { mark: mark ?? "none", after: after ?? "none" }));
}

/** FR-08 : la relecture vient de l'arbre de syntaxe, jamais d'un modèle (P-03). */
export function checkReadback(): FeatureVerdict {
  const source = 'on mouseUp\n  put round(total, 2) into field "Total"\nend mouseUp\n';
  const first = paraphraseScript(source);
  const stable = JSON.stringify(first) === JSON.stringify(paraphraseScript(source));
  return verdict("FR-08", first.length >= 2 && stable, line("proof.readback", { sentences: first.length }));
}

/** Analyse un script de démonstration ; lève si le texte d'exemple est faux. */
function scriptOf(source: string): Script {
  const parsed = parseScript(source);
  if (!parsed.ok) throw new Error(parsed.errors.map((error) => error.message).join(" | "));
  return parsed.script;
}

/** FR-12 : analyser → imprimer → analyser rend le même texte (P-01, P-02). */
export function checkRoundTrip(): FeatureVerdict {
  const source = 'on mouseUp\n  put 0 into total\n  add 3 to total\n  put total into field "Total"\nend mouseUp';
  const once = printScript(scriptOf(source));
  const twice = printScript(scriptOf(once));
  return verdict("FR-12", once === twice, line("proof.roundtrip"));
}

/** FR-13 : les décimaux et les morceaux viennent de la bonne famille (P-05, P-21). */
export function checkNumbers(): FeatureVerdict {
  const decimal = formatNumber(0.1 + 0.2);
  const joined = joinChunk(splitChunk("one two three", "word"), "word");
  return verdict("FR-13", decimal === "0.3" && joined === "one two three",
    line("proof.numbers", { decimal, pieces: joined }));
}

/** FR-14 : budgets bornés, figés une fois épuisés (P-15, P-16). */
export function checkBudgets(): FeatureVerdict {
  const session = new SessionBudgetTracker({ ...DEFAULT_SETTINGS, agentTurnsPerSession: 2 });
  session.consumeTurn();
  session.consumeTurn();
  const third = session.consumeTurn();
  const action = new ActionBudgetTracker({ ...DEFAULT_SETTINGS, hopBudget: 2 });
  action.consumeHop();
  action.consumeHop();
  const hop = action.consumeHop();
  return verdict("FR-14", !third.ok && !hop.ok && session.snapshot().turnsUsed === 2,
    line("proof.budgets", { used: 2, max: 2 }));
}

/** FR-15 : exporter → importer → exporter rend octet pour octet (P-18). */
export async function checkFile(): Promise<FeatureVerdict> {
  const run = await runManor();
  const saved = serializeStack(run.stack);
  const parsed = parseStackFile(saved);
  const state = parsed.ok && serializeStack(parsed.stack) === saved ? "identical" : "different";
  const keys = /sk-[A-Za-z0-9]/.test(saved) ? "found" : "none";
  return verdict("FR-15", state === "identical" && keys === "none",
    line("proof.file", { state, keys }));
}

/** FR-16 : l'empreinte d'un appel est stable, et sans clé (P-19, P-22). */
export function checkFingerprint(): FeatureVerdict {
  const request = makeRequest();
  const hash = fingerprint(request);
  const stable = hash === fingerprint(makeRequest());
  const keys = /sk-[A-Za-z0-9]/.test(JSON.stringify(request)) ? "found" : "none";
  return verdict("FR-16", stable && keys === "none",
    line("proof.fingerprint", { hash: hash.slice(0, 12), keys }));
}
