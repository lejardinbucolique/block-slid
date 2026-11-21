// Moteur de block-pose (BS40) : les règles du deuxième jeu, sans écran ni navigateur.
//
// L'état est un objet simple, jamais modifié en place : poser rend un nouvel état,
// ou null si la pose est refusée (l'ancien état reste alors valable).
//
// Grille de reglages.lignes × reglages.colonnes : lignes de haut (0) en bas,
// colonnes de gauche (0) à droite. Une case vaut null (vide) ou la couleur de la
// pièce posée là, simple valeur transmise par la pièce (les modes de couleur
// viendront en BS44). Aucune gravité.
//
// Un tour : trois pièces en main (enCours ; une place passe à null quand sa pièce
// est posée) et l'aperçu des trois du tour suivant (suivantes). Une pièce en main :
// { id, couleur }, l'id étant celui du catalogue (pieces.js). Quand les trois sont
// posées, l'aperçu passe en main et un nouvel aperçu est tiré par reglages.tirage.
//
// Un coup rend, dans dernierCoup, de quoi animer et compter : cases posées, lignes
// et colonnes effacées, cases disparues, points, grille vidée, rang dans la série.
//
// Le moteur ne conclut pas la défaite : bloquee(etat) dit seulement qu'aucune pièce
// en main ne tient nulle part, et piecesJouables(etat) lesquelles tiennent. Le bonus
// qui peut sauver la partie est de BS42, qui décidera.

import { REGLAGES } from './reglages.js'
import { piece } from './pieces.js'
import { NIVEAU_PAR_DEFAUT, niveauValide } from './niveaux.js'

// Le niveau est un réglage de la partie : un niveau illisible retombe sur le niveau 1.
export function nouvellePartie({ graine = Date.now(), niveau = NIVEAU_PAR_DEFAUT, reglages = REGLAGES } = {}) {
  const etat = etatVide(reglages, graine, niveau)
  etat.enCours = tirer(etat)
  etat.suivantes = tirer(etat)
  return etat
}

function etatVide(reglages, graine, niveau) {
  return {
    reglages,
    niveau: niveauValide(niveau) ? niveau : NIVEAU_PAR_DEFAUT,
    grille: Array.from({ length: reglages.lignes }, () => Array(reglages.colonnes).fill(null)),
    enCours: [],
    suivantes: [],
    score: 0,
    // Pièces posées, et tours commencés depuis le premier (0 au premier tour).
    coups: 0,
    tours: 0,
    // Rang dans la série : combien de coups de suite ont effacé quelque chose.
    serie: 0,
    hasard: graine >>> 0,
    dernierCoup: null,
  }
}

// --- Jouer ----------------------------------------------------------------

// Pose la pièce en main à la place `index`, son coin haut gauche en (ligne, col).
// Refusée (null) si la place est vide, si la pièce sort de la grille ou recouvre
// une case occupée.
export function poser(etat, index, ligne, col) {
  const enMain = etat.enCours[index]
  if (!enMain || !tient(etat, enMain.id, ligne, col)) return null
  const p = piece(enMain.id)
  const { reglages } = etat
  const e = cloner(etat)

  const casesPosees = p.cases.map((c) => ({ ligne: ligne + c.ligne, col: col + c.col }))
  for (const c of casesPosees) e.grille[c.ligne][c.col] = enMain.couleur

  // Lignes et colonnes pleines, effacées toutes en même temps : une case à leur
  // croisement ne disparaît qu'une fois.
  const lignes = rangs(reglages.lignes).filter((l) => e.grille[l].every((v) => v !== null))
  const colonnes = rangs(reglages.colonnes).filter((k) => e.grille.every((r) => r[k] !== null))
  const casesDisparues = []
  for (let l = 0; l < reglages.lignes; l++) {
    for (let k = 0; k < reglages.colonnes; k++) {
      if (lignes.includes(l) || colonnes.includes(k)) casesDisparues.push({ ligne: l, col: k, couleur: e.grille[l][k] })
    }
  }
  for (const c of casesDisparues) e.grille[c.ligne][c.col] = null

  const effaces = lignes.length + colonnes.length
  e.serie = effaces > 0 ? etat.serie + 1 : 0
  const multiplicateur = effaces > 0 ? Math.min(e.serie, reglages.plafondSerie) : 1
  const points = multiplicateur *
    (casesPosees.length * reglages.pointsParCase + casesDisparues.length * reglages.pointsParCaseEffacee * effaces)
  e.score += points
  e.coups += 1

  e.enCours[index] = null
  const nouveauTour = e.enCours.every((x) => x === null)
  if (nouveauTour) {
    e.enCours = e.suivantes
    e.suivantes = tirer(e)
    e.tours += 1
  }

  e.dernierCoup = {
    index,
    piece: enMain.id,
    ligne,
    col,
    casesPosees,
    lignes,
    colonnes,
    casesDisparues,
    points,
    multiplicateur,
    serie: e.serie,
    grilleVidee: e.grille.every((r) => r.every((v) => v === null)),
    nouveauTour,
    bloquee: bloquee(e),
  }
  return e
}

