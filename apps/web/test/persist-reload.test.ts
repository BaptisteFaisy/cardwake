// @vitest-environment jsdom
/**
 * La pile est un fichier que tu possèdes (O4) : le parcours complet dans un
 * vrai DOM, avec `react-dom/client` comme le fait `main.tsx`.
 *
 * Trois gestes y sont montrés de bout en bout : une pile construite survit à
 * un rechargement, un fichier déposé est chargé, un fichier invalide est
 * refusé avec sa raison — et un appareil sans stockage le dit au lieu de
 * faire semblant.
 *
 * `@vitest-environment jsdom` ne vaut que pour ce fichier : le reste du
 * dépôt tourne en Node.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { Stack } from "@cardwake/model";
import { App } from "../src/App";
import { STACK_KEY, saveStack, startSession } from "../src/data/persist";
import type { SessionStart } from "../src/data/persist";
import type { StorageLike } from "../src/data/storage";
import { serializeStack } from "@cardwake/model";
import { t } from "../src/i18n";
import { demoStack, makeEngine, memoryStorage, textOf } from "./fixtures";
import type { ModelEngineApi } from "../src/engine/model-engine";

/** Active l'environnement d'acte de React : les mises à jour sont attendues. */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Les applications montées par le test en cours, démontées après le cas. */
const mounted: { root: Root; container: HTMLElement }[] = [];

/** Monte le site et rend son conteneur. */
async function mountApp(engine: ModelEngineApi, storage: StorageLike | null, start?: SessionStart): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(createElement(App, { engine, storage, start }));
  });
  return container;
}

/** Laisse tourner ce qui est asynchrone (lecture d'un fichier, effets). */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Démonte tout ce qui reste : un test ne laisse pas d'arbre derrière lui. */
afterEach(async () => {
  for (const item of mounted.splice(0)) {
    await act(async () => {
      item.root.unmount();
    });
    item.container.remove();
  }
});

/** Une pile de travail : le manoir, renommé pour être reconnaissable. */
function workingStack(): Stack {
  return { ...demoStack(), name: "Stormy night" };
}

/** Dépose un fichier sur la page, comme le ferait la main de l'utilisateur. */
async function dropFile(text: string, filename = "stack.json"): Promise<void> {
  const file = new File([text], filename, { type: "application/json" });
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { files: [file], types: ["Files"] } });
  await act(async () => {
    document.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await settle();
}

describe("rechargement de la page", () => {
  it("une pile construite est reprise telle quelle après un rechargement", async () => {
    const storage = memoryStorage();
    const before = makeEngine();
    const start = startSession(before.engine, storage);
    await mountApp(before.engine, storage, start);

    // Le travail : ouvrir une pile, changer de carte, écrire dans un champ.
    await act(async () => {
      before.engine.openStack(workingStack());
      before.engine.navigate(10);
      before.engine.editField(3, "Suspicious");
    });
    expect(storage.getItem(STACK_KEY)).toBe(serializeStack(before.engine.state()!));

    // « Rechargement » : tout est démonté, un moteur neuf reprend le stockage.
    const second = makeEngine();
    const restarted = startSession(second.engine, storage);
    expect(restarted.kind).toBe("restored");
    expect(textOf(second.engine.state()!, 10, 3)).toBe("Suspicious");
    const container = await mountApp(second.engine, storage, restarted);
    expect(container.textContent).toContain(t("persist.resumed"));
  });

  it("une pile reçue et non déclarée fiable rouvre sur la réception, agents endormis", async () => {
    const storage = memoryStorage();
    const received: Stack = { ...workingStack(), provenance: { kind: "received", trusted: false, receivedAt: "2026-11-13T10:00:00.000Z" } };
    const first = makeEngine();
    await mountApp(first.engine, storage, startSession(first.engine, storage));
    await act(async () => {
      first.engine.openStack(received);
    });
    const second = makeEngine();
    const restarted = startSession(second.engine, storage);
    const container = await mountApp(second.engine, storage, restarted);
    expect(restarted.kind).toBe("restored");
    expect(second.engine.mode()).toBe("build");
    expect(container.textContent).toContain(t("reception.title"));
  });
});

describe("fichier déposé sur la page", () => {
  it("un fichier valide est chargé", async () => {
    const storage = memoryStorage();
    const { engine } = makeEngine();
    const container = await mountApp(engine, storage, startSession(engine, storage));
    await dropFile(serializeStack(workingStack()));
    expect(engine.state()?.name).toBe("Stormy night");
    expect(storage.getItem(STACK_KEY)).toBe(serializeStack(engine.state()!));
    expect(container.textContent).toContain(t("persist.kept"));
  });

  it("un fichier invalide est refusé avec sa raison, et rien n'est chargé", async () => {
    const storage = memoryStorage();
    const { engine } = makeEngine();
    const container = await mountApp(engine, storage, startSession(engine, storage));
    await dropFile("{ pas du JSON ");
    expect(engine.state()).toBeNull();
    expect(container.textContent).toContain(t("persist.refused"));
    expect(container.textContent).toContain("not valid JSON");
    // Le refus garde le contenu : on peut encore le télécharger.
    expect(document.querySelector(".state-note.refusal")).not.toBeNull();
    expect(container.textContent).toContain(t("persist.refusedDownload"));
  });

  it("après un refus, on repart d'une pile vide sans perdre le fichier refusé", async () => {
    const storage = memoryStorage();
    const { engine } = makeEngine();
    const container = await mountApp(engine, storage, startSession(engine, storage));
    await dropFile('{"format":"cardwake/9"}');
    expect(container.textContent).toContain("cardwake/1");
    const startEmpty = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === t("persist.startEmpty"),
    );
    expect(startEmpty).toBeDefined();
    await act(async () => {
      startEmpty?.click();
    });
    expect(engine.state()?.cards).toHaveLength(0);
    expect(storage.getItem("cardwake.stack.refused.v1")).toBe('{"format":"cardwake/9"}');
  });
});

