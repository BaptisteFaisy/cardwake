/**
 * La pile est un fichier que tu possèdes (O4, CAR-F-07, CAR-F-51).
 *
 * Ces tests tournent en Node, sans jsdom : la persistance reçoit son stockage
 * en paramètre, donc on lui donne un `Map` — le « rechargement de la page »
 * est un second moteur branché sur le même stockage. Aucun réseau, aucune
 * clé, aucun modèle.
 *
 * Ce que le cas « stockage indisponible » doit prouver : un navigateur qui
 * refuse de garder ne fait pas planter le site et ne ment pas — il le dit.
 */
import { describe, expect, it } from "vitest";
import { serializeStack } from "@cardwake/model";
import { STACK_KEY, loadRefusedStack, saveStack, stackText, startSession } from "../src/data/persist";
import { attachAutosave } from "../src/data/autosave";
import type { AutosaveStatus } from "../src/data/autosave";
import { browserStorage } from "../src/data/storage";
import { exportStack, importStackText, stackFileName } from "../src/data/stack-file";
import { demoStack, makeEngine, memoryStorage, refusingStorage, textOf } from "./fixtures";

/** Écrit une pile dans le stockage, comme le ferait la séance précédente. */
function seedSaved(stack = demoStack()): ReturnType<typeof memoryStorage> {
  const storage = memoryStorage();
  saveStack(storage, stack);
  return storage;
}

describe("la pile survit à un rechargement", () => {
  it("chaque transaction validée est écrite, et un second moteur la retrouve", () => {
    const storage = memoryStorage();
    const first = makeEngine(demoStack());
    const autosave = attachAutosave(first.engine, { storage });
    first.engine.navigate(10);
    first.engine.editField(3, "Suspicious");
    autosave.detach();

    // « Rechargement » : une autre page, un autre moteur, le même appareil.
    const second = makeEngine();
    const start = startSession(second.engine, storage);
    expect(start.kind).toBe("restored");
    const reloaded = second.engine.state();
    expect(reloaded).not.toBeNull();
    expect(textOf(reloaded!, 10, 3)).toBe("Suspicious");
    expect(second.engine.currentCard()?.id).toBe(10);
  });

  it("le stockage ne garde que le fichier de pile, au format canonique", () => {
    const storage = memoryStorage();
    const { engine } = makeEngine(demoStack());
    const autosave = attachAutosave(engine, { storage });
    engine.navigate(10);
    autosave.detach();

    const text = storage.getItem(STACK_KEY);
    expect(text).toBe(stackText(engine.state()!));
    expect(text).toBe(serializeStack(engine.state()!));
    // Ni clé, ni compteur de session : le format n'a pas de champ pour eux
    // (le schéma refuse toute clé inconnue, donc un `apiKey` n'y entrerait pas).
    expect(text).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/);
    expect(text).not.toContain("apiKey");
    expect(text).not.toContain("api_key");
    expect([...storage.entries.keys()]).toEqual([STACK_KEY]);
  });

  it("un refus n'écrit rien : une transaction refusée ne laisse aucune trace", () => {
    const storage = memoryStorage();
    const { engine } = makeEngine(demoStack());
    const autosave = attachAutosave(engine, { storage });
    engine.navigate(10);
    const afterNavigate = storage.getItem(STACK_KEY);
    engine.addCard("Refused in play mode"); // mode Jouer : la structure est refusée
    autosave.detach();
    expect(storage.getItem(STACK_KEY)).toBe(afterNavigate);
    expect(engine.state()?.cards).toHaveLength(demoStack().cards.length);
  });

  it("écrire deux fois le même texte ne réécrit pas (écriture idempotente)", () => {
    const storage = memoryStorage();
    const { engine } = makeEngine(demoStack());
    const statuses: AutosaveStatus[] = [];
    const autosave = attachAutosave(engine, { storage, onStatus: (status) => statuses.push(status) });
    engine.navigate(10);
    engine.navigate(10); // même carte : le moteur ne produit rien
    autosave.detach();
    expect(statuses).toEqual([{ kind: "saved" }]);
  });
});

