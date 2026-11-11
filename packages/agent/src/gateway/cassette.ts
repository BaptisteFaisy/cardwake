/**
 * La passerelle en mode enregistré (7.11) : la cassette.
 *
 * Une requête est réduite à son empreinte canonique ; l'empreinte retrouve la
 * réponse enregistrée. Sans enregistrement pour la situation, `CassetteMiss`
 * est levée : l'interface le dit et propose d'ajouter une clé.
 *
 * `verify()` est le contrôle d'intégration continue : il liste les
 * enregistrements périmés (empreintes qui ne correspondent plus à aucune
 * situation attendue) et les situations sans enregistrement.
 */

import type { CassetteEntry } from "@cardwake/model";
import { fingerprint } from "./canon";
import { throwIfAborted } from "./http";
import { CassetteMiss } from "../types";
import type { LlmBlock, LlmGateway, LlmRequest, LlmResponse } from "../types";

/** Un enregistrement illisible : à refaire avec une vraie clé. */
export class CassetteCorrupt extends Error {
  readonly fingerprint: string;
  constructor(fp: string) {
    super(
      `The recording for ${fp} is not readable. Record this situation again with a real key.`,
    );
    this.name = "CassetteCorrupt";
    this.fingerprint = fp;
  }
}

export type CassetteOptions = { entries?: readonly CassetteEntry[] };

export type CassetteVerifyResult = { stale: string[]; missing: string[] };

const STOPS: readonly string[] = ["end", "tool_use", "max_tokens", "refusal"];

function isBlock(value: unknown): value is LlmBlock {
  if (typeof value !== "object" || value === null) return false;
  const block = value as Record<string, unknown>;
  if (block.type === "text") return typeof block.text === "string";
  if (block.type === "tool_use") {
    return (
      typeof block.id === "string" &&
      typeof block.name === "string" &&
      typeof block.input === "object" &&
      block.input !== null
    );
  }
  if (block.type === "tool_result") {
    return typeof block.toolUseId === "string" && typeof block.content === "string";
  }
  return false;
}

function isResponse(value: unknown): value is LlmResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;
  if (typeof response.stop !== "string" || !STOPS.includes(response.stop)) return false;
  if (!Array.isArray(response.blocks) || !response.blocks.every(isBlock)) return false;
  const usage = response.usage as Record<string, unknown> | undefined;
  return (
    typeof usage === "object" &&
    usage !== null &&
    typeof usage.inputTokens === "number" &&
    typeof usage.outputTokens === "number"
  );
}

/** Lecture d'un enregistrement : réponse valide, sinon erreur lisible. */
function readResponse(raw: unknown, fp: string): LlmResponse {
  if (!isResponse(raw)) throw new CassetteCorrupt(fp);
  return raw;
}

/** Copie profonde par JSON : garantit un export sérialisable. */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class CassetteGateway implements LlmGateway {
  readonly mode = "cassette" as const;

  private readonly byFingerprint = new Map<string, CassetteEntry>();

  constructor(options: CassetteOptions = {}) {
    for (const entry of options.entries ?? []) this.store(entry);
  }

  /** Nombre d'enregistrements. */
  get size(): number {
    return this.byFingerprint.size;
  }

  /** Empreinte sous laquelle une requête est rangée. */
  fingerprintOf(request: LlmRequest): string {
    return fingerprint(request);
  }

  /** Un enregistrement existe-t-il pour cette empreinte ? */
  has(fp: string): boolean {
    return this.byFingerprint.has(fp);
  }

  private store(entry: CassetteEntry): void {
    this.byFingerprint.set(entry.fingerprint, {
      fingerprint: entry.fingerprint,
      purpose: entry.purpose,
      response: cloneJson(entry.response),
    });
  }

  /** Rend l'enregistrement, ou lève `CassetteMiss`. */
  async call(request: LlmRequest, signal: AbortSignal): Promise<LlmResponse> {
    throwIfAborted(signal);
    const fp = fingerprint(request);
    const entry = this.byFingerprint.get(fp);
    if (entry === undefined) throw new CassetteMiss(fp);
    return readResponse(entry.response, fp);
  }

  /** Enregistre une réponse ; rend l'entrée écrite. */
  record(request: LlmRequest, response: LlmResponse): CassetteEntry {
    const entry: CassetteEntry = {
      fingerprint: fingerprint(request),
      purpose: request.purpose,
      response: cloneJson(response),
    };
    this.store(entry);
    return entry;
  }

  /**
   * Contrôle d'intégration. `expected` accepte des empreintes déjà calculées
   * ou des requêtes (par exemple celles des boutons des piles de
   * démonstration) : `stale` = enregistrements périmés, `missing` =
   * situations à enregistrer.
   */
  verify(expected: Iterable<string | LlmRequest>): CassetteVerifyResult {
    const wanted = new Set<string>();
    for (const item of expected) {
      wanted.add(typeof item === "string" ? item : fingerprint(item));
    }
    const stale: string[] = [];
    const missing: string[] = [];
    for (const fp of this.byFingerprint.keys()) {
      if (!wanted.has(fp)) stale.push(fp);
    }
    for (const fp of wanted) {
      if (!this.byFingerprint.has(fp)) missing.push(fp);
    }
    return { stale: stale.sort(), missing: missing.sort() };
  }

  /** Toutes les entrées, triées par empreinte, prêtes pour JSON. */
  entries(): CassetteEntry[] {
    return [...this.byFingerprint.keys()]
      .sort()
      .map((fp) => cloneJson(this.byFingerprint.get(fp)!));
  }

  /** Forme exportable : ni clé, ni compteur de session (CAR-P-22). */
  toJSON(): { mode: "cassette"; entries: CassetteEntry[] } {
    return { mode: this.mode, entries: this.entries() };
  }
}

/** Raccourci : une cassette bâtie à partir d'un tableau d'enregistrements. */
export function cassetteFrom(entries: readonly CassetteEntry[]): CassetteGateway {
  return new CassetteGateway({ entries });
}
