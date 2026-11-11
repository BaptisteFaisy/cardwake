/**
 * Textes de l'interface (12.2, 12.3).
 *
 * Un seul dictionnaire, en **anglais** : aucun libellé n'est écrit en dur
 * dans un composant. `t(key)` retombe sur la clé elle-même et la signale,
 * ce qui permet au test de repérer toute clé manquante (`missingKeys`).
 *
 * Les clés `state.*` couvrent chacun des états du brief 12.2 : l'interface
 * doit savoir les dire, même quand le moteur ne les produit pas encore.
 */

const TEXTS: Record<string, string> = {
  // Application et navigation
  "app.name": "Cardwake",
  "app.tagline": "Programmable card stacks, written in plain words.",
  "nav.shelf": "Shelf",
  "nav.journal": "Journal",
  "nav.reception": "Reception",
  "nav.settings": "Settings",
  "nav.backToShelf": "Back to the shelf",
  "mode.play": "Play",
  "mode.build": "Build",
  "mode.switchToPlay": "Switch to play mode",
  "mode.switchToBuild": "Switch to build mode",
  "common.close": "Close",
  "common.cancel": "Cancel",
  "common.ok": "OK",
  "common.none": "None",
  "common.you": "you",

  // Étagère (CAR-F-01)
  "shelf.title": "Your stacks",
  "shelf.saved": "Saved on this device",
  "shelf.examples": "Example stacks",
  "shelf.startHere": "Start here: The Manor (no key needed)",
  "shelf.newStack": "New stack",
  "shelf.openFile": "Open a file",
  "shelf.open": "Open",
  "shelf.none": "No stacks saved on this device yet.",
  "shelf.cardCount": "{count} cards",
  "shelf.received": "received",
  "shelf.newStackName": "Untitled stack",

  // Carte, mode Jouer (CAR-F-05, CAR-F-41, CAR-F-42)
  "play.cardOf": "Card {index} of {count}",
  "play.previous": "Previous",
  "play.next": "Next",
  "play.goTo": "Go to card",
  "play.discussion": "Talk to the agent of this card",
  "play.discussionPlaceholder": "Write to the agent…",
  "play.send": "Send",
  "play.budget": "Session budget",
  "play.turns": "Turns {used} / {max}",
  "play.tokens": "Input tokens {used} / {max}",
  "play.hops": "Hops left {left}",
  "play.candle": "The agent of this card is awake",
  "play.candleOut": "The agent of this card is asleep",
  "play.noAgent": "This card has no agent.",
  "play.scriptNotWired": "script not wired yet",
  "play.locked": "Locked",
  "play.writtenByAgent": "written by an agent",
  "play.notWiredHint": "Scripts are shown but not run yet.",

  // Carte, mode Fabriquer (CAR-F-02, CAR-F-05)
  "build.title": "Build",
  "build.palette": "Palette",
  "build.addButton": "Button",
  "build.addField": "Field",
  "build.addCard": "Card",
  "build.addBackground": "Background",
  "build.selected": "Selected",
  "build.nothing": "Nothing selected. Click an element on the card.",
  "build.tabProperties": "Properties",
  "build.tabScript": "Script",
  "build.tabAgent": "Agent",
  "build.rect": "Rectangle",
  "build.rectHint": "x, y, width, height, in card points.",
  "build.applyRect": "Apply",
  "build.name": "Name",
  "build.locked": "Locked",
  "build.visible": "Visible",
  "build.multiline": "Multiline",
  "build.label": "Label",
  "build.enabled": "Enabled",
  "build.agentNone": "No agent on this card.",
  "build.agentLevel": "Level",
  "build.agentAwake": "Awake",
  "build.agentPersona": "Instructions",
  "build.delete": "Delete",
  "build.handles": "Handles",
  "build.refused": "Refused",

  // Journal (CAR-F-44, CAR-F-45, CAR-F-46)
  "journal.title": "Journal",
  "journal.empty": "The journal is empty.",
  "journal.filter": "Filter by actor",
  "journal.filterAll": "Everyone",
  "journal.filterHuman": "You",
  "journal.filterScript": "Scripts",
  "journal.filterAgent": "Agents",
  "journal.undo": "Undo",
  "journal.redo": "Redo",
  "journal.export": "Export as text",
  "journal.at": "at {clock}",
  "journal.noUndo": "Nothing left to undo.",
  "journal.noRedo": "Nothing left to redo.",
  "journal.opCount": "{count} operations",
  "journal.exported": "Journal copied as text.",

  // Réception (7.10, CAR-F-52)
  "reception.title": "A stack you received",
  "reception.intro": "This stack came from a file. Nothing runs until you say so.",
  "reception.contents": "What it contains",
  "reception.cardCount": "{count} cards",
  "reception.scriptCount": "{count} scripts",
  "reception.agents": "Agents",
  "reception.agentLine": "{name} — level {level} — {persona}",
  "reception.asleep": "asleep",
  "reception.allAsleep": "Every agent is asleep.",
  "reception.wake": "Wake the agents",
  "reception.wakeHint": "Wakes them, at level 2 at most.",
  "reception.trust": "I trust this stack",
  "reception.trustHint": "Restores their original levels.",
  "reception.trusted": "You declared that you trust this stack.",
  "reception.woken": "The agents are awake.",
  "reception.notReceived": "This stack was created here, not received.",

  // Réglages (CAR-F-47, CAR-F-48, CAR-F-49)
  "settings.title": "Settings",
  "settings.modelAccess": "Model access",
  "settings.modeRecorded": "Recorded mode",
  "settings.modeRecordedHint": "Plays the example stacks from recordings. No key, no network.",
  "settings.modeKey": "Personal key",
  "settings.modeRelay": "Relay",
  "settings.key": "Key",
  "settings.keyPlaceholder": "Paste your key",
  "settings.keyTest": "Test the key",
  "settings.keyClear": "Erase the key",
  "settings.keyMemoryOnly": "The key stays in memory only.",
  "settings.keyRemember": "Remember on this device",
  "settings.keyOk": "The key works.",
  "settings.keyUntested": "The key has not been tested yet.",
  "settings.budgets": "Budgets",
  "settings.leaves": "What leaves your machine",
  "settings.item": "Item",
  "settings.destination": "Destination",
  "settings.leavesNothing": "Nothing.",
  "settings.leavesStackFile": "A stack file you export — downloaded by you, nowhere else.",
  "settings.leavesKey": "Your key — to the provider you chose, only when you test it.",
  "settings.leavesTurn": "The card content an agent needs — to your provider, or to the relay.",
  "settings.saved": "Settings are kept for this session.",

  // Les états du brief 12.2
  "state.emptyStack": "This stack has no cards yet.",
  "state.cardWithoutParts": "This card has no elements yet.",
  "state.scriptSyntaxError": "This script has a syntax error.",
  "state.scriptRuntimeError": "This script stopped with an error.",
  "state.guardrailReached": "A guardrail stopped this action.",
  "state.agentAsleep": "The agent is asleep.",
  "state.agentWorking": "The agent is working…",
  "state.agentSilent": "The agent did not answer.",
  "state.noRecording": "No recording for this situation.",
  "state.budgetExhausted": "The session budget is exhausted.",
  "state.hopsExhausted": "The hops are exhausted.",
  "state.keyMissing": "No key: add one in Settings.",
  "state.keyInvalid": "That key is invalid.",
  "state.keyRefused": "That key was refused.",
  "state.scriptProposalPending": "A script proposal is waiting for you.",
  "state.storageFull": "This device's storage is full.",
  "state.fileRefused": "That file was refused.",
  "state.offline": "You are offline: recorded mode keeps working.",
};

