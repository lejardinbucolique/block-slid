// Catalogue des pièces de block-pose (BS40), cadré en BS38 : une seule table, ici.
//
// Les pièces ne tournent pas (sauf bonus, BS42) : chaque forme existe dans toutes
// ses orientations, et chaque orientation est une pièce à part. Les orientations
// sont tirées du motif par quarts de tour dans le sens des aiguilles d'une montre,
// sans doublon (une forme symétrique en a moins de quatre).
//
// Identifiant stable d'une pièce : « forme.rang », le rang étant celui de
// l'orientation dans cet ordre (barre4.0 couchée, barre4.1 debout). Il ne bouge pas
// tant qu'on ne change ni le motif ni le sens de rotation d'une forme ; on ajoute
// une forme en ajoutant une ligne à FORMES.
//
// La rotation (BS42) passe d'une pièce à l'orientation suivante : pieceSuivante.
//
// `difficulte` (1 à 4) classe la forme pour le tirage selon le niveau (niveaux.js) :
// 1 facile à poser, 2 moyenne, 3 tordue, 4 grosse ou tordue et longue.

export const FORMES = Object.freeze([
  { forme: 'bloc', difficulte: 1, motif: ['#'] },
  { forme: 'barre2', difficulte: 1, motif: ['##'] },
  { forme: 'barre3', difficulte: 1, motif: ['###'] },
  { forme: 'carre2', difficulte: 1, motif: ['##', '##'] },
  { forme: 'barre4', difficulte: 2, motif: ['####'] },
  // Coin en L de 3 cases.
  { forme: 'coin', difficulte: 2, motif: ['#.', '##'] },
  // Rectangle 2x3, debout en 3x2 dans son autre orientation.
  { forme: 'rectangle', difficulte: 2, motif: ['###', '###'] },
  { forme: 't', difficulte: 2, motif: ['###', '.#.'] },
  // L de 4 cases (BS50), trois en ligne et une au bout, et son symétrique J.
  { forme: 'l', difficulte: 2, motif: ['###', '#..'] },
  { forme: 'j', difficulte: 2, motif: ['###', '..#'] },
  { forme: 'carre3', difficulte: 3, motif: ['###', '###', '###'] },
  { forme: 's', difficulte: 3, motif: ['.##', '##.'] },
  { forme: 'z', difficulte: 3, motif: ['##.', '.##'] },
  { forme: 'barre5', difficulte: 4, motif: ['#####'] },
  { forme: 'carre4', difficulte: 4, motif: ['####', '####', '####', '####'] },
  // Grand L de 5 cases, deux bras de 3.
  { forme: 'grandL', difficulte: 4, motif: ['#..', '#..', '###'] },
].map(Object.freeze))

// Toutes les pièces, dans l'ordre des formes puis des orientations.
// Une pièce : { id, forme, rang, difficulte, cases: [{ ligne, col }], hauteur, largeur }.
export const CATALOGUE = Object.freeze(FORMES.flatMap(orientations))

const PAR_ID = new Map(CATALOGUE.map((p) => [p.id, p]))

// La pièce d'un identifiant, ou undefined s'il n'est pas au catalogue.
export const piece = (id) => PAR_ID.get(id)

// L'orientation suivante de la même forme (un quart de tour de plus), en boucle.
export function pieceSuivante(id) {
  const p = PAR_ID.get(id)
  if (!p) return undefined
  const memes = CATALOGUE.filter((q) => q.forme === p.forme)
  return memes[(p.rang + 1) % memes.length].id
}

// Règle de faisabilité (BS38) : une pose n'efface que les lignes et les colonnes
// que la pièce traverse. Aucune condition de bonus ne peut donc demander plus de
// lignes (ou de colonnes) d'un coup que ces deux maximums, tirés du catalogue.
export const LIGNES_MAX_PAR_COUP = Math.max(...CATALOGUE.map((p) => p.hauteur))
export const COLONNES_MAX_PAR_COUP = Math.max(...CATALOGUE.map((p) => p.largeur))

function cle(cases) {
  return cases.map((c) => `${c.ligne},${c.col}`).join(' ')
}

function orientations({ forme, difficulte, motif }) {
  let cases = normaliser(motif.flatMap((rangee, ligne) =>
    [...rangee].flatMap((c, col) => (c === '.' ? [] : [{ ligne, col }]))))
  const vues = new Set()
  const pieces = []
  while (!vues.has(cle(cases))) {
    vues.add(cle(cases))
    const hauteur = Math.max(...cases.map((c) => c.ligne)) + 1
    const largeur = Math.max(...cases.map((c) => c.col)) + 1
    pieces.push(Object.freeze({
      id: `${forme}.${pieces.length}`,
      forme,
      rang: pieces.length,
      difficulte,
      cases: Object.freeze(cases.map(Object.freeze)),
      hauteur,
      largeur,
    }))
    // Quart de tour horaire : la ligne devient la colonne, comptée depuis la droite.
    cases = normaliser(cases.map((c) => ({ ligne: c.col, col: hauteur - 1 - c.ligne })))
  }
  return pieces
}

// Ramène les cases contre le coin haut gauche, triées ligne par ligne.
function normaliser(cases) {
  const l0 = Math.min(...cases.map((c) => c.ligne))
  const c0 = Math.min(...cases.map((c) => c.col))
  return cases
    .map((c) => ({ ligne: c.ligne - l0, col: c.col - c0 }))
    .sort((a, b) => a.ligne - b.ligne || a.col - b.col)
}

