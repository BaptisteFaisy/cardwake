/**
 * Racine du site : routeur d'écrans, barre de navigation, bascule de mode.
 *
 * Pas de bibliothèque de routage : un état local suffit, les écrans lisent la
 * pile via `useCardwake()`. Le moteur est injecté par `main.tsx` (horloge et
 * graine viennent de là). Une pile reçue s'ouvre toujours sur l'écran de
 * réception, en mode Fabriquer : réveiller ses agents est un geste d'auteur
 * (7.10, CAR-F-52).
 *
 * La pile est un fichier que tu possèdes (O4) : le site la garde sur
 * l'appareil après chaque transaction, la reprend au démarrage, l'exporte en
 * un clic et accepte qu'on en dépose une n'importe où dans la page. La
 * mécanique de séance vit dans `parts/use-stack-session`, la barre dans
 * `parts/StackBar`, le diagnostic d'un fichier refusé dans
 * `parts/RefusedNotice`.
 */
import { useMemo } from "react";
import type { Stack } from "@cardwake/model";
import { CardwakeProvider, useCardwake } from "./store";
import type { CardwakeEngine } from "./engine/types";
import type { SessionStart } from "./data/persist";
import { browserStorage } from "./data/storage";
import type { StorageLike } from "./data/storage";
import { t } from "./i18n";
import { useStackSession } from "./parts/use-stack-session";
import { DropZone } from "./parts/DropZone";
import { RefusedNotice } from "./parts/RefusedNotice";
import { StackBar } from "./parts/StackBar";
import { Shelf } from "./screens/Shelf";
import { CardPlay } from "./screens/CardPlay";
import { CardBuild } from "./screens/CardBuild";
import { Journal } from "./screens/Journal";
import { Proof } from "./screens/Proof";
import { Reception } from "./screens/Reception";
import { Settings } from "./screens/Settings";
import { Spy } from "./screens/Spy";
import type { Screen } from "./routes";
import "./styles/two-inks.css";

export type { Screen } from "./routes";

export type AppProps = {
  engine: CardwakeEngine;
  /** Le stockage de l'appareil ; `undefined` : on prend celui du navigateur. */
  storage?: StorageLike | null;
  /** Ce que le démarrage a trouvé sur l'appareil. */
  start?: SessionStart;
};

export function App({ engine, storage, start }: AppProps): JSX.Element {
  const store = useMemo(() => (storage === undefined ? browserStorage() : storage), [storage]);
  return (
    <CardwakeProvider engine={engine}>
      <Shell storage={store} start={start ?? { kind: "empty" }} />
    </CardwakeProvider>
  );
}

type ShellProps = { storage: StorageLike | null; start: SessionStart };

function Shell({ storage, start }: ShellProps): JSX.Element {
  const { engine, stack, notice, refusal } = useCardwake();
  const session = useStackSession({ engine, storage, start });
  return (
    <div className="app">
      <DropZone onFile={session.openFile} />
      <TopBar screen={session.screen} go={session.go} hasStack={stack !== null} />
      {notice !== null ? (
        <p className={`state-note${refusal !== null ? " refusal" : ""}`} role="status">
          {notice}
        </p>
      ) : null}
      <main className="screen">
        <StackBar
          stack={stack}
          resumed={start.kind === "restored"}
          status={session.status}
          storage={storage}
          onExport={session.exportCurrent}
          onOpenAnother={() => session.go("shelf")}
          onNewStack={session.openNew}
        />
        {session.refused !== null ? (
          <RefusedNotice
            fault={session.refused.fault}
            onDownload={session.downloadRefused}
            onStartEmpty={session.openNew}
            onDismiss={session.dismissRefusal}
          />
        ) : null}
        <Body
          screen={session.screen}
          onOpenDemo={session.openDemo}
          onNew={session.openNew}
          onOpenFile={session.openFile}
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
};

function Body(props: BodyProps): JSX.Element {
  const { screen, onOpenDemo, onNew, onOpenFile } = props;
  const { mode } = useCardwake();
  switch (screen) {
    case "shelf":
      // Le refus d'un fichier est porté par `RefusedNotice`, juste au-dessus,
      // avec ses gestes (repartir d'une pile vide, télécharger le fichier
      // refusé). L'étagère garde son emplacement et ne dit donc rien elle-même.
      return <Shelf onOpen={onOpenDemo} onNew={onNew} onOpenFile={onOpenFile} fileError={null} />;
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
