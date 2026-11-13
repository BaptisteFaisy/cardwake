/**
 * Le rapport du banc : `docs/mesures/bench.json` pour la machine,
 * `docs/mesures.md` pour l'humain.
 *
 * Aucun chiffre n'est recopié à la main : les deux fichiers sont réécrits à
 * chaque exécution depuis les mesures rendues par `bench.ts`. La date est celle
 * du début de la mesure, la graine est celle du banc, et la machine est décrite
 * telle qu'elle se présente (hôte, processeur, mémoire, Node).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, cpus, hostname, loadavg, platform, release, totalmem } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { median, p95 } from "./mesure";

/** Ce que vaut une mesure face à sa cible. « mesuré ailleurs » : hors de ce banc. */
export type Verdict = "atteint" | "non atteint" | "mesuré ailleurs";

export type Mesure = {
  /** Identifiant stable, en français, sans espace. */
  id: string;
  /** La cible du cahier des charges à laquelle la mesure répond. */
  cible: "CAR-N-04" | "CAR-N-05";
  /** Le titre lisible de la mesure. */
  intitule: string;
  unite: "ms" | "étapes/s";
  /** « < » : il faut rester sous la limite ; « ≥ » : il faut l'atteindre. */
  comparaison: "<" | "≥";
  /** La valeur de la cible, dans l'unité de la mesure. */
  limite: number;
  /** Ce qui a été mesuré, en une phrase. */
  methode: string;
  /** La médiane des tours mesurés ; `null` si la mesure n'a pas eu lieu ici. */
  mediane: number | null;
  p95: number | null;
  /** Nombre de tours mesurés (0 : non mesuré ici). */
  tours: number;
  verdict: Verdict;
  verdictP95: Verdict | null;
  /** Pourquoi la cible n'est pas atteinte, ou pourquoi la mesure est ailleurs. */
  note?: string;
};

export type MachineInfo = {
  hote: string;
  systeme: string;
  processeur: string;
  coeurs: number;
  memoireGo: number;
  /** Charge système (1, 5 et 15 minutes) au moment du relevé : lit le p95. */
  charge: number[];
  node: string;
  v8: string;
};

export type ReportOptions = { date: string; seed: number };

/** La racine du dépôt, déduite de ce fichier et non du répertoire courant. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** La commande qui rejoue le banc, écrite une seule fois. */
export const COMMAND = "npx vite-node scripts/bench/bench.ts";

/** Le modèle du processeur, lu dans `/proc/cpuinfo` quand il existe. */
function cpuModel(): string {
  try {
    const line = readFileSync("/proc/cpuinfo", "utf8")
      .split("\n")
      .find((entry) => entry.startsWith("model name"));
    if (line !== undefined) return line.split(":").slice(1).join(":").trim();
  } catch {
    /* autre système : le nombre de cœurs suffit à décrire la machine */
  }
  return "inconnu";
}

/** La machine au moment de la mesure : rien de deviné, tout lu sur l'hôte. */
export function machineInfo(): MachineInfo {
  return {
    hote: hostname(),
    systeme: `${platform()} ${release()} ${arch()}`,
    processeur: cpuModel(),
    coeurs: cpus().length,
    memoireGo: Math.round(totalmem() / 1024 ** 3),
    // La charge dit si les chiffres ont été pris sur une machine au repos :
    // c'est ce qui explique un p95 plus haut que la médiane.
    charge: loadavg().map((value) => Math.round(value * 100) / 100),
    node: process.version,
    v8: process.versions.v8,
  };
}

/** Compare une valeur à sa cible : « < » et « ≥ » couvrent les deux sens. */
export function judge(value: number, comparaison: "<" | "≥", limite: number): Verdict {
  const ok = comparaison === "<" ? value < limite : value >= limite;
  return ok ? "atteint" : "non atteint";
}

