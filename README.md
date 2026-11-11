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
- Figures à composer (BS10) : le jeu propose un modèle fait de blocs d'une seule case (1 ou 2 lignes), montré à droite du score avec son bonus (3000, 5000 ou 10000 points selon le nombre de cases) ; le bonus baisse de 100 à chaque coup, et la figure faite n'importe où dans la grille ajoute le bonus qui reste au score. Réglages dans `src/moteur/reglages.js` (`figures`, `null` pour tout couper), tirage et reconnaissance dans `src/moteur/figures.js`, case à cocher dans la fenêtre des réglages
- `manifest.webmanifest` : nom, affichage plein écran, orientation portrait, couleurs, icônes
- `sw.js` : service worker (précache, ouverture hors ligne). Changer `VERSION` quand un fichier précaché change, et y lister tout nouveau fichier. `node --test` le rappelle : après avoir changé `VERSION`, lancer `node tools/empreinte.js`.
- `icons/` : icônes, régénérables par `python tools/icones.py`
