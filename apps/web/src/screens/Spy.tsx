/**
 * L'espion de messages (CAR-F-19) : la trace de la dernière action humaine.
 *
 * L'écran ne calcule rien : il lit `engine.spy()` — le `Dispatcher` a déjà
 * savoir ce que le message a traversé, qui l'a pris et ce qui a été refusé.
 * Tout est en listes sémantiques (`dl`, `ol`, `ul`) et la zone est
 * `aria-live` : un lecteur d'écran annonce la nouvelle trace sans qu'il
 * faille la chercher.
 */
import { useCardwake } from "../store";
import type { Refusal, SpyView } from "../engine/types";
import { t } from "../i18n";

export function Spy(): JSX.Element {
  const { spy } = useCardwake();
  return (
    <section className="spy" aria-labelledby="spy-title" aria-live="polite">
      <h1 id="spy-title">{t("spy.title")}</h1>
      {spy.message === null ? (
        <p className="state-note">{t("spy.empty")}</p>
      ) : (
        <SpyReport view={spy} />
      )}
    </section>
  );
}

/** Le rapport : les faits d'abord, puis la trace, puis les refus. */
function SpyReport({ view }: { view: SpyView }): JSX.Element {
  return (
    <>
      <SpyFacts view={view} />
      <SpyPath path={view.path} />
      <SpyTrace trace={view.trace} />
      <SpyRefusals refusals={view.refusals} />
    </>
  );
}

/** Les faits du message : ce qu'il était, où il allait, qui l'a pris. */
function SpyFacts({ view }: { view: SpyView }): JSX.Element {
  return (
    <dl className="spy-facts">
      <dt>{t("spy.message")}</dt>
      <dd>{view.message ?? t("spy.none")}</dd>
      <dt>{t("spy.target")}</dt>
      <dd>{view.target ?? t("spy.none")}</dd>
      <dt>{t("spy.handledBy")}</dt>
      <dd>{view.handledBy ?? t("spy.nobody")}</dd>
      <dt>{t("spy.hopsLeft")}</dt>
      <dd>{view.hopsLeft}</dd>
    </dl>
  );
}

/** Les objets traversés, dans l'ordre. */
function SpyPath({ path }: { path: string[] }): JSX.Element {
  if (path.length === 0) return <p className="state-note">{t("spy.none")}</p>;
  return (
    <>
      <h2>{t("spy.path")}</h2>
      <ol className="spy-path">
        {path.map((item, index) => (
          <li key={`${index}-${item}`}>{item}</li>
        ))}
      </ol>
    </>
  );
}

/** La trace, ligne à ligne : ce que le `Dispatcher` a fait. */
function SpyTrace({ trace }: { trace: string[] }): JSX.Element {
  if (trace.length === 0) return <p className="state-note">{t("spy.none")}</p>;
  return (
    <>
      <h2>{t("spy.trace")}</h2>
      <ol className="spy-trace">
        {trace.map((line, index) => (
          <li key={`${index}-${line}`}>{line}</li>
        ))}
      </ol>
    </>
  );
}

/** Les refus rencontrés, avec la règle qui les motive. */
function SpyRefusals({ refusals }: { refusals: Refusal[] }): JSX.Element {
  if (refusals.length === 0) return <p className="state-note">{t("spy.none")}</p>;
  return (
    <>
      <h2>{t("spy.refusals")}</h2>
      <ul className="spy-refusals">
        {refusals.map((refusal, index) => (
          <li key={`${index}-${refusal.rule}`}>
            {t("spy.refusalLine", { reason: refusal.reason, rule: refusal.rule })}
          </li>
        ))}
      </ul>
    </>
  );
}
