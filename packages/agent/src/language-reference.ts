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
import card from "../../../docs/language-card.md?raw";

/** La référence complète du langage, telle qu'elle est imprimée aux deux IA. */
export const LANGUAGE_REFERENCE: string = reference;

/**
 * La carte d'une page : les formes, les recettes et les pièges, lus AVANT la
 * référence complète. Elle n'ajoute aucune forme au langage — ses extraits de
 * code sont copiés de la référence, et un test le vérifie
 * (`packages/agent/test/language-card.test.ts`). La référence reste la source
 * unique : la carte est un sommaire, pas une seconde consigne.
 */
export const LANGUAGE_CARD: string = card;
