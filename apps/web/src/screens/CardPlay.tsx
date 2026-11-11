/**
 * La carte en mode Jouer (12.1) : la carte elle-même, la navigation, la barre
 * de discussion si la carte est habitée (CAR-F-41), la jauge de budget et la
 * flamme de bougie quand l'agent veille (12.3).
 *
 * `CardFrame`, exporté d'ici, est le rendu partagé de la carte : le mode
 * Fabriquer le réutilise au lieu d'en écrire un second (zéro duplication).
 *
 * Les tours d'agent ne sont pas encore branchés : la barre de discussion le
 * dit honnêtement au lieu de faire semblant.
 */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { currentText } from "@cardwake/model";
import type { Card, Stack } from "@cardwake/model";
import { useCardwake } from "../store";
import type { BudgetView, CardwakeEngine } from "../engine/types";
import { t } from "../i18n";
import { ButtonPartView } from "../parts/ButtonPartView";
import { FieldPartView } from "../parts/FieldPartView";

/** Rendu de la carte : éléments du fond d'abord, puis ceux de la carte. */
export type CardFrameProps = {
  stack: Stack;
  card: Card;
  buildMode: boolean;
  selectedId: number | null;
  onSelect: (partId: number) => void;
  onCommitField: (partId: number, text: string) => void;
  onActivateButton: (partId: number) => void;
  /** Couche au-dessus des éléments : poignées en mode Fabriquer. */
  children?: ReactNode;
};

export function CardFrame(props: CardFrameProps): JSX.Element {
  const { stack, card, buildMode, selectedId, onSelect, onCommitField, onActivateButton, children } = props;
  const background = stack.backgrounds.find((item) => item.id === card.background);
  const parts = [...(background?.parts ?? []), ...card.parts].filter((part) => part.visible);
  return (
    <div className="card-frame" aria-label={card.name}>
      {card.agent !== null ? <Candle awake={card.agent.awake} /> : null}
      {parts.map((part) =>
        part.kind === "field" ? (
          <FieldPartView
            key={part.id}
            part={part}
            text={currentText(stack, card.id, part.id)}
            inkedByAgent={card.ink[String(part.id)] !== undefined}
            lockedInPlay={part.locked && !buildMode}
            buildMode={buildMode}
            selected={selectedId === part.id}
            onCommit={(text) => onCommitField(part.id, text)}
            onSelect={() => onSelect(part.id)}
          />
        ) : (
          <ButtonPartView
            key={part.id}
            part={part}
            buildMode={buildMode}
            selected={selectedId === part.id}
            onActivate={() => onActivateButton(part.id)}
            onSelect={() => onSelect(part.id)}
          />
        ),
      )}
      {children}
    </div>
  );
}

/** Bougie : allumée tant que l'agent veille, éteinte quand il dort (12.3). */
function Candle({ awake }: { awake: boolean }): JSX.Element {
  return (
    <div className={`candle${awake ? "" : " out"}`}>
      <span className="body" aria-hidden="true" />
      <span className="flame" aria-hidden="true" />
      <span className="visually-hidden">{awake ? t("play.candle") : t("play.candleOut")}</span>
    </div>
  );
}

export function CardPlay(): JSX.Element {
  const { engine, stack, card, budget } = useCardwake();
  const [chatNote, setChatNote] = useState<string | null>(null);
  useCardArrows(stack, card, engine);

  if (stack === null || card === null) {
    return <p className="state-note">{t("state.emptyStack")}</p>;
  }
  const background = stack.backgrounds.find((item) => item.id === card.background);
  const parts = [...(background?.parts ?? []), ...card.parts].filter((part) => part.visible);

  return (
    <section className="card-stage" aria-label={card.name}>
      <CardNav stack={stack} card={card} engine={engine} />
      <CardFrame
        key={card.id}
        stack={stack}
        card={card}
        buildMode={false}
        selectedId={null}
        onSelect={() => undefined}
        onCommitField={(partId, text) => engine.editField(partId, text)}
        onActivateButton={(partId) => engine.click(partId)}
      />
      {parts.length === 0 ? <p className="state-note">{t("state.cardWithoutParts")}</p> : null}
      {card.agent !== null ? (
        <ChatBar awake={card.agent.awake} onSend={() => setChatNote(t("play.chatNotWired"))} />
      ) : (
        <p>{t("play.noAgent")}</p>
      )}
      <CardStates budget={budget} chatNote={chatNote} />
    </section>
  );
}

