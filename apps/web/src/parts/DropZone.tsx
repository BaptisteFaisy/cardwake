/**
 * Le glisser-déposer d'un fichier de pile (CAR-F-51).
 *
 * N'importe où dans la page : on dépose un `.json`, il est lu et validé par
 * le même chemin que le bouton « Open a file ». Un fichier refusé l'est pour
 * la même raison, dite de la même façon.
 *
 * Les écouteurs vivent sur le document, pas sur un cadre : le dépôt marche
 * depuis n'importe quel écran, et le cadre changerait la mise en page.
 */

import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";

/** Les fichiers déposés, sans supposer que le navigateur les donne. */
export function droppedFiles(event: Event): File[] {
  const data = (event as DragEvent).dataTransfer;
  if (!data || !data.files) return [];
  return Array.from(data.files);
}

/** Ce glisser-déposer porte-t-il des fichiers ? (un texte glissé ne compte pas) */
function carriesFiles(event: Event): boolean {
  const data = (event as DragEvent).dataTransfer;
  if (!data) return false;
  const types = data.types ? Array.from(data.types) : [];
  return types.includes("Files") || droppedFiles(event).length > 0;
}

/**
 * Le survol des fichiers déposés sur la page : rend `true` tant qu'un
 * fichier est au-dessus du document. Le geste lui-même part vers `onFile`.
 */
export function useDropTarget(onFile: (file: File) => void): boolean {
  const [over, setOver] = useState(false);
  const handler = useRef(onFile);
  handler.current = onFile;

  useEffect(() => {
    const onDragOver = (event: Event): void => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      setOver(true);
    };
    // On ne referme le voile qu'en quittant la fenêtre : passer au-dessus
    // d'un bouton ne doit pas faire clignoter l'invite.
    const onDragLeave = (event: Event): void => {
      if (event.target === document.documentElement) setOver(false);
    };
    const onDrop = (event: Event): void => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      setOver(false);
      const file = droppedFiles(event)[0];
      if (file) handler.current(file);
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("drop", onDrop);
    };
  }, []);

  return over;
}

/** Le voile affiché pendant le survol : il ne prend aucun clic. */
const VEIL = {
  position: "fixed",
  inset: 0,
  zIndex: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: "2rem",
  background: "rgba(247, 245, 239, 0.94)",
  border: "3px dashed var(--ink)",
  fontFamily: "var(--font-title)",
  pointerEvents: "none",
} as const;

export type DropZoneProps = {
  /** Appelé avec le premier fichier déposé. */
  onFile: (file: File) => void;
};

export function DropZone({ onFile }: DropZoneProps): JSX.Element | null {
  const over = useDropTarget(onFile);
  if (!over) return null;
  return (
    <div role="status" style={VEIL}>
      {t("persist.dropActive")}
    </div>
  );
}
