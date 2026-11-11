/**
 * Point d'entrée du site : monte l'application React dans `#root`.
 *
 * L'horloge réelle est injectée ici, à la frontière du navigateur : le moteur
 * et les paquets purs ne contiennent ni `Date.now()` ni `Math.random()`.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createModelEngine } from "./engine/model-engine";
import "./styles/two-inks.css";

const container = document.getElementById("root");
if (!container) throw new Error("The root element is missing from index.html.");

/** Horloge et graine de production : ISO locale, graine fixe par session. */
const engine = createModelEngine({
  clock: () => new Date().toISOString(),
  seed: 20260129,
});

createRoot(container).render(
  <StrictMode>
    <App engine={engine} />
  </StrictMode>,
);
