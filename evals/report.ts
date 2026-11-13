/**
 * La mise en forme du rapport du jeu d'évaluation (7.7).
 *
 * Fonctions pures, dans un module à part : `run.ts` lance le jeu à l'import,
 * et un rapport se relit, se teste et se recompose sans jamais déclencher un
 * passage qui coûte de l'argent.
 */

import type { GameReport, TaskOutcome } from "./runner";

/**
 * La première cause d'un échec, en clair. Un échec a toujours une cause, et
 * ce n'est pas toujours le script : distinguer « le modèle n'a pas répondu »
 * de « le script rend faux » est ce qui décide quoi corriger.
 */
export function causeOf(outcome: TaskOutcome): string {
  const text = [...outcome.errors, ...outcome.failures].join(" ");
  if (/model call failed|gateway failed|refused the call|502/i.test(text)) return "panne du modèle";
  if (outcome.errors.some((error) => /no usable script|asked questions|not readable/i.test(error))) return "aucun script";
  if (outcome.failures.length > 0) return "pile fausse";
  return outcome.errors.length > 0 ? "erreur du lanceur" : "inconnue";
}

/** Les causes d'échec d'une famille, de la plus fréquente à la moins. */
export function causesOf(report: GameReport, family: string): string[] {
  const counts = new Map<string, number>();
  for (const outcome of report.tasks) {
    if (outcome.family !== family || outcome.status === "ok") continue;
    const cause = causeOf(outcome);
    counts.set(cause, (counts.get(cause) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((first, second) => second[1] - first[1])
    .map(([cause, count]) => `${cause} (${count})`);
}

/** La cause la plus fréquente d'une famille, avec son compte. */
export function topCause(report: GameReport, family: string): string {
  const causes = causesOf(report, family);
  return causes.length === 0 ? "—" : causes.join(", ");
}

/** Le tableau du rapport, en markdown : une ligne par famille. */
export function familyTable(report: GameReport): string {
  const lines = [
    "| famille | tâches | premier coup | après réparation | taux (après réparation) | première cause d'échec |",
    "|---|---|---|---|---|---|",
  ];
  for (const [family, counts] of Object.entries(report.byFamily)) {
    const rate = counts.total === 0 ? 0 : Math.round((counts.ok / counts.total) * 100);
    lines.push(`| ${family} | ${counts.total} | ${counts.firstTry} | ${counts.ok} | ${rate} % | ${topCause(report, family)} |`);
  }
  return lines.join("\n");
}

/** Le tableau des échecs, en markdown : une ligne par tâche ratée. */
export function failureTable(report: GameReport): string {
  const lines = ["| tâche | statut | pourquoi |", "|---|---|---|"];
  for (const outcome of report.tasks) {
    if (outcome.status === "ok") continue;
    const reason = outcome.failures[0] ?? outcome.errors[0] ?? "unknown";
    lines.push(`| ${outcome.id} | ${outcome.status} | ${reason.replace(/\|/g, "/")} |`);
  }
  return lines.join("\n");
}
