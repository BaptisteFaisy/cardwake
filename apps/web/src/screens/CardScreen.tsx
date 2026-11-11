/**
 * La carte, en mode Jouer et en mode Fabriquer (12.1).
 *
 * Rendu avec des éléments de page ordinaires, pas dans un canevas (11.8) :
 * chaque bouton est un vrai bouton, chaque champ un vrai champ de saisie,
 * placés dans un cadre aux proportions d'origine mis à l'échelle.
 */

import { useState } from "react";
import type { Card, Part, Stack } from "@cardwake/model";
import { ButtonPartView } from "../parts/ButtonPartView";
import { FieldPartView, partStyle } from "../parts/FieldPartView";
import { t } from "../i18n";
import { useCardwake } from "../store";

/** Tous les éléments visibles d'une carte : les siens, puis ceux de son fond. */
export function partsOf(stack: Stack, card: Card): Part[] {
  const background = stack.backgrounds.find((item) => item.id === card.background);
  return [...(background?.parts ?? []), ...card.parts];
}

/** Texte affiché d'un champ : le contenu propre à la carte pour un champ de fond. */
export function textOf(stack: Stack, card: Card, part: Part): string {
  if (part.kind !== "field") return "";
  const background = stack.backgrounds.find((item) => item.id === card.background);
  const shared = background?.parts.some((item) => item.id === part.id) ?? false;
  return shared ? (card.content[String(part.id)] ?? "") : part.text;
}

function Rank({ stack, card }: { stack: Stack; card: Card }): JSX.Element {
  const index = stack.cards.findIndex((item) => item.id === card.id);
  return (
    <p className="card__rank">
      {t("play.cardOf", { index: index + 1, count: stack.cards.length })}
    </p>
  );
}

export function CardScreen({ onJournal, onShelf }: { onJournal: () => void; onShelf: () => void }): JSX.Element {
  const { engine, stack, card, mode, budget, refusal, notice } = useCardwake();
  const [selected, setSelected] = useState<number | null>(null);

  if (!stack || !card) {
    return (
      <section className="card card--empty">
        <p>{t("state.emptyStack")}</p>
        <button type="button" onClick={onShelf}>{t("nav.backToShelf")}</button>
      </section>
    );
  }

  const buildMode = mode === "build";
  const index = stack.cards.findIndex((item) => item.id === card.id);
  const inhabited = card.agent?.awake ?? false;

  return (
    <section className="card">
      <header className="card__bar">
        <button type="button" onClick={onShelf}>{t("nav.backToShelf")}</button>
        <h1>{stack.name}</h1>
        <button type="button" onClick={onJournal}>{t("nav.journal")}</button>
      </header>

      <Rank stack={stack} card={card} />

      <div className={`card__frame${inhabited ? " card__frame--inhabited" : ""}`} role="group" aria-label={card.name}>
        {inhabited ? <span className="card__candle" aria-hidden="true" title={t("play.candle")} /> : null}
        {partsOf(stack, card).map((part) =>
          part.kind === "field" ? (
            <FieldPartView
              key={part.id}
              part={part}
              text={textOf(stack, card, part)}
              inkedByAgent={card.ink[String(part.id)] !== undefined}
              lockedInPlay={!buildMode && part.locked}
              buildMode={buildMode}
              selected={selected === part.id}
              onCommit={(text) => engine.editField(part.id, text)}
              onSelect={() => setSelected(part.id)}
            />
          ) : (
            <ButtonPartView
              key={part.id}
              part={part}
              buildMode={buildMode}
              selected={selected === part.id}
              onActivate={() => engine.click(part.id)}
              onSelect={() => setSelected(part.id)}
            />
          ),
        )}
        {partsOf(stack, card).length === 0 ? <p style={partStyle([16, 16, 480, 40])}>{t("state.cardWithoutParts")}</p> : null}
      </div>

      <nav className="card__nav">
        <button type="button" onClick={() => engine.navigate(stack.cards[index - 1]?.id ?? null)} disabled={index <= 0}>
          {t("play.previous")}
        </button>
        <button
          type="button"
          onClick={() => engine.navigate(stack.cards[index + 1]?.id ?? null)}
          disabled={index >= stack.cards.length - 1}
        >
          {t("play.next")}
        </button>
        <button type="button" onClick={() => engine.setMode(buildMode ? "play" : "build")}>
          {buildMode ? t("mode.switchToPlay") : t("mode.switchToBuild")}
        </button>
      </nav>

      <p className="card__budget">
        {t("play.budget")} {t("play.turns")} {budget.turnsMax - budget.turnsUsed} · {t("play.hops")} {budget.hopsLeft}
      </p>

      {inhabited ? (
        <p className="card__chat card__chat--muted">
          {t("play.discussion")}: {t("play.notWiredHint")}
        </p>
      ) : (
        <p className="card__chat card__chat--muted">{t("play.noAgent")}</p>
      )}

      {notice ? <p className="card__notice" role="status">{notice}</p> : null}
      {refusal ? (
        <p className="card__refusal" role="alert">
          {t("build.refused")}: {refusal.reason}
        </p>
      ) : null}
    </section>
  );
}