/** Les dix-huit états du brief 12.2, tels que le test les vérifie. */
export const STATE_KEYS: readonly string[] = [
  "state.emptyStack",
  "state.cardWithoutParts",
  "state.scriptSyntaxError",
  "state.scriptRuntimeError",
  "state.guardrailReached",
  "state.agentAsleep",
  "state.agentWorking",
  "state.agentSilent",
  "state.noRecording",
  "state.budgetExhausted",
  "state.hopsExhausted",
  "state.keyMissing",
  "state.keyInvalid",
  "state.keyRefused",
  "state.scriptProposalPending",
  "state.storageFull",
  "state.fileRefused",
  "state.offline",
];

/** Toutes les clés du dictionnaire : la liste de référence du test. */
export const REQUIRED_KEYS: readonly string[] = Object.keys(TEXTS);

/** Clés demandées par `t()` et absentes (ou vides) du dictionnaire. */
const misses = new Set<string>();

/** Remplace `{nom}` par la valeur correspondante ; laisse ce qu'il ne connaît pas. */
function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

/** Traduit une clé ; retombe sur la clé elle-même et la signale. */
export function t(key: string, params?: Record<string, string | number>): string {
  const text = TEXTS[key];
  if (text === undefined || text === "") {
    misses.add(key);
    return key;
  }
  return interpolate(text, params);
}

/** Les clés qui ont manqué depuis le dernier `resetMissingKeys()`. */
export function missingKeys(): string[] {
  return [...misses];
}

/** Vide la liste des clés manquantes (le test s'en sert entre deux cas). */
export function resetMissingKeys(): void {
  misses.clear();
}
