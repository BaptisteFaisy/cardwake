/**
 * La barre de la pile (O4) : ce que l'appareil garde, comment l'exporter,
 * comment en ouvrir une autre.
 *
 * Elle ne vit dans aucun écran : la pile traverse tous les écrans, et le
 * sélecteur doit rester sous la main. Trois choses à dire honnêtement : ce
 * que l'appareil garde, si la pile vient d'être reprise au démarrage, et —
 * quand c'est le cas — pourquoi une écriture a échoué.
 */

import type { Stack } from "@cardwake/model";
import type { AutosaveStatus } from "../data/autosave";
import type { StorageLike } from "../data/storage";
import { t } from "../i18n";

export type StackBarProps = {
  /** La pile ouverte, ou `null`. */
  stack: Stack | null;
  /** La pile affichée vient-elle de l'appareil (reprise au démarrage) ? */
  resumed: boolean;
  /** L'état de la dernière écriture automatique. */
  status: AutosaveStatus;
  /** Le stockage de l'appareil, ou `null` quand le navigateur n'en donne pas. */
  storage: StorageLike | null;
  /** Exporte la pile en un fichier `.json`. */
  onExport: () => void;
  /** Va choisir une autre pile : l'étagère et ses exemples. */
  onOpenAnother: () => void;
  /** Repart d'une pile vide. */
  onNewStack: () => void;
};

/** Ce que la barre dit de la pile ouverte, en une phrase. */
function headline(props: StackBarProps): string {
  if (props.stack === null) return t("persist.noStack");
  return props.resumed ? t("persist.resumed") : t("persist.kept");
}

/**
 * Ce que la barre dit du stockage, ou `null` quand tout va bien. Un stockage
 * absent ou plein ne doit jamais passer sous silence : sans lui, la pile ne
 * survit pas au rechargement, et c'est à l'utilisateur de décider quoi faire.
 */
function storageLine(props: StackBarProps): string | null {
  const { storage, status } = props;
  if (storage === null) return t("persist.storageUnavailable");
  if (status.kind !== "fault") return null;
  return t("persist.storageRefused", { reason: status.fault.reason });
}

export function StackBar(props: StackBarProps): JSX.Element {
  const { stack, onExport, onOpenAnother, onNewStack } = props;
  const problem = storageLine(props);
  return (
    <section className="state-note stack-bar" aria-label={t("persist.title")}>
      <p className="stack-bar__state" role="status">
        {headline(props)}
      </p>
      {problem !== null ? (
        <p className="stack-bar__problem" role="alert">
          {problem}
        </p>
      ) : null}
      <div className="shelf-actions">
        {stack !== null ? (
          <button type="button" onClick={onExport}>
            {t("persist.export")}
          </button>
        ) : null}
        <button type="button" onClick={onOpenAnother}>
          {t("persist.openAnother")}
        </button>
        <button type="button" onClick={onNewStack}>
          {t("persist.newStack")}
        </button>
      </div>
      <p className="stack-bar__hint">{t("persist.dropHint")}</p>
    </section>
  );
}
