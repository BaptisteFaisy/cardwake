/**
 * Racine du site : trois écrans pour cette étape — l'étagère, la carte et le
 * journal. Le moteur est injecté ici et porté par le contexte, donc un moteur
 * de remplacement (tests, démonstration enregistrée) se branche sans toucher
 * aux écrans.
 */

import { useState } from "react";
import type { CardwakeEngine } from "./engine/types";
import { CardwakeProvider } from "./store";
import { CardScreen } from "./screens/CardScreen";
import { JournalScreen } from "./screens/JournalScreen";
import { Shelf } from "./screens/Shelf";
import "./styles/two-inks.css";

type View = "shelf" | "card" | "journal";

function Screens(): JSX.Element {
  const [view, setView] = useState<View>("shelf");
  if (view === "card") {
    return <CardScreen onShelf={() => setView("shelf")} onJournal={() => setView("journal")} />;
  }
  if (view === "journal") return <JournalScreen onBack={() => setView("card")} />;
  return <Shelf onOpenStack={() => setView("card")} />;
}

export function App({ engine }: { engine: CardwakeEngine }): JSX.Element {
  return (
    <CardwakeProvider engine={engine}>
      <Screens />
    </CardwakeProvider>
  );
}

export default App;
