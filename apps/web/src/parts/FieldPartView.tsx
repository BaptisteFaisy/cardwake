/**
 * Un champ, rendu comme un vrai `<input>` ou `<textarea>` (11.8).
 *
 * - verrouillé en mode Jouer : `readOnly`, la saisie humaine est refusée
 *   (CAR-F-06) — l'erreur elle-même est du texte, annoncée par le moteur ;
 * - `aria-label` au nom de l'objet, ordre de tabulation = ordre du DOM, donc
 *   ordre des éléments ;
 * - un texte écrit par un agent porte l'encre d'accent **et** une marque en
 *   marge, et un `aria-live="polite"` l'annonce sans voler le focus
 *   (CAR-F-42, 12.4) ; dès qu'un humain le modifie, l'encre redevient noire.
 */
import { useEffect, useState } from "react";
import type { ChangeEvent, CSSProperties } from "react";
import type { FieldPart, Rect } from "@cardwake/model";
import { CARD_SIZE } from "@cardwake/model";
import { t } from "../i18n";

/**
 * Rectangle de la carte (512×342 points) vers un positionnement en
 * pourcentages : le cadre se met à l'échelle sans transform ni JS.
 * Exporté d'ici et réutilisé par `ButtonPartView` : un seul exemplaire,
 * pour rester dans la liste de fichiers du lot.
 */
export function partStyle(rect: Rect): CSSProperties {
  const [, , cardWidth, cardHeight] = CARD_SIZE;
  const [x, y, width, height] = rect;
  return {
    left: `${(x / cardWidth) * 100}%`,
    top: `${(y / cardHeight) * 100}%`,
    width: `${(width / cardWidth) * 100}%`,
    height: `${(height / cardHeight) * 100}%`,
  };
}

export type FieldPartViewProps = {
  part: FieldPart;
  /** Texte actuel : contenu de la carte pour un champ de fond. */
  text: string;
  /** Le texte vient d'un agent et n'a pas été retouché depuis (CAR-F-42). */
  inkedByAgent: boolean;
  /** Champ verrouillé **et** mode Jouer actif : saisie humaine refusée. */
  lockedInPlay: boolean;
  buildMode: boolean;
  selected: boolean;
  /** Saisie validée (perte de focus ou Entrée) : ouvre une transaction. */
  onCommit: (text: string) => void;
  onSelect: () => void;
};

type FieldControl = {
  value: string;
  readOnly: boolean;
  "aria-label": string;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
};

/**
 * Propriétés communes au `<input>` et au `<textarea>` : un seul exemplaire,
 * pour que les deux rendus restent strictement identiques côté accessibilité.
 */
function controlProps(
  part: FieldPart,
  draft: string,
  lockedInPlay: boolean,
  onSelect: () => void,
  commit: () => void,
  setDraft: (value: string) => void,
): FieldControl {
  return {
    value: draft,
    readOnly: lockedInPlay,
    "aria-label": part.name,
    onFocus: onSelect,
    onBlur: commit,
    onChange: (event) => setDraft(event.target.value),
  };
}

export function FieldPartView(props: FieldPartViewProps): JSX.Element {
  const { part, text, inkedByAgent, lockedInPlay, buildMode, selected, onCommit, onSelect } = props;
  // Brouillon local : une transaction par saisie validée, pas par frappe.
  const [draft, setDraft] = useState(text);

  useEffect(() => {
    setDraft(text);
  }, [text]);

  const commit = (): void => {
    if (draft !== text) onCommit(draft);
  };

  const shared = controlProps(part, draft, lockedInPlay, onSelect, commit, setDraft);

  return (
    <div
      className={`part part-field${inkedByAgent ? " ink-agent" : ""}${selected && buildMode ? " selected" : ""}`}
      style={partStyle(part.rect)}
      {...(inkedByAgent ? { "aria-live": "polite" as const } : {})}
    >
      {inkedByAgent ? (
        <span className="ink-mark" aria-hidden="true">
          ◆
        </span>
      ) : null}
      {part.multiline ? (
        <textarea rows={2} {...shared} />
      ) : (
        <input
          type="text"
          {...shared}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
          }}
        />
      )}
      {lockedInPlay ? (
        <span className="visually-hidden">{t("play.locked")}</span>
      ) : null}
    </div>
  );
}
