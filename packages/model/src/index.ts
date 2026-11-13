/**
 * Point d'entrée public du paquet `model` : schémas, opérations, journal,
 * droits et hiérarchie des messages. Paquet **pur** : aucune dépendance au
 * navigateur ni au réseau (CAR-N-09).
 *
 * `authorize` est le point de passage unique des droits : aucun autre module
 * ne décide de ce qu'un acteur peut faire.
 */

export * from "./types";
export * from "./limits";
export * from "./authorize";
export * from "./ids";
export * from "./factory";
export * from "./schema";
export * from "./file";
export * from "./migrate";
export * from "./clone";
export * from "./ops";
export * from "./invariants";
export * from "./journal";
export * from "./host";
export * from "./dispatch";
