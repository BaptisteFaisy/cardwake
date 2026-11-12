/**
 * Les essais du relais local (7.11, 11.6) : aucun appel réseau, le `fetch`
 * du fournisseur est injecté. Le serveur, lui, est écouté sur une porte
 * éphémère de la boucle locale.
 */

import { afterEach, describe, expect, it } from "vitest";
import { createRelayServer } from "../src/server";
import type { RelayServerOptions } from "../src/server";
import type { FetchLike } from "../src/garde-fous";

/** Une clé d'essai : jamais une vraie, jamais dans le dépôt. */
const KEY = "relay-test-key-not-a-real-secret";

type UpstreamCall = { url: string; headers: Record<string, string>; body: string };

type FakeUpstream = { fetchImpl: FetchLike; calls: UpstreamCall[] };

/** Un fournisseur de substitution : il запиe les appels, il n'appelle rien. */
function fakeUpstream(reply: { status?: number; body?: string } = {}): FakeUpstream {
  const calls: UpstreamCall[] = [];
  const status = reply.status ?? 200;
  const body =
    reply.body ??
    JSON.stringify({
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 12, completion_tokens: 3 },
    });
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });
    return { ok: status < 400, status, text: async () => body };
  };
  return { fetchImpl, calls };
}

type Relay = {
  url: string;
  logs: string[];
  calls: UpstreamCall[];
  close: () => Promise<void>;
};

const opened: Relay[] = [];

/** Démarre un relais sur une porte libre, et le rend adressable. */
async function startRelay(
  options: RelayServerOptions = {},
  upstream: FakeUpstream = fakeUpstream(),
): Promise<Relay> {
  const logs: string[] = [];
  const server = createRelayServer({
    apiKey: KEY,
    upstreamBaseUrl: "https://provider.test/v1",
    publicBaseUrl: "http://127.0.0.1:8787/v1",
    allowedModels: ["combo/cheap"],
    allowedOrigins: ["http://localhost:5173"],
    fetchImpl: upstream.fetchImpl,
    log: (line) => logs.push(line),
    ...options,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  const relay: Relay = {
    url: `http://127.0.0.1:${port}`,
    logs,
    calls: upstream.calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
  opened.push(relay);
  return relay;
}

/** Un appel au chat du relais. */
function chat(relay: Relay, body: unknown, session?: string): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (session !== undefined) headers["x-cardwake-session"] = session;
  return fetch(`${relay.url}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

afterEach(async () => {
  while (opened.length > 0) {
    const relay = opened.pop();
    if (relay !== undefined) await relay.close();
  }
});

describe("le relais refuse ce qui dépasse ses plafonds", () => {
  it("refuse un modèle hors liste (403)", async () => {
    const relay = await startRelay();
    const res = await chat(relay, { model: "modele-hors-liste", messages: [] });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "model is not allowed" });
    expect(relay.calls).toHaveLength(0);
  });

  it("refuse une requête trop longue (413)", async () => {
    const relay = await startRelay({ limits: { maxRequestChars: 200 } });
    const body = { model: "combo/cheap", messages: [{ role: "user", content: "x".repeat(400) }] };
    const res = await chat(relay, body);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "request too long" });
    expect(relay.calls).toHaveLength(0);
  });

  it("respecte le compteur de requêtes par session", async () => {
    const relay = await startRelay({ limits: { sessionRequestsPerHour: 2, dailyRequests: 100 } });
    expect((await chat(relay, { model: "combo/cheap" }, "sess-1")).status).toBe(200);
    expect((await chat(relay, { model: "combo/cheap" }, "sess-1")).status).toBe(200);
    const third = await chat(relay, { model: "combo/cheap" }, "sess-1");
    expect(third.status).toBe(429);
    expect(await third.json()).toEqual({ error: "session limit reached" });
    expect((await chat(relay, { model: "combo/cheap" }, "sess-2")).status).toBe(200);
  });

  it("répond 429 quand le plafond journalier est atteint", async () => {
    const relay = await startRelay({ limits: { dailyRequests: 2, sessionRequestsPerHour: 100 } });
    expect((await chat(relay, { model: "combo/cheap" }, "a")).status).toBe(200);
    expect((await chat(relay, { model: "combo/cheap" }, "b")).status).toBe(200);
    const res = await chat(relay, { model: "combo/cheap" }, "c");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "daily limit reached" });
  });

  it("remet le compteur journalier à zéro le lendemain", async () => {
    let clock = Date.parse("2026-11-12T10:00:00Z");
    const relay = await startRelay({
      now: () => clock,
      limits: { dailyRequests: 1, sessionRequestsPerHour: 10 },
    });
    expect((await chat(relay, { model: "combo/cheap" }, "a")).status).toBe(200);
    expect((await chat(relay, { model: "combo/cheap" }, "b")).status).toBe(429);
    clock += 86_400_000;
    expect((await chat(relay, { model: "combo/cheap" }, "c")).status).toBe(200);
  });
});

describe("le relais garde la clé et son silence", () => {
  it("ne laisse la clé ni dans une réponse ni dans le journal", async () => {
    const upstream = fakeUpstream({ status: 401, body: JSON.stringify({ error: `bad key ${KEY}` }) });
    const relay = await startRelay({}, upstream);
    const res = await chat(relay, { model: "combo/cheap" });
    const text = await res.text();
    expect(res.status).toBe(401);
    expect(text).not.toContain(KEY);
    expect(text).toContain("***");
    expect(relay.logs.join("\n")).not.toContain(KEY);
    expect(upstream.calls[0]?.headers.authorization).toBe(`Bearer ${KEY}`);
  });

  it("ne journalise aucun contenu de requête", async () => {
    const relay = await startRelay();
    await chat(relay, { model: "combo/cheap", messages: [{ role: "user", content: "phrase-secrete" }] });
    const journal = relay.logs.join("\n");
    expect(journal).not.toContain("phrase-secrete");
    expect(journal).toContain("model=combo/cheap");
  });

  it("ne montre aucun secret dans /health", async () => {
    const relay = await startRelay();
    const res = await fetch(`${relay.url}/health`);
    const body = await res.json();
    expect(body).toEqual({ ok: true, model: "combo/cheap", remainingToday: 500 });
    expect(JSON.stringify(body)).not.toContain(KEY);
    expect(res.headers.get("authorization")).toBeNull();
  });

  it("décrit sa configuration au site, sans secret", async () => {
    const relay = await startRelay();
    const res = await fetch(`${relay.url}/config`);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      baseUrl: "http://127.0.0.1:8787/v1",
      mode: "relay",
      models: ["combo/cheap"],
      dailyLimit: 500,
    });
    expect(text).not.toContain(KEY);
  });
});

describe("le relais et le navigateur", () => {
  it("n'autorise que les origines listées", async () => {
    const relay = await startRelay();
    const allowed = await fetch(`${relay.url}/config`, { headers: { origin: "http://localhost:5173" } });
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    const refused = await fetch(`${relay.url}/config`, { headers: { origin: "http://ailleurs.example" } });
    expect(refused.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("renvoie le code du fournisseur quand il refuse", async () => {
    const upstream = fakeUpstream({ status: 429, body: JSON.stringify({ error: "slow down" }) });
    const relay = await startRelay({}, upstream);
    const res = await chat(relay, { model: "combo/cheap" });
    expect(res.status).toBe(429);
    expect((await res.json()).error).toContain("slow down");
  });
});
