# Décisions du chantier — Cardwake

Une ligne par décision, datée. Le « pourquoi » et le « rejeté » sont la partie
utile : une décision sans alternative connue se réexplique dans six mois.

Source : l'historique git (`git log --reverse --pretty=format:'%ad %s' --date=format:'%Y-%m-%d %H:%M' origin/main`),
`docs/journal.md` et `docs/etat-du-chantier.md`. Les dates sont celles des
commits sur `main`.

## 11 novembre 2026 — le socle

- **15:37 — Monorepo npm, TypeScript strict en ESM, Node 22, cinq espaces de
  travail** (`lang`, `model`, `agent`, `cli`, `web`) plus deux applis (`mcp`,
  `relay`). *Pourquoi :* `lang` et `model` doivent rester purs (ni DOM, ni
  réseau, ni horloge interne), et la pureté ne se vérifie qu'à travers une
  frontière de paquet. *Rejeté :* un paquet unique — le mélange aurait rendu
  la pureté invérifiable.
- **15:37 — Les contrats sont figés avant la première implémentation**
  (`ast.ts`, `host.ts`, `types.ts`, `limits.ts`, `types.ts` de l'agent).
  *Pourquoi :* la grammaire du langage, l'hôte que l'interpréteur a le droit
  de toucher, le format de pile et les plafonds sont des décisions
  irréversibles ; les écrire d'abord évite de les redécouvrir à six reprises.
- **15:37 — La CI rend son verdict en 5 minutes au plus**, jobs bornés,
  `fetch-depth: 1`, garde `ci-budget` qui refuse un job sans `timeout-minutes`.
  *Pourquoi :* une file de merge automatique n'ingère pas une CI lente.
  *Rejeté :* construire le site dans la CI de PR — le build est passé hors PR,
  dans `pages.yml`, déclenché sur `main`.
- **15:48 — Les dates antérieures au 26 octobre sont interdites dans l'arbre**
  (motif de la garde `couche0`). *Pourquoi :* un relevé daté hors de cet arbre
  pollue la lecture. *Rejeté :* citer la date réelle — la garde et le commit
  « Retirer les dates hors arbre des commentaires » l'ont fait à la place.
- **15:48 — Mergify tient la file de merge, pas la file native de GitHub.**
  *Pourquoi :* la file native exige un dépôt public possédé par une
  organisation ; le compte est un compte utilisateur et l'API refuse la règle
  (`422`). *Rejeté :* la file native de GitHub.

## 11 novembre 2026 — le cœur

- **18:03 — Le langage s'appelle Murmur et est écrit de zéro.** *Pourquoi :*
  le cahier exige une syntaxe lisible, et le produit ne peut pas contenir la
  marque d'un tiers. *Rejeté :* une syntaxe empruntée à un langage existant.
- **18:19 — Découper les fonctions longues plutôt qu'exempter des fichiers.**
  *Pourquoi :* la garde des 500 lignes de fichier / 50 lignes de fonction est
  ce qui empêche un fichier fourre-tout ; l'exempter revient à l'abandonner.
- **18:19 — La fausse clé `sk-…` du test est retirée du dépôt.** *Pourquoi :*
  même factice, un texte en `sk-…` fait rougir la CI et `couche0`.
  *Rejeté :* nommer la clé de test autrement — c'est ce qui a été fait.
- **19:07 — « Tout est du texte » : un nombre est un texte qui devient nombre
  quand l'arithmétique en a besoin.** *Pourquoi :* un seul type de valeur rend
  l'affichage, la lecture et l'écriture des champs homogènes.
- **19:36 — Les opérations sont réversibles et le journal est annulable
  transaction par transaction.** *Pourquoi :* l'annulation doit être exacte,
  pas une approximation : appliquer une suite d'opérations puis ses inverses
  redonne la pile de départ.
- **20:42 — L'interpréteur s'arrête sous `maxSteps`, et `true`, `false`,
  `return`, `tab` et `comma` sont des constantes.** *Pourquoi :* la propriété
  `CAR-P-06` a trouvé le vrai bug — ces cinq mots étaient implémentés comme des
  variables, donc `repeat while true` ne bouclait jamais ; le réducteur a
  donné le contre-exemple de quatre lignes. *Rejeté :* laisser passer parce que
  « ça ne se voit pas ».
- **22:12 — Le site est branché sur le vrai moteur, pas sur une maquette.**
  *Pourquoi :* une maquette ne prouve rien, et l'écart se paie deux fois.
- **22:55 — La garde « aucune ressource distante » vérifie le HTML construit,
  pas le paquet minifié.** *Pourquoi :* dans un paquet minifié, les motifs de
  la bibliothèque d'interface donnent des faux positifs ; le HTML, lui, est
  ce que le navigateur charge vraiment.

## 12 novembre 2026 — le produit

- **00:37 — Les 23 propriétés du cahier ont chacune un identifiant cité dans
  un fichier de test.** *Pourquoi :* une exigence non citée n'est pas
  vérifiable, et le cahier lui-même le demande. *Rejeté :* un tableau de
  correspondance dans un document — il peut mentir, un test non.
- **01:15 — `authorize` est le point de passage unique des droits.** *Pourquoi :*
  une règle répartie dans dix modules n'est pas une règle. *Rejeté :* vérifier
  les droits au cas par cas, dans chaque appelant.
- **10:33 — La hiérarchie des messages (élément → carte → fond → pile) avec
  compteur de sauts.** *Pourquoi :* le même chemin sert aux messages entre
  agents : la coopération entre cartes n'a besoin d'aucun orchestrateur.
- **14:22 — Le mode enregistré (cassettes) devient le mode par défaut de la
  démo.** *Pourquoi :* la démo doit se jouer sans clé et sans réseau, donc
  le site public peut rester un paquet statique.
- **17:19 — Un registre de preuves exécutable : une preuve est une commande
  qui sort en code 0.** *Pourquoi :* une preuve déclarée verte par un
  document finit par mentir ; celle-ci rougit toute seule.
- **21:04 — Le dépôt change de nom, l'adresse du site suit.** *Pourquoi :* les
  Pages suivent le dépôt ; le lien de la soumission doit être le bon.
- **22:52 — La clé est détenue par un relais local, la page n'a qu'une
  adresse.** *Pourquoi :* la clé ne quitte jamais la machine, et la page
  publiée n'a rien à cacher. *Rejeté :* la clé dans le navigateur, et le
  proxy distant qui l'aurait vue transiter.
- **23:35 — Le serveur MCP est écrit à la main : stdio, six outils, sans
  dépendance.** *Pourquoi :* le dépôt n'ajoute pas de dépendance native, et
  l'outil reste lisible.

## 13 novembre 2026 — la mesure

- **11:57 — Le fichier de verrou doit contenir tous les espaces de travail**
  (`relay` et `mcp` y manquaient). *Pourquoi :* `npm ci` doit être reproductible
  sur une machine vierge.
- **13:34 — La relecture en clair reçoit la source du script, pas l'arbre
  syntaxique.** *Pourquoi :* la CLI passait l'arbre au relecteur et annonçait
  que le module n'était pas livré ; le `catch` avalait l'échec et la commande
  retombait sur le texte normalisé.
- **13:57 — Le jeu d'évaluation juge la pile finale, jamais le texte du
  script.** *Pourquoi :* c'est le comportement observable qui compte, pas la
  forme de la réponse du modèle.
- **14:18 — Le banc de mesure est headless et le dit.** *Pourquoi :* le rendu
  de l'interface n'est pas mesuré ; le dire serait mentir par omission.
  La charge système est relevée avec la configuration, parce qu'elle explique
  qu'un p95 dépasse parfois la médiane.
- **14:28 — Le lanceur vise le bouton quand un champ et un bouton portent le
  même nom.** *Pourquoi :* la phrase commence par « When … is clicked » ; le
  script était installé sur le champ, puis on cliquait le bouton — huit
  « échecs » qui n'en étaient pas. *Rejeté :* continuer à publier 70 %.
  Le taux passe à 85 % sans toucher au modèle.
- **14:45 — L'audit d'accessibilité est automatisé (axe-core, WCAG 2.2 AA,
  parcours clavier) ; la passe lecteur d'écran reste humaine.** *Pourquoi :*
  l'automatique trouve ce qui est calculable, pas ce qui est compris.
- **14:46 — Licence MIT, à la racine et dans chaque paquet.** *Pourquoi :*
  le cahier le demande, et une pile d'exemple sous licence non claire est un
  piège pour le repreneur.
- **14:58 — Rien ne s'installe sans un Accept humain, et le jeton
  d'acceptation est à usage unique.** *Pourquoi :* le jeton relie l'écran de
  relecture à la proposition de l'agent ; il vit en mémoire et ne survit pas
  à la session qui l'a donné.
- **15:10 — `cassette verify` compare les empreintes enregistrées aux
  situations que les parcours demandent aujourd'hui.** *Pourquoi :* il
  déclarait périmés treize enregistrements qui ne l'étaient pas : la liste des
  situations attendues était vide. C'est l'outil qui mentait, pas les
  cassettes.
- **16:40 — La seconde cible (≥ 95 % après une réparation) est mesurée
  séparément**, et une réparation vaut **un** appel supplémentaire, dont la
  demande porte ce que la pile a réellement montré. *Pourquoi :* le cahier
  distingue les deux cibles, et une « réparation » qui peut appeler dix fois
  ne prouve rien.
- **17:06 — La CI passe sur les runners GitHub-hosted.** *Pourquoi :* les deux
  runners auto-hébergés `r630-cardwake-01` et `-02` sont hors ligne ; un job
  qui les attend ne démarre jamais. *Rejeté :* attendre le retour des
  runners pour garder la CI locale.
- **17:40 — Deux passages publiés, la fourchette plutôt que le meilleur
  chiffre.** *Pourquoi :* `combo/cheap` est un modèle routé : la variation vient
  du modèle, pas du harnais, et sur une cible de 85 % un modèle routé est un
  mauvais instrument de mesure.

## Ce qui a été refusé, et pourquoi

| Refusé | Raison |
|---|---|
| La vidéo de trois minutes | Exclue par le demandeur. Le script minuté est livré (`docs/video-script.md`), rien n'a été tourné. |
| La file de merge native de GitHub | Exige un dépôt public possédé par une organisation ; l'API refuse (`422`). Mergify tient la file. |
| La clé dans le navigateur | Elle quitterait la machine et finirait dans un export. Le relais local la détient. |
| `eval`, `new Function`, `innerHTML` | Un texte de modèle ne doit jamais être exécuté comme du code. La garde le refuse partout. |
| Les exceptions à la garde des tailles | Un fichier dispenser de la règle des 500/50 lignes est un fichier qui grossit. On découpe. |
| Une cible unique pour le jeu d'évaluation | Le modèle est routé : la variance dépasse la marge. Deux chiffres valent mieux qu'un. |