/** Navigation entre les cartes : boutons, compteur et liste des cartes. */
function CardNav(props: { stack: Stack; card: Card; engine: CardwakeEngine }): JSX.Element {
  const { stack, card, engine } = props;
  const index = stack.cards.findIndex((item) => item.id === card.id);
  return (
    <nav className="card-nav" aria-label={t("play.goTo")}>
      <button type="button" disabled={index <= 0} onClick={() => engine.navigate(stack.cards[index - 1].id)}>
        {t("play.previous")}
      </button>
      <span className="card-title">{card.name}</span>
      <span>{t("play.cardOf", { index: index + 1, count: stack.cards.length })}</span>
      <button
        type="button"
        disabled={index < 0 || index >= stack.cards.length - 1}
        onClick={() => engine.navigate(stack.cards[index + 1].id)}
      >
        {t("play.next")}
      </button>
      <select
        aria-label={t("play.goTo")}
        value={card.id}
        onChange={(event) => engine.navigate(Number(event.target.value))}
      >
        {stack.cards.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </nav>
  );
}

/** Les états à dire : agent qui dort, budget épuisé, sauts épuisés. */
function CardStates({ budget, chatNote }: { budget: BudgetView; chatNote: string | null }): JSX.Element {
  return (
    <>
      {chatNote !== null ? (
        <p className="state-note" role="status">
          {chatNote}
        </p>
      ) : null}
      <BudgetGauge budget={budget} />
      {budget.exhausted ? <p className="state-note">{t("state.budgetExhausted")}</p> : null}
      {budget.hopsExhausted ? <p className="state-note">{t("state.hopsExhausted")}</p> : null}
    </>
  );
}

/** Barre de discussion : offerte seulement si la carte est habitée (CAR-F-41). */
function ChatBar({ awake, onSend }: { awake: boolean; onSend: (text: string) => void }): JSX.Element {
  const [text, setText] = useState("");
  return (
    <form
      className="chat-bar"
      aria-label={t("play.discussion")}
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim() === "") return;
        onSend(text);
        setText("");
      }}
    >
      <input
        type="text"
        value={text}
        disabled={!awake}
        placeholder={t("play.discussionPlaceholder")}
        aria-label={t("play.discussion")}
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" disabled={!awake || text.trim() === ""}>
        {t("play.send")}
      </button>
      {awake ? null : <span>{t("state.agentAsleep")}</span>}
    </form>
  );
}

/** Jauge de budget de session : ce qui reste de tours et de jetons (P8). */
function BudgetGauge({ budget }: { budget: BudgetView }): JSX.Element {
  const pct = budget.turnsMax > 0 ? Math.round((budget.turnsUsed / budget.turnsMax) * 100) : 0;
  return (
    <aside className={`budget-gauge${budget.exhausted ? " exhausted" : ""}`} aria-label={t("play.budget")}>
      <div>{t("play.turns", { used: budget.turnsUsed, max: budget.turnsMax })}</div>
      <div className="gauge-bar" aria-hidden="true">
        <div className="gauge-fill" style={{ width: `${pct}%` }} />
      </div>
      <div>{t("play.tokens", { used: budget.inputTokensUsed, max: budget.inputTokensMax })}</div>
      <div>{t("play.hops", { left: budget.hopsLeft })}</div>
    </aside>
  );
}

/** Flèches gauche/droite : navigation entre cartes, sauf pendant la saisie. */
function useCardArrows(stack: Stack | null, card: Card | null, engine: CardwakeEngine): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (stack === null || card === null) return;
      const index = stack.cards.findIndex((item) => item.id === card.id);
      if (event.key === "ArrowLeft" && index > 0) engine.navigate(stack.cards[index - 1].id);
      if (event.key === "ArrowRight" && index >= 0 && index < stack.cards.length - 1) {
        engine.navigate(stack.cards[index + 1].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stack, card, engine]);
}
