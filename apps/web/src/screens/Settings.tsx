/**
 * Les réglages (CAR-F-47, CAR-F-48, CAR-F-49) : mode d'accès au modèle
 * (cassette, relais, ou relais quand il répond), adresse du relais et
 * résultat de la sonde, budgets de la pile ouverte, et le tableau honnête
 * « what leaves your machine ».
 *
 * **Aucune clé n'est demandée ici, et aucune n'est stockée** : la clé reste
 * sur la machine qui fait tourner le relais (CAR-N-09, CAR-P-22). Le
 * navigateur ne connaît qu'une adresse, et la sonde vérifie qu'elle répond.
 */
import { useState } from "react";
import type { StackSettings } from "@cardwake/model";
import { useCardwake } from "../store";
import { t } from "../i18n";
import {
  accessProbe,
  accessSettings,
  setAccessProbe,
  setAccessSettings,
} from "../engine/model-access";
import type { ModelAccessMode } from "../engine/model-access";
import { probeRelay } from "../engine/relay-probe";
import type { RelayProbeResult } from "../engine/relay-probe";

export function Settings(): JSX.Element {
  const { stack } = useCardwake();

  return (
    <section aria-labelledby="settings-title">
      <h1 id="settings-title">{t("settings.title")}</h1>

      <ModelAccessSection />

      <div className="settings-section">
        <h2>{t("settings.budgets")}</h2>
        {stack === null ? <p>{t("common.none")}</p> : <BudgetTable settings={stack.settings} />}
      </div>

      <LeavesTable />
      <p>{t("settings.saved")}</p>
    </section>
  );
}

/** L'explication du mode choisi, en anglais. */
function hintOf(mode: ModelAccessMode): string {
  if (mode === "live") return t("settings.modeLiveHint");
  if (mode === "auto") return t("settings.modeAutoHint");
  return t("settings.modeRecordedHint");
}

/** Le résultat de la sonde, dit en anglais. */
function probeText(probe: RelayProbeResult): string {
  if (!probe.available) return t("settings.relayUnreachable");
  const models =
    probe.models.length === 0 ? t("settings.relayNoModels") : probe.models.join(", ");
  return t("settings.relayReachable", { models });
}

/**
 * L'accès au modèle : le mode, et le relais qu'il vise. La sonde
 * n'interroge que `GET {baseUrl}/config` — jamais une clé.
 */
function ModelAccessSection(): JSX.Element {
  const [mode, setMode] = useState<ModelAccessMode>(() => accessSettings().mode);

  const pick = (next: ModelAccessMode): void => {
    setMode(next);
    setAccessSettings({ mode: next });
  };

  return (
    <div className="settings-section">
      <h2>{t("settings.modelAccess")}</h2>
      <AccessPicker mode={mode} onPick={pick} />
      <p>{hintOf(mode)}</p>
      <RelaySection />
      <p>{t("settings.relayKeyNote")}</p>
    </div>
  );
}

/** L'adresse du relais, et ce que la sonde en dit. */
function RelaySection(): JSX.Element {
  const [baseUrl, setBaseUrl] = useState<string>(() => accessSettings().baseUrl);
  const [probe, setProbe] = useState<RelayProbeResult | null>(() => accessProbe());
  const [asking, setAsking] = useState(false);

  const retype = (text: string): void => {
    setBaseUrl(text);
    setAccessSettings({ baseUrl: text });
    setProbe(null);
    setAccessProbe(null);
  };

  const ask = (): void => {
    setAsking(true);
    void probeRelay(baseUrl).then((result) => {
      setProbe(result);
      setAccessProbe(result);
      setAsking(false);
    });
  };

  return (
    <div>
      <label className="relay-row">
        <span>{t("settings.relayAddress")}</span>
        <input
          type="text"
          value={baseUrl}
          aria-label={t("settings.relayAddress")}
          autoComplete="off"
          onChange={(event) => retype(event.target.value)}
        />
      </label>
      <p>{t("settings.relayAddressHint")}</p>
      <button type="button" onClick={ask} disabled={asking}>
        {t("settings.relayTest")}
      </button>
      {asking ? (
        <p className="state-note" role="status">
          {t("settings.relayChecking")}
        </p>
      ) : null}
      {probe === null ? null : <ProbeResult probe={probe} />}
    </div>
  );
}

/** Ce que la sonde a compris : joignable ou non, et pourquoi. */
function ProbeResult({ probe }: { probe: RelayProbeResult }): JSX.Element {
  return (
    <>
      <p className="state-note" role="status">
        {probeText(probe)}
      </p>
      {probe.available ? null : <p>{t("settings.relayUnreachableHint")}</p>}
    </>
  );
}

/** Le sélecteur de mode : cassette, relais, ou relais quand il répond. */
function AccessPicker({
  mode,
  onPick,
}: {
  mode: ModelAccessMode;
  onPick: (mode: ModelAccessMode) => void;
}): JSX.Element {
  const modes: [ModelAccessMode, string][] = [
    ["recorded", t("settings.modeRecorded")],
    ["live", t("settings.modeLive")],
    ["auto", t("settings.modeAuto")],
  ];
  return (
    <div role="radiogroup" aria-label={t("settings.modelAccess")}>
      {modes.map(([value, label]) => (
        <label key={value}>
          <input
            type="radio"
            name="model-access"
            value={value}
            checked={mode === value}
            onChange={() => onPick(value)}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

function BudgetTable({ settings }: { settings: StackSettings }): JSX.Element {
  const rows: [string, number][] = [
    [t("settings.budgetTurnsSession"), settings.agentTurnsPerSession],
    [t("settings.budgetTokensSession"), settings.agentInputTokensPerSession],
    [t("settings.budgetTurnsAction"), settings.agentTurnsPerAction],
    [t("settings.budgetHops"), settings.hopBudget],
    [t("settings.budgetSteps"), settings.maxSteps],
  ];
  return (
    <table className="settings-table">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Le tableau « what leaves your machine » : honnête, sans jargon (12.1). */
function LeavesTable(): JSX.Element {
  const rows: [string, string][] = [
    [t("settings.itemStackFile"), t("settings.destStackFile")],
    [t("settings.itemRelayAddress"), t("settings.destRelayAddress")],
    [t("settings.itemTurn"), t("settings.destTurn")],
    [t("settings.itemRelayKey"), t("settings.destRelayKey")],
    [t("settings.itemNothing"), t("settings.destNothing")],
  ];
  return (
    <div className="settings-section">
      <h2>{t("settings.leaves")}</h2>
      <table className="settings-table">
        <thead>
          <tr>
            <th scope="col">{t("settings.item")}</th>
            <th scope="col">{t("settings.destination")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([item, destination]) => (
            <tr key={item}>
              <td>{item}</td>
              <td>{destination}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
