/**
 * Le journal (12.1) : les transactions de la plus récente à la plus ancienne,
 * un filtre par acteur, annuler et rétablir, et l'export en texte.
 *
 * C'est l'écran qui rend visible la promesse du projet : ce qu'un agent a fait
 * est écrit, lisible, et s'annule d'un geste (CAR-F-44, CAR-F-45).
 */

import { useState } from "react";
import type { TransactionActor } from "@cardwake/model";
import { t } from "../i18n";
import { useCardwake } from "../store";

type Filter = "all" | TransactionActor["kind"];

const FILTERS: Filter[] = ["all", "human", "script", "agent"];

/** Une ligne lisible pour une transaction : qui, pourquoi, combien d'opérations. */
function describe(actor: TransactionActor): string {
  if (actor.kind === "human") return actor.mode === "author" ? t("mode.build") : t("mode.play");
  if (actor.kind === "script") return `${t("common.you")} · script`;
  return `${t("journal.filterAgent")} · ${actor.cardId}`;
}

export function JournalScreen({ onBack }: { onBack: () => void }): JSX.Element {
  const { engine, journal } = useCardwake();
  const [filter, setFilter] = useState<Filter>("all");
  const entries = filter === "all" ? journal.entries : journal.entries.filter((entry) => entry.actor.kind === filter);

  return (
    <section className="journal">
      <header className="journal__bar">
        <button type="button" onClick={onBack}>{t("nav.backToShelf")}</button>
        <h1>{t("journal.title")}</h1>
      </header>

      <div className="journal__filters" role="group" aria-label={t("journal.filter")}>
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={filter === item}
            onClick={() => setFilter(item)}
          >
            {item === "all" ? t("journal.filterAll") : t(`journal.filter${item.charAt(0).toUpperCase()}${item.slice(1)}`)}
          </button>
        ))}
      </div>

      <div className="journal__actions">
        <button type="button" onClick={() => engine.undo()} disabled={!journal.canUndo}>
          {journal.canUndo ? t("journal.undo") : t("journal.noUndo")}
        </button>
        <button type="button" onClick={() => engine.redo()} disabled={!journal.canRedo}>
          {journal.canRedo ? t("journal.redo") : t("journal.noRedo")}
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="journal__empty">{t("journal.empty")}</p>
      ) : (
        <ol className="journal__list">
          {entries.map((entry) => (
            <li key={entry.id} className={entry.actor.kind === "agent" ? "journal__entry journal__entry--agent" : "journal__entry"}>
              <span className="journal__id">#{entry.id}</span>
              <span className="journal__actor">{describe(entry.actor)}</span>
              <span className="journal__cause">{entry.cause}</span>
              <span className="journal__ops">{t("journal.opCount", { count: entry.ops.length })}</span>
              <span className="journal__at">{t("journal.at")} {entry.clock}</span>
            </li>
          ))}
        </ol>
      )}

      <details className="journal__export">
        <summary>{t("journal.export")}</summary>
        <pre>{journal.exportText}</pre>
      </details>
    </section>
  );
}
