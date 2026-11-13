/**
 * L'onglet Script de la carte en mode Fabriquer (7.7, 12.1) : un vrai éditeur,
 * et les trois défenses qui précèdent une installation.
 *
 * Deux gestes, deux chemins :
 * - le texte s'édite et s'applique (`Apply script` → `engine.setScript`) :
 *   rien ne s'installe à la frappe, seulement au clic ;
 * - une phrase se décrit, le modèle écrit (`Propose a draft` → `proposeScript`),
 *   et le brouillon s'affiche avec la relecture en clair, l'essai à blanc et le
 *   diff — puis `Accept` installe, `Refuse` jette le brouillon.
 *
 * L'écran ne parle jamais au modèle lui-même : la passerelle vient du plan
 * d'accès de la pile (`planFor`), donc de la cassette par défaut — sans réseau
 * et sans clé (CAR-N-09). Sans passerelle, ou sans réponse enregistrée, le
 * message le dit au lieu de faire semblant.
 */
import { useId, useState } from "react";
import type { Card, Part, Stack } from "@cardwake/model";
import { planFor } from "../engine/model-access";
import { findPart } from "../engine/ops";
import { acceptDraft, proposeScript } from "../engine/script-editor";
import type { DiffLine, ScriptDraft } from "../engine/script-editor";
import type { CardwakeEngine } from "../engine/types";
import { t } from "../i18n";

type ScriptEditorProps = { engine: CardwakeEngine; stack: Stack; card: Card; part: Part };

/** Ce que l'éditeur tient : le texte, la phrase, le brouillon, et l'attente. */
type Editor = {
  text: string;
  setText: (text: string) => void;
  phrase: string;
  setPhrase: (phrase: string) => void;
  draft: ScriptDraft | null;
  busy: boolean;
  note: string | null;
  apply: () => void;
  propose: () => void;
  accept: () => void;
  refuse: () => void;
};

/** Le script est-il réellement installé sur cet élément ? (la pile le dit) */
function installedNow(engine: CardwakeEngine, partId: number, script: string): boolean {
  const stack = engine.state();
  const card = engine.currentCard();
  if (stack === null || card === null) return false;
  return findPart(stack, card, partId)?.script === script;
}

/** L'état de l'éditeur : un seul endroit qui touche au moteur, et quand. */
function useScriptDraft(props: ScriptEditorProps): Editor {
  const { engine, stack, card, part } = props;
  const [text, setText] = useState(part.script);
  const [phrase, setPhrase] = useState("");
  const [draft, setDraft] = useState<ScriptDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const apply = (): void => {
    engine.setScript(part.id, text);
    // L'avis ne ment pas : il ne dit « installé » que si la pile le porte
    // vraiment (en mode Jouer, `authorizeOp` a refusé et le bandeau le dit).
    setNote(installedNow(engine, part.id, text) ? t("build.scriptApplied") : null);
  };

  const propose = (): void => {
    setBusy(true);
    setNote(null);
    const plan = planFor(stack);
    void proposeScript({ phrase, stack, card, part, gateway: plan.primary ?? plan.fallback }).then(
      (next) => {
        setDraft(next);
        setBusy(false);
      },
    );
  };

  const accept = (): void => {
    if (!acceptDraft(draft, (script) => engine.setScript(part.id, script))) return;
    const script = draft?.script ?? "";
    // Refusé par les droits (mode Jouer) : le brouillon reste, le bandeau parle.
    if (!installedNow(engine, part.id, script)) return;
    setText(script);
    setDraft(null);
    setNote(t("build.draftAccepted"));
  };

  const refuse = (): void => {
    setDraft(null);
    setNote(t("build.draftRefused"));
  };

  return { text, setText, phrase, setPhrase, draft, busy, note, apply, propose, accept, refuse };
}

export function ScriptEditor(props: ScriptEditorProps): JSX.Element {
  const editor = useScriptDraft(props);
  const hintId = useId();
  return (
    <div className="props script-editor">
      <label>
        {t("build.scriptText")}
        <textarea
          className="script-text"
          rows={10}
          value={editor.text}
          aria-describedby={hintId}
          onChange={(event) => editor.setText(event.target.value)}
        />
      </label>
      <p id={hintId}>{t("build.scriptHint")}</p>
      <button type="button" onClick={editor.apply} disabled={editor.text === props.part.script}>
        {t("build.scriptApply")}
      </button>
      <PhraseRow editor={editor} />
      {editor.note !== null ? <p role="status">{editor.note}</p> : null}
      {editor.draft !== null ? (
        <DraftView draft={editor.draft} onAccept={editor.accept} onRefuse={editor.refuse} />
      ) : null}
    </div>
  );
}

