// Les couleurs des pièces de block-pose (BS44), cadrées en BS38 : une seule table, ici.
//
// Vingt couleurs, toutes disponibles dès le départ (rien ne s'y débloque), choisies pour
// rester bien distinctes entre elles, lisibles sous une texture (ni trop pâles, ni noyées
// dans un style) et sur un fond rose tricot (BS46) : aucun rose pâle ni crème dans la
// palette. À ajuster après essai sur le téléphone : on ne change que cette table, le
// reste du jeu ne lit que des identifiants.
//
// La liste de choix a vingt-deux entrées : les vingt couleurs unies (toute la pièce de la
// même couleur) et deux entrées spéciales, « une couleur par pièce » et « couleurs
// mélangées dans la pièce ». Une partie commence par la première entrée. Chaque grille
// entièrement vidée passe à l'entrée suivante : dans l'ordre de la liste la première fois
// (tout le tour), puis au hasard, jamais deux fois la même d'affilée.
//
// Ce module ne connaît ni le moteur ni l'écran. Son hasard est à part de celui de la
// partie : le moteur lui donne une suite à lui (etat.hasardCouleurs), de sorte que les
// pièces tirées ne dépendent jamais de l'avancement des couleurs.

// Un fond rose tricot de référence, pour juger de la lisibilité (test) ; BS46 fixera le vrai.
export const FOND_ROSE_REFERENCE = '#f4b8c8'

// La palette : `id` est ce que porte une pièce et ce qui reste dans la grille, `valeur`
// la couleur à l'écran. Ordre = ordre des entrées unies de la liste, choisi pour que deux
// grilles vidées de suite changent franchement de teinte.
export const PALETTE = Object.freeze([
  { id: 'bleu', nom: 'Bleu', valeur: '#2a6fdb' },
  { id: 'orange', nom: 'Orange', valeur: '#f57c00' },
  { id: 'vert', nom: 'Vert', valeur: '#3aa655' },
  { id: 'violet', nom: 'Violet', valeur: '#9b44c8' },
  { id: 'jaune', nom: 'Jaune', valeur: '#f4c20d' },
  { id: 'turquoise', nom: 'Turquoise', valeur: '#0aa5a8' },
  { id: 'rouge', nom: 'Rouge', valeur: '#d62839' },
  { id: 'citron', nom: 'Citron vert', valeur: '#a6d21f' },
  { id: 'marine', nom: 'Bleu marine', valeur: '#1c2f73' },
  { id: 'framboise', nom: 'Framboise', valeur: '#d81b86' },
  { id: 'menthe', nom: 'Menthe', valeur: '#4fd8a4' },
  { id: 'marron', nom: 'Marron', valeur: '#6e4a2e' },
  { id: 'ciel', nom: 'Bleu ciel', valeur: '#38bdf2' },
  { id: 'brique', nom: 'Brique', valeur: '#b4532a' },
  { id: 'indigo', nom: 'Indigo', valeur: '#5a49c9' },
  { id: 'sapin', nom: 'Vert sapin', valeur: '#1b6b4a' },
  { id: 'bordeaux', nom: 'Bordeaux', valeur: '#7d1524' },
  { id: 'ardoise', nom: 'Ardoise', valeur: '#607080' },
  { id: 'prune', nom: 'Prune', valeur: '#63235f' },
  { id: 'anthracite', nom: 'Anthracite', valeur: '#2c2c34' },
].map(Object.freeze))

// Les trois façons de colorer une pièce.
export const MODE_UNIE = 'unie'
export const MODE_PAR_PIECE = 'par-piece'
export const MODE_MELANGEE = 'melangee'

const ENTREE_PAR_PIECE = Object.freeze({ id: 'par-piece', nom: 'Une couleur par pièce', mode: MODE_PAR_PIECE })
const ENTREE_MELANGEE = Object.freeze({ id: 'melangee', nom: 'Couleurs mélangées dans la pièce', mode: MODE_MELANGEE })

