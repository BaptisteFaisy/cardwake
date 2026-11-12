/**
 * Le registre des preuves exécutables (CAR-P-01 à CAR-P-29).
 *
 * Chaque preuve reprend la table source (`step`, `claim`, `command`) telle
 * quelle : la table fait foi, le registre ne réinterprète rien. Le champ
 * `file` est **dérivé** de la commande, sans accès au disque — le fichier
 * cité est le dernier jeton de la ligne ; s'il ne se termine pas par
 * `.test.ts` (cas du dossier `evals`), on y ajoute le test homonyme.
 *
 * Trois façons de vérifier : `vitest` (on exécute la commande), `property`
 * (idem, la commande vise un test de propriétés fast-check) et `demo`
 * (une assertion locale dédiée, sans navigateur ni réseau — voir `demos.ts`).
 */

export type ProofKind = "vitest" | "property" | "demo";

/** Une preuve, dite exactement comme la table la dit. */
export type Proof = {
  id: string;
  step: string;
  claim: string;
  command: string;
  file?: string;
  kind: ProofKind;
};

/** Les preuves portées par un test de propriétés (fast-check, tirages bornés). */
const PROPERTY_IDS = new Set(["P-13", "P-16", "P-17", "P-19", "P-22"]);

/** Les preuves vérifiées par une démonstration locale dédiée. */
const DEMO_IDS = new Set(["P-20", "P-24", "P-25", "P-26"]);

/** Le dernier jeton d'une commande : le chemin de test qu'elle vise. */
function fileToken(command: string): string {
  return command.trim().split(/\s+/).at(-1) ?? "";
}

/** Dérive le fichier de test cité, sans toucher au disque (pur). */
function fileFromCommand(command: string): string {
  const token = fileToken(command);
  if (token.endsWith(".test.ts")) return token;
  const leaf = token.split("/").at(-1) ?? token;
  return `${token}/${leaf}.test.ts`;
}

/** Le genre d'une preuve, décidé par son identifiant. */
function kindOf(id: string): ProofKind {
  if (PROPERTY_IDS.has(id)) return "property";
  if (DEMO_IDS.has(id)) return "demo";
  return "vitest";
}

/** La table source, entrée par entrée, dans son ordre. */
type ProofSpec = { id: string; step: string; claim: string; command: string };

