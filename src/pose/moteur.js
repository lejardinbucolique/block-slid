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
// Bonus (BS42, bonus.js) : la réserve est au joueur, pas à la partie. Elle entre par
// nouvellePartie({ reserve }) et se lit dans etat.reserve. Quatre effets, chacun rend
// un nouvel état ou null (refusé : rien ne change, le bonus n'est pas consommé) :
// supprimerPiece, tournerPiece, changerPieces, annulerCoup. gagnerBonus ajoute un bonus
// à la réserve (les conditions de gain sont de BS43).
//
// Fin de partie : bloquee(etat) dit seulement qu'aucune pièce en main ne tient nulle
// part, et piecesJouables(etat) lesquelles tiennent. La partie n'est perdue
// (perdue(etat)) que si, en plus, aucun bonus de la réserve ne peut changer cela.

import { REGLAGES } from './reglages.js'
import { piece, pieceSuivante } from './pieces.js'
import { NIVEAU_PAR_DEFAUT, niveauValide } from './niveaux.js'
import { SORTES, reserveVide, ajouterBonus, retirerBonus, lireReserve } from './bonus.js'

// Le niveau est un réglage de la partie : un niveau illisible retombe sur le niveau 1.
// La réserve de bonus est celle du joueur (sans réserve donnée, la partie commence à
// vide : le moteur n'en crée jamais) ; une réserve illisible est une erreur de l'appelant.
export function nouvellePartie({ graine = Date.now(), niveau = NIVEAU_PAR_DEFAUT, reserve = reserveVide(), reglages = REGLAGES } = {}) {
  const lue = lireReserve(reserve)
  if (!lue) throw new TypeError(`réserve de bonus illisible : ${JSON.stringify(reserve)}`)
  const etat = etatVide(reglages, graine, niveau)
  etat.reserve = lue
  etat.enCours = tirer(etat, reglages.piecesParTour)
  etat.suivantes = tirer(etat, reglages.piecesParTour)
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
    // La réserve de bonus du joueur.
    reserve: reserveVide(),
    // L'état d'avant la dernière pose, pour annulerCoup ; null s'il n'y a rien à annuler.
    annulation: null,
    dernierCoup: null,
    // Le dernier bonus employé, pour l'affichage ; remis à null par la pose suivante.
    dernierBonus: null,
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
  e.annulation = instantane(etat)
  e.dernierBonus = null

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
  const nouveauTour = finDeTour(e)

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
    perdue: perdue(e),
  }
  return e
}

// Quand les trois pièces sont posées ou retirées, l'aperçu passe en main et un nouvel
// aperçu est tiré. Rend vrai si un nouveau tour commence.
function finDeTour(e) {
  if (!e.enCours.every((x) => x === null)) return false
  e.enCours = e.suivantes
  e.suivantes = tirer(e, e.reglages.piecesParTour)
  e.tours += 1
  return true
}