/** Rend une mesure complète depuis ses tours : médiane, p95, et leurs verdicts. */
export function complete(
  base: Omit<Mesure, "mediane" | "p95" | "tours" | "verdict" | "verdictP95">,
  samples: number[],
): Mesure {
  const mediane = median(samples);
  const p95Value = p95(samples);
  return {
    ...base,
    mediane,
    p95: p95Value,
    tours: samples.length,
    verdict: judge(mediane, base.comparaison, base.limite),
    verdictP95: judge(p95Value, base.comparaison, base.limite),
  };
}

/** Sépare les milliers par une espace fine, comme les chiffres se lisent ici. */
function grouped(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Un nombre lisible : milliers séparés, décimales adaptées à l'échelle. */
export function formatNumber(value: number, unite: Mesure["unite"]): string {
  if (unite === "étapes/s") return grouped(value);
  if (Number.isInteger(value)) return String(value);
  return value >= 1 ? value.toFixed(2) : value.toFixed(3);
}

/** La cellule de valeur d'une mesure, unité comprise. */
function valueCell(value: number | null, unite: Mesure["unite"]): string {
  return value === null ? "—" : `${formatNumber(value, unite)} ${unite}`;
}

/** La ligne du tableau markdown pour une mesure. */
function rowOf(mesure: Mesure): string {
  const cells = [
    mesure.cible,
    mesure.intitule,
    valueCell(mesure.mediane, mesure.unite),
    valueCell(mesure.p95, mesure.unite),
    mesure.tours === 0 ? "—" : String(mesure.tours),
    `${mesure.comparaison} ${formatNumber(mesure.limite, mesure.unite)} ${mesure.unite}`,
    mesure.verdict,
  ];
  return `| ${cells.join(" | ")} |`;
}

/** Le tableau de configuration de la machine. */
function configTable(machine: MachineInfo, seed: number): string {
  return [
    "| | |",
    "| --- | --- |",
    `| Hôte | \`${machine.hote}\` |`,
    `| Système | ${machine.systeme} |`,
    `| Processeur | ${machine.processeur} (${machine.coeurs} cœurs) |`,
    `| Mémoire | ${machine.memoireGo} Go |`,
    `| Charge système | ${machine.charge.join(" / ")} (1 / 5 / 15 min) |`,
    `| Node | ${machine.node} (V8 ${machine.v8}) |`,
    `| Graine du banc | ${seed} (fixe) |`,
  ].join("\n");
}

/** Le tableau des résultats, une ligne par mesure. */
function resultTable(mesures: Mesure[]): string {
  return [
    "| Cible | Mesure | Médiane | p95 | Tours | Seuil | Verdict |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- |",
    ...mesures.map(rowOf),
  ].join("\n");
}

/** Ce que couvre chaque mesure, en une puce par cible. */
function methodsList(mesures: Mesure[]): string {
  return mesures
    .map((mesure) => `- **${mesure.intitule}** (${mesure.cible}) — ${mesure.methode}`)
    .join("\n");
}

/** Les cibles non atteintes, avec leur cause en une phrase. Absent si tout passe. */
function missesList(mesures: Mesure[]): string {
  const missed = mesures.filter((mesure) => mesure.verdict === "non atteint");
  if (missed.length === 0) return "";
  const lines = missed.map(
    (mesure) =>
      `- **${mesure.intitule}** : ${valueCell(mesure.mediane, mesure.unite)} pour une cible de ` +
      `${mesure.comparaison} ${formatNumber(mesure.limite, mesure.unite)} ${mesure.unite}. ` +
      `${mesure.note ?? "Cause non identifiée."}`,
  );
  return `## Cibles non atteintes\n\n${lines.join("\n")}\n`;
}

/** Le début du rapport : titre, configuration, résultats, méthodes. */
function headOf(mesures: Mesure[], machine: MachineInfo, options: ReportOptions): string {
  return [
    "# Mesures de performance — CAR-N-04 et CAR-N-05",
    "",
    `Mesures prises le **${options.date}** par le banc \`scripts/bench/bench.ts\`, ` +
      "sur la machine décrite ci-dessous. Chaque cible du cahier des charges est " +
      "comparée à sa valeur mesurée ; le verdict porte sur la **médiane**, et le p95 " +
      "montre la dispersion. Aucun chiffre de ce fichier n'est recopié à la main : " +
      "il est réécrit à chaque exécution du banc. La charge système est relevée avec " +
      "la configuration : c'est elle qui explique qu'un p95 dépasse parfois la médiane.",
    "",
    "## Configuration",
    "",
    configTable(machine, options.seed),
    "",
    "## Résultats",
    "",
    resultTable(mesures),
    "",
    "## Ce que couvre chaque mesure",
    "",
    methodsList(mesures),
    "",
    missesList(mesures),
  ].join("\n");
}

/** La fin du rapport : le tour d'agent, ce qui reste hors banc, et comment rejouer. */
function tailOf(): string {
  return [
    "## Tour d'agent",
    "",
    "Le tour d'agent médian (cible < 4 s, CAR-N-05) n'est **pas** mesuré par ce " +
      "banc : il demande un vrai modèle et une vraie clé, donc du réseau et de " +
      "l'argent. **mesuré avec une vraie clé : voir le rapport d'évaluation** " +
      "(`evals/`, lancé par un humain).",
    "",
    "## Ce que ce banc ne mesure pas",
    "",
    "- Le **rendu** de l'interface (React, peinture du navigateur) : le banc est " +
      "headless et mesure le cœur déterministe du produit. Le changement de carte " +
      "et le délai d'indication passent par le vrai moteur du site, sans DOM.",
    "- La **lecture disque à froid** : le fichier de la pile est relu à chaque tour, " +
      "donc servi par le cache du système — c'est le cas d'une pile déjà ouverte une " +
      "première fois, et la marge sur la cible d'une seconde reste très large.",
    "",
    "## Rejouer",
    "",
    "```sh",
    COMMAND,
    "```",
    "",
    "Le banc écrit les deux rapports, n'appelle aucun réseau, et affiche sa graine " +
      "fixe : deux exécutions sur la même machine donnent les mêmes jeux d'essai.",
    "",
  ].join("\n");
}

/** Le document markdown complet : les mesures, puis la part fixe du rapport. */
function markdownOf(mesures: Mesure[], machine: MachineInfo, options: ReportOptions): string {
  const body = `${headOf(mesures, machine, options)}\n\n${tailOf()}`;
  return `${body.replace(/\n{3,}/g, "\n\n")}\n`;
}

/** L'objet JSON du rapport : la version lisible par une machine. */
function jsonOf(mesures: Mesure[], machine: MachineInfo, options: ReportOptions): string {
  const body = {
    projet: "Cardwake",
    cahier: ["CAR-N-04", "CAR-N-05"],
    date: options.date,
    graine: options.seed,
    commande: COMMAND,
    machine,
    mesures: mesures.map((mesure) => ({
      id: mesure.id,
      cible: mesure.cible,
      intitule: mesure.intitule,
      unite: mesure.unite,
      // `valeur` est le chiffre de tête : la médiane, comparée à la cible.
      valeur: mesure.mediane,
      mediane: mesure.mediane,
      p95: mesure.p95,
      limite: mesure.limite,
      comparaison: mesure.comparaison,
      tours: mesure.tours,
      verdict: mesure.verdict,
      verdictP95: mesure.verdictP95,
      methode: mesure.methode,
      ...(mesure.note === undefined ? {} : { note: mesure.note }),
    })),
  };
  return JSON.stringify(body, null, 2);
}

/** Écrit les deux rapports et rend leurs chemins. */
export function writeReport(
  mesures: Mesure[],
  options: ReportOptions,
): { markdown: string; json: string } {
  const machine = machineInfo();
  const jsonPath = join(ROOT, "docs", "mesures", "bench.json");
  const markdownPath = join(ROOT, "docs", "mesures.md");
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, `${jsonOf(mesures, machine, options)}\n`);
  writeFileSync(markdownPath, markdownOf(mesures, machine, options));
  return { markdown: markdownPath, json: jsonPath };
}