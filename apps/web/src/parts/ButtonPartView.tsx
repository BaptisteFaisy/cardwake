/**
 * Un bouton, rendu comme un vrai `<button>` (11.8) : accessible au clavier,
 * `aria-label` au nom de l'objet, désactivé quand l'élément l'est.
 *
 * En mode Fabriquer, le clic **sélectionne** l'élément au lieu de l'activer :
 * on ne joue pas la carte pendant qu'on la construit.
 */
import type { ButtonPart } from "@cardwake/model";
import { partStyle } from "./FieldPartView";

export type ButtonPartViewProps = {
  part: ButtonPart;
  buildMode: boolean;
  selected: boolean;
  /** Activation en mode Jouer : le moteur décide ce qu'elle produit. */
  onActivate: () => void;
  onSelect: () => void;
};

export function ButtonPartView(props: ButtonPartViewProps): JSX.Element {
  const { part, buildMode, selected, onActivate, onSelect } = props;
  return (
    <div
      className={`part part-button${selected && buildMode ? " selected" : ""}`}
      style={partStyle(part.rect)}
    >
      <button
        type="button"
        aria-label={part.name}
        disabled={!part.enabled}
        onClick={() => (buildMode ? onSelect() : onActivate())}
      >
        {part.label === "" ? part.name : part.label}
      </button>
    </div>
  );
}