describe("stockage indisponible", () => {
  it("le site démarre, dit qu'il ne garde rien, et ne lève pas", async () => {
    const { engine } = makeEngine();
    const container = await mountApp(engine, null);
    expect(container.textContent).toContain(t("persist.storageUnavailable"));
    expect(container.textContent).not.toContain(t("persist.kept"));
  });

  it("un stockage qui lève à l'écriture est dit, sans exception", async () => {
    const { engine } = makeEngine();
    const container = await mountApp(engine, {
      getItem: () => null,
      setItem: () => {
        const refused = new Error("The operation is insecure.");
        refused.name = "SecurityError";
        throw refused;
      },
      removeItem: () => undefined,
    });
    await act(async () => {
      engine.openStack(workingStack());
    });
    // La raison est dite telle quelle, avec le conseil qui va avec.
    expect(container.textContent).toContain(t("persist.storageError", { name: "SecurityError" }));
    expect(container.textContent).toContain(t("persist.export"));
  });
});

/** Le bouton qui porte ce libellé, dans le conteneur donné. */
function button(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find((item) => item.textContent === label);
}

describe("export en un clic", () => {
  it("télécharge la pile ouverte, au format canonique, sous un nom lisible", async () => {
    const storage = memoryStorage();
    const { engine } = makeEngine();
    const container = await mountApp(engine, storage, startSession(engine, storage));
    await act(async () => {
      engine.openStack(workingStack());
    });

    const urls = URL as unknown as { createObjectURL: (blob: Blob) => string; revokeObjectURL: (url: string) => void };
    const created: Blob[] = [];
    const downloads: string[] = [];
    const restore = stubDownload(urls, created, downloads);
    try {
      const download = button(container, t("persist.export"));
      expect(download).toBeDefined();
      await act(async () => {
        download?.click();
      });
    } finally {
      restore();
    }

    expect(downloads).toEqual(["stormy-night.json"]);
    expect(await created[0].text()).toBe(serializeStack(engine.state()!));
  });
});

/** Remplace le téléchargement du navigateur par un espion, le temps d'un cas. */
function stubDownload(
  urls: { createObjectURL: (blob: Blob) => string; revokeObjectURL: (url: string) => void },
  created: Blob[],
  downloads: string[],
): () => void {
  const beforeCreate = urls.createObjectURL;
  const beforeRevoke = urls.revokeObjectURL;
  const beforeClick = HTMLAnchorElement.prototype.click;
  urls.createObjectURL = (blob: Blob): string => {
    created.push(blob);
    return "blob:cardwake";
  };
  urls.revokeObjectURL = (): void => undefined;
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement): void {
    downloads.push(this.download);
  };
  return () => {
    urls.createObjectURL = beforeCreate;
    urls.revokeObjectURL = beforeRevoke;
    HTMLAnchorElement.prototype.click = beforeClick;
  };
}

describe("le sélecteur de pile", () => {
  it("« Open another stack » ramène à l'étagère, et ses trois exemples restent accessibles", async () => {
    const storage = memoryStorage();
    saveStack(storage, workingStack());
    const { engine } = makeEngine();
    const container = await mountApp(engine, storage, startSession(engine, storage));
    expect(container.textContent).toContain(t("persist.resumed"));

    const another = button(container, t("persist.openAnother"));
    await act(async () => {
      another?.click();
    });
    expect(container.textContent).toContain(t("shelf.examples"));
    for (const name of ["The Manor", "Quotes", "Dashboard"]) {
      expect(container.textContent).toContain(name);
    }

    // On rouvre un exemple : c'est lui qui est désormais la pile de travail.
    const open = [...container.querySelectorAll("button")].filter((item) => item.textContent === t("shelf.open"));
    await act(async () => {
      open[0]?.click();
    });
    expect(engine.state()?.name).toBe("The Manor");
    expect(storage.getItem(STACK_KEY)).toBe(serializeStack(engine.state()!));
    // La mention « reprise au démarrage » ne parle que de la pile du démarrage.
    expect(container.textContent).toContain(t("persist.kept"));
    expect(container.textContent).not.toContain(t("persist.resumed"));
  });
});
