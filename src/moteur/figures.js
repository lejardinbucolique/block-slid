// Les figures à composer (BS10, refaites en BS12, élargies en BS14) : une ligne du
// bas de 6 ou 7 blocs d'une seule case d'affilée, et une ligne du haut posée dessus,
// soit complète (les deux lignes sont alors identiques), soit incomplète : d'au
// moins 4 cases, sur des colonnes occupées par la ligne du bas, d'un seul tenant ou
// avec quelques trous, faite de cases du bas dans leur ordre (BS18). 1 à 3 couleurs en tout. Elles rapportent
// un bonus quand elles apparaissent quelque part dans la grille. Fonctions pures :
// le hasard est passé en paramètre.
//
// Une figure : { cases: [{ ligne, col, couleur }], depart }. Lignes (0 en haut, 1 en
// bas) et colonnes sont relatives (la colonne de gauche vaut 0) ; `depart` est le
// bonus de départ (plus haut pour une figure complexe, BS21).
//
// Pourquoi elle est faisable : chaque case de la ligne du haut a une case dessous
// (aucun bloc en l'air), à la manière de la copie de ligne du jeu, et ses couleurs
// se retrouvent dans le même ordre en bas (BS18). Pour le reste, les lignes qui
// arrivent qui s'adaptent à elle en recolorant leurs blocs d'une case (BS15).

// Hauteur et largeur (en cases) du rectangle qui contient la figure.
export function tailleFigure(figure) {
  return {
    lignes: Math.max(...figure.cases.map((c) => c.ligne)) + 1,
    colonnes: Math.max(...figure.cases.map((c) => c.col)) + 1,
  }
}

// La figure écrite en clair, pour la lire d'un coup d'œil (signalements, BS19) :
// { haut, bas, legende }. Chaque rangée a une lettre par colonne (un point pour une
// case vide) ; la légende dit quelle lettre est quelle couleur.
const LETTRES = { jaune: 'J', orange: 'O', rouge: 'R', vert: 'V', bleu: 'B', 'bleu clair': 'C', violet: 'P' }