const unie = (c) => Object.freeze({ id: c.id, nom: c.nom, mode: MODE_UNIE, couleur: c.id })

// La liste de choix, dans l'ordre : les couleurs unies de la palette, avec les deux entrées
// spéciales intercalées assez tôt pour qu'on les rencontre pendant le premier tour
// (la cinquième entrée et la onzième).
export const LISTE = Object.freeze([
  ...PALETTE.slice(0, 4).map(unie),
  ENTREE_PAR_PIECE,
  ...PALETTE.slice(4, 9).map(unie),
  ENTREE_MELANGEE,
  ...PALETTE.slice(9).map(unie),
])

// L'état des couleurs d'une partie : l'entrée en cours (son rang dans LISTE) et combien
// de grilles vidées on a déjà passées. Tant que `avances` est sous la taille de la liste,
// on en est au premier tour : l'entrée est alors son rang.
export const couleursDepart = () => ({ entree: 0, avances: 0 })

export const entreeDe = (etat) => LISTE[etat.entree]

// Un état de couleurs lu de données gardées : { entree, avances }, ou null s'il est abîmé
// ou incohérent (au premier tour, l'entrée doit être son rang).
export function lireCouleurs(d) {
  if (!d || typeof d !== 'object') return null
  const { entree, avances } = d
  if (!Number.isInteger(entree) || entree < 0 || entree >= LISTE.length) return null
  if (!Number.isInteger(avances) || avances < 0 || avances > Number.MAX_SAFE_INTEGER) return null
  if (avances < LISTE.length && entree !== avances) return null
  return { entree, avances }
}

// L'état après une grille entièrement vidée : l'entrée suivante de la liste la première
// fois, puis une entrée au hasard, jamais la même qu'avant. `aleatoire` rend un nombre de
// [0, 1[ : il n'est appelé que pour tirer au hasard, jamais pendant le premier tour.
export function couleursSuivantes(etat, aleatoire) {
  const avances = etat.avances + 1
  if (avances < LISTE.length) return { entree: avances, avances }
  const autres = LISTE.length - 1
  const r = aleatoire()
  const i = Math.min(autres - 1, Math.max(0, Math.floor(Number.isFinite(r) ? r * autres : 0)))
  // Le i-ième rang de la liste en sautant l'entrée en cours.
  return { entree: i >= etat.entree ? i + 1 : i, avances }
}

// Les couleurs de `nombre` pièces tirées d'un coup, selon l'entrée en cours : pour chaque
// pièce { couleur } et, en mode mélangé, { couleur, couleurs } où `couleurs` donne une
// couleur par case, dans l'ordre des cases de la pièce (`casesParPiece[i]` : leur nombre
// pour la pièce i). Unie : toutes de la même. Une couleur par pièce : toutes différentes
// entre elles tant que la palette le permet. Mélangée : deux cases voisines dans l'ordre
// des cases ne partagent jamais leur couleur, de sorte qu'une pièce de plusieurs cases
// en a toujours au moins deux.
export function couleursDePieces(etat, casesParPiece, aleatoire) {
  const entree = entreeDe(etat)
  const hasard = (n) => Math.min(n - 1, Math.floor(aleatoire() * n))
  if (entree.mode === MODE_UNIE) return casesParPiece.map(() => ({ couleur: entree.couleur }))
  if (entree.mode === MODE_PAR_PIECE) {
    let reste = PALETTE.map((c) => c.id)
    return casesParPiece.map(() => {
      if (reste.length === 0) reste = PALETTE.map((c) => c.id)
      const [id] = reste.splice(hasard(reste.length), 1)
      return { couleur: id }
    })
  }
  return casesParPiece.map((nb) => {
    const couleurs = []
    for (let i = 0; i < nb; i++) {
      const choix = PALETTE.filter((c) => c.id !== couleurs[i - 1])
      couleurs.push(choix[hasard(choix.length)].id)
    }
    return { couleur: couleurs[0], couleurs }
  })
}
