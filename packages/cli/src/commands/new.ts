/**
 * `cardwake new <fichier>` : une pile neuve, vide, valide, au format canonique.
 *
 * Le fichier produit passe `validate` tel quel : une carte, un champ, un
 * bouton qui répond. Rien de plus — l'auteur remplit ensuite. Deux refus
 * explicites : le fichier existe déjà (sauf `--overwrite`), et la pile fabriquée
 * ne se relit pas (ce serait un bogue de la fabrique, pas de l'auteur).
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname } from "node:path";
import { createButton, createCard, createField, createStack, parseStackFile, serializeStack } from "@cardwake/model";
import type { Stack } from "@cardwake/model";
import type { CliArgs, CliIO } from "../args";

/** Le nom de la pile, tiré du fichier : `first.json` donne « first ». */
function stackNameOf(path: string): string {
  return basename(path, extname(path)) || "Untitled";
}

/** Le script de départ du bouton : il répond, donc il se voit tout de suite. */
function starterScript(name: string): string {
  return `on mouseUp\n  answer "Hello from ${name.replace(/"/g, "'")}."\nend mouseUp\n`;
}

/** Une pile neuve : une carte, un champ multiligne, un bouton qui répond. */
export function emptyStack(name: string): Stack {
  const withCard = createCard(createStack(name), { name: "Home" });
  const withField = createField(withCard.stack, { name: "Text", cardId: withCard.card.id, multiline: true });
  return createButton(withField.stack, {
    name: "Say hello",
    cardId: withCard.card.id,
    script: starterScript(name),
  }).stack;
}

/** Écrit la pile ; rend `null` si tout va bien, le message d'erreur sinon. */
function writeStack(path: string, text: string): string | null {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function newCommand(args: CliArgs, io: CliIO): number {
  const path = args.positionals[0];
  if (path === undefined) {
    io.err("new: needs the path of the stack file to create");
    return 3;
  }
  if (existsSync(path) && !args.overwrite) {
    io.err(`new: ${path} already exists — choose another name, or pass --overwrite to replace it`);
    return 1;
  }
  const stack = emptyStack(stackNameOf(path));
  const text = serializeStack(stack);
  const reread = parseStackFile(text);
  if (!reread.ok) {
    io.err(`new: the stack this command builds does not read back — ${reread.errors[0]}`);
    return 1;
  }
  const problem = writeStack(path, text);
  if (problem !== null) {
    io.err(`new: cannot write ${path} — ${problem}`);
    return 1;
  }
  io.out(`${path}: new stack "${stack.name}" — 1 card, 1 field, 1 button`);
  return 0;
}