// La pièce en main à la place `index` peut-elle se poser en (ligne, col) ?
export function peutPoser(etat, index, ligne, col) {
  const enMain = etat.enCours[index]
  return Boolean(enMain) && tient(etat, enMain.id, ligne, col)
}

// Toutes les places { ligne, col } où la pièce en main à `index` peut se poser.
export function positionsPossibles(etat, index) {
  const enMain = etat.enCours[index]
  if (!enMain) return []
  return positionsDe(etat, enMain.id)
}

// Les places (index) des pièces en main qui tiennent quelque part.
export function piecesJouables(etat) {
  return etat.enCours.flatMap((x, i) => (x && positionsDe(etat, x.id, 1).length > 0 ? [i] : []))
}

// Aucune pièce en main ne tient nulle part.
export const bloquee = (etat) => piecesJouables(etat).length === 0

// Où une pièce du catalogue tiendrait sur la grille de l'état ; au plus `max` places.
function positionsDe(etat, id, max = Infinity) {
  const p = piece(id)
  const places = []
  for (let l = 0; l + p.hauteur <= etat.reglages.lignes; l++) {
    for (let k = 0; k + p.largeur <= etat.reglages.colonnes; k++) {
      if (tient(etat, id, l, k)) places.push({ ligne: l, col: k })
      if (places.length >= max) return places
    }
  }
  return places
}

function tient(etat, id, ligne, col) {
  const p = piece(id)
  if (!p || !Number.isInteger(ligne) || !Number.isInteger(col)) return false
  if (ligne < 0 || col < 0 || ligne + p.hauteur > etat.reglages.lignes || col + p.largeur > etat.reglages.colonnes) return false
  return p.cases.every((c) => etat.grille[ligne + c.ligne][col + c.col] === null)
}

// --- Garder une partie ----------------------------------------------------

// Change quand la forme des données gardées change : une partie gardée avec un
// autre numéro n'est plus relue.
export const SCHEMA_PARTIE = 1

// L'état d'une partie en données simples (JSON), sans `reglages` (il contient une
// fonction) ni `dernierCoup` (utile au seul affichage du coup qui vient d'être joué).
export function exporterPartie(etat) {
  const figer = (x) => x && { id: x.id, couleur: x.couleur }
  return {
    schema: SCHEMA_PARTIE,
    niveau: etat.niveau,
    grille: etat.grille.map((r) => [...r]),
    enCours: etat.enCours.map(figer),
    suivantes: etat.suivantes.map(figer),
    score: etat.score,
    coups: etat.coups,
    tours: etat.tours,
    serie: etat.serie,
    hasard: etat.hasard,
  }
}

// Reconstruit un état jouable depuis des données exportées, ou null si elles sont
// d'une autre version, de forme invalide ou incohérentes.
export function importerPartie(donnees, reglages = REGLAGES) {
  try {
    return lirePartie(donnees, reglages)
  } catch {
    return null
  }
}

