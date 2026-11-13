/**
 * Les types des imports « ?raw » de Vite : la référence du langage
 * (`docs/language.md`) est lue telle quelle, par le site comme par
 * l'enregistreur des cassettes.
 */

declare module "*.md?raw" {
  const content: string;
  export default content;
}
