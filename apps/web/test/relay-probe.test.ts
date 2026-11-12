/**
 * Tests de la sonde du relais et du repli du pont (7.11) : sans jsdom et
 * sans réseau — le `fetch` est injecté, et le pont est joué sur une vraie
 * pile de démonstration.
 *
 * Ce que ces tests verrouillent :
 * - la sonde rend `available: false` quand personne ne répond ;
 * - elle rend la liste des modèles quand `/config` répond ;
 * - elle respecte son délai (le signal est coupé) et ne lève jamais ;
 * - elle n'interroge que `/config`, jamais une clé ;
 * - le pont en mode `auto` bascule sur la cassette quand le relais ne
 *   répond pas, et **le dit** dans l'avis lisible.
 */
import { describe, expect, it } from "vitest";
import type { LlmGateway } from "@cardwake/agent";
import { RELAY_UNREACHABLE } from "../src/engine/agent-bridge";
import { createRelayGateway } from "../src/engine/relay-gateway";
import { probeRelay } from "../src/engine/relay-probe";
import type { ProbeFetch } from "../src/engine/relay-probe";
import { demoStack, makeEngine, settled } from "./fixtures";

/** La carte du garde du manoir : c'est elle qui porte l'agent. */
const GUARD = 10;

/** Un `/config` de relais, avec deux modèles. */
const CONFIG_BODY = JSON.stringify({
  baseUrl: "http://127.0.0.1:8787",
  mode: "relay",
  models: ["claude-haiku-5-5", "claude-sonnet-5-5"],
  dailyLimit: 1000,
});

/** Un `fetch` qui répond `200` avec le corps donné. */
function answering(body: string): ProbeFetch {
  return async () => ({ ok: true, status: 200, text: async () => body });
}

/** Un `fetch` qui ne répond jamais : il attend que le signal soit coupé. */
function hanging(): ProbeFetch {
  return (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        reject(new Error("The relay did not answer in time."));
      });
    });
}

/** Une cassette factice : elle répond toujours, sans réseau. */
const recorded: LlmGateway = {
  mode: "cassette",
  call: async () => ({
    stop: "end",
    blocks: [{ type: "text", text: "The recording answers." }],
    usage: { inputTokens: 4, outputTokens: 2 },
  }),
};

/** Un relais qui ne répond jamais : la connexion elle-même échoue. */
const deadRelay = createRelayGateway({
  baseUrl: "http://127.0.0.1:8787",
  fetchImpl: async () => {
    throw new TypeError("Failed to fetch");
  },
});

describe("la sonde du relais", () => {
  it("rend available: false quand personne ne répond", async () => {
    const probe = await probeRelay("http://127.0.0.1:8787", {
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    expect(probe).toEqual({
      available: false,
      baseUrl: "http://127.0.0.1:8787",
      models: [],
    });
  });

  it("rend available: true, la liste des modèles, et n'interroge que /config", async () => {
    const urls: string[] = [];
    const probe = await probeRelay("http://127.0.0.1:8787/", {
      fetchImpl: async (url) => {
        urls.push(url);
        return { ok: true, status: 200, text: async () => CONFIG_BODY };
      },
    });
    expect(probe.available).toBe(true);
    expect(probe.models).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
    expect(probe.baseUrl).toBe("http://127.0.0.1:8787");
    expect(urls).toEqual(["http://127.0.0.1:8787/config"]);
  });

  it("respecte son délai : le signal est coupé et la sonde rend false", async () => {
    let aborted = false;
    const probe = await probeRelay("http://127.0.0.1:8787", {
      fetchImpl: (url, init) => {
        init.signal.addEventListener("abort", () => {
          aborted = true;
        });
        return hanging()(url, init);
      },
      timeoutMs: 20,
    });
    expect(aborted).toBe(true);
    expect(probe.available).toBe(false);
    expect(probe.models).toEqual([]);
  });

  it("ne lève jamais : ni exception du fetch, ni corps illisible, ni refus", async () => {
    const broken = await probeRelay("http://127.0.0.1:8787", {
      fetchImpl: async () => {
        throw new Error("boom");
      },
    });
    const garbage = await probeRelay("http://127.0.0.1:8787", {
      fetchImpl: answering("pas du json"),
    });
    const refused = await probeRelay("http://127.0.0.1:8787", {
      fetchImpl: async () => ({ ok: false, status: 500, text: async () => "" }),
    });
    for (const probe of [broken, garbage, refused]) {
      expect(probe.available).toBe(false);
      expect(probe.models).toEqual([]);
    }
  });
});

describe("le pont en mode auto", () => {
  it("bascule sur la cassette quand le relais ne répond pas, et le dit", async () => {
    const { engine } = makeEngine(demoStack(), {
      gatewayOf: () => deadRelay,
      fallbackOf: () => recorded,
      relayExpected: () => true,
    });
    engine.navigate(GUARD);
    const done = settled(engine);
    engine.chat("Who goes there?");
    await done;
    expect(engine.lastNotice()).toBe(RELAY_UNREACHABLE);
    expect(engine.lastNotice()).toContain("not reachable from this browser");
  });

  it("le tour perdu ne coûte rien : la cassette répond, un seul tour est payé", async () => {
    const { engine } = makeEngine(demoStack(), {
      gatewayOf: () => deadRelay,
      fallbackOf: () => recorded,
      relayExpected: () => true,
    });
    engine.navigate(GUARD);
    const done = settled(engine);
    engine.chat("Who goes there?");
    await done;
    expect(engine.budget().turnsUsed).toBe(1);
  });

  it("sans relais, l'avis reste celui de l'enregistrement", async () => {
    const { engine } = makeEngine(demoStack(), {
      gatewayOf: () => recorded,
      fallbackOf: () => recorded,
      relayExpected: () => false,
    });
    engine.navigate(GUARD);
    const done = settled(engine);
    engine.chat("Who goes there?");
    await done;
    expect(engine.lastNotice()).not.toBe(RELAY_UNREACHABLE);
  });
});

describe("le relais qui répond", () => {
  it("en mode live, sa réponse est servie telle quelle", async () => {
    const relay = createRelayGateway({
      baseUrl: "http://127.0.0.1:8787",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: "The relay answers." }, finish_reason: "stop" }],
            usage: { prompt_tokens: 5, completion_tokens: 2 },
          }),
      }),
    });
    const { engine } = makeEngine(demoStack(), {
      gatewayOf: () => relay,
      fallbackOf: () => recorded,
      relayExpected: () => true,
    });
    engine.navigate(GUARD);
    const done = settled(engine);
    engine.chat("Who goes there?");
    await done;
    expect(engine.lastNotice()).toBe("The relay answers.");
  });
});