export function figureEnTexte(figure) {
  const { colonnes } = tailleFigure(figure)
  const legende = {}
  const rangee = (ligne) => {
    const r = Array(colonnes).fill('.')
    for (const c of figure.cases) {
      if (c.ligne !== ligne) continue
      const lettre = LETTRES[c.couleur] ?? c.couleur[0].toUpperCase()
      legende[lettre] = c.couleur
      r[c.col] = lettre
    }
    return r.join('')
  }
  return { haut: rangee(0), bas: rangee(1), legende }
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

// La figure est-elle complexe (BS21) : exactement 3 couleurs, 7 cases de large et une
// ligne du haut incomplète (au moins un trou, ou une case de moins que le bas) ? Elle
// démarre alors avec un plus gros bonus. Faux si le motif est illisible.
export const LARGEUR_COMPLEXE = 7

export function figureComplexe(figure) {
  const motif = motifFigure(figure)
  if (!motif || motif.largeur !== LARGEUR_COMPLEXE) return false
  return new Set(motif.couleurs).size === 3 && motif.haut.includes(null)
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

// La ligne du haut est-elle faite de cases de la ligne du bas, dans le même ordre
// de gauche à droite (BS18) ? Sa suite de couleurs est alors une sous-suite de
// celle du bas, quelle que soit sa place : c'est ce qui la rend faisable.
export function figureCoherente(figure) {
  const motif = motifFigure(figure)
  if (!motif) return false
  let i = 0
  for (const c of motif.haut) {
    if (c === null) continue
    while (i < motif.bas.length && motif.bas[i] !== c) i++
    if (i++ >= motif.bas.length) return false
  }
  return true
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

// Une figure : la largeur, 1 à 3 couleurs tirées parmi celles du jeu, au poids de
// `poidsCouleurs` (BS16). Les rangées sont faites de plages : des cases voisines de
// même couleur, au moins 2 par plage, deux plages voisines de couleurs différentes,
// au plus 3 plages en bas et 2 en haut. Pas de couleurs alternées case par case, qui
// demandaient de poser les blocs d'une case dans un ordre exact. Avec la chance
// `haut.chanceIncomplete`, la ligne du haut est incomplète (taille et place au hasard,
// cases du bas gardées dans leur ordre, posées avec au plus
// `trousMax` trous, éventuellement décalées) ; sinon elle recopie celle du bas. `figureValide` ne vérifie
// pas les plages : les parties gardées avec une figure d'avant se rouvrent telles quelles.
function composer(reglages, aleatoire) {
  const cfg = reglages.figures
  const entre = (a, b) => a + Math.floor(aleatoire() * (b - a + 1))
  const largeur = cfg.largeurs[entre(0, cfg.largeurs.length - 1)]
  const max = Math.min(cfg.couleursMax, reglages.couleurs.length, 3)
  const nb = auPoids(aleatoire, cfg.poidsCouleurs, max)
  const palette = melanger(aleatoire, [...reglages.couleurs]).slice(0, nb)
  // Bas : une plage par couleur, ou A B A avec 2 couleurs une fois sur deux.
  const ordre = nb === 2 && largeur >= 6 && aleatoire() < 0.5 ? [palette[0], palette[1], palette[0]] : palette
  const bas = plages(aleatoire, largeur, ordre)
  let haut = bas
  if (aleatoire() < cfg.haut.chanceIncomplete) {
    // BS18 : n cases du bas, gardées dans leur ordre (une fenêtre de cases voisines,
    // parfois privée de 1 ou 2 cases du milieu), puis posées en haut sur une étendue
    // de n à n + trousMax colonnes, n'importe où dans la largeur, décalées ou non.
    const n = entre(Math.min(cfg.haut.min, largeur - 1), largeur - 1)
    const retires = aleatoire() < 0.6 ? 0 : entre(1, Math.max(1, Math.min(2, largeur - n, n - 1)))
    const k = Math.min(retires, largeur - n)
    const fenetre = entre(0, largeur - n - k)
    let gardees = bas.slice(fenetre, fenetre + n + k).map((c, i) => ({ c, i }))
    for (let r = 0; r < k; r++) gardees.splice(entre(1, gardees.length - 2), 1)
    const t = entre(0, Math.min(cfg.haut.trousMax, largeur - n))
    const ecarts = Array(n - 1).fill(0)
    for (let r = 0; r < t; r++) ecarts[entre(0, n - 2)]++
    const cellules = []
    gardees.forEach(({ c }, i) => {
      cellules.push(c)
      if (i < n - 1) for (let e = 0; e < ecarts[i]; e++) cellules.push(null)
    })
    const debut = entre(0, largeur - cellules.length)
    haut = bas.map((_, col) => (col >= debut && col < debut + cellules.length ? cellules[col - debut] : null))
  }
  const cases = []
  haut.forEach((c, col) => { if (c !== null) cases.push({ ligne: 0, col, couleur: c }) })
  bas.forEach((c, col) => cases.push({ ligne: 1, col, couleur: c }))
  const figure = { cases, depart: cfg.bonusDepart }
  if (figureComplexe(figure)) figure.depart = cfg.bonusDepartComplexe ?? cfg.bonusDepart
  return figure
}

// Une rangée de `longueur` cases en autant de plages que de couleurs dans `ordre`,
// chacune d'au moins 2 cases, le reste réparti au hasard.
function plages(aleatoire, longueur, ordre) {
  const tailles = ordre.map(() => 2)
  for (let reste = longueur - 2 * ordre.length; reste > 0; reste--) tailles[Math.floor(aleatoire() * tailles.length)]++
  return ordre.flatMap((c, i) => Array(tailles[i]).fill(c))
}

// Un nombre de 1 à `max`, au poids de la table { nombre: poids }.
function auPoids(aleatoire, table, max) {
  const choix = Object.entries(table ?? { 1: 1, 2: 1, 3: 1 }).map(([k, p]) => [Number(k), p]).filter(([k]) => k >= 1 && k <= max)
  let r = aleatoire() * choix.reduce((t, [, p]) => t + p, 0)
  for (const [k, p] of choix) if ((r -= p) < 0) return k
  return choix[choix.length - 1][0]
}

function melanger(aleatoire, liste) {
  for (let i = liste.length - 1; i > 0; i--) {
    const j = Math.floor(aleatoire() * (i + 1))
    ;[liste[i], liste[j]] = [liste[j], liste[i]]
  }
  return liste
}
