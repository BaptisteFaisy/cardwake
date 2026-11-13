/**
 * Les types de la recette : un point, son verdict, ses preuves.
 *
 * La recette ne croit personne : chaque point rend ce qu'il a constaté, et
 * le rapport ne fait que recopier ces constats. Un point qui n'a pas pu être
 * joué rend un verdict KO avec la raison — jamais un silence.
 */

/** Le verdict d'un point : vert, rouge, ou hors périmètre. */
export type Verdict = "OK" | "KO" | "HORS PERIMETRE";

/** Le produit d'un point : le verdict, une phrase, et les preuves. */
export type Resultat = {
  verdict: Verdict;
  resume: string;
  preuves: string[];
  commande: string | null;
};

/** Un point de la recette : son numéro, son titre, et son calcul. */
export type Point = {
  numero: number;
  titre: string;
  /** Faux pour un point hors périmètre : il n'échoue jamais la recette. */
  obligatoire: boolean;
  execute: () => Promise<Resultat>;
};

/** Un résultat rouge, avec la raison et les preuves. */
export function ko(resume: string, preuves: string[] = [], commande: string | null = null): Resultat {
  return { verdict: "KO", resume, preuves, commande };
}

/** Un résultat vert, avec la raison et les preuves. */
export function ok(resume: string, preuves: string[] = [], commande: string | null = null): Resultat {
  return { verdict: "OK", resume, preuves, commande };
}

/** Un résultat « hors périmètre » : rien n'a été fait, et c'est dit. */
export function horsPerimetre(resume: string, preuves: string[] = []): Resultat {
  return { verdict: "HORS PERIMETRE", resume, preuves, commande: null };
}