const SPECS: ProofSpec[] = [
  { id: "P-01", step: "aller-retour du langage", claim: "imprimer puis analyser redonne le même arbre", command: "npx vitest run packages/lang/test/print.test.ts" },
  { id: "P-02", step: "robustesse de l'analyse", claim: "tout texte rend un arbre ou des erreurs positionnées", command: "npx vitest run packages/lang/test/print.test.ts" },
  { id: "P-03", step: "relecture en clair", claim: "au moins une phrase par instruction, chaque objet cité", command: "npx vitest run packages/lang/test/paraphrase.test.ts" },
  { id: "P-04", step: "déterminisme", claim: "même graine, exactement la même suite d'effets", command: "npx vitest run packages/lang/test/interpreter.test.ts" },
  { id: "P-05", step: "morceaux de texte", claim: "écrire puis lire rend ce qui a été écrit", command: "npx vitest run packages/lang/test/values-chunks.test.ts" },
  { id: "P-06", step: "garde-fous", claim: "une boucle sans fin s'arrête sous maxSteps", command: "npx vitest run packages/lang/test/interpreter.test.ts" },
  { id: "P-07", step: "tout ou rien", claim: "une transaction avortée ne laisse aucune trace", command: "npx vitest run packages/model/test/ops-journal.test.ts" },
  { id: "P-08", step: "inverse", claim: "suite d'opérations puis inverses redonne la pile", command: "npx vitest run packages/model/test/ops-journal.test.ts" },
  { id: "P-09", step: "hiérarchie des messages", claim: "le chemin parcouru est visible", command: "npx vitest run packages/model/test/dispatch.test.ts" },
  { id: "P-10", step: "identifiants", claim: "uniques, jamais réalloués", command: "npx vitest run packages/model/test/ops-journal.test.ts" },
  { id: "P-11", step: "aucun dépassement", claim: "le faux modèle adversaire ne passe pas", command: "npx vitest run packages/agent/test/loop-adversary.test.ts" },
  { id: "P-12", step: "aucune élévation", claim: "ni niveau, ni consigne, ni budget ne bougent", command: "npx vitest run packages/agent/test/loop-adversary.test.ts" },
  { id: "P-13", step: "pile reçue", claim: "niveau plafonné à 2 sans confiance", command: "npx vitest run packages/model/test/properties-authorize.test.ts" },
  { id: "P-14", step: "fin des bavardages", claim: "le compteur de sauts borne les tours", command: "npx vitest run packages/model/test/dispatch.test.ts" },
  { id: "P-15", step: "budgets", claim: "épuisés, plus aucun appel à la passerelle", command: "npx vitest run packages/agent/test/loop.test.ts" },
  { id: "P-16", step: "contexte borné", claim: "ni clé, ni autre carte, ni journal", command: "npx vitest run packages/agent/test/properties-agent.test.ts" },
  { id: "P-17", step: "scripts sous accord", claim: "aucun script d'agent sans jeton humain", command: "npx vitest run packages/model/test/properties-authorize.test.ts" },
  { id: "P-18", step: "fichier", claim: "exporter puis importer redonne la même pile", command: "npx vitest run packages/model/test/schema-file.test.ts" },
  { id: "P-19", step: "empreinte", claim: "indépendante de l'ordre des clés", command: "npx vitest run packages/agent/test/properties-gateway.test.ts" },
  { id: "P-20", step: "rejeu", claim: "le mode enregistré donne le même état final", command: "npx vitest run packages/agent/test/cassette-record.test.ts" },
  { id: "P-21", step: "nombres", claim: "0.1 + 0.2 s'affiche 0.3", command: "npx vitest run packages/lang/test/values-chunks.test.ts" },
  { id: "P-22", step: "rien de secret", claim: "ni clé ni compteur dans un export", command: "npx vitest run packages/agent/test/properties-gateway.test.ts" },
  { id: "P-23", step: "encre", claim: "un texte d'agent reste marqué, une écriture humaine l'efface", command: "npx vitest run packages/model/test/ops-journal.test.ts" },
  { id: "P-24", step: "le devis", claim: "150 / 15 / 165 dans le navigateur", command: "npx vitest run apps/web/test/dispatch-adapter.test.ts" },
  { id: "P-25", step: "le manoir", claim: "le garde alerte, la cuisinière sait déjà", command: "npx vitest run apps/web/test/agent-bridge.test.ts" },
  { id: "P-26", step: "l'espion", claim: "le chemin et les refus sont visibles", command: "npx vitest run apps/web/test/spy.test.ts" },
  { id: "P-27", step: "phrase vers script", claim: "brouillon contrôlé, relu, essai à blanc", command: "npx vitest run packages/agent/test/write-script.test.ts" },
  { id: "P-28", step: "les 40 tâches", claim: "six familles, attentes atteignables", command: "npx vitest run evals" },
  { id: "P-29", step: "sans clé", claim: "la démo se joue sans réseau ni clé", command: "npx vitest run apps/web/test/agent-bridge.test.ts" },
];

/** Les 29 preuves, dans l'ordre de la table. */
export const PROOFS: Proof[] = SPECS.map((spec) => ({
  ...spec,
  kind: kindOf(spec.id),
  file: fileFromCommand(spec.command),
}));

const BY_ID = new Map(PROOFS.map((proof) => [proof.id, proof]));

/** Une preuve par identifiant ; erreur lisible si l'identifiant n'existe pas. */
export function proofById(id: string): Proof {
  const proof = BY_ID.get(id);
  if (!proof) throw new Error(`Unknown proof id "${id}": the table has P-01 to P-29.`);
  return proof;
}
