/**
 * L'écran de réception (7.10, CAR-F-52) : ce que contient la pile reçue, ses
 * agents avec leur niveau et leur consigne en clair, et les **deux gestes
 * distincts** — « Wake the agents » (niveau plafonné à 2 par le modèle tant
 * que la pile n'est pas fiable), puis « I trust this stack » (niveaux
 * d'origine).
 *
 * L'écran s'ouvre en mode Fabriquer : réveiller un agent est un geste
 * d'auteur, `authorizeOp` le refuse en mode Jouer.
 */
import type { Card, Stack } from "@cardwake/model";
import { useCardwake } from "../store";
import type { CardwakeEngine } from "../engine/types";
import { t } from "../i18n";

/** Nombre de scripts non vides : pile, fonds, cartes, éléments. */
function countScripts(stack: Stack): number {
  const partScripts = (items: { parts: { script: string }[] }[]): number =>
    items.flatMap((item) => item.parts).filter((part) => part.script.trim() !== "").length;
  return (
    (stack.script.trim() === "" ? 0 : 1) +
    partScripts(stack.backgrounds) +
    partScripts(stack.cards) +
    stack.cards.filter((card) => card.script.trim() !== "").length +
    stack.backgrounds.filter((bg) => bg.script.trim() !== "").length
  );
}

/** Les cartes habitées, avec leur agent. */
function agentsOf(stack: Stack): { card: Card; level: number; persona: string; awake: boolean }[] {
  return stack.cards
    .filter((card) => card.agent !== null)
    .map((card) => ({
      card,
      level: card.agent?.level ?? 1,
      persona: card.agent?.persona ?? "",
      awake: card.agent?.awake ?? false,
    }));
}

export function Reception(): JSX.Element {
  const { engine, stack } = useCardwake();
  if (stack === null) {
    return <p className="state-note">{t("state.emptyStack")}</p>;
  }
  if (stack.provenance.kind !== "received") {
    return (
      <section className="reception" aria-labelledby="reception-title">
        <h1 id="reception-title">{t("reception.title")}</h1>
        <p className="state-note">{t("reception.notReceived")}</p>
      </section>
    );
  }
  return (
    <section className="reception" aria-labelledby="reception-title">
      <h1 id="reception-title">{t("reception.title")}</h1>
      <p>{t("reception.intro")}</p>
      <h2>{t("reception.contents")}</h2>
      <ul>
        <li>{t("reception.cardCount", { count: stack.cards.length })}</li>
        <li>{t("reception.scriptCount", { count: countScripts(stack) })}</li>
      </ul>
      <AgentsBlock agents={agentsOf(stack)} />
      <Gestures engine={engine} stack={stack} agents={agentsOf(stack)} />
    </section>
  );
}

type AgentLine = { card: Card; level: number; persona: string; awake: boolean };

/** La liste des agents : niveau, consigne en clair, badge « endormi ». */
function AgentsBlock({ agents }: { agents: AgentLine[] }): JSX.Element {
  const asleep = agents.filter((agent) => !agent.awake).length;
  return (
    <>
      <h2>{t("reception.agents")}</h2>
      {agents.length === 0 ? (
        <p>{t("common.none")}</p>
      ) : (
        <ul className="agent-list">
          {agents.map((agent) => (
            <li key={agent.card.id}>
              {t("reception.agentLine", {
                name: agent.card.name,
                level: agent.level,
                persona: agent.persona,
              })}{" "}
              {!agent.awake ? <span className="badge">{t("reception.asleep")}</span> : null}
            </li>
          ))}
        </ul>
      )}
      {agents.length > 0 && asleep === agents.length ? (
        <p className="state-note">{t("reception.allAsleep")}</p>
      ) : null}
    </>
  );
}

/** Les deux gestes distincts de confiance, jamais confondus (7.10). */
function Gestures(props: { engine: CardwakeEngine; stack: Stack; agents: AgentLine[] }): JSX.Element {
  const { engine, stack, agents } = props;
  const trusted = stack.provenance.kind === "received" && stack.provenance.trusted;
  const allAwake = agents.length > 0 && agents.every((agent) => agent.awake);
  return (
    <div className="gestures">
      <div className="gesture">
        <p className="hint">{t("reception.wakeHint")}</p>
        {allAwake ? (
          <p role="status">{t("reception.woken")}</p>
        ) : (
          <button type="button" onClick={() => engine.wakeAgents()}>
            {t("reception.wake")}
          </button>
        )}
      </div>
      <div className="gesture">
        <p className="hint">{t("reception.trustHint")}</p>
        {trusted ? (
          <p role="status">{t("reception.trusted")}</p>
        ) : (
          <button type="button" onClick={() => engine.trustStack()}>
            {t("reception.trust")}
          </button>
        )}
      </div>
    </div>
  );
}
