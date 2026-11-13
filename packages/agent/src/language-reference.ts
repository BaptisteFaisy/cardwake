/**
 * La référence du langage Murmur, lue telle quelle (7.7).
 *
 * Une seule source pour trois lecteurs : le modèle qui rédige le brouillon,
 * l'auteur qui le relit, et l'enregistreur des cassettes qui rejoue la
 * demande. Si le site et l'enregistreur lisaient deux copies du texte, les
 * empreintes ne concorderaient jamais et le mode enregistré ne trouverait
 * aucune réponse.
 *
 * Le fichier est lu à la compilation (`?raw`) : aucune requête réseau, aucune
 * ressource distante dans le site public.
 */

import reference from "../../../docs/language.md?raw";

/** La référence complète du langage, telle qu'elle est imprimée aux deux IA. */
export const LANGUAGE_REFERENCE: string = reference;
