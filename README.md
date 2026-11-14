# Block slid

PWA installable (portrait, plein écran, hors ligne). HTML, CSS et JavaScript simples, sans build.

## Essayer en local

```
python -m http.server 8000
```

Puis ouvrir http://localhost:8000. Sur Android (Chrome), l'installation exige HTTPS ou localhost : la page propose le bouton « Installer l'application », ou un texte d'aide si le navigateur ne la propose pas.

## Fichiers

- `index.html`, `style.css`, `app.js` : page, styles, installation (proposée dans les réglages)
- `src/moteur/` : la logique du jeu (BS2), testée par `npm test` ; un coup rend aussi ses étapes (`dernierCoup.etapes`)
- `src/ui/jeu.js` : l’écran de jeu, qui joue les étapes d’un coup une à une (durées dans `DUREES_MS`) et lui relaie le glisser au doigt ; `src/ui/stockage.js` : meilleur score, vibration et partie en cours (sans date limite, rechargée à l'ouverture sauf si elle est perdue), gardés sur l'appareil ; la mise à jour automatique recharge donc la page à tout moment (BS9)
- Figures à composer (BS10, refaites en BS12, élargies en BS14) : le jeu propose toujours une figure, montrée à droite du score avec son bonus de 10000 points : une ligne du bas de 6 ou 7 blocs d'une seule case d'affilée, sans trou, et une ligne du haut posée dessus, soit complète (deux lignes identiques), soit incomplète (4 cases au moins, jusqu'à 2 trous, couleurs libres), en 1 à 3 couleurs en tout et toujours sur des colonnes occupées par la ligne du bas (donc aucun bloc en l'air). Le bonus baisse de 100 à chaque coup ; la figure faite n'importe où dans la grille, sur deux lignes voisines aux mêmes colonnes (les cases vides du haut ne demandent rien), ajoute le bonus qui reste au score, et une nouvelle figure arrive (aussi quand le bonus tombe à 0). Elle est faisable parce que les lignes qui arrivent la poussent : tant qu'elle est en cours, chacune contient 3 ou 4 blocs d'une case aux couleurs qui manquent le plus à la figure (au moins 1 ou 2 : mesuré avec un joueur automatique, avec si peu aucune figure ne se réalise en 80 coups la plupart du temps). Réglages dans `src/moteur/reglages.js` (`figures`, `null` pour tout couper), tirage de la figure et reconnaissance dans `src/moteur/figures.js`, poussée des lignes dans `src/moteur/tirage.js` (`pousserLigne`), case à cocher dans la fenêtre des réglages
- Passer le coup (BS20) : le bouton à gauche du score fait monter la ligne sans déplacer aucun bloc (`passerCoup` dans `src/moteur/moteur.js`) ; c'est un coup de grille comme un autre (montée, lignes, secours, défaite, bonus, figure, par le même chemin que `jouer`), toujours permis tant que la partie n'est pas finie, et il ne change pas le tirage des lignes
- `manifest.webmanifest` : nom, affichage plein écran, orientation portrait, couleurs, icônes
- `sw.js` : service worker (précache, ouverture hors ligne). Changer `VERSION` quand un fichier précaché change, et y lister tout nouveau fichier. `node --test` le rappelle : après avoir changé `VERSION`, lancer `node tools/empreinte.js`.
- `icons/` : icônes, régénérables par `python tools/icones.py`
