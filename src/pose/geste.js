// Calculs du geste de pose de block-pose (BS45), sans écran ni navigateur : de la position
// du doigt à la case visée, validité de l'emplacement, lignes et colonnes que la pose
// compléterait, taille d'une case. L'écran (ecran.js) ne fait que les appeler et dessiner.
//
// Repère : les lignes comptent du haut (0) vers le bas, les colonnes de la gauche (0) vers la
// droite, comme le moteur (moteur.js). Les positions à l'écran sont en pixels.

// De combien de cases la pièce peut dépasser du bord de la grille tout en visant la case du
// bord : un doigt un peu imprécis pose quand même au ras du bord. Au-delà, la pose est « hors
// de la grille » et la pièce revient à sa place.
export const TOLERANCE_HORS_GRILLE = 0.6

const borne = (n, min, max) => Math.min(max, Math.max(min, n))

// La case (coin haut gauche de la pièce) visée par le doigt, ou null si la pièce est hors de
// la grille. La pièce s'affiche centrée sur le doigt, son bord bas à `decalage` pixels au-dessus
// (pour ne pas être cachée par le doigt) ; elle prend la case dont elle est la plus proche.
//   x, y        position du doigt
//   hauteur, largeur   de la pièce, en cases
//   cellule     côté d'une case de la grille, en pixels
//   origine     { x, y } du coin haut gauche de la grille à l'écran
export function caseVisee({ x, y, hauteur, largeur, cellule, origine, decalage, lignes, colonnes, tolerance = TOLERANCE_HORS_GRILLE }) {
  const colMax = colonnes - largeur
  const ligneMax = lignes - hauteur
  if (colMax < 0 || ligneMax < 0 || !(cellule > 0)) return null
  const col = (x - (largeur * cellule) / 2 - origine.x) / cellule
  const ligne = (y - decalage - hauteur * cellule - origine.y) / cellule
  if (!Number.isFinite(col) || !Number.isFinite(ligne)) return null
  if (col < -tolerance || col > colMax + tolerance || ligne < -tolerance || ligne > ligneMax + tolerance) return null
  return { ligne: borne(Math.round(ligne), 0, ligneMax), col: borne(Math.round(col), 0, colMax) }
}

// Ce que donnerait la pose de ces cases (du catalogue : { ligne, col } relatives) avec leur coin
// haut gauche en (ligne, col), sur une grille de null (vide) et de couleurs (occupé) :
//   valide    la pièce tient (dans la grille, sur des cases vides)
//   cases     les cases qu'elle occuperait, à leur place sur la grille
//   lignes, colonnes   les rangs des lignes et colonnes qui seraient pleines, donc effacées
// Une pose refusée ne complète rien. Même résultat que poser() du moteur, sans rien modifier.
export function apercuCoup(grille, cases, ligne, col) {
  const nbLignes = grille.length
  const nbColonnes = nbLignes > 0 ? grille[0].length : 0
  const posees = cases.map((c) => ({ ligne: ligne + c.ligne, col: col + c.col }))
  const dedans = posees.every((c) => c.ligne >= 0 && c.ligne < nbLignes && c.col >= 0 && c.col < nbColonnes)
  const valide = cases.length > 0 && dedans && posees.every((c) => grille[c.ligne][c.col] === null)
  if (!valide) return { valide: false, cases: posees, lignes: [], colonnes: [] }
  const prises = new Set(posees.map((c) => c.ligne * nbColonnes + c.col))
  const plein = (l, k) => grille[l][k] !== null || prises.has(l * nbColonnes + k)
  const rangs = (n) => Array.from({ length: n }, (_, i) => i)
  return {
    valide: true,
    cases: posees,
    lignes: rangs(nbLignes).filter((l) => rangs(nbColonnes).every((k) => plein(l, k))),
    colonnes: rangs(nbColonnes).filter((k) => rangs(nbLignes).every((l) => plein(l, k))),
  }
}

// Les cases de la grille qui s'élèvent dans l'aperçu : toutes celles des lignes et colonnes
// que la pose compléterait, un croisement une seule fois. Dans l'ordre de la grille.
export function casesElevees(apercu, nbLignes, nbColonnes) {
  const rendues = []
  for (let l = 0; l < nbLignes; l++) {
    for (let k = 0; k < nbColonnes; k++) {
      if (apercu.lignes.includes(l) || apercu.colonnes.includes(k)) rendues.push({ ligne: l, col: k })
    }
  }
  return rendues
}

// Comment chaque case disparue d'un coup s'efface (BS46) : une case d'une ligne pleine suit le sens
// de la ligne (de gauche à droite : sa colonne est sa place), une case d'une colonne seule suit
// celui de la colonne (de haut en bas : sa ligne est sa place). À un croisement, la ligne l'emporte.
// Les styles de blocs étalent leur animation de case en case d'après cette place et lui donnent,
// pour une colonne, la version verticale de leur effet. Dans l'ordre de `casesDisparues`.
export function sensEffacement({ lignes, colonnes, casesDisparues }) {
  return casesDisparues.map((c) => {
    const dansUneLigne = lignes.includes(c.ligne)
    return { ligne: c.ligne, col: c.col, vertical: !dansUneLigne, position: dansUneLigne ? c.col : c.ligne }
  })
}

// Le centre, en cases (décimales), de ce que le coup efface : le milieu des lignes effacées
// pour des lignes seules, des colonnes pour des colonnes seules, de la grille quand les deux se
// croisent. C'est là que montent les points. null s'il n'y a rien d'effacé.
export function centreEffacement({ lignes, colonnes }, nbLignes, nbColonnes) {
  if (lignes.length === 0 && colonnes.length === 0) return null
  const milieu = (rangs) => rangs.reduce((a, b) => a + b, 0) / rangs.length + 0.5
  if (lignes.length > 0 && colonnes.length > 0) return { ligne: nbLignes / 2, col: nbColonnes / 2 }
  if (lignes.length > 0) return { ligne: milieu(lignes), col: nbColonnes / 2 }
  return { ligne: nbLignes / 2, col: milieu(colonnes) }
}

// Le côté d'une case de la grille, en pixels entiers, d'après la place dont on dispose : il
// faut loger la grille (`lignes` cases de haut), puis les pièces à poser et l'aperçu, qui
// valent `piecesEnCases` cases de haut à la taille d'une case de grille (par exemple
// 5 × 0,5 + 5 × 0,3). `fixe` est la hauteur de ce qui ne dépend pas de la case : en-tête,
// bonus, écarts. Jamais en dessous de `minimum`.
export function tailleCellule({ largeur, hauteur, fixe, colonnes, lignes, piecesEnCases, minimum = 18 }) {
  const parLargeur = largeur / colonnes
  const parHauteur = (hauteur - fixe) / (lignes + piecesEnCases)
  return Math.max(minimum, Math.floor(Math.min(parLargeur, parHauteur)))
}
