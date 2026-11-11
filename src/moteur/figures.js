// Les figures à composer (BS10, refaites en BS12, élargies en BS14) : une ligne du
// bas de 6 ou 7 blocs d'une seule case d'affilée, et une ligne du haut posée dessus,
// soit complète (les deux lignes sont alors identiques), soit incomplète : d'au
// moins 4 cases, sur des colonnes occupées par la ligne du bas, d'un seul tenant ou
// avec quelques trous, aux couleurs libres. 1 à 3 couleurs en tout. Elles rapportent
// un bonus quand elles apparaissent quelque part dans la grille. Fonctions pures :
// le hasard est passé en paramètre.
//
// Une figure : { cases: [{ ligne, col, couleur }], depart }. Lignes (0 en haut, 1 en
// bas) et colonnes sont relatives (la colonne de gauche vaut 0) ; `depart` est le
// bonus de départ.
//
// Pourquoi elle est faisable : chaque case de la ligne du haut a une case dessous
// (aucun bloc en l'air), à la manière de la copie de ligne du jeu. Rien n'est testé
// après coup : ses couleurs sont tirées librement, et ce sont les lignes qui
// arrivent qui s'adaptent à elle en recolorant leurs blocs d'une case (BS15).

// Hauteur et largeur (en cases) du rectangle qui contient la figure.
export function tailleFigure(figure) {
  return {
    lignes: Math.max(...figure.cases.map((c) => c.ligne)) + 1,
    colonnes: Math.max(...figure.cases.map((c) => c.col)) + 1,
  }
}

// --- Le motif --------------------------------------------------------------

const motifs = new WeakMap()

// Le motif de la figure : { largeur, bas: [couleur de chaque colonne], haut: [couleur
// de chaque colonne, null là où la ligne du haut est vide], couleurs: la couleur de
// chaque case de la figure }, ou null si la figure n'est pas au bon format : ligne du
// bas pleine de 0 à largeur - 1, ligne du haut non vide et sur des colonnes du bas.
export function motifFigure(figure) {
  if (!figure || !Array.isArray(figure.cases)) return null
  if (motifs.has(figure)) return motifs.get(figure)
  const motif = lireMotif(figure)
  motifs.set(figure, motif)
  return motif
}

function lireMotif(figure) {
  const rangee = (l) => figure.cases.filter((c) => c.ligne === l).sort((a, b) => a.col - b.col)
  const haut = rangee(0)
  const bas = rangee(1)
  if (!haut.length || !bas.length || haut.length + bas.length !== figure.cases.length) return null
  if (bas.some((c, i) => c.col !== i)) return null
  if (haut.some((c) => c.col >= bas.length)) return null
  const hautParCol = Array(bas.length).fill(null)
  for (const c of haut) hautParCol[c.col] = c.couleur
  return {
    largeur: bas.length,
    bas: bas.map((c) => c.couleur),
    haut: hautParCol,
    couleurs: [...bas, ...haut].map((c) => c.couleur),
  }
}

// La figure est-elle dans le bon format pour ces réglages de figures ?
export function figureValide(figure, cfg) {
  const motif = motifFigure(figure)
  if (!motif || !cfg.largeurs.includes(motif.largeur)) return false
  const cols = motif.haut.flatMap((c, i) => (c === null ? [] : [i]))
  const trous = cols[cols.length - 1] - cols[0] + 1 - cols.length
  // La ligne du haut complète est toujours permise (les deux lignes identiques).
  if (cols.length < motif.largeur && (cols.length < cfg.haut.min || trous > cfg.haut.trousMax)) return false
  return new Set(motif.couleurs).size <= cfg.couleursMax
}

// Les cases de la grille, rangée par rangée : la couleur du bloc d'une case,
// '#' pour un bloc plus large, '' pour une case vide.
function rangees(blocs, nbLignes, colonnes) {
  const g = Array.from({ length: nbLignes }, () => Array(colonnes).fill(''))
  for (const b of blocs) {
    for (let c = b.col; c < b.col + b.largeur; c++) g[b.ligne][c] = b.largeur === 1 ? b.couleur : '#'
  }
  return g
}