describe("un fichier de pile refusé", () => {
  it("une pile invalide est refusée en bloc, avec sa raison, et rien n'est chargé", () => {
    const storage = memoryStorage({ [STACK_KEY]: '{"format":"cardwake/1","cards":[' });
    const { engine } = makeEngine();
    const start = startSession(engine, storage);
    expect(start.kind).toBe("refused");
    if (start.kind === "refused") {
      expect(start.fault.rule).toBe("file-invalid");
      expect(start.fault.reason).toContain("not valid JSON");
    }
    // Jamais de chargement à moitié.
    expect(engine.state()).toBeNull();
  });

  it("le contenu refusé est gardé tel quel : rien n'est perdu", () => {
    const broken = '{"format":"cardwake/1","cards":[';
    const storage = memoryStorage({ [STACK_KEY]: broken });
    const { engine } = makeEngine();
    startSession(engine, storage);
    expect(loadRefusedStack(storage)).toBe(broken);
  });

  it("une version inconnue le dit, en nommant la version que ce build lit", () => {
    const storage = memoryStorage({ [STACK_KEY]: '{"format":"cardwake/9","cards":[]}' });
    const { engine } = makeEngine();
    const start = startSession(engine, storage);
    expect(start.kind).toBe("refused");
    if (start.kind === "refused") expect(start.fault.reason).toContain("cardwake/1");
    expect(engine.state()).toBeNull();
  });

  it("un fichier tronqué au milieu d'une carte est refusé, pas deviné", () => {
    const full = serializeStack(demoStack());
    const storage = memoryStorage({ [STACK_KEY]: full.slice(0, Math.floor(full.length / 2)) });
    const { engine } = makeEngine();
    expect(startSession(engine, storage).kind).toBe("refused");
    expect(engine.state()).toBeNull();
  });
});

describe("export puis import", () => {
  it("le fichier exporté, relu, donne la même pile", () => {
    const saved: { text: string; filename: string }[] = [];
    const stack = demoStack();
    const filename = exportStack(stack, {
      save: (text, name) => {
        saved.push({ text, filename: name });
      },
    });
    expect(filename).toBe("the-manor.json");
    expect(filename).toBe(stackFileName(stack));
    const reread = importStackText(saved[0].text);
    expect(reread.ok).toBe(true);
    if (reread.ok) expect(serializeStack(reread.stack)).toBe(serializeStack(stack));
  });

  it("exporter deux fois la même pile donne le même texte, octet pour octet", () => {
    const texts: string[] = [];
    const io = { save: (text: string) => texts.push(text) };
    exportStack(demoStack(), io);
    exportStack(demoStack(), io);
    expect(texts[0]).toBe(texts[1]);
  });

  it("un fichier invalide est refusé avec sa raison, sans lever", () => {
    const result = importStackText("ceci n'est pas du JSON");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("not valid JSON");
      expect(result.text).toBe("ceci n'est pas du JSON");
    }
  });

  it("le nom du fichier est lisible, même pour un nom de pile exotique", () => {
    expect(stackFileName({ ...demoStack(), name: "My Stack / 2026" })).toBe("my-stack-2026.json");
    expect(stackFileName({ ...demoStack(), name: "   " })).toBe("stack.json");
  });
});

describe("un stockage indisponible", () => {
  it("un stockage qui lève ne lève pas : il rend la raison", () => {
    const storage = refusingStorage("QuotaExceededError");
    const result = saveStack(storage, demoStack());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fault.rule).toBe("storage-full");
      expect(result.fault.reason).toMatch(/storage is full/i);
    }
  });

  it("l'enregistrement automatique dit l'échec au lieu de le taire", () => {
    const storage = refusingStorage("SecurityError");
    const { engine } = makeEngine(demoStack());
    const statuses: AutosaveStatus[] = [];
    const autosave = attachAutosave(engine, { storage, onStatus: (status) => statuses.push(status) });
    engine.navigate(10);
    autosave.detach();
    expect(autosave.status().kind).toBe("fault");
    expect(statuses.at(-1)).toEqual({
      kind: "fault",
      fault: { reason: expect.stringMatching(/refused to keep/i), rule: "storage-unavailable" },
    });
  });

  it("un stockage muet ne fait pas un refus : il n'y a rien à reprendre", () => {
    const { engine } = makeEngine();
    const start = startSession(engine, refusingStorage("SecurityError"));
    expect(start.kind).toBe("empty");
    expect(engine.state()).toBeNull();
  });

  it("sans stockage du tout, le site démarre quand même sur une pile vide", () => {
    const { engine } = makeEngine();
    expect(startSession(engine, null).kind).toBe("empty");
    expect(saveStack(null, demoStack()).ok).toBe(false);
  });

  it("un accès à localStorage qui lève est rendu comme « pas de stockage »", () => {
    const globals = globalThis as { localStorage?: unknown };
    const before = Object.getOwnPropertyDescriptor(globals, "localStorage");
    Object.defineProperty(globals, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("The operation is insecure.");
      },
    });
    try {
      expect(browserStorage()).toBeNull();
    } finally {
      if (before) Object.defineProperty(globals, "localStorage", before);
      else delete globals.localStorage;
    }
  });

  it("un localStorage normal est bien celui que le site prend", () => {
    const globals = globalThis as { localStorage?: unknown };
    const before = Object.getOwnPropertyDescriptor(globals, "localStorage");
    const storage = memoryStorage();
    Object.defineProperty(globals, "localStorage", { configurable: true, value: storage });
    try {
      expect(browserStorage()).toBe(storage);
    } finally {
      if (before) Object.defineProperty(globals, "localStorage", before);
      else delete globals.localStorage;
    }
  });
});
