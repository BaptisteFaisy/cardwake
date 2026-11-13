/**
 * Une pile refusée, dite en clair (CAR-F-51, état 12.2 « fichier refusé »).
 *
 * Le diagnostic tient en trois choses : la raison exacte du refus, la
 * promesse que le contenu refusé n'est pas perdu, et deux gestes — repartir
 * d'une pile vide, ou télécharger le fichier refusé tel quel. Rien n'est
 * chargé à moitié, et rien n'est jeté sans trace.
 */

import type { PersistFault } from "../data/persist";
import { t } from "../i18n";

export type RefusedNoticeProps = {
  /** La raison du refus, et la règle qui l'a motivé. */
  fault: PersistFault;
  /** Télécharge le fichier refusé, tel qu'il a été reçu (`null` : rien de gardé). */
  onDownload: (() => void) | null;
  /** Repart d'une pile vide, sans effacer le contenu refusé. */
  onStartEmpty: () => void;
  /** Ferme le diagnostic. */
  onDismiss: () => void;
};

export function RefusedNotice(props: RefusedNoticeProps): JSX.Element {
  const { fault, onDownload, onStartEmpty, onDismiss } = props;
  return (
    <section className="state-note refusal" role="alert">
      <p>
        <strong>{t("persist.refused")}</strong> {fault.reason}
      </p>
      <p>{t("persist.refusedKept")}</p>
      <div className="shelf-actions">
        <button type="button" onClick={onStartEmpty}>
          {t("persist.startEmpty")}
        </button>
        {onDownload !== null ? (
          <button type="button" onClick={onDownload}>
            {t("persist.refusedDownload")}
          </button>
        ) : null}
        <button type="button" onClick={onDismiss}>
          {t("common.close")}
        </button>
      </div>
    </section>
  );
}
