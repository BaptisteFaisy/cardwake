/**
 * Le journal (CAR-F-44, CAR-F-45, CAR-F-46) : les transactions de la plus
 * récente à la plus ancienne, un filtre par acteur, annuler/rétablir et
 * l'export en texte.
 *
 * Les lignes d'opérations et les noms d'acteurs viennent de `describeOp` et
 * `describeActor` du modèle : un seul exemplaire, déjà testé. La ligne d'un
 * agent porte l'encre d'accent **et** une marque en marge (12.3).
 */
import { useState } from "react";
import { describeActor, describeOp } from "@cardwake/model";
import type { Transaction, TransactionActor } from "@cardwake/model";
import { useCardwake } from "../store";
import type { JournalView } from "../engine/types";
import type { CardwakeEngine } from "../engine/types";
import { t } from "../i18n";

type ActorFilter = TransactionActor["kind"] | "all";

export function Journal(): JSX.Element {
  const { engine, journal } = useCardwake();
  const [filter, setFilter] = useState<ActorFilter>("all");
  const [showExport, setShowExport] = useState(false);
  const entries =
    filter === "all" ? journal.entries : journal.entries.filter((tx) => tx.actor.kind === filter);

  return (
    <section aria-labelledby="journal-title">
      <h1 id="journal-title">{t("journal.title")}</h1>
      <JournalToolbar
        engine={engine}
        journal={journal}
        filter={filter}
        onFilter={setFilter}
        showExport={showExport}
        onToggleExport={() => setShowExport(!showExport)}
      />
      {showExport ? (
        <textarea
          className="journal-export"
          readOnly
          rows={12}
          value={journal.exportText}
          aria-label={t("journal.export")}
        />
      ) : null}
      {entries.length === 0 ? (
        <p className="state-note">{t("journal.empty")}</p>
      ) : (
        <ul className="journal-list">
          {entries.map((tx) => (
            <JournalEntry key={tx.id} tx={tx} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Filtre par acteur, annuler/rétablir, export texte (CAR-F-45/46). */
function JournalToolbar(props: {
  engine: CardwakeEngine;
  journal: JournalView;
  filter: ActorFilter;
  onFilter: (filter: ActorFilter) => void;
  showExport: boolean;
  onToggleExport: () => void;
}): JSX.Element {
  const { engine, journal, filter, onFilter, showExport, onToggleExport } = props;
  return (
    <div className="journal-toolbar">
      <label>
        {t("journal.filter")}{" "}
        <select value={filter} onChange={(event) => onFilter(event.target.value as ActorFilter)}>
          <option value="all">{t("journal.filterAll")}</option>
          <option value="human">{t("journal.filterHuman")}</option>
          <option value="script">{t("journal.filterScript")}</option>
          <option value="agent">{t("journal.filterAgent")}</option>
        </select>
      </label>
      <button
        type="button"
        disabled={!journal.canUndo}
        title={journal.canUndo ? undefined : t("journal.noUndo")}
        onClick={() => engine.undo()}
      >
        {t("journal.undo")}
      </button>
      <button
        type="button"
        disabled={!journal.canRedo}
        title={journal.canRedo ? undefined : t("journal.noRedo")}
        onClick={() => engine.redo()}
      >
        {t("journal.redo")}
      </button>
      <button type="button" aria-pressed={showExport} onClick={onToggleExport}>
        {t("journal.export")}
      </button>
    </div>
  );
}

function JournalEntry({ tx }: { tx: Transaction }): JSX.Element {
  return (
    <li className={`journal-entry${tx.actor.kind === "agent" ? " from-agent" : ""}`}>
      <div>
        <strong>#{tx.id}</strong> <span className="actor">{describeActor(tx.actor)}</span>{" "}
        <span className="meta">{t("journal.at", { clock: tx.clock })}</span>
      </div>
      <div>{tx.cause}</div>
      <ul>
        {tx.ops.map((op, index) => (
          <li key={index}>{describeOp(op)}</li>
        ))}
      </ul>
      <div className="meta">{t("journal.opCount", { count: tx.ops.length })}</div>
    </li>
  );
}
