/**
 * Les réglages (CAR-F-47, CAR-F-48, CAR-F-49) : mode d'accès au modèle,
 * saisie/test/effacement de la clé **en mémoire seule**, budgets de la pile
 * ouverte, et le tableau honnête « what leaves your machine ».
 *
 * Rien n'est persisté ici : la clé vit dans un état React et disparaît avec
 * la page. Le test de clé n'est pas branché sur une passerelle (autre lot) :
 * l'écran le dit au lieu de faire semblant.
 */
import { useState } from "react";
import type { StackSettings } from "@cardwake/model";
import { useCardwake } from "../store";
import { t } from "../i18n";

type AccessMode = "recorded" | "key" | "relay";

export function Settings(): JSX.Element {
  const { stack } = useCardwake();
  const [access, setAccess] = useState<AccessMode>("recorded");

  return (
    <section aria-labelledby="settings-title">
      <h1 id="settings-title">{t("settings.title")}</h1>

      <div className="settings-section">
        <h2>{t("settings.modelAccess")}</h2>
        <AccessPicker access={access} onPick={setAccess} />
        {access === "recorded" ? <p>{t("settings.modeRecordedHint")}</p> : null}
      </div>

      {access === "key" ? <KeySection /> : null}

      <div className="settings-section">
        <h2>{t("settings.budgets")}</h2>
        {stack === null ? <p>{t("common.none")}</p> : <BudgetTable settings={stack.settings} />}
      </div>

      <LeavesTable />
      <p>{t("settings.saved")}</p>
    </section>
  );
}

function AccessPicker({ access, onPick }: { access: AccessMode; onPick: (mode: AccessMode) => void }): JSX.Element {
  const modes: [AccessMode, string][] = [
    ["recorded", t("settings.modeRecorded")],
    ["key", t("settings.modeKey")],
    ["relay", t("settings.modeRelay")],
  ];
  return (
    <div role="radiogroup" aria-label={t("settings.modelAccess")}>
      {modes.map(([value, label]) => (
        <label key={value}>
          <input
            type="radio"
            name="model-access"
            value={value}
            checked={access === value}
            onChange={() => onPick(value)}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

/** La clé : mémoire seule, jamais de stockage appareil (CAR-F-48). */
function KeySection(): JSX.Element {
  const [key, setKey] = useState("");
  const [keyNote, setKeyNote] = useState<string | null>(null);
  return (
    <div className="settings-section">
      <h2>{t("settings.key")}</h2>
      <div className="key-row">
        <input
          type="password"
          value={key}
          placeholder={t("settings.keyPlaceholder")}
          aria-label={t("settings.key")}
          autoComplete="off"
          onChange={(event) => {
            setKey(event.target.value);
            setKeyNote(null);
          }}
        />
        <button type="button" disabled={key === ""} onClick={() => setKeyNote(t("settings.keyUntested"))}>
          {t("settings.keyTest")}
        </button>
        <button
          type="button"
          disabled={key === "" && keyNote === null}
          onClick={() => {
            setKey("");
            setKeyNote(null);
          }}
        >
          {t("settings.keyClear")}
        </button>
      </div>
      <p>{t("settings.keyMemoryOnly")}</p>
      {keyNote !== null ? (
        <p className="state-note" role="status">
          {keyNote}
        </p>
      ) : null}
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
    [t("settings.itemKey"), t("settings.destKey")],
    [t("settings.itemTurn"), t("settings.destTurn")],
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
