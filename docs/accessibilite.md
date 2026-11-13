# Accessibilité — ce qui est vérifié, ce qui reste à vérifier à la main

Le cahier (CAR-N-06) demande **WCAG 2.2 niveau AA** : boutons et champs sont
de vrais contrôles, l'ordre de tabulation suit l'ordre des éléments, le mode
Fabriquer s'utilise au clavier, un texte écrit par un agent est annoncé aux
lecteurs d'écran. La recette (§ 18, point 12) demande un contrôle automatique
sans erreur sur les sept écrans et un parcours P2 fait au clavier seul.

Ce document dit ce qui est contrôlé automatiquement, par quoi, et ce qui ne
l'est pas. Il est écrit pour être lu tel quel : un « tout est vert » sans
détail ne sert à rien au jury.

## 1. Les contrôles automatiques

| Ce qui est contrôlé | Par quoi | Où |
| --- | --- | --- |
| Règles WCAG 2.2 AA (axe-core) sur chaque écran | `axe-core` dans jsdom | `apps/web/test/a11y.test.ts` |
| Nom accessible de **tous** les contrôles focusables | Le test lui-même | `apps/web/test/a11y.test.ts` |
| Contrôles natifs (pas de div cliquable) | Le test lui-même | `apps/web/test/a11y.test.ts` |
| Ordre de tabulation = ordre du document, aucun `tabindex` positif | Le test lui-même | `apps/web/test/a11y.test.ts` |
| Parcours P2 au clavier seul : Tab atteint la palette, Entrée crée le champ puis le bouton | Harnais clavier + le test | `apps/web/test/a11y.test.ts`, `apps/web/test/clavier.ts` |
| Mouvement réduit : la media query existe et coupe animations, transitions et défilement doux | Le test lit les styles | `apps/web/test/styles-a11y.test.ts` |
| Focus visible : la règle `:focus-visible` existe et couvre tous les types de contrôles | Le test lit les styles | `apps/web/test/styles-a11y.test.ts` |
| Contraste des couleurs (WCAG 1.4.3 et 1.4.11) | `scripts/quality/contrast.py` | `scripts/quality/contrast.py` |

Les neuf montages testés sont : l'étagère, la carte en mode Jouer, la carte en
mode Fabriquer, le journal, la réception, les réglages, l'espion, les
preuves, et le site entier (barre de la pile comprise).

### La règle « color-contrast » d'axe est désactivée, et pourquoi

jsdom ne calcule pas de mise en page : il n'a pas de canvas, donc il ne sait
pas quelle couleur de fond est réellement peinte sous un texte. Axe rendrait
alors la règle « incomplète » plutôt que « fausse ». La règle est donc
désactivée **explicitement**, et le contraste est mesuré par un script
dédié, sur les styles du dépôt.

## 2. La mesure du contraste

```bash
python3 scripts/quality/contrast.py                                   # tableau et verdict
python3 scripts/quality/contrast.py --reference ancien.css           # avant / après
python3 scripts/quality/contrast.py --json                            # la même mesure, en JSON
```

