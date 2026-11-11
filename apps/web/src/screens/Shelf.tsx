/**
 * L'étagère (12.1) : tes piles, les trois exemples, « nouvelle pile ».
 * C'est l'écran d'arrivée — celui d'un juge qui n'a pas de clé.
 */

import { createStack } from "@cardwake/model";
import { DEMO_STACKS } from "../data";
import { t } from "../i18n";
import { useCardwake } from "../store";

export function Shelf({ onOpenStack }: { onOpenStack: () => void }): JSX.Element {
  const { engine } = useCardwake();

  const open = (stack: Parameters<typeof engine.openStack>[0]): void => {
    engine.openStack(stack);
    onOpenStack();
  };

  return (
    <section className="shelf">
      <header className="shelf__head">
        <h1>{t("app.name")}</h1>
        <p className="shelf__tagline">{t("app.tagline")}</p>
        <p className="shelf__start-here">{t("shelf.startHere")}</p>
      </header>

      <h2>{t("shelf.examples")}</h2>
      <ul className="shelf__list">
        {DEMO_STACKS.map((demo) => (
          <li key={demo.slug} className="shelf__item">
            <button type="button" className="shelf__open" onClick={() => open(demo.stack)}>
              <span className="shelf__name">{demo.stack.name}</span>
              <span className="shelf__count">
                {t("shelf.cardCount", { count: demo.stack.cards.length })}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <h2>{t("shelf.saved")}</h2>
      <p className="shelf__none">{t("shelf.none")}</p>

      <div className="shelf__actions">
        <button
          type="button"
          onClick={() => {
            const name = t("shelf.newStackName");
            open(createStack(name));
          }}
        >
          {t("shelf.newStack")}
        </button>
      </div>
    </section>
  );
}
