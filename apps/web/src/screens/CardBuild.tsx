/**
 * La carte en mode Fabriquer (12.1) : la carte avec ses poignées, une palette
 * (bouton, champ, carte, fond) et un inspecteur à trois onglets — propriétés,
 * script, agent.
 *
 * Tout passe par le moteur, donc par `authorizeOp` : si l'utilisateur repasse
 * en mode Jouer, la palette se met à refuser avec la raison affichée
 * (CAR-F-05). Le déplacement d'un élément se fait aux flèches, comme le reste,
 * au clavier (12.4).
 *
 * L'onglet script est un vrai éditeur : le texte s'applique par `setScript`, et
 * une phrase produit un brouillon relu, essayé à blanc et diffé — accepté ou
 * refusé par l'humain seul (`ScriptEditor`, lot de l'atelier de phrase).
 */
import { useState } from "react";
import type { KeyboardEvent } from "react";
import type { PropName } from "@cardwake/lang";
import type { Card, Part, Rect, Stack } from "@cardwake/model";
import { CARD_SIZE } from "@cardwake/model";
import { useCardwake } from "../store";
import type { CardwakeEngine } from "../engine/types";
import { t } from "../i18n";
import { CardFrame } from "./CardPlay";
import { ScriptEditor } from "./ScriptEditor";

export function CardBuild(): JSX.Element {
  const { engine, stack, card } = useCardwake();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (stack === null || card === null) {
    return (
      <section className="build-layout">
        <p className="state-note">{t("state.emptyStack")}</p>
        <Palette onCreate={() => engine.addCard(t("build.addCard"))} />
      </section>
    );
  }
  const selected = findPart(stack, card.id, selectedId);
  return (
    <section className="build-layout" aria-label={t("build.title")}>
      <BuildStage
        stack={stack}
        card={card}
        selected={selected}
        selectedId={selectedId}
        engine={engine}
        onSelect={setSelectedId}
      />
      <div className="build-side">
        <Palette
          onCreate={() => engine.addCard(t("build.addCard"))}
          onNewBackground={() => engine.addBackground(t("build.addBackground"))}
          onNewButton={() => engine.addPart("button", t("build.addButton"))}
          onNewField={() => engine.addPart("field", t("build.addField"))}
        />
        {selected !== null ? (
          <Inspector
            part={selected}
            engine={engine}
            stack={stack}
            card={card}
            onRect={(rect) => engine.setPartRect(selected.id, rect)}
            onProp={(prop, value) => engine.setPartProp(selected.id, prop, value)}
            onDelete={() => {
              engine.deletePart(selected.id);
              setSelectedId(null);
            }}
          />
        ) : null}
      </div>
    </section>
  );
}

/** Le plan de travail : la carte, ses poignées et le déplacement au clavier. */
function BuildStage(props: {
  stack: Stack;
  card: Card;
  selected: Part | null;
  selectedId: number | null;
  engine: CardwakeEngine;
  onSelect: (partId: number) => void;
}): JSX.Element {
  const { stack, card, selected, selectedId, engine, onSelect } = props;
  return (
    <div>
      <div onKeyDown={(event) => nudge(event, selected, engine.setPartRect.bind(engine))}>
        <CardFrame
          key={card.id}
          stack={stack}
          card={card}
          buildMode
          selectedId={selectedId}
          onSelect={onSelect}
          onCommitField={(partId, text) => engine.editField(partId, text)}
          onActivateButton={onSelect}
        >
          {selected !== null ? <Handles rect={selected.rect} /> : null}
        </CardFrame>
      </div>
      {selected === null ? <p>{t("build.nothing")}</p> : null}
    </div>
  );
}

/** Élément visé : propre à la carte, ou champ de son fond. */
function findPart(stack: Stack, cardId: number, partId: number | null): Part | null {
  if (partId === null) return null;
  const card = stack.cards.find((item) => item.id === cardId);
  const own = card?.parts.find((part) => part.id === partId);
  if (own !== undefined) return own;
  const background = stack.backgrounds.find((item) => item.id === card?.background);
  return background?.parts.find((part) => part.id === partId) ?? null;
}

