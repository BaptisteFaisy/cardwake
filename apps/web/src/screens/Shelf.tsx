/**
 * L'étagère (CAR-F-01) : les trois piles d'exemple, « New stack », « Open a
 * file ». Les piles d'exemple sont relues et validées par `parseStackFile`,
 * comme n'importe quel fichier reçu : le site ne fait pas plus confiance à
 * ses propres exemples qu'à ceux d'un inconnu.
 *
 * La persistance sur l'appareil n'est pas encore branchée : la section
 * « Saved on this device » le dit honnêtement au lieu d'afficher une liste vide.
 */
import { useRef } from "react";
import { parseStackFile } from "@cardwake/model";
import type { Stack } from "@cardwake/model";
import manorRaw from "../../../../stacks/manor/stack.json";
import quotesRaw from "../../../../stacks/quotes/stack.json";
import dashboardRaw from "../../../../stacks/dashboard/stack.json";
import { t } from "../i18n";

/** Valide une pile de démonstration au chargement : aucune pile tordue en vitrine. */
function demoStack(raw: unknown, label: string): Stack {
  const parsed = parseStackFile(JSON.stringify(raw));
  if (!parsed.ok) throw new Error(`Demo stack ${label} refused: ${parsed.errors.join(", ")}`);
  return parsed.stack;
}

export const DEMO_STACKS: readonly Stack[] = [
  demoStack(manorRaw, "manor"),
  demoStack(quotesRaw, "quotes"),
  demoStack(dashboardRaw, "dashboard"),
];

export type ShelfProps = {
  onOpen: (stack: Stack) => void;
  onNew: () => void;
  onOpenFile: (file: File) => void;
  /** Raison d'un fichier refusé, affichée telle quelle (CAR-F-51). */
  fileError: string | null;
};

export function Shelf(props: ShelfProps): JSX.Element {
  const { onOpen, onNew, onOpenFile, fileError } = props;
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <section aria-labelledby="shelf-title">
      <h1 id="shelf-title">{t("shelf.title")}</h1>
      <p>{t("app.tagline")}</p>

      <div className="shelf-actions">
        <button type="button" onClick={onNew}>
          {t("shelf.newStack")}
        </button>
        <button type="button" onClick={() => fileInput.current?.click()}>
          {t("shelf.openFile")}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          aria-label={t("shelf.openFile")}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onOpenFile(file);
            event.target.value = "";
          }}
        />
      </div>

      {fileError !== null ? (
        <p className="state-note refusal" role="alert">
          {t("state.fileRefused")} {fileError}
        </p>
      ) : null}

      <h2>{t("shelf.examples")}</h2>
      <ul className="shelf-list">
        {DEMO_STACKS.map((stack) => (
          <DemoItem key={stack.name} stack={stack} onOpen={onOpen} />
        ))}
      </ul>

      <h2>{t("shelf.saved")}</h2>
      <p>{t("shelf.none")}</p>
    </section>
  );
}

function DemoItem({ stack, onOpen }: { stack: Stack; onOpen: (stack: Stack) => void }): JSX.Element {
  return (
    <li className="shelf-item">
      <span className="stack-name">{stack.name}</span>
      <span className="stack-hint">{t("shelf.cardCount", { count: stack.cards.length })}</span>
      {stack.name === "The Manor" ? <span className="stack-hint">{t("shelf.startHere")}</span> : null}
      {stack.provenance.kind === "received" ? <span className="badge">{t("shelf.received")}</span> : null}
      <span>{stack.persona}</span>
      <button type="button" onClick={() => onOpen(stack)}>
        {t("shelf.open")}
      </button>
    </li>
  );
}
