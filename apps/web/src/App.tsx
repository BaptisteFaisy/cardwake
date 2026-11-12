/**
 * Racine du site : routeur d'écrans, barre de navigation, bascule de mode.
 *
 * Pas de bibliothèque de routage : un état local suffit, les écrans lisent la
 * pile via `useCardwake()`. Le moteur est injecté par `main.tsx` (horloge et
 * graine viennent de là). Une pile reçue s'ouvre toujours sur l'écran de
 * réception, en mode Fabriquer : réveiller ses agents est un geste d'auteur
 * (7.10, CAR-F-52).
 */
import { useState } from "react";
import { createStack, parseStackFile } from "@cardwake/model";
import type { Stack } from "@cardwake/model";
import { CardwakeProvider, useCardwake } from "./store";
import type { CardwakeEngine } from "./engine/types";
import { t } from "./i18n";
import { Shelf } from "./screens/Shelf";
import { CardPlay } from "./screens/CardPlay";
import { CardBuild } from "./screens/CardBuild";
import { Journal } from "./screens/Journal";
import { Proof } from "./screens/Proof";
import { Reception } from "./screens/Reception";
import { Settings } from "./screens/Settings";
import { Spy } from "./screens/Spy";
import "./styles/two-inks.css";

/** Les écrans du brief (12.1), routés sans bibliothèque externe. */
export type Screen = "shelf" | "card" | "journal" | "reception" | "settings" | "spy" | "proof";

export function App({ engine }: { engine: CardwakeEngine }): JSX.Element {
  return (
    <CardwakeProvider engine={engine}>
      <Shell />
    </CardwakeProvider>
  );
}

function Shell(): JSX.Element {
  const { engine, stack, notice, refusal } = useCardwake();
  const [screen, setScreen] = useState<Screen>("shelf");
  const [fileError, setFileError] = useState<string | null>(null);

  /** Ouvre une pile : réception d'abord si elle vient d'un fichier (CAR-F-52). */
  const openStack = (next: Stack, mode: "play" | "build"): void => {
    engine.openStack(next);
    const received = next.provenance.kind === "received" && !next.provenance.trusted;
    engine.setMode(received ? "build" : mode);
    setFileError(null);
    setScreen(received ? "reception" : "card");
  };

  const openDemo = (next: Stack): void => openStack(next, "play");
  const openNew = (): void => openStack(createStack(t("shelf.newStackName")), "build");

  /** Import d'un fichier : validation par schéma, refus entier avec la raison (CAR-F-51). */
  const openFile = (file: File): void => {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseStackFile(String(reader.result ?? ""));
      if (parsed.ok) openStack(parsed.stack, "play");
      else setFileError(parsed.errors.join(", "));
    };
    reader.readAsText(file);
  };

  return (
    <div className="app">
      <TopBar screen={screen} go={setScreen} hasStack={stack !== null} />
      {notice !== null ? (
        <p className={`state-note${refusal !== null ? " refusal" : ""}`} role="status">
          {notice}
        </p>
      ) : null}
      <main className="screen">
        <Body
          screen={screen}
          onOpenDemo={openDemo}
          onNew={openNew}
          onOpenFile={openFile}
          fileError={fileError}
        />
      </main>
    </div>
  );
}

type TopBarProps = { screen: Screen; go: (screen: Screen) => void; hasStack: boolean };

function TopBar({ screen, go, hasStack }: TopBarProps): JSX.Element {
  const { engine, mode } = useCardwake();
  const navButton = (target: Screen, label: string, enabled = true): JSX.Element | null =>
    enabled ? (
      <button type="button" aria-current={screen === target ? "page" : undefined} onClick={() => go(target)}>
        {label}
      </button>
    ) : null;
  return (
    <header className="topbar">
      <span className="app-name">{t("app.name")}</span>
      <nav aria-label={t("app.name")}>
        {navButton("shelf", t("nav.shelf"))}
        {navButton("card", t("mode.play"), hasStack)}
        {navButton("journal", t("nav.journal"), hasStack)}
        {navButton("spy", t("nav.spy"), hasStack)}
        {navButton("proof", t("nav.proof"))}
        {navButton("reception", t("nav.reception"), hasStack)}
        {navButton("settings", t("nav.settings"))}
      </nav>
      {hasStack ? <ModeSwitch mode={mode} engine={engine} /> : null}
    </header>
  );
}

function ModeSwitch({ mode, engine }: { mode: "play" | "build"; engine: CardwakeEngine }): JSX.Element {
  return (
    <div role="group" aria-label={t("app.tagline")}>
      <button type="button" aria-pressed={mode === "play"} onClick={() => engine.setMode("play")}>
        {t("mode.play")}
      </button>{" "}
      <button type="button" aria-pressed={mode === "build"} onClick={() => engine.setMode("build")}>
        {t("mode.build")}
      </button>
    </div>
  );
}

type BodyProps = {
  screen: Screen;
  onOpenDemo: (stack: Stack) => void;
  onNew: () => void;
  onOpenFile: (file: File) => void;
  fileError: string | null;
};

function Body(props: BodyProps): JSX.Element {
  const { screen, onOpenDemo, onNew, onOpenFile, fileError } = props;
  const { mode } = useCardwake();
  switch (screen) {
    case "shelf":
      return <Shelf onOpen={onOpenDemo} onNew={onNew} onOpenFile={onOpenFile} fileError={fileError} />;
    case "card":
      return mode === "play" ? <CardPlay /> : <CardBuild />;
    case "journal":
      return <Journal />;
    case "reception":
      return <Reception />;
    case "settings":
      return <Settings />;
    case "spy":
      return <Spy />;
    case "proof":
      return <Proof />;
  }
}

export default App;
