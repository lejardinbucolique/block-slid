# Mesures de fluidité des styles (BS53)

Chrome headless sur ce poste (`C:/Program Files/Google/Chrome/Application/chrome.exe`), CPU ralenti par `RATE` (4 par défaut).

- `styles-pose.mjs <dépôt> [styles] [largeur] [hauteur]` : block-pose au repos, au glisser et à l'effacement d'une ligne (images, temps de tâche).
- `glisse-trace-pose.mjs <dépôt> [styles] 412 800` : profil de trace du glisser ; `LONG=40` liste les images longues et ce qu'elles font, `CSS="…"` injecte une règle pour essayer une piste.
- `anim-slid.mjs <dépôt> [largeur]` (avec `STYLE=laine`) : block-slid, un coup qui efface une ligne.
- `captures-pose.mjs <dépôt> [styles] 412 800` (avec `SORTIE=<dossier>`) puis `python diff-captures.py <avant> <après> [dossier des écarts]` : captures de block-pose au repos et pendant le glisser, comparées au pixel.

# Fluidité du glisser (BS59)

- `glisse-fluide-pose.mjs <dépôt> [styles] 412 800` : un vrai geste continu (doigt posé sur une pièce de la main, tiré vers la grille, entrée, survol de plusieurs places, pause, puis jusqu'à la place qui complète une ligne). Pour chaque style et chaque scénario (`SCENARIOS=milieu,ligne`), le plus long retard entre un mouvement du doigt et son traitement par la page (la pièce suit le doigt à ce moment-là), l'image la plus longue et le nombre d'images au-dessus de 33 ms. Le retard de base, même sur un geste fluide, est d'environ 35 ms (l'événement attend l'image). `GESTE=3` répète le geste, `PHOTOS=<dossier>` garde une capture au moment de la place qui complète une ligne.
- `marquage-pose.mjs <dépôt> [styles]` : le coût du recalcul de style quand 10 puis 40 blocs passent à « allume » puis « efface ». Sans geste ni trace : sert à essayer une règle (`CSS="…"`).
- `glisse-trace-pose.mjs` : `EFFACE=2500` relâche le doigt sur la ligne à compléter et trace la pose et l'effacement ; `INV=1` compte les invalidations de style ; `PROFIL=1` (avec `EFFACE`) liste le temps propre des fonctions JS ; `MIN=<ms>` règle la durée minimale des sous-événements affichés par `LONG`.
- `PLEINES=<n>` (styles-pose, glisse-trace, glisse-fluide, marquage) : le nombre de lignes déjà pleines sous la ligne à compléter (3 par défaut : 4 lignes d'un coup ; 0 : une seule).

# Fluidité, suite (BS61)

- `glisse-fluide-pose.mjs` : `LONG=<ms>` trace le geste, liste les tâches plus longues que ça avec leur contenu, et le décompte des dessins (combien de fois chaque élément est redessiné, ce que coûtent les images de texture : un décompte qui ne dépend pas de la charge du poste, à préférer aux temps pour comparer deux versions) ; `REPERES=1` donne l'instant du pointerdown et des gros dessins ; `MIN=<ms>` règle le plus petit sous-événement montré.
- `tirage-fin-de-tour-pose.mjs [niveaux] [parties] [poses]` : le coût du tirage de fin de tour sur le PC (pas de navigateur) : le robot du simulateur joue, chaque pose qui renouvelle la main est chronométrée (le plus court de `ESSAIS=3` essais, pour écarter les interruptions d'un poste chargé). Rapporte moyenne, médian, 95e centile, pire cas, la part des renouvellements où le filet remplace la main, et une empreinte de tout ce qui a été tiré : elle ne doit pas changer quand on optimise (test/tirage-reference.json le garde aussi).
- `renouvellement-pose.mjs <dépôt> [styles] 412 800` : le moment où la dernière pièce de la main se pose et où la main suivante arrive, à CPU ralenti, après échauffement du code de tirage (`CHAUFFE=25`). Rapporte le traitement du relâchement (pointerup : pose, tirage, redessin), la tâche et l'image les plus longues ; `LONG=<ms>` liste les tâches longues avec leur contenu, `PROFIL=1` les fonctions JS qui coûtent le plus, `NIVEAU=1` le niveau, `TOURS=6` le nombre de renouvellements.