Le script lit les fichiers `.css` de `apps/web/src/styles/`, **suit la
cascade** (un `@import` est résolu à sa place, dans l'ordre du source),
résout les variables CSS (`var(--nom)`) et calcule le ratio WCAG de chaque
couple texte/fond et composant/fond. Il sort en **1** dès qu'un couple passe
sous son seuil : 4,5:1 pour le texte normal, 3:1 pour le grand texte
(24 px, ou 18,66 px en gras) et 3:1 pour les composants d'interface
(bordures, contours, contour de focus). Bibliothèque standard uniquement,
aucun accès réseau, aucune écriture.

Le test `apps/web/test/styles-a11y.test.ts` vérifie les deux moitiés de la
promesse : les styles du dépôt **passent**, et le script **échoue bien** quand
on lui donne un CSS dont un couple est trop juste.

### Le tableau (avant la correction / après)

Les ratios sont calculés sur les couples que le script trouve dans les
styles. « Avant » = les styles de `main`, « après » = ceux de cette branche.

| Couple | Texte / fond | Avant | Après | Seuil | Verdict |
| --- | --- | --- | --- | --- | --- |
| texte `html`, `body`, `button` | #1a1a18 / #f7f5ef | 15,99 | 15,99 | 4,5 | ok |
| texte `button:disabled` | #4a4740 / #f7f5ef | 8,50 | 8,50 | 4,5 | exempt |
| texte `input`, `textarea`, `select` | #1a1a18 / #fffdf8 | 17,15 | 17,15 | 4,5 | ok |
| texte `.shelf-item .stack-hint`, `.journal-entry .meta` | #4a4740 / #fffdf8 | 9,11 | 9,11 | 4,5 | ok |
| texte `.stack-bar__hint`, `.part-label` | #4a4740 / #f7f5ef | 8,50 | 8,50 | 4,5 | ok |
| texte `.ink-agent input`, `.ink-agent textarea` | #8a3d0a / #fffdf8 | 7,50 | 7,50 | 4,5 | ok |
| texte `.ink-mark` | #8a3d0a / #f7f5ef | 7,00 | 7,00 | 4,5 | ok |
| texte `.inspector .tabs button[aria-selected="true"]` | #f7f5ef / #1a1a18 | 15,99 | 15,99 | 4,5 | ok |
| limite `button`, `.topbar`, `.badge`, `.candle .body` | #1a1a18 / #f7f5ef | 15,99 | 15,99 | 3 | ok |
| limite `button:disabled` | #c9c4b6 → #8f8a7d / #f7f5ef | 1,60 | 3,16 | 3 | exempt |
| limite `input`, `textarea`, `select`, `.state-note` | #1a1a18 / #fffdf8 | 17,15 | 17,15 | 3 | ok |
| limite `.state-note.refusal`, `.ink-agent input` | #8a3d0a / #fffdf8 | 7,50 | 7,50 | 3 | ok |
| limite `.stack-bar__problem` | #8a3d0a / #f7f5ef | 7,00 | 7,00 | 3 | ok |
| limite `.candle.out .flame` | #4a4740 / #f7f5ef | 8,50 | 8,50 | 3 | ok |
| limite `.handle.selected` | #1f4f8a / #f7f5ef | 7,57 | 7,57 | 3 | ok |
| limite `.agent-list li` | #c9c4b6 → #8f8a7d / #f7f5ef | **1,60** | **3,16** | 3 | **corrigé** |
| limite `.settings-section` | #c9c4b6 → #8f8a7d / #fffdf8 | **1,71** | **3,39** | 3 | **corrigé** |
| focus `:focus-visible` sur le papier | #1f4f8a / #f7f5ef | 7,57 | 7,57 | 3 | ok |
| focus `:focus-visible` sur un panneau | #1f4f8a / #fffdf8 | 8,12 | 8,12 | 3 | ok |

Verdict du script sur cette branche : **19 couples mesurés, 0 en échec,
2 exempts** (les contrôles désactivés, que le WCAG 1.4.11 exempte).

## 3. Les écarts trouvés, et ce qui a été fait

1. **Les bordures de composants ne tenaient pas 3:1.** La variable `--rule`
   (#c9c4b6) servait de bordure aux entrées de la liste des agents et aux
   sections des réglages : 1,60:1 et 1,71:1, très en dessous du seuil de 3:1
   du WCAG 1.4.11. Elle est passée à **#8f8a7d** (3,16:1 sur le papier,
   3,39:1 sur un panneau) : la teinte chaude et le trait fin restent, le
   contraste passe.
2. **Les contrastes annoncés dans les commentaires du CSS étaient faux.**
   L'encre secondaire y était annoncée à 7,6:1 : elle est à 8,50:1. Les
   commentaires disent maintenant les valeurs mesurées.
3. **Le mouvement réduit ne coupait pas le défilement.** La media query
   existed et neutralisait les animations et les transitions, mais pas le
   défilement doux. `scroll-behavior: smooth` est désormais coupé par
   `scroll-behavior: auto` dans la media query.
4. **Les transitions du site étaient absentes des styles.** L'encre d'un
   champ change de couleur quand l'agent écrit, et une entrée du journal se
   pose en douceur : ces deux mouvements sont déclarés, et la media query les
   coupe. Avec le mouvement réduit, la flamme reste allumée mais immobile,
   l'entrée du journal apparaît d'un coup, l'encre change sans fondu.
5. **Le focus n'était vérifié nulle part.** La règle `:focus-visible`
   existait (3 px, à 2 px du bord, #1f4f8a) : rien ne garantissait qu'elle
   couvre tous les types de contrôle, ni qu'elle tienne son contraste. Un
   test s'en assure désormais, et le script mesure le couple focus/fond.
6. **Les styles ne respectaient pas la règle des tailles.** Le fichier unique
   faisait 641 lignes. Il est désormais split en quatre feuilles
   (`two-inks.css` reste le point d'entrée et importe les trois autres dans
   l'ordre de la cascade), chacune sous 500 lignes. C'est aussi ce qui permet
   au script de contraste de suivre une cascade répartie sur plusieurs
   fichiers.

## 4. Ce qui n'est pas contrôlé automatiquement, et pourquoi

Le jsdom est un DOM sans navigateur : pas de mise en page, pas de styles
calculés, pas de rendu réel. Ce qui suit reste **à vérifier à la
main** avant d'annoncer la conformité :

- **Le contraste dans un vrai rendu.** Le script raisonne sur le CSS seul : il
  déduit le fond d'un élément par la cascade (règle la plus spécifique qui
  s'applique, sinon le fond du parent, sinon celui de la page). Il ne voit
  pas le DOM rendu, donc un fond posé par une classe d'ancêtre non chaînée
  lui échappe. Trois couples sont dans ce cas : `.part-label` (dans
  `.card-frame`), `.ink-mark` et l'indicateur « ◆ agent » du journal. Le
  script les mesure sur le fond de la page (8,50 et 7,00) alors que le fond
  réel est le panneau clair (9,11 et 7,50) : **les deux versions passent**,
  mais la valeur exacte demande un navigateur.
- **La lecture d'écran réelle.** Le test calcule un nom accessible (aria,
  `label`, texte, titre) et vérifie qu'il n'est pas vide ; un lecteur
  d'écran réel calcule le sien, qui peut différer (notamment sur les
  boutons dont le texte vient d'un agent). L'ordre de lecture, l'annonce
  des zones `aria-live` (le texte écrit par un agent, dans
  `apps/web/src/parts/FieldPartView.tsx`) et le rôle des onglets
  (`role="tab"`) se vérifient à l'oreille, avec VoiceOver ou NVDA.
- **Le focus visible à l'écran.** jsdom ne calcule pas les styles : le test
  vérifie que la règle existe, qu'elle porte un contour et qu'elle couvre
  tous les types de contrôle ; que le contour soit *visible* se regarde.
- **Le zoom à 400 % et le reflow** (WCAG 1.4.10) : le site a des règles de
  petite largeur (`@media (max-width: 420px)`), mais rien ne le vérifie
  automatiquement.
- **La taille des cibles tactiles** (WCAG 2.5.8, 24 px) : non mesurée.
- **Les états de survol et de focus des couleurs** : le script mesure l'état
  normal ; un survol qui changerait la couleur d'un texte n'est pas vu.
- **Les exemptions** : les contrôles désactivés (`button:disabled`) sont
  exempts des seuils de contraste, comme le veut le WCAG. C'est un choix
  assumé, pas une mesure.

## 5. Le parcours P2 au clavier

Le parcours demandé par la recette est « créer un champ, créer un bouton
depuis la palette ». Il est fait **au clavier seul** dans le test : Tab
déplace le focus jusqu'au bouton de la palette, Entrée l'active, et le
moteur crée la partie ; puis Tab again, Entrée, et la seconde partie est
créée. L'ordre de tabulation est vérifié écran par écran : il suit l'ordre
du document, et aucun `tabindex` positif ne le décolle.

jsdom n'active pas un bouton avec la touche Entrée : le test installe donc
un **harnais clavier** (`apps/web/test/clavier.ts`) qui fait ce que fait un
navigateur — Tab passe au contrôle suivant, Entrée et Espace activent le
bouton qui a le focus. Ce qui est vérifié ensuite (l'action demandée au
clavier aboutit) reste vrai dans un vrai navigateur.

## 6. Reproduire

```bash
npm run typecheck                                   # 0 erreur
npm run test:ci                                     # la suite complète
npx vitest run apps/web/test/a11y.test.ts           # l'audit axe et le clavier
npx vitest run apps/web/test/styles-a11y.test.ts     # les règles de style et le contraste
python3 scripts/quality/contrast.py                 # le tableau de contraste
python3 scripts/guards/run_all.py                   # les gardes du dépôt
npm run build --workspace @cardwake/web             # le site se construit
```