/** Poignées aux quatre coins de l'élément sélectionné. */
function Handles({ rect }: { rect: Rect }): JSX.Element {
  const [, , cardWidth, cardHeight] = CARD_SIZE;
  const [x, y, width, height] = rect;
  const corners: [number, number][] = [
    [x, y],
    [x + width, y],
    [x, y + height],
    [x + width, y + height],
  ];
  return (
    <>
      {corners.map(([cx, cy], index) => (
        <span
          key={index}
          className="handle selected"
          aria-hidden="true"
          style={{ left: `${(cx / cardWidth) * 100}%`, top: `${(cy / cardHeight) * 100}%` }}
        />
      ))}
    </>
  );
}

/** Déplacement au clavier : flèches = 1 point, Maj + flèches = 10 points. */
function nudge(
  event: KeyboardEvent,
  part: Part | null,
  setRect: (partId: number, rect: Rect) => void,
): void {
  if (part === null) return;
  const deltas: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  const delta = deltas[event.key];
  if (delta === undefined) return;
  event.preventDefault();
  const step = event.shiftKey ? 10 : 1;
  const [x, y, width, height] = part.rect;
  setRect(part.id, [x + delta[0] * step, y + delta[1] * step, width, height]);
}

type PaletteProps = {
  onCreate: () => void;
  onNewButton?: () => void;
  onNewField?: () => void;
  onNewBackground?: () => void;
};

/** Palette : bouton, champ, carte, fond (CAR-F-02). */
function Palette(props: PaletteProps): JSX.Element {
  const { onCreate, onNewButton, onNewField, onNewBackground } = props;
  return (
    <div className="palette" role="group" aria-label={t("build.palette")}>
      {onNewButton ? <button type="button" onClick={onNewButton}>{t("build.addButton")}</button> : null}
      {onNewField ? <button type="button" onClick={onNewField}>{t("build.addField")}</button> : null}
      <button type="button" onClick={onCreate}>{t("build.addCard")}</button>
      {onNewBackground ? (
        <button type="button" onClick={onNewBackground}>{t("build.addBackground")}</button>
      ) : null}
    </div>
  );
}

type InspectorProps = {
  part: Part;
  engine: CardwakeEngine;
  stack: Stack;
  card: Card;
  onRect: (rect: Rect) => void;
  onProp: (prop: PropName, value: string) => void;
  onDelete: () => void;
};

/** Inspecteur : propriétés, script, agent — trois onglets (12.1). */
function Inspector(props: InspectorProps): JSX.Element {
  const { part, engine, stack, card, onRect, onProp, onDelete } = props;
  const [tab, setTab] = useState<"properties" | "script" | "agent">("properties");
  return (
    <div className="inspector" aria-label={t("build.selected")}>
      <div className="tabs" role="tablist">
        <TabButton current={tab} id="properties" label={t("build.tabProperties")} onSelect={setTab} />
        <TabButton current={tab} id="script" label={t("build.tabScript")} onSelect={setTab} />
        <TabButton current={tab} id="agent" label={t("build.tabAgent")} onSelect={setTab} />
      </div>
      {tab === "properties" ? (
        <PropertiesTab part={part} onRect={onRect} onProp={onProp} onDelete={onDelete} />
      ) : null}
      {tab === "script" ? (
        <ScriptEditor key={part.id} engine={engine} stack={stack} card={card} part={part} />
      ) : null}
      {tab === "agent" ? <AgentTab card={card} /> : null}
    </div>
  );
}

/**
 * Onglet Agent : les quatre réglages de la carte, en lecture seule (7.5).
 *
 * Le défaut corrigé ici : l'onglet rendait `build.agentNone` **quel que soit**
 * le contenu de la carte — une carte habitée affichait « No agent on this
 * card. », et les trois clés du dictionnaire écrites pour cet écran restaient
 * mortes. Un humain seul fixe ces réglages (règle 4) : l'écran les montre, il
 * ne les change pas.
 */
