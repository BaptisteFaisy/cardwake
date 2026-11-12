/**
 * Point d'entrée du paquet `proofs` : le registre, le coureur, les
 * démonstrations et le rapport. Ce fichier existe pour que le typage de la
 * CI (les dossiers `src` des paquets) atteigne les modules voisins, écrits
 * à plat.
 */

export * from "../registry";
export * from "../demos";
export * from "../runner";
export * from "../report";
export { runCli } from "../cli";
