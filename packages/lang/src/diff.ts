/**
 * Le diff de script : la troisième défense avant d'installer un script.
 *
 * L'écran d'atelier montre à l'auteur ce qui change entre le script en place et
 * le script proposé. Ce module est l'**unique** implémentation de ce diff : il
 * vit dans `lang` parce qu'il ne compare que du texte, et le jour où l'écran
 * s'y branche, il n'y aura plus deux algorithmes à garder d'accord.
 *
 * Trois propriétés tenues, et vérifiées par `test/script-diff.test.ts` :
 * - le diff est une **fusion** exacte : `same + removed` redonne l'ancien
 *   script, `same + added` redonne le nouveau, ligne pour ligne ;
 * - les lignes marquées `same` forment une plus longue sous-suite commune :
 *   aucune ligne identique n'est présentée comme changée quand elle pouvait
 *   rester alignée ;
 * - aucune ligne qui diffère n'est escamotée : tout ce qui apparaît d'un côté
 *   et pas de l'autre est présente dans le diff.
 *
 * Aucune exécution, aucune analyse : seulement du texte comparé.
 */

/** Une ligne du diff : inchangée, retirée du script en place, ou ajoutée. */
export type ScriptDiffLine = { kind: "same" | "removed" | "added"; text: string };

/** Les lignes d'un script, sans la dernière ligne vide qu'ajoute un collage. */
export function scriptLines(script: string): string[] {
  const lines = script.split("\n");
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  return lines;
}

/** La table des plus longues sous-suites communes, remplie par le bas. */
function lcsTable(before: string[], after: string[]): number[][] {
  const table: number[][] = [];
  for (let row = 0; row <= before.length; row += 1) {
    table.push(new Array<number>(after.length + 1).fill(0));
  }
  for (let row = before.length - 1; row >= 0; row -= 1) {
    for (let column = after.length - 1; column >= 0; column -= 1) {
      table[row][column] =
        before[row] === after[column]
          ? table[row + 1][column + 1] + 1
          : Math.max(table[row + 1][column], table[row][column + 1]);
    }
  }
  return table;
}

/** Le diff ligne à ligne : ce qui reste, ce qui part, ce qui arrive. */
export function diffLines(before: string[], after: string[]): ScriptDiffLine[] {
  const table = lcsTable(before, after);
  const lines: ScriptDiffLine[] = [];
  let row = 0;
  let column = 0;
  while (row < before.length && column < after.length) {
    if (before[row] === after[column]) {
      lines.push({ kind: "same", text: before[row] });
      row += 1;
      column += 1;
    } else if (table[row + 1][column] >= table[row][column + 1]) {
      lines.push({ kind: "removed", text: before[row] });
      row += 1;
    } else {
      lines.push({ kind: "added", text: after[column] });
      column += 1;
    }
  }
  for (; row < before.length; row += 1) lines.push({ kind: "removed", text: before[row] });
  for (; column < after.length; column += 1) lines.push({ kind: "added", text: after[column] });
  return lines;
}

/** Le diff de deux scripts, découpés en lignes. C'est la forme qu'utilise l'écran. */
export function diffScript(before: string, after: string): ScriptDiffLine[] {
  return diffLines(scriptLines(before), scriptLines(after));
}