// Les colonnes où le motif commence : `bas` est la rangée de la grille qui porte la
// ligne du bas du motif, `haut` la rangée du dessus, qui porte les cases de la ligne
// du haut (les colonnes vides du motif ne demandent rien).
function departs(bas, haut, motif) {
  const trouves = []
  for (let a = 0; a + motif.largeur <= bas.length; a++) {
    if (motif.bas.every((couleur, dc) => bas[a + dc] === couleur)
      && motif.haut.every((couleur, dc) => couleur === null || haut[a + dc] === couleur)) trouves.push(a)
  }
  return trouves
}

// La figure est-elle dans la grille, n'importe où ? Deux rangées voisines portent le
// motif aux mêmes colonnes, la ligne du haut au-dessus de celle du bas. Seuls
// comptent les blocs d'une case de la bonne couleur ; le reste de la grille ne
// change rien.
export function figurePresente(figure, blocs, nbLignes = null, colonnes = null) {
  const motif = motifFigure(figure)
  if (!motif || !blocs.length) return false
  nbLignes ??= Math.max(...blocs.map((b) => b.ligne)) + 1
  colonnes ??= Math.max(...blocs.map((b) => b.col + b.largeur))
  const g = rangees(blocs, nbLignes, colonnes)
  for (let l = 0; l + 1 < nbLignes; l++) {
    if (departs(g[l + 1], g[l], motif).length) return true
  }
  return false
}

// --- Proposer ----------------------------------------------------------------

// Tire une figure : toujours une, jamais « rien ». Une figure déjà dans la
// grille est écartée (elle rapporterait tout de suite) : on en tire une autre.
export function proposerFigure(blocs, reglages, aleatoire) {
  let figure
  for (let essai = 0; essai < 50; essai++) {
    figure = composer(reglages, aleatoire)
    if (!figurePresente(figure, blocs, reglages.lignes, reglages.colonnes)) break
  }
  return figure
}

// Une figure : la largeur, 1 à 3 couleurs tirées parmi celles du jeu, une couleur de
// cette palette au hasard pour chaque case de la ligne du bas. Avec la chance
// `haut.chanceIncomplete`, la ligne du haut est incomplète (taille, place et trous
// au hasard, couleurs libres dans la palette) ; sinon elle recopie celle du bas.
function composer(reglages, aleatoire) {
  const cfg = reglages.figures
  const entre = (a, b) => a + Math.floor(aleatoire() * (b - a + 1))
  const largeur = cfg.largeurs[entre(0, cfg.largeurs.length - 1)]
  const palette = melanger(aleatoire, [...reglages.couleurs]).slice(0, entre(1, Math.min(cfg.couleursMax, reglages.couleurs.length)))
  const couleur = () => palette[entre(0, palette.length - 1)]
  const bas = Array.from({ length: largeur }, couleur)
  let haut = bas
  if (aleatoire() < cfg.haut.chanceIncomplete) {
    // n cases sur une étendue de n à n + trousMax colonnes, bornes comprises ; les
    // trous sont pris parmi les colonnes entre les deux bornes.
    const n = entre(Math.min(cfg.haut.min, largeur - 1), largeur - 1)
    const etendue = entre(n, Math.min(largeur, n + cfg.haut.trousMax))
    const debut = entre(0, largeur - etendue)
    const entres = melanger(aleatoire, Array.from({ length: etendue - 2 }, (_, i) => debut + 1 + i))
    const trous = new Set(entres.slice(0, etendue - n))
    haut = bas.map((_, col) => (col >= debut && col < debut + etendue && !trous.has(col) ? couleur() : null))
  }
  const cases = []
  haut.forEach((c, col) => { if (c !== null) cases.push({ ligne: 0, col, couleur: c }) })
  bas.forEach((c, col) => cases.push({ ligne: 1, col, couleur: c }))
  return { cases, depart: cfg.bonusDepart }
}

function melanger(aleatoire, liste) {
  for (let i = liste.length - 1; i > 0; i--) {
    const j = Math.floor(aleatoire() * (i + 1))
    ;[liste[i], liste[j]] = [liste[j], liste[i]]
  }
  return liste
}
