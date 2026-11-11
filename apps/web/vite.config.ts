/**
 * Configuration Vite du site Cardwake (11.9).
 *
 * Hébergement statique seulement : aucune ressource distante, aucune clé.
 * Les piles de démonstration vivent à la racine du dépôt (`stacks/*`), hors
 * de la racine de l'application : le serveur de développement doit donc
 * pouvoir servir ce dossier parent.
 */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Pages d'un dépôt : le site est servi sous /cardwake/.
  base: "/cardwake/",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    fs: {
      // Racine du monorepo : `apps/web` -> `../..`.
      allow: ["../.."],
    },
  },
});