// Ce qu'annulerCoup rend : l'état d'une partie hors réserve et niveau, en données simples.
function instantane(etat) {
  return {
    grille: etat.grille.map((r) => [...r]),
    enCours: etat.enCours.map((x) => x && { ...x }),
    suivantes: etat.suivantes.map((x) => ({ ...x })),
    score: etat.score,
    coups: etat.coups,
    tours: etat.tours,
    serie: etat.serie,
    hasard: etat.hasard,
  }
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

// --- Bonus -----------------------------------------------------------------

// Un bonus est employé quand on veut ; chaque effet est refusé (null, rien ne change,
// aucun bonus consommé) s'il n'y en a plus de cette sorte ou s'il ne peut rien faire.

// Ajoute `n` bonus de cette sorte à la réserve (plafonnée : le surplus est perdu).
// Rend un nouvel état ; le même si la sorte est inconnue.
export function gagnerBonus(etat, sorte, n = 1) {
  const reserve = ajouterBonus(etat.reserve, sorte, n)
  return reserve === etat.reserve ? etat : { ...etat, reserve }
}

// Le bonus de cette sorte est-il employable maintenant (en réserve, et son effet
// possible) ? `index` est la place de la pièce visée, pour supprimer et tourner.
export function peutUtiliser(etat, sorte, index) {
  if (!(etat.reserve[sorte] > 0)) return false
  const enMain = etat.enCours[index]
  switch (sorte) {
    case 'supprimer': return Boolean(enMain)
    case 'tourner': return Boolean(enMain) && pieceSuivante(enMain.id) !== enMain.id
    case 'changer': return true
    case 'annuler': return etat.annulation !== null
    default: return false
  }
}

// Début d'un effet : copie de l'état, un bonus de moins, plus rien à annuler (sauf
// pour l'annulation elle-même, qui lit l'ancien état), ni coup à rejouer à l'écran.
function employer(etat, sorte, index) {
  if (!peutUtiliser(etat, sorte, index)) return null
  const e = cloner(etat)
  e.reserve = retirerBonus(etat.reserve, sorte)
  e.annulation = null
  e.dernierCoup = null
  return e
}

// Supprimer : la pièce en main à la place `index` disparaît, le tour continue avec les
// autres ; il finit quand les trois sont posées ou retirées.
export function supprimerPiece(etat, index) {
  const e = employer(etat, 'supprimer', index)
  if (!e) return null
  const retiree = e.enCours[index].id
  e.enCours[index] = null
  const nouveauTour = finDeTour(e)
  e.dernierBonus = { sorte: 'supprimer', index, piece: retiree, nouveauTour }
  return e
}

// Tourner : la pièce passe à son orientation suivante (voir pieceSuivante). Refusé pour
// une pièce qui n'a qu'une orientation.
export function tournerPiece(etat, index) {
  const e = employer(etat, 'tourner', index)
  if (!e) return null
  const avant = e.enCours[index]
  e.enCours[index] = { ...avant, id: pieceSuivante(avant.id) }
  e.dernierBonus = { sorte: 'tourner', index, avant: avant.id, apres: e.enCours[index].id }
  return e
}

// Changer : les pièces restantes du tour sont retirées et remplacées, aux mêmes places
// et en même nombre, par un tirage neuf ; l'aperçu est tiré de nouveau avec elles. Le
// tirage garanti s'applique comme au début d'une partie : les pièces neuves se posent,
// puis celles de l'aperçu. Retirer aussi l'aperçu est la manière la plus simple de
// tenir la garantie, et l'aperçu montré reste la vérité.
export function changerPieces(etat) {
  const e = employer(etat, 'changer')
  if (!e) return null
  const anciennes = e.enCours.map((x) => x && x.id)
  const places = e.enCours.flatMap((x, i) => (x ? [i] : []))
  e.enCours = e.enCours.map(() => null)
  const neuves = tirer(e, places.length)
  places.forEach((place, i) => { e.enCours[place] = neuves[i] })
  e.suivantes = tirer(e, e.reglages.piecesParTour)
  e.dernierBonus = { sorte: 'changer', anciennes, neuves: e.enCours.map((x) => x && x.id) }
  return e
}

// Annuler : rend l'état exact d'avant la dernière pose (grille, score, série, pièces du
// tour, aperçu, compteurs, état du hasard : la suite reste cohérente). Un seul coup en
// arrière, jamais deux de suite ; le bonus consommé n'est pas rendu. Refusé s'il n'y a
// pas de coup à annuler : début de partie, coup déjà annulé, ou bonus de supprimer,
// tourner ou changer employé depuis la pose (il a touché aux pièces que l'état d'avant
// contient, et le rendre gaspillerait ce bonus).
export function annulerCoup(etat) {
  const e = employer(etat, 'annuler')
  if (!e) return null
  const avant = etat.annulation
  e.grille = avant.grille.map((r) => [...r])
  e.enCours = avant.enCours.map((x) => x && { ...x })
  e.suivantes = avant.suivantes.map((x) => ({ ...x }))
  e.score = avant.score
  e.coups = avant.coups
  e.tours = avant.tours
  e.serie = avant.serie
  e.hasard = avant.hasard
  e.dernierBonus = { sorte: 'annuler' }
  return e
}

// Les sortes de bonus de la réserve qui peuvent changer une partie bloquée : supprimer
// et changer s'il y en a un ; annuler s'il y a un coup à annuler ; tourner si l'une des
// pièces en main se pose dans une orientation que la réserve de « tourner » permet
// d'atteindre (un bonus par quart de tour).
export function bonusUtiles(etat) {
  return SORTES.filter((sorte) => (sorte === 'tourner' ? tournerUtile(etat) : peutUtiliser(etat, sorte, etat.enCours.findIndex(Boolean))))
}

function tournerUtile(etat) {
  return etat.enCours.some((x) => {
    if (!x) return false
    let id = x.id
    for (let i = 0; i < etat.reserve.tourner; i++) {
      id = pieceSuivante(id)
      if (id === x.id) return false
      if (positionsDe(etat, id, 1).length > 0) return true
    }
    return false
  })
}

// La partie est perdue quand aucune pièce restante ne se pose et qu'aucun bonus de la
// réserve ne peut changer cela. Tant qu'il en existe un, la partie continue : le joueur
// doit l'utiliser (un « supprimer » compte même s'il y a plus de pièces bloquées que de
// bonus : il faut aller au bout).
export const perdue = (etat) => bloquee(etat) && bonusUtiles(etat).length === 0

// --- Garder une partie ----------------------------------------------------

// Change quand la forme des données gardées change : une partie gardée avec un
// autre numéro n'est plus relue.
// 2 (BS42) : la réserve de bonus et l'instantané d'annulation s'ajoutent à la partie.
export const SCHEMA_PARTIE = 2

// L'état d'une partie en données simples (JSON), sans `reglages` (il contient une
// fonction), `dernierCoup` ni `dernierBonus` (utiles au seul affichage du dernier geste).
// La réserve y figure : c'est celle du joueur, que l'interface garde aussi à part pour
// la partie suivante ; l'instantané d'annulation aussi, pour qu'on puisse annuler après
// avoir relancé l'appli.
export function exporterPartie(etat) {
  return {
    schema: SCHEMA_PARTIE,
    niveau: etat.niveau,
    ...figerInstantane(etat),
    reserve: { ...etat.reserve },
    annulation: etat.annulation && figerInstantane(etat.annulation),
  }
}

// Les données qu'un instantané et une partie ont en commun : tout, hors niveau et réserve.
function figerInstantane(x) {
  const figer = (p) => p && { id: p.id, couleur: p.couleur }
  return {
    grille: x.grille.map((r) => [...r]),
    enCours: x.enCours.map(figer),
    suivantes: x.suivantes.map(figer),
    score: x.score,
    coups: x.coups,
    tours: x.tours,
    serie: x.serie,
    hasard: x.hasard,
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
  if (!niveauValide(d.niveau)) return null
  const reserve = lireReserve(d.reserve)
  const photo = lireInstantane(d, reglages)
  if (!reserve || !photo) return null
  // Rien à annuler (null), ou l'état d'avant la dernière pose, lu avec les mêmes règles.
  const annulation = d.annulation === null ? null : lireInstantane(d.annulation, reglages)
  if (d.annulation !== null && !annulation) return null

  return { ...etatVide(reglages, photo.hasard, d.niveau), ...photo, reserve, annulation }
}

// Les données communes à une partie et à son instantané d'annulation, relues et
// vérifiées : un objet { grille, enCours, suivantes, score, coups, tours, serie,
// hasard }, ou null si elles sont de forme invalide.
function lireInstantane(d, reglages) {
  if (!d || typeof d !== 'object') return null
  const entier = (n, min, max = Number.MAX_SAFE_INTEGER) => Number.isInteger(n) && n >= min && n <= max
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

  return {
    grille: d.grille.map((r) => [...r]),
    enCours,
    suivantes,
    score: d.score,
    coups: d.coups,
    tours: d.tours,
    serie: d.serie,
    hasard: d.hasard,
  }
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
export function depuisTexte({ rangees = [], enCours, suivantes, niveau = NIVEAU_PAR_DEFAUT, graine = 1, reserve = reserveVide(), reglages = REGLAGES }) {
  const e = etatVide(reglages, graine, niveau)
  e.reserve = { ...reserve }
  rangees.forEach((r, l) => {
    if (r.length !== reglages.colonnes) throw new RangeError(`rangée ${l} de ${r.length} cases au lieu de ${reglages.colonnes}`)
    e.grille[l] = [...r].map((c) => (c === '.' ? null : c))
  })
  const enMain = (id) => {
    if (id === null) return null
    if (!piece(id)) throw new RangeError(`pièce inconnue : ${id}`)
    return { id, couleur: reglages.couleurPiece }
  }
  e.enCours = enCours ? enCours.map(enMain) : tirer(e, reglages.piecesParTour)
  e.suivantes = suivantes ? suivantes.map(enMain) : tirer(e, reglages.piecesParTour)
  return e
}

// --- Interne ----------------------------------------------------------------

// `nombre` pièces, par le tirage des réglages (remplaçable, voir tirage.js) : trois pour
// un tour, moins pour remplacer les pièces restantes d'un tour (changerPieces).
function tirer(etat, nombre) {
  const { reglages } = etat
  const ids = reglages.tirage({
    aleatoire: () => aleatoire(etat),
    niveau: etat.niveau,
    nombre,
    grille: etat.grille.map((r) => [...r]),
    enCours: etat.enCours.filter(Boolean).map((x) => x.id),
    reglages,
  })
  if (!Array.isArray(ids) || ids.length !== nombre || !ids.every((id) => piece(id))) {
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
    reserve: { ...etat.reserve },
  }
}