function lirePartie(d, reglages) {
  if (!d || typeof d !== 'object' || d.schema !== SCHEMA_PARTIE) return null
  const entier = (n, min, max = Number.MAX_SAFE_INTEGER) => Number.isInteger(n) && n >= min && n <= max
  if (!niveauValide(d.niveau)) return null
  if (!entier(d.score, 0) || !entier(d.coups, 0) || !entier(d.tours, 0) || !entier(d.serie, 0) || !entier(d.hasard, 0, 0xffffffff)) return null

  const couleur = (v) => typeof v === 'string' && v.length > 0
  const { lignes, colonnes, piecesParTour } = reglages
  if (!Array.isArray(d.grille) || d.grille.length !== lignes) return null
  if (!d.grille.every((r) => Array.isArray(r) && r.length === colonnes && r.every((v) => v === null || couleur(v)))) return null

  const lirePiece = (x) => (x && typeof x === 'object' && piece(x.id) && couleur(x.couleur) ? { id: x.id, couleur: x.couleur } : undefined)
  if (!Array.isArray(d.enCours) || d.enCours.length !== piecesParTour) return null
  if (!Array.isArray(d.suivantes) || d.suivantes.length !== piecesParTour) return null
  const enCours = d.enCours.map((x) => (x === null ? null : lirePiece(x)))
  const suivantes = d.suivantes.map(lirePiece)
  if (enCours.includes(undefined) || suivantes.includes(undefined)) return null
  // Un tour dont les trois pièces sont posées a déjà laissé place au suivant.
  if (enCours.every((x) => x === null)) return null

  const e = etatVide(reglages, d.hasard, d.niveau)
  e.grille = d.grille.map((r) => [...r])
  e.enCours = enCours
  e.suivantes = suivantes
  e.score = d.score
  e.coups = d.coups
  e.tours = d.tours
  e.serie = d.serie
  return e
}

// --- Pour les essais --------------------------------------------------------

// La grille en texte, une chaîne par ligne : '.' vide ; sinon la couleur si elle
// tient en un caractère, '#' autrement.
export function versTexte(etat) {
  return etat.grille.map((r) => r.map((v) => (v === null ? '.' : v.length === 1 ? v : '#')).join(''))
}

// Un état depuis un dessin de la grille (la rangée i est la ligne i, les rangées
// absentes sont vides ; tout caractère autre que '.' est une case de cette couleur)
// et des pièces données par leur id (null : déjà posée). Sans pièces données, elles
// sont tirées comme en partie.
export function depuisTexte({ rangees = [], enCours, suivantes, niveau = NIVEAU_PAR_DEFAUT, graine = 1, reglages = REGLAGES }) {
  const e = etatVide(reglages, graine, niveau)
  rangees.forEach((r, l) => {
    if (r.length !== reglages.colonnes) throw new RangeError(`rangée ${l} de ${r.length} cases au lieu de ${reglages.colonnes}`)
    e.grille[l] = [...r].map((c) => (c === '.' ? null : c))
  })
  const enMain = (id) => {
    if (id === null) return null
    if (!piece(id)) throw new RangeError(`pièce inconnue : ${id}`)
    return { id, couleur: reglages.couleurPiece }
  }
  e.enCours = enCours ? enCours.map(enMain) : tirer(e)
  e.suivantes = suivantes ? suivantes.map(enMain) : tirer(e)
  return e
}

// --- Interne ----------------------------------------------------------------

// Les pièces d'un tour, par le tirage des réglages (remplaçable, voir tirage.js).
function tirer(etat) {
  const { reglages } = etat
  const ids = reglages.tirage({
    aleatoire: () => aleatoire(etat),
    niveau: etat.niveau,
    nombre: reglages.piecesParTour,
    grille: etat.grille.map((r) => [...r]),
    enCours: etat.enCours.filter(Boolean).map((x) => x.id),
    reglages,
  })
  if (!Array.isArray(ids) || ids.length !== reglages.piecesParTour || !ids.every((id) => piece(id))) {
    throw new Error(`tirage invalide : ${JSON.stringify(ids)}`)
  }
  return ids.map((id) => ({ id, couleur: reglages.couleurPiece }))
}

const rangs = (n) => Array.from({ length: n }, (_, i) => i)

// Générateur reproductible (mulberry32) : sa graine vit dans l'état, qui reste
// ainsi un objet simple qu'on peut enregistrer et rejouer.
function aleatoire(etat) {
  let t = (etat.hasard = (etat.hasard + 0x6d2b79f5) >>> 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function cloner(etat) {
  return {
    ...etat,
    grille: etat.grille.map((r) => [...r]),
    enCours: etat.enCours.map((x) => x && { ...x }),
    suivantes: etat.suivantes.map((x) => ({ ...x })),
  }
}