export function AgentTab({ card }: { card: Card }): JSX.Element {
  const agent = card.agent;
  if (agent === null) return <p>{t("build.agentNone")}</p>;
  return (
    <dl className="agent-props">
      <dt>{t("build.agentAwake")}</dt>
      <dd>{agent.awake ? t("common.yes") : t("common.no")}</dd>
      <dt>{t("build.agentLevel")}</dt>
      <dd>{agent.level}</dd>
      <dt>{t("build.agentSpeed")}</dt>
      <dd>{agent.speed}</dd>
      <dt>{t("build.agentPersona")}</dt>
      <dd>{agent.persona === "" ? t("common.none") : agent.persona}</dd>
    </dl>
  );
}

type TabId = "properties" | "script" | "agent";

function TabButton(props: {
  current: TabId;
  id: TabId;
  label: string;
  onSelect: (tab: TabId) => void;
}): JSX.Element {
  const { current, id, label, onSelect } = props;
  return (
    <button type="button" role="tab" aria-selected={current === id} onClick={() => onSelect(id)}>
      {label}
    </button>
  );
}

function PropertiesTab(props: {
  part: Part;
  onRect: (rect: Rect) => void;
  onProp: (prop: PropName, value: string) => void;
  onDelete: () => void;
}): JSX.Element {
  const { part, onRect, onProp, onDelete } = props;
  return (
    <div className="props">
      <label>
        {t("build.name")}
        <input
          type="text"
          defaultValue={part.name}
          onBlur={(event) => onProp("name", event.target.value)}
        />
      </label>
      <label>
        <input
          type="checkbox"
          defaultChecked={part.visible}
          onChange={(event) => onProp("visible", String(event.target.checked))}
        />
        {t("build.visible")}
      </label>
      {part.kind === "field" ? (
        <FieldProps part={part} onProp={onProp} />
      ) : (
        <ButtonProps part={part} onProp={onProp} />
      )}
      <RectEditor rect={part.rect} onRect={onRect} />
      <button type="button" onClick={onDelete}>{t("build.delete")}</button>
    </div>
  );
}

type PropSetter = (prop: PropName, value: string) => void;

function FieldProps({ part, onProp }: { part: Part; onProp: PropSetter }): JSX.Element | null {
  if (part.kind !== "field") return null;
  return (
    <label>
      <input
        type="checkbox"
        defaultChecked={part.locked}
        onChange={(event) => onProp("locked", String(event.target.checked))}
      />
      {t("build.locked")}
    </label>
  );
}

function ButtonProps({ part, onProp }: { part: Part; onProp: PropSetter }): JSX.Element | null {
  if (part.kind !== "button") return null;
  return (
    <>
      <label>
        {t("build.label")}
        <input type="text" defaultValue={part.label} onBlur={(event) => onProp("label", event.target.value)} />
      </label>
      <label>
        <input
          type="checkbox"
          defaultChecked={part.enabled}
          onChange={(event) => onProp("enabled", String(event.target.checked))}
        />
        {t("build.enabled")}
      </label>
    </>
  );
}

/** Le rectangle saisi au champ : x, y, largeur, hauteur en points de carte. */
function RectEditor({ rect, onRect }: { rect: Rect; onRect: (rect: Rect) => void }): JSX.Element {
  const [draft, setDraft] = useState<string[]>(rect.map(String));
  return (
    <fieldset>
      <legend>{t("build.rect")}</legend>
      {draft.map((value, index) => (
        <label key={index}>
          {["x", "y", "w", "h"][index]}
          <input
            type="number"
            value={value}
            onChange={(event) => {
              const next = [...draft];
              next[index] = event.target.value;
              setDraft(next);
            }}
          />
        </label>
      ))}
      <small>{t("build.rectHint")}</small>
      <button
        type="button"
        onClick={() => {
          const numbers = draft.map((item) => Number(item));
          if (numbers.length === 4 && numbers.every((n) => Number.isFinite(n))) {
            onRect([numbers[0], numbers[1], numbers[2], numbers[3]]);
          }
        }}
      >
        {t("build.applyRect")}
      </button>
    </fieldset>
  );
}
