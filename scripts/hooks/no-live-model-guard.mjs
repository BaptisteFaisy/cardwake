#!/usr/bin/env node
/**
 * Garde 1 — aucun appel à un vrai modèle depuis l'agent (14.3).
 *
 * Déclencheur : avant usage d'un outil de la catégorie `shell`. Une commande qui
 * enregistrerait une cassette, lancerait le jeu d'évaluation ou porterait une
 * variable de clé coûte de l'argent : elle reste à l'humain.
 */

import { allow, commandOf, deny, guard, hookInput } from "./lib.mjs";

/** Sous-commandes réservées à l'humain : elles consomment des crédits. */
const PAID_COMMANDS = [
  { re: /\bcassette\s+record\b/, message: "enregistrer une cassette appelle un vrai modèle" },
  { re: /\beval\s+compile\b/, message: "le jeu d'évaluation appelle un vrai modèle" },
  { re: /\bnpm\s+run\s+(cassette|eval)\b/, message: "cette commande appelle un vrai modèle" },
  { re: /\bcardwake\s+eval\b/, message: "cette commande appelle un vrai modèle" },
];

/** Une commande qui porte une clé, ou qui en lit une, sort du périmètre de l'agent. */
const KEY_IN_COMMAND = [
  { re: /\b[A-Za-z0-9_]*(API_KEY|SECRET_KEY|ACCESS_TOKEN)\b\s*=/, message: "une variable de clé est passée à la commande" },
  { re: /\$\{?[A-Za-z0-9_]*(API_KEY|SECRET_KEY|ACCESS_TOKEN)\b/, message: "la commande lit une variable de clé" },
  { re: /sk-[A-Za-z0-9_-]{24,}/, message: "une clé apparaît en clair dans la commande" },
  { re: /--api-key\b/, message: "une clé est passée en argument" },
];

await guard(async () => {
  const command = commandOf(await hookInput());
  if (command.trim() === "") allow();
  const hits = [...PAID_COMMANDS, ...KEY_IN_COMMAND].filter((rule) => rule.re.test(command));
  if (hits.length === 0) allow();
  deny("Refusé : cette commande appellerait un vrai modèle ou porterait une clé.", [
    ...hits.map((rule) => rule.message),
    `Commande : ${command.slice(0, 200)}`,
    "Ces commandes coûtent de l'argent et restent à l'humain : demande-la, ne la lance pas.",
    "Sans crédits : `cardwake validate`, `cardwake run` sur enregistrements, ou le faux modèle des tests.",
  ]);
});
