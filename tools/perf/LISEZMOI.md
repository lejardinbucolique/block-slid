# Mesures de fluidité des styles (BS53)

Chrome headless sur ce poste (`C:/Program Files/Google/Chrome/Application/chrome.exe`), CPU ralenti par `RATE` (4 par défaut).

- `styles-pose.mjs <dépôt> [styles] [largeur] [hauteur]` : block-pose au repos, au glisser et à l'effacement d'une ligne (images, temps de tâche).
- `glisse-trace-pose.mjs <dépôt> [styles] 412 800` : profil de trace du glisser ; `LONG=40` liste les images longues et ce qu'elles font, `CSS="…"` injecte une règle pour essayer une piste.
- `anim-slid.mjs <dépôt> [largeur]` (avec `STYLE=laine`) : block-slid, un coup qui efface une ligne.
- `captures-pose.mjs <dépôt> [styles] 412 800` (avec `SORTIE=<dossier>`) puis `python diff-captures.py <avant> <après> [dossier des écarts]` : captures de block-pose au repos et pendant le glisser, comparées au pixel.
