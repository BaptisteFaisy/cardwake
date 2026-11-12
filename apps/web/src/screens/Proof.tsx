/**
 * L'écran des preuves : ce que le projet a prouvé (les 29 preuves de la
 * campagne, déjà jouées), et ce qui se recalcule maintenant dans le
 * navigateur (sept démonstrations jouées par le moteur réel — sans modèle,
 * sans réseau, sans clé).
 *
 * L'écran ne calcule rien lui-même : il appelle les fonctions pures de
 * `proofs` et affiche leurs lignes. Les lignes sont des données calculées
 * (comme la trace de l'espion), donc affichées telles quelles ; toute la
 * chrome — titres, verdicts, bouton — passe par `t()`. La zone est
 * `aria-live` : un lecteur d'écran annonce les nouveaux verdicts sans que
 * le focus ne bouge.
 */
import { useEffect, useState } from "react";
import { t } from "../i18n";
import { CAMPAIGN_PROOFS } from "../data/proofs";
import type { CampaignProof } from "../data/proofs";
import { demoManor, demoQuote, demoRelay, demoReplay, demoRights, demoSpy, demoUndo } from "../proofs";
import type { ProofDemo } from "../proofs";

/** Les sept démonstrations recalculées, dans l'ordre de l'écran. */
const LIVE_DEMOS: { key: string; run: () => Promise<ProofDemo> }[] = [
  { key: "quote", run: demoQuote },
  { key: "manor", run: demoManor },
  { key: "spy", run: demoSpy },
  { key: "rights", run: demoRights },
  { key: "replay", run: demoReplay },
  { key: "undo", run: demoUndo },
  { key: "relay", run: demoRelay },
];

export function Proof(): JSX.Element {
  return (
    <section className="proof" aria-labelledby="proof-title" aria-live="polite">
      <h1 id="proof-title">{t("proof.title")}</h1>
      <p>{t("proof.intro")}</p>
      <CampaignProofs />
      <LiveProofs />
    </section>
  );
}

/** Les 29 preuves déjà jouées : étape, ce qu'elles prouvent, commande. */
function CampaignProofs(): JSX.Element {
  return (
    <section aria-labelledby="proof-campaign">
      <h2 id="proof-campaign">{t("proof.campaign")}</h2>
      <p>{t("proof.campaignHint")}</p>
      <ol className="proof-campaign">
        {CAMPAIGN_PROOFS.map((proof) => (
          <CampaignEntry key={proof.id} proof={proof} />
        ))}
      </ol>
    </section>
  );
}

/** Une preuve de la campagne : son identifiant, son verdict, sa commande. */
function CampaignEntry({ proof }: { proof: CampaignProof }): JSX.Element {
  return (
    <li>
      <h3>
        {proof.id} · {proof.step}
      </h3>
      <p>{proof.proves}</p>
      <p>
        <code>{proof.command}</code>
      </p>
      <Verdict ok={proof.verdict === "verified"} />
    </li>
  );
}

/** Les six preuves recalculées : jouées au montage, rejouables au bouton. */
function LiveProofs(): JSX.Element {
  const [results, setResults] = useState<ProofDemo[] | null>(null);
  const [running, setRunning] = useState(false);

  /** Joue les six démonstrations, chacune sur son propre moteur. */
  const runProofs = (): void => {
    setRunning(true);
    void Promise.all(LIVE_DEMOS.map((demo) => demo.run())).then((done) => {
      setResults(done);
      setRunning(false);
    });
  };

  useEffect(runProofs, []);

  return (
    <section aria-labelledby="proof-live">
      <h2 id="proof-live">{t("proof.live")}</h2>
      <p>{t("proof.liveHint")}</p>
      <button type="button" onClick={runProofs} disabled={running}>
        {t("proof.replay")}
      </button>
      {running ? (
        <p className="state-note" role="status">
          {t("proof.running")}
        </p>
      ) : null}
      {results === null ? null : (
        <ol className="proof-live">
          {LIVE_DEMOS.map((demo, index) => (
            <LiveEntry key={demo.key} demoKey={demo.key} result={results[index]} />
          ))}
        </ol>
      )}
    </section>
  );
}

/** Une preuve recalculée : son verdict, puis ses étapes intermédiaires. */
function LiveEntry({ demoKey, result }: { demoKey: string; result: ProofDemo }): JSX.Element {
  return (
    <li>
      <h3>{t(`proof.demo.${demoKey}`)}</h3>
      <Verdict ok={result.ok} skipped={result.skipped === true} />
      <p>{t("proof.steps")}</p>
      <ol className="proof-lines">
        {result.lines.map((line, index) => (
          <li key={`${index}-${line}`}>
            <code>{line}</code>
          </li>
        ))}
      </ol>
    </li>
  );
}

/** La pastille de verdict : vérifié, échoué, ou sauté. */
function Verdict({ ok, skipped }: { ok: boolean; skipped?: boolean }): JSX.Element {
  const label = skipped === true
    ? t("proof.verdict.skipped")
    : ok
      ? t("proof.verdict.verified")
      : t("proof.verdict.failed");
  return <span className="badge">{label}</span>;
}
