/**
 * Point d'entrée du site : monte l'application React dans `#root`.
 *
 * L'horloge réelle est injectée ici, à la frontière du navigateur : le moteur
 * et les paquets purs ne contiennent ni `Date.now()` ni `Math.random()`.
 *
 * C'est aussi ici que la pile de l'appareil est reprise, **avant** le premier
 * rendu : un rechargement retrouve le travail en cours sans rien demander, et
 * une pile illisible est refusée une fois, avec sa raison, plutôt qu'à
 * moitié.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createModelEngine } from "./engine/model-engine";
import { startSession } from "./data/persist";
import { browserStorage } from "./data/storage";
import "./styles/two-inks.css";

const container = document.getElementById("root");
if (!container) throw new Error("The root element is missing from index.html.");

/** Horloge et graine de production : ISO locale, graine fixe par session. */
const engine = createModelEngine({
  clock: () => new Date().toISOString(),
  seed: 20260129,
});

/** Le stockage de l'appareil, et la pile qu'il garde (ou la raison du refus). */
const storage = browserStorage();
const start = startSession(engine, storage);

createRoot(container).render(
  <StrictMode>
    <App engine={engine} storage={storage} start={start} />
  </StrictMode>,
);
