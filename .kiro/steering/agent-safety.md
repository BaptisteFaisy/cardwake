# Sécurité des agents — non négociable

Ces règles viennent du cahier des charges 7.4, 7.5 et 7.10. Elles ne se
discutent pas en spec, elles s'appliquent.

1. **Un seul point de passage des droits.** Toute opération passe par
   `model/authorize`. Aucun module n'applique une opération directement.
2. **Aucune sortie de modèle n'est exécutée comme du code.** Ni `eval`, ni
   `new Function`, ni `innerHTML`. Ce que produit un modèle est du texte,
   analysé par l'analyseur Murmur, contrôlé, relu, puis accepté par un humain.
3. **Aucun état caché.** Ce qu'un agent sait est écrit dans les champs de sa
   carte. Pas d'historique de tours, pas de base de souvenirs à part.
4. **Seul un humain fixe un niveau.** Aucun outil d'agent, aucune commande de
   script ne modifie un niveau, une consigne, un état d'éveil ou un budget.
5. **Un agent n'écrit que sur sa carte.** Pour agir ailleurs il envoie un
   message, et la carte destinataire décide.
6. **Niveau 5 = proposition.** Un script proposé n'est installé qu'après
   acceptation humaine, au vu de la relecture en clair et de la différence.
7. **Pile reçue = méfiance.** Agents endormis à l'ouverture, niveau effectif
   plafonné à 2 tant que l'humain n'a pas déclaré faire confiance.
8. **Aucune sortie.** Pas de réseau, pas de fichiers, pas de presse-papiers
   depuis un script ou un agent. Les seuls appels réseau sont ceux de la
   passerelle, vers un modèle.
9. **La clé ne voyage pas.** Jamais dans un fichier de pile, dans le journal,
   dans le contexte d'un agent, dans une adresse ni dans un message d'erreur.
10. **Tout est annulable.** Chaque traitement est une transaction ; un tour
    d'agent s'annule d'un geste.
