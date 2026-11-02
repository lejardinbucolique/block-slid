# Block slid

PWA installable (portrait, plein écran, hors ligne). HTML, CSS et JavaScript simples, sans build.

## Essayer en local

```
python -m http.server 8000
```

Puis ouvrir http://localhost:8000. Sur Android (Chrome), l'installation exige HTTPS ou localhost : la page propose le bouton « Installer l'application », ou un texte d'aide si le navigateur ne la propose pas.

## Fichiers

- `index.html`, `style.css`, `app.js` : page, styles, installation (proposée dans les réglages)
- `src/moteur/` : la logique du jeu (BS2), testée par `npm test`
- `src/ui/jeu.js` : l'écran de jeu, qui affiche l'état du moteur et lui relaie le glisser au doigt ; `src/ui/stockage.js` : meilleur score et vibration, gardés sur l'appareil
- `manifest.webmanifest` : nom, affichage plein écran, orientation portrait, couleurs, icônes
- `sw.js` : service worker (précache, ouverture hors ligne). Changer `VERSION` quand un fichier précaché change, et y lister tout nouveau fichier
- `icons/` : icônes, régénérables par `python tools/icones.py`
