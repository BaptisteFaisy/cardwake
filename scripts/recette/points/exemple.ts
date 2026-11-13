/**
 * Point 4 — l'exemple 7.13 : deux transactions, trois appels, `Mood` à
 * « alarmed » puis « nervous », et deux annulations qui restaurent l'état de
 * départ.
 *
 * L'exemple est rejoué par `scripts/recette/exemples/manoir-713.ts`, qui
 * reprend le texte du § 7.13 exactement. Le verdict est factuel : chaque
 * exigence du cahier est comparée à ce que le moteur produit vraiment, et un
 * écart est dit noir sur blanc.
 */
import type { Resultat } from "../types";
import { ko, ok } from "../types";
import { bilanManoir } from "../exemples/manoir-713";

export async function pointExemple(): Promise<Resultat> {
  const bilan = await bilanManoir();
  const garde = bilan.humeurs.find((humeur) => humeur.carte === "Guard")?.valeur ?? "";
  const cuisine = bilan.humeurs.find((humeur) => humeur.carte === "Cook")?.valeur ?? "";

  const preuves: string[] = [
    `appels au modèle : ${bilan.appels} (le cahier en attend 3)`,
    `transactions au journal : ${bilan.transactions} (le cahier en attend 2)`,
    `humeur du garde : "${garde}" (attendu "alarmed")`,
    `humeur de la cuisinière : "${cuisine}" (attendu "nervous")`,
    `annulations pour revenir à l'état de départ : ${bilan.annulations} (le cahier en attend 2)`,
    `état de départ restauré : ${bilan.etatDeDepartRestaure ? "oui" : "non"}`,
    ...bilan.journal.map((ligne) => `  ${ligne}`),
    "écart 1 : la boucle d'agent rappelle le modèle une fois de plus après une réponse à outils (Mood « nervous » puis un dernier appel pour la phrase finale).",
    "écart 2 : chaque tour d'agent est sa propre transaction du journal ; le `put it into field \"Says\"` du script en ouvre une troisième.",
    "écart 3 : conséquence des deux précédents, il faut trois annulations pour revenir à l'état de départ.",
  ];

  const alarme = garde === "alarmed";
  const nerveuse = cuisine === "nervous";
  const restaure = bilan.etatDeDepartRestaure;

  // Les écarts assumés, expliqués dans le rapport final par la recette.
  const ecarts: string[] = [];
  if (bilan.appels !== 3) ecarts.push(`appels : ${bilan.appels} au lieu de 3`);
  if (bilan.transactions !== 2) ecarts.push(`transactions : ${bilan.transactions} au lieu de 2`);
  if (bilan.annulations !== 2) ecarts.push(`annulations : ${bilan.annulations} au lieu de 2`);

  if (alarme && nerveuse && restaure && ecarts.length === 0) {
    return ok("l'exemple 7.13 se joue exactement comme le cahier le décrit", preuves, "scripts/recette/exemples/manoir-713.ts");
  }
  const resumes: string[] = [];
  if (alarme && nerveuse) resumes.push("Mood « alarmed » puis « nervous »");
  resumes.push(restaure ? "l'état de départ est restauré" : "l'état de départ n'est PAS restauré");
  if (ecarts.length > 0) resumes.push(`écart(s) : ${ecarts.join(" ; ")}`);
  return ko(resumes.join(" ; "), preuves, "scripts/recette/exemples/manoir-713.ts");
}