/** La phrase de l'auteur et le bouton qui demande un brouillon. */
function PhraseRow({ editor }: { editor: Editor }): JSX.Element {
  return (
    <div role="group" aria-label={t("build.draftAsk")}>
      <label>
        {t("build.scriptPhrase")}
        <input
          type="text"
          value={editor.phrase}
          placeholder={t("build.scriptPhrasePlaceholder")}
          onChange={(event) => editor.setPhrase(event.target.value)}
        />
      </label>
      <button
        type="button"
        onClick={editor.propose}
        disabled={editor.busy || editor.phrase.trim() === ""}
      >
        {t("build.scriptPropose")}
      </button>
      {editor.busy ? <p role="status">{t("build.scriptWorking")}</p> : null}
    </div>
  );
}

/**
 * Le brouillon et ses trois défenses : rien n'est installé à ce stade. Exporté
 * pour que le test du site puisse le rendre seul, avec un brouillon réel.
 */
export function DraftView(props: {
  draft: ScriptDraft;
  onAccept: () => void;
  onRefuse: () => void;
}): JSX.Element {
  const { draft, onAccept, onRefuse } = props;
  return (
    <section className="draft" aria-label={t("build.draftTitle")}>
      <h4>{t("build.draftTitle")}</h4>
      {draft.failure !== "none" ? <p className="state-note">{failureText(draft)}</p> : null}
      {draft.summary !== "" ? <p>{draft.summary}</p> : null}
      {draft.status === "draft" ? (
        <>
          <List title={t("build.draftReadback")} items={draft.readback} />
          <DryRun dryRun={draft.dryRun} />
          <Diff diff={draft.diff} />
          <List title={t("build.draftAssumptions")} items={draft.assumptions} />
        </>
      ) : null}
      <List title={t("build.draftQuestions")} items={draft.questions} />
      <div className="draft-actions">
        <button type="button" onClick={onAccept} disabled={draft.status !== "draft"}>
          {t("build.draftAccept")}
        </button>
        <button type="button" onClick={onRefuse}>
          {t("build.draftRefuse")}
        </button>
      </div>
    </section>
  );
}

/** Ce que l'échec d'un brouillon veut dire, dans les mots de l'écran. */
function failureText(draft: ScriptDraft): string {
  if (draft.failure === "no-gateway") return t("build.draftNoGateway");
  if (draft.failure === "no-recording") return t("build.draftNoRecording");
  if (draft.failure === "model") return t("build.draftFailedWhy", { why: draft.problem });
  return draft.problem;
}

/** Une liste titrée, absente quand il n'y a rien à dire. */
function List({ title, items }: { title: string; items: string[] }): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <div>
      <h5>{title}</h5>
      <ul>
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** La seconde défense : l'essai à blanc sur une copie de la pile (CAR-F-24). */
function DryRun({ dryRun }: { dryRun: { lines: string[]; error: string | null } }): JSX.Element {
  if (dryRun.error !== null) {
    return (
      <div>
        <h5>{t("build.draftDryRun")}</h5>
        <p className="state-note">{t("build.draftDryRunError", { why: dryRun.error })}</p>
      </div>
    );
  }
  return (
    <div>
      <h5>{t("build.draftDryRun")}</h5>
      {dryRun.lines.length === 0 ? <p>{t("build.draftDryRunNone")}</p> : null}
      <List title={t("build.draftDryRunChanges")} items={dryRun.lines} />
    </div>
  );
}

/** La troisième défense : ce que le script en place devient, ligne à ligne. */
function Diff({ diff }: { diff: DiffLine[] }): JSX.Element {
  const changed = diff.some((line) => line.kind !== "same");
  return (
    <div>
      <h5>{t("build.draftDiff")}</h5>
      {changed ? (
        <ol className="script-diff">
          {diff.map((line, index) => (
            <li key={index} className={`diff-${line.kind}`}>
              <span className="visually-hidden">{kindLabel(line.kind)}</span>
              <span aria-hidden="true">{diffMark(line.kind)}</span>
              {line.text}
            </li>
          ))}
        </ol>
      ) : (
        <p>{t("build.draftDiffNone")}</p>
      )}
    </div>
  );
}

/** Le mot du diff pour les lecteurs d'écran : ajouté, retiré, inchangé. */
function kindLabel(kind: DiffLine["kind"]): string {
  if (kind === "added") return t("build.diffAdded");
  if (kind === "removed") return t("build.diffRemoved");
  return t("build.diffSame");
}

/** Le signe du diff, à l'œil : `+`, `−`, ou rien. Le texte le suit. */
function diffMark(kind: DiffLine["kind"]): string {
  if (kind === "added") return t("build.diffMarkAdded");
  if (kind === "removed") return t("build.diffMarkRemoved");
  return t("build.diffMarkSame");
}