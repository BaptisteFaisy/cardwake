/**
 * Racine du site.
 *
 * Étape en cours du lot C5 : le moteur réel (`engine/model-engine.ts`), le
 * contexte (`store.tsx`), les textes (`i18n.ts`) et les deux encres
 * (`styles/two-inks.css`) sont en place. Cette amorce monte le moteur dans le
 * contexte et affiche le titre et la pile ouverte ; les sept écrans prennent la
 * suite et liront l'état via `useCardwake()`.
 */

import type { ReactNode } from "react";
import type { CardwakeEngine } from "./engine/types";
import { CardwakeProvider, useCardwake } from "./store";
import { t } from "./i18n";
import "./styles/two-inks.css";

/** Ce que le cadre affiche tant que les écrans ne sont pas montés. */
function Shell() {
  const { stack, mode } = useCardwake();
  return (
    <main className="app">
      <header className="app__header">
        <h1>{t("app.title")}</h1>
        <p className="app__mode">{t(`mode.${mode}`)}</p>
      </header>
      <section className="app__body">
        {stack ? (
          <p>{t("shelf.stacks.count", { count: stack.cards.length })}</p>
        ) : (
          <p>{t("state.emptyStack")}</p>
        )}
      </section>
    </main>
  );
}

export function App({ engine }: { engine?: CardwakeEngine }) {
  const shell: ReactNode = <Shell />;
  return engine ? <CardwakeProvider engine={engine}>{shell}</CardwakeProvider> : <main className="app">{t("app.title")}</main>;
}

export default App;
