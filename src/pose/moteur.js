// Moteur de block-pose (BS40) : les règles du deuxième jeu, sans écran ni navigateur.
//
// L'état est un objet simple, jamais modifié en place : poser rend un nouvel état,
// ou null si la pose est refusée (l'ancien état reste alors valable).
//
// Grille de reglages.lignes × reglages.colonnes : lignes de haut (0) en bas,
// colonnes de gauche (0) à droite. Une case vaut null (vide) ou la couleur de la
// pièce posée là, simple valeur transmise par la pièce (un identifiant de la palette,
// couleurs.js). Aucune gravité.
//
// Un tour : trois pièces en main (enCours ; une place passe à null quand sa pièce
// est posée) et l'aperçu des trois du tour suivant (suivantes). Une pièce en main :
// { id, couleur }, l'id étant celui du catalogue (pieces.js) ; une pièce aux couleurs
// mélangées porte en plus couleurs, une couleur par case dans l'ordre des cases de la pièce
// (sa couleur est alors la première). Quand les trois sont
// posées, l'aperçu passe en main et un nouvel aperçu est tiré par reglages.tirage.
//
// La future main se joue aussi aux niveaux 1 et 2 (BS58, niveaux.js : NIVEAU_APERCU_JOUABLE) : une
// pièce se désigne alors par sa place `index`, de 0 à 2 pour la main, de 3 à 5 pour l'aperçu
// (pieceA, indicesEnJeu). Une pièce posée, ou retirée, de l'aperçu y laisse une place à null. Quand
// la main est finie, l'aperçu passe en main tel qu'il est, ses places vides comprises : la main
// compte alors moins de trois pièces, et celles déjà posées ne reviennent pas. Si les trois de
// l'aperçu étaient déjà posées, la main est un tirage neuf sur la grille réelle. Le niveau décide à
// chaque appel : le changer fait jouer l'aperçu, ou non, tout de suite, sans toucher aux pièces.
//
// Un coup rend, dans dernierCoup, de quoi animer et compter : cases posées, lignes
// et colonnes effacées, cases disparues, points, grille vidée, rang dans la série.
//
// Bonus (BS42, bonus.js) : la réserve est au joueur, pas à la partie. Elle entre par
// nouvellePartie({ reserve }) et se lit dans etat.reserve. Quatre effets, chacun rend
// un nouvel état ou null (refusé : rien ne change, le bonus n'est pas consommé) :
// supprimerPiece, tournerPiece, changerPieces, annulerCoup. gagnerBonus ajoute un bonus
// à la réserve ; les conditions qui en gagnent sont ci-dessous (BS43).
//
// Gains (BS43, gains.js) : chaque pose peut rapporter des bonus, rangés dans
// dernierCoup.gains [{ cause, sorte, ajoute }] et ajoutés à la réserve (plafonnée). Cinq
// causes sont mesurées au coup ou à l'état (lignes, croisement, grilleVidee, defi, palier),
// la sixième est la case surprise : portée par une case d'une pièce du tirage (pièce.surprise
// = { ligne, col } dans la pièce), elle prend sa place sur la grille (etat.surprise = { ligne,
// col, reste }) quand la pièce est posée, son compte à rebours baisse à chaque pose suivante.
// Une grille vidée donne un gain « au choix » : etat.choix compte les choix en attente,
// choisirBonus(etat, sorte) en consomme un. Le défi (etat.defi), le prochain palier
// (etat.palier) et la surprise font partie de la partie exportée. Leur hasard (la sorte d'une
// surprise gagnée, la pièce qui la porte) a sa propre suite, etat.hasardGains, à part de celle
// du tirage : ajouter les gains n'a pas changé un seul tirage.
//
// Couleurs (BS44, couleurs.js) : la couleur d'une pièce est fixée à son tirage, selon l'entrée
// en cours de la liste de choix (etat.couleurs = { entree, avances }). Chaque grille
// vidée passe à l'entrée suivante, et les pièces visibles (main et aperçu) la prennent
// aussitôt (BS60). Le hasard des couleurs (l'entrée tirée après le premier
// tour, la couleur de chaque pièce ou de chaque case) a sa propre suite, etat.hasardCouleurs :
// les pièces tirées ne dépendent jamais de l'avancement des couleurs.
//
// Fin de partie : bloquee(etat) dit seulement qu'aucune pièce en main ne tient nulle
// part, et piecesJouables(etat) lesquelles tiennent. La partie n'est perdue
// (perdue(etat)) que si, en plus, aucun bonus de la réserve ne peut changer cela.

import { REGLAGES } from './reglages.js'
import { piece, pieceSuivante } from './pieces.js'
import { NIVEAU_PAR_DEFAUT, NIVEAU_DIFFICILE, NIVEAU_APERCU_JOUABLE, niveauValide, aideDuNiveau, poidsDesPieces } from './niveaux.js'
import { SORTES, sorteValide, reserveVide, ajouterBonus, retirerBonus, lireReserve } from './bonus.js'
import { AU_CHOIX, nouveauDefi, compteSurprise, gainsDeCoup, duNiveau } from './gains.js'
import { LISTE, couleursDepart, couleursSuivantes, couleursDePieces, lireCouleurs } from './couleurs.js'

// Le niveau est un réglage de la partie, qui peut changer en cours de route (changerNiveau) :
// un niveau illisible retombe sur le niveau 1.
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

function etatVide(reglages, graine, niveauDemande) {
  const niveau = niveauValide(niveauDemande) ? niveauDemande : NIVEAU_PAR_DEFAUT
  return {
    reglages,
    niveau,
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
    // Hasard des gains (sorte d'une surprise gagnée, pièce qui en porte une), à part.
    hasardGains: (graine ^ 0x9e3779b9) >>> 0,
    // Hasard des couleurs (entrée tirée, couleur d'une pièce ou d'une case), à part aussi, et
    // l'entrée de la liste en cours : une partie commence par la première.
    hasardCouleurs: (graine ^ 0x7f4a7c15) >>> 0,
    couleurs: couleursDepart(),
    // La réserve de bonus du joueur.
    reserve: reserveVide(),
    // Le défi en cours { points, coups, scoreDebut, coupsFaits } ; le prochain palier de
    // score ; la case surprise posée sur la grille { ligne, col, reste }, ou null ; les
    // gains « au choix » en attente.
    defi: nouveauDefi(niveau, 0, reglages.gains),
    palier: duNiveau(reglages.gains.palier, niveau),
    surprise: null,
    choix: 0,
    // L'état d'avant la dernière pose, pour annulerCoup ; null s'il n'y a rien à annuler.
    annulation: null,
    dernierCoup: null,
    // Le dernier bonus employé, pour l'affichage ; remis à null par la pose suivante.
    dernierBonus: null,
  }
}

// --- Jouer ----------------------------------------------------------------

// L'aperçu se joue-t-il à ce niveau ? Oui aux niveaux 1 et 2 (BS58).
export const apercuJouable = (etat) => etat.niveau <= NIVEAU_APERCU_JOUABLE

// La pièce à la place `index` : de 0 à 2 la main, de 3 à 5 l'aperçu quand il se joue ; null si la
// place est vide, hors des six, ou si c'est une place de l'aperçu qui ne se joue pas.
export function pieceA(etat, index) {
  if (!Number.isInteger(index) || index < 0) return null
  const n = etat.reglages.piecesParTour
  if (index < n) return etat.enCours[index] ?? null
  if (index < 2 * n && apercuJouable(etat)) return etat.suivantes[index - n] ?? null
  return null
}

// Les places des pièces qu'on peut poser ou viser d'un bonus : celles de la main qui n'est pas
// finie, et celles de l'aperçu quand il se joue.
export function indicesEnJeu(etat) {
  const n = etat.reglages.piecesParTour
  const places = []
  for (let i = 0; i < 2 * n; i++) if (pieceA(etat, i)) places.push(i)
  return places
}

// Vide la place `index` de l'état `e` (copie), ou y met `pieceNeuve`.
function ranger(e, index, pieceNeuve = null) {
  const n = e.reglages.piecesParTour
  if (index < n) e.enCours[index] = pieceNeuve
  else e.suivantes[index - n] = pieceNeuve
}

// Pose la pièce à la place `index` (voir pieceA), son coin haut gauche en (ligne, col).
// Refusée (null) si la place est vide, si la pièce sort de la grille ou recouvre
// une case occupée.
export function poser(etat, index, ligne, col) {
  const enMain = pieceA(etat, index)
  if (!enMain || !tient(etat, enMain.id, ligne, col)) return null
  const p = piece(enMain.id)
  const { reglages } = etat
  const e = cloner(etat)
  e.annulation = instantane(etat)
  e.dernierBonus = null

  const casesPosees = p.cases.map((c) => ({ ligne: ligne + c.ligne, col: col + c.col }))
  casesPosees.forEach((c, i) => { e.grille[c.ligne][c.col] = enMain.couleurs ? enMain.couleurs[i] : enMain.couleur })

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

  ranger(e, index)
  const grilleVidee = e.grille.every((r) => r.every((v) => v === null))
  const { gains, defiFini, surprise } = gagner(e, enMain, { lignes, colonnes, casesDisparues, ligne, col, grilleVidee })
  e.annulation.gagnes = appliquerGains(e, gains)
  // Une grille vidée change l'entrée des couleurs avant le prochain tirage.
  if (grilleVidee) {
    e.couleurs = couleursSuivantes(e.couleurs, () => aleatoire(e, 'hasardCouleurs'))
    recolorer(e)
  }
  const apercuAvant = e.suivantes
  const nouveauTour = finDeTour(e)
  // La main qui est arrivée n'est pas l'aperçu annoncé : le filet des niveaux faciles l'a remplacée.
  const mainRemplacee = nouveauTour && e.enCours !== apercuAvant

  e.dernierCoup = {
    index,
    // Posée depuis l'aperçu (niveaux 1 et 2).
    apercu: index >= reglages.piecesParTour,
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
    grilleVidee,
    nouvelleEntree: grilleVidee ? LISTE[e.couleurs.entree].id : null,
    gains,
    defiFini,
    surprise,
    nouveauTour,
    mainRemplacee,
    bloquee: bloquee(e),
    perdue: perdue(e),
  }
  return e
}

// Quand les trois pièces sont posées ou retirées, l'aperçu passe en main et un nouvel
// aperçu est tiré. Rend vrai si un nouveau tour commence.
//
// Filet des niveaux faciles (BS51, niveaux.js) : si le joueur a rendu l'aperçu impossible à
// poser en entier, la main n'est pas cet aperçu mais un tirage neuf, garanti sur la grille réelle,
// et le nouvel aperçu se tire à partir d'elle. Une main dont la recherche épuise son budget reste.
//
// Les besoins (BS62) : de même, si la main termine moins de lignes et de colonnes presque pleines que ne le
// ferait une main du catalogue, elle est tirée de nouveau, avec la même chance, pour en terminer le plus.
//
// Garantie d'effacement (BS55) : aux niveaux faciles, si aucune pièce de la main ne peut effacer
// une ligne ou une colonne sur la grille réelle alors qu'une pièce de la table le pourrait, la main
// est tirée de nouveau pour en contenir une. La chance en est pleine au niveau 1 et s'estompe jusqu'au
// niveau 6 (aideDuNiveau). La main impossible à poser est remplacée dans les mêmes conditions de chance.
//
// Aperçu joué en avance (BS58) : la main qui arrive peut compter moins de trois pièces (places de
// l'aperçu déjà posées). Si elle n'en compte aucune, elle est un tirage neuf, garanti comme les autres.
function finDeTour(e) {
  if (!e.enCours.every((x) => x === null)) return false
  e.enCours = e.suivantes
  const vide = e.enCours.every((x) => x === null)
  const impossible = !vide && mainImpossible(e)
  const sansEffacement = !vide && !impossible && (mainSansEffacement(e) || mainSansBesoin(e))
  if (vide || impossible || sansEffacement) {
    const exigerEfface = e.niveau < NIVEAU_DIFFICILE && aleatoire(e) < aideDuNiveau(e.niveau)
    if (vide || impossible || exigerEfface) {
      e.enCours = []
      e.suivantes = []
      e.enCours = tirer(e, e.reglages.piecesParTour, exigerEfface)
    }
  }
  e.suivantes = tirer(e, e.reglages.piecesParTour)
  e.tours += 1
  return true
}

function mainImpossible(e) {
  const { mainPosable } = e.reglages
  if (e.niveau >= NIVEAU_DIFFICILE || typeof mainPosable !== 'function') return false
  const { posable, epuise } = mainPosable(e.grille, e.enCours.filter(Boolean).map((x) => x.id))
  return !posable && !epuise
}

// Aux niveaux faciles : la main qui arrive n'a aucune pièce à poser qui efface, alors qu'une pièce
// du tirage du niveau (poids non nul) le ferait sur la grille du moment.
function mainSansEffacement(e) {
  const { mainEfface } = e.reglages
  if (e.niveau >= NIVEAU_DIFFICILE || typeof mainEfface !== 'function') return false
  const possibles = poidsDesPieces(e.niveau).filter((q) => q.poids > 0).map((q) => q.id)
  const { efface, possible } = mainEfface(e.grille, e.enCours.filter(Boolean).map((x) => x.id), possibles)
  return !efface && possible
}

// Aux niveaux faciles (BS62) : la main qui arrive termine moins de lignes et de colonnes presque pleines
// (au plus trois cases à combler) que ne le ferait une main du catalogue de même taille.
function mainSansBesoin(e) {
  const { mainBesoins } = e.reglages
  if (e.niveau >= NIVEAU_DIFFICILE || typeof mainBesoins !== 'function') return false
  const { couverts, atteignables } = mainBesoins(e.grille, e.enCours.filter(Boolean).map((x) => x.id))
  return couverts < atteignables
}

// Ce qu'annulerCoup rend : l'état d'une partie hors réserve et niveau, en données simples.
// La réserve n'y figure pas : annulerCoup en retire seulement ce que la pose a rapporté.
function instantane(etat) {
  return {
    grille: etat.grille.map((r) => [...r]),
    enCours: etat.enCours.map((x) => x && { ...x }),
    suivantes: etat.suivantes.map((x) => x && { ...x }),
    score: etat.score,
    coups: etat.coups,
    tours: etat.tours,
    serie: etat.serie,
    hasard: etat.hasard,
    hasardGains: etat.hasardGains,
    hasardCouleurs: etat.hasardCouleurs,
    couleurs: { ...etat.couleurs },
    defi: { ...etat.defi },
    palier: etat.palier,
    surprise: etat.surprise && { ...etat.surprise },
    choix: etat.choix,
    // Les bonus que la pose rapportera à la réserve (rempli par poser, une fois les gains
    // connus) : annulerCoup les retire avec la pose, sans toucher au reste de la réserve.
    gagnes: reserveVide(),
  }
}

// La pièce à la place `index` peut-elle se poser en (ligne, col) ?
export function peutPoser(etat, index, ligne, col) {
  const enMain = pieceA(etat, index)
  return Boolean(enMain) && tient(etat, enMain.id, ligne, col)
}

// Toutes les places { ligne, col } où la pièce à `index` peut se poser.
export function positionsPossibles(etat, index) {
  const enMain = pieceA(etat, index)
  if (!enMain) return []
  return positionsDe(etat, enMain.id)
}

// Les places (index) des pièces qu'on peut poser (main, et aperçu aux niveaux 1 et 2) qui tiennent
// quelque part.
export function piecesJouables(etat) {
  return indicesEnJeu(etat).filter((i) => positionsDe(etat, pieceA(etat, i).id, 1).length > 0)
}

// Aucune pièce qu'on peut poser ne tient nulle part.
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

// Grille vidée : le gain est « au choix ». Il attend dans etat.choix (le nombre de choix
// non faits) ; choisirBonus en consomme un et ajoute à la réserve la sorte choisie (plafond
// comme tout gain : le surplus est perdu). Refusé (null, rien ne change) s'il n'y a aucun
// choix en attente ou si la sorte est inconnue. Choisir empêche d'annuler la pose, comme
// employer un bonus : le gain qu'on vient de prendre ne doit pas se gagner deux fois.
export function choisirBonus(etat, sorte) {
  if (!(etat.choix > 0) || !sorteValide(sorte)) return null
  const e = cloner(etat)
  e.choix -= 1
  e.reserve = ajouterBonus(etat.reserve, sorte)
  e.annulation = null
  e.dernierCoup = null
  e.dernierBonus = { sorte: 'choisir', choisie: sorte, ajoute: e.reserve[sorte] > etat.reserve[sorte] }
  return e
}

// Le bonus de cette sorte est-il employable maintenant (en réserve, et son effet
// possible) ? `index` est la place de la pièce visée, pour supprimer et tourner.
export function peutUtiliser(etat, sorte, index) {
  if (!(etat.reserve[sorte] > 0)) return false
  const enMain = pieceA(etat, index)
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

// Supprimer : la pièce à la place `index` (main, ou aperçu aux niveaux 1 et 2) disparaît, le tour
// continue avec les autres ; il finit quand les trois de la main sont posées ou retirées.
export function supprimerPiece(etat, index) {
  const e = employer(etat, 'supprimer', index)
  if (!e) return null
  const retiree = pieceA(e, index).id
  ranger(e, index)
  const nouveauTour = finDeTour(e)
  e.dernierBonus = { sorte: 'supprimer', index, piece: retiree, nouveauTour }
  return e
}

// Tourner : la pièce passe à son orientation suivante (voir pieceSuivante). Refusé pour
// une pièce qui n'a qu'une orientation.
export function tournerPiece(etat, index) {
  const e = employer(etat, 'tourner', index)
  if (!e) return null
  const avant = pieceA(e, index)
  const tournee = { ...avant, id: pieceSuivante(avant.id) }
  if (avant.couleurs) {
    tournee.couleurs = couleursTournees(avant)
    // La couleur d'une pièce mélangée est celle de sa première case.
    tournee.couleur = tournee.couleurs[0]
  }
  // La case surprise tourne avec la pièce : un quart de tour horaire envoie (l, c) en
  // (c, hauteur - 1 - l), comme le catalogue (pieces.js).
  if (avant.surprise) tournee.surprise = { ligne: avant.surprise.col, col: piece(avant.id).hauteur - 1 - avant.surprise.ligne }
  ranger(e, index, tournee)
  e.dernierBonus = { sorte: 'tourner', index, avant: avant.id, apres: tournee.id }
  return e
}

// Changer : les pièces restantes du tour sont retirées et remplacées, aux mêmes places
// et en même nombre, par un tirage neuf ; l'aperçu est tiré de nouveau avec elles. Le
// tirage garanti s'applique comme au début d'une partie : les pièces neuves se posent,
// puis celles de l'aperçu. Retirer aussi l'aperçu est la manière la plus simple de
// tenir la garantie, et l'aperçu montré reste la vérité. Les places de l'aperçu déjà posées
// (niveaux 1 et 2, BS58) restent vides : changer ne rend aucune pièce posée.
export function changerPieces(etat) {
  const e = employer(etat, 'changer')
  if (!e) return null
  const anciennes = e.enCours.map((x) => x && x.id)
  const places = e.enCours.flatMap((x, i) => (x ? [i] : []))
  const placesApercu = e.suivantes.flatMap((x, i) => (x ? [i] : []))
  e.enCours = e.enCours.map(() => null)
  // L'aperçu va être retiré aussi : une surprise qu'il portait ne compte plus.
  e.suivantes = e.suivantes.map(() => null)
  const neuves = tirer(e, places.length)
  places.forEach((place, i) => { e.enCours[place] = neuves[i] })
  const neuvesApercu = placesApercu.length > 0 ? tirer(e, placesApercu.length) : []
  placesApercu.forEach((place, i) => { e.suivantes[place] = neuvesApercu[i] })
  e.dernierBonus = { sorte: 'changer', anciennes, neuves: e.enCours.map((x) => x && x.id) }
  return e
}

// Le niveau change en cours de partie (BS55) et vaut tout de suite : les pièces déjà en main et dans
// l'aperçu restent comme elles sont, les tirages suivants et le prochain défi suivent le nouveau
// niveau. Rien d'autre ne bouge, et annuler un coup ne ramène pas l'ancien niveau (le niveau
// n'est pas dans l'instantané). Refusé (null) si le niveau n'est pas de 1 à 10.
export function changerNiveau(etat, niveau) {
  if (!niveauValide(niveau)) return null
  if (niveau === etat.niveau) return etat
  const e = cloner(etat)
  e.niveau = niveau
  return e
}

// Annuler : rend l'état exact d'avant la dernière pose (grille, score, série, pièces du
// tour, aperçu, compteurs, état du hasard, défi, palier, surprise, choix en attente : la
// suite reste cohérente). Les bonus que cette pose avait rapportés sont retirés de la
// réserve : annuler ne permet pas de les gagner deux fois. Un seul coup en
// arrière, jamais deux de suite ; le bonus consommé n'est pas rendu. Refusé s'il n'y a
// pas de coup à annuler : début de partie, coup déjà annulé, ou bonus de supprimer,
// tourner ou changer employé depuis la pose (il a touché aux pièces que l'état d'avant
// contient, et le rendre gaspillerait ce bonus).
export function annulerCoup(etat) {
  const e = employer(etat, 'annuler')
  if (!e) return null
  const avant = etat.annulation
  e.grille = avant.grille.map((r) => [...r])
  e.enCours = avant.enCours.map((x) => x && copiePiece(x))
  e.suivantes = avant.suivantes.map((x) => x && copiePiece(x))
  e.score = avant.score
  e.coups = avant.coups
  e.tours = avant.tours
  e.serie = avant.serie
  e.hasard = avant.hasard
  e.hasardGains = avant.hasardGains
  e.hasardCouleurs = avant.hasardCouleurs
  e.couleurs = { ...avant.couleurs }
  e.defi = { ...avant.defi }
  e.palier = avant.palier
  e.surprise = avant.surprise && { ...avant.surprise }
  e.choix = avant.choix
  // Les bonus gagnés par la pose s'en vont avec elle (le choix en attente aussi, plus haut) ;
  // celui qu'on vient d'employer n'est pas rendu.
  for (const sorte of SORTES) e.reserve[sorte] = Math.max(0, e.reserve[sorte] - avant.gagnes[sorte])
  e.dernierBonus = { sorte: 'annuler' }
  return e
}

// Les sortes de bonus de la réserve qui peuvent changer une partie bloquée : supprimer
// et changer s'il y en a un ; annuler s'il y a un coup à annuler ; tourner si l'une des
// pièces en main se pose dans une orientation que la réserve de « tourner » permet
// d'atteindre (un bonus par quart de tour).
export function bonusUtiles(etat) {
  return SORTES.filter((sorte) => (sorte === 'tourner' ? tournerUtile(etat) : peutUtiliser(etat, sorte, indicesEnJeu(etat)[0])))
}

function tournerUtile(etat) {
  return indicesEnJeu(etat).some((index) => {
    const x = pieceA(etat, index)
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
// Un bonus « au choix » en attente (grille vidée) compte aussi : il peut donner supprimer ou changer.
export const perdue = (etat) => bloquee(etat) && etat.choix === 0 && bonusUtiles(etat).length === 0

// --- Gains ------------------------------------------------------------------

// Les gains que la pose vient de mériter, d'après le coup (grille déjà effacée, score et
// compteurs à jour) : le défi, le palier et la case surprise y sont décidés et l'état `e`
// les reflète. Rend { gains, defiFini, surprise } : la liste [{ cause, sorte }] dans l'ordre
// de gains.js, comment le défi a fini ('reussi', 'rate' ou null), ce qu'il est advenu de la
// case surprise ('posee', 'gagnee', 'perdue' ou null).
function gagner(e, enMain, { lignes, colonnes, casesDisparues, ligne, col, grilleVidee }) {
  const g = e.reglages.gains
  const gains = gainsDeCoup({ lignes: lignes.length, colonnes: colonnes.length, grilleVidee }, g, e.niveau)

  // Défi : les points gagnés depuis son début, tous comptés, dans les coups accordés.
  const defi = { ...e.defi, coupsFaits: e.defi.coupsFaits + 1 }
  let defiFini = null
  if (e.score - defi.scoreDebut >= defi.points) {
    defiFini = 'reussi'
    gains.push({ cause: 'defi', sorte: 'supprimer' })
  } else if (defi.coupsFaits >= defi.coups) {
    defiFini = 'rate'
  }
  // Fini, réussi ou raté : un nouveau défi arrive aussitôt, compté à partir de maintenant.
  e.defi = defiFini ? nouveauDefi(e.niveau, e.score, g) : defi

  // Paliers de score : un par seuil franchi, un gros coup peut en franchir plusieurs.
  while (e.score >= e.palier) {
    gains.push({ cause: 'palier', sorte: 'changer', palier: e.palier })
    e.palier += duNiveau(g.palier, e.niveau)
  }

  // Case surprise. Celle de la grille : effacée avant que son numéro tombe à zéro, elle
  // rapporte un bonus au hasard ; la pose qui l'efface compte même si c'était la dernière.
  // Celle que la pièce posée porte prend la place de la grille à son tour (et, si cette
  // pose la complète, elle est gagnée tout de suite). Une seule à la fois : la porteuse
  // ne peut arriver que si la grille n'en a plus.
  let surprise = null
  const effacee = (s) => casesDisparues.some((c) => c.ligne === s.ligne && c.col === s.col)
  const gagnee = () => {
    surprise = 'gagnee'
    gains.push({ cause: 'surprise', sorte: SORTES[Math.floor(aleatoire(e, 'hasardGains') * SORTES.length)] })
  }
  if (e.surprise) {
    if (effacee(e.surprise)) {
      gagnee()
      e.surprise = null
    } else if (e.surprise.reste <= 1) {
      surprise = 'perdue'
      e.surprise = null
    } else {
      e.surprise = { ...e.surprise, reste: e.surprise.reste - 1 }
    }
  }
  if (enMain.surprise) {
    const place = { ligne: ligne + enMain.surprise.ligne, col: col + enMain.surprise.col }
    if (effacee(place)) gagnee()
    else {
      e.surprise = { ...place, reste: compteSurprise(e.niveau, g) }
      surprise = 'posee'
    }
  }
  return { gains, defiFini, surprise }
}

// Ajoute les gains à la réserve de `e` (plafonnée) ou aux choix en attente, et complète
// chaque gain de `ajoute` : vrai s'il est entré dans la réserve, faux s'il est perdu au-delà
// du plafond ou « au choix » (pas encore choisi). Rend les bonus réellement gagnés, par
// sorte, de quoi les retirer si la pose est annulée.
function appliquerGains(e, gains) {
  const gagnes = reserveVide()
  for (const gain of gains) {
    gain.ajoute = false
    if (gain.sorte === AU_CHOIX) {
      e.choix += 1
      continue
    }
    const avant = e.reserve[gain.sorte]
    e.reserve = ajouterBonus(e.reserve, gain.sorte)
    gain.ajoute = e.reserve[gain.sorte] > avant
    if (gain.ajoute) gagnes[gain.sorte] += 1
  }
  return gagnes
}

// --- Garder une partie ----------------------------------------------------

// Change quand la forme des données gardées change : une partie gardée avec un
// autre numéro n'est plus relue.
// 2 (BS42) : la réserve de bonus et l'instantané d'annulation s'ajoutent à la partie.
// 3 (BS43) : le défi, le palier, la case surprise (sur la grille et sur les pièces), les choix
// en attente, le hasard des gains et les bonus rapportés par la dernière pose (annulation).
// 4 (BS44) : l'entrée des couleurs en cours, son hasard, et les couleurs par case d'une pièce mélangée.
export const SCHEMA_PARTIE = 4

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
    annulation: etat.annulation && { ...figerInstantane(etat.annulation), gagnes: { ...etat.annulation.gagnes } },
  }
}

// Les données qu'un instantané et une partie ont en commun : tout, hors niveau et réserve.
function figerInstantane(x) {
  const figer = (p) => p && { id: p.id, couleur: p.couleur, ...(p.couleurs && { couleurs: [...p.couleurs] }), ...(p.surprise && { surprise: { ligne: p.surprise.ligne, col: p.surprise.col } }) }
  return {
    grille: x.grille.map((r) => [...r]),
    enCours: x.enCours.map(figer),
    suivantes: x.suivantes.map(figer),
    score: x.score,
    coups: x.coups,
    tours: x.tours,
    serie: x.serie,
    hasard: x.hasard,
    hasardGains: x.hasardGains,
    hasardCouleurs: x.hasardCouleurs,
    couleurs: { ...x.couleurs },
    defi: { ...x.defi },
    palier: x.palier,
    surprise: x.surprise && { ...x.surprise },
    choix: x.choix,
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
  // Ce que la pose à annuler a rapporté à la réserve : une réserve (entiers de 0 au plafond).
  const gagnes = annulation && lireReserve(d.annulation.gagnes)
  if (annulation && !gagnes) return null
  if (annulation) annulation.gagnes = gagnes

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

  // Une pièce { id, couleur } et, si elle porte la case surprise, sa place dans la pièce.
  const lirePiece = (x) => {
    if (!x || typeof x !== 'object' || !piece(x.id) || !couleur(x.couleur)) return undefined
    const lue = { id: x.id, couleur: x.couleur }
    if (x.couleurs !== undefined) {
      const cases = piece(x.id).cases.length
      if (!Array.isArray(x.couleurs) || x.couleurs.length !== cases || !x.couleurs.every(couleur) || x.couleurs[0] !== x.couleur) return undefined
      lue.couleurs = [...x.couleurs]
    }
    if (x.surprise === undefined) return lue
    const s = x.surprise
    if (!s || typeof s !== 'object' || !piece(x.id).cases.some((c) => c.ligne === s.ligne && c.col === s.col)) return undefined
    return { ...lue, surprise: { ligne: s.ligne, col: s.col } }
  }
  if (!Array.isArray(d.enCours) || d.enCours.length !== piecesParTour) return null
  if (!Array.isArray(d.suivantes) || d.suivantes.length !== piecesParTour) return null
  const enCours = d.enCours.map((x) => (x === null ? null : lirePiece(x)))
  // Une place de l'aperçu déjà posée (niveaux 1 et 2, BS58) est null.
  const suivantes = d.suivantes.map((x) => (x === null ? null : lirePiece(x)))
  if (enCours.includes(undefined) || suivantes.includes(undefined)) return null
  // Un tour dont les trois pièces sont posées a déjà laissé place au suivant.
  if (enCours.every((x) => x === null)) return null

  const gains = lireGains(d, reglages, entier)
  if (!gains) return null
  const couleurs = lireCouleurs(d.couleurs)
  if (!couleurs || !entier(d.hasardCouleurs, 0, 0xffffffff)) return null
  // Une seule case surprise à la fois, sur la grille ou sur une pièce, et posée sur une case occupée.
  const portees = [...enCours, ...suivantes].filter((x) => x && x.surprise).length
  if (portees + (gains.surprise ? 1 : 0) > 1) return null
  if (gains.surprise && d.grille[gains.surprise.ligne][gains.surprise.col] === null) return null
  if (d.palier <= d.score) return null

  return {
    grille: d.grille.map((r) => [...r]),
    enCours,
    suivantes,
    score: d.score,
    coups: d.coups,
    tours: d.tours,
    serie: d.serie,
    hasard: d.hasard,
    hasardCouleurs: d.hasardCouleurs,
    couleurs,
    ...gains,
  }
}

// Le défi, le palier, la case surprise de la grille, les choix en attente et le hasard des
// gains, relus et vérifiés : { hasardGains, defi, palier, surprise, choix }, ou null.
function lireGains(d, reglages, entier) {
  const { defi, surprise } = d
  if (!entier(d.hasardGains, 0, 0xffffffff) || !entier(d.palier, 1) || !entier(d.choix, 0)) return null
  if (!defi || typeof defi !== 'object' || !entier(defi.points, 1) || !entier(defi.coups, 1)) return null
  if (!entier(defi.scoreDebut, 0, d.score) || !entier(defi.coupsFaits, 0, defi.coups - 1)) return null
  if (surprise !== null) {
    if (!surprise || typeof surprise !== 'object') return null
    if (!entier(surprise.ligne, 0, reglages.lignes - 1) || !entier(surprise.col, 0, reglages.colonnes - 1)) return null
    if (!entier(surprise.reste, 1, Math.max(...reglages.gains.surprise.compte))) return null
  }
  return {
    hasardGains: d.hasardGains,
    defi: { points: defi.points, coups: defi.coups, scoreDebut: defi.scoreDebut, coupsFaits: defi.coupsFaits },
    palier: d.palier,
    surprise: surprise && { ligne: surprise.ligne, col: surprise.col, reste: surprise.reste },
    choix: d.choix,
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
// et des pièces données par leur id (null : déjà posée) ou par { id, surprise: { ligne,
// col } } pour une pièce qui porte la case surprise. Sans pièces données, elles sont
// tirées comme en partie. Défi, palier, surprise (de la grille) et choix se posent à la
// main pour les essais ; sans eux, ce sont ceux d'une partie qui commence.
export function depuisTexte({ rangees = [], enCours, suivantes, niveau = NIVEAU_PAR_DEFAUT, graine = 1, reserve = reserveVide(), reglages = REGLAGES, score, defi, palier, surprise, choix }) {
  const e = etatVide(reglages, graine, niveau)
  e.reserve = { ...reserve }
  if (score !== undefined) e.score = score
  if (defi) e.defi = { ...e.defi, ...defi }
  if (palier !== undefined) e.palier = palier
  if (surprise) e.surprise = { ...surprise }
  if (choix !== undefined) e.choix = choix
  rangees.forEach((r, l) => {
    if (r.length !== reglages.colonnes) throw new RangeError(`rangée ${l} de ${r.length} cases au lieu de ${reglages.colonnes}`)
    e.grille[l] = [...r].map((c) => (c === '.' ? null : c))
  })
  const enMain = (donnee) => {
    if (donnee === null) return null
    const { id, surprise: porte } = typeof donnee === 'string' ? { id: donnee } : donnee
    if (!piece(id)) throw new RangeError(`pièce inconnue : ${id}`)
    return { id, couleur: reglages.couleurPiece, ...(porte && { surprise: { ...porte } }) }
  }
  e.enCours = enCours ? enCours.map(enMain) : tirer(e, reglages.piecesParTour)
  e.suivantes = suivantes ? suivantes.map(enMain) : tirer(e, reglages.piecesParTour)
  return e
}

// --- Interne ----------------------------------------------------------------

// `nombre` pièces, par le tirage des réglages (remplaçable, voir tirage.js) : trois pour
// un tour, moins pour remplacer les pièces restantes d'un tour (changerPieces).
function tirer(etat, nombre, exigerEfface = false) {
  const { reglages } = etat
  const ids = reglages.tirage({
    exigerEfface,
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
  const couleurs = couleursDePieces(etat.couleurs, ids.map((id) => piece(id).cases.length), () => aleatoire(etat, 'hasardCouleurs'))
  return marquerSurprise(etat, ids.map((id, i) => ({ id, ...couleurs[i] })))
}

// Une pièce tirée peut porter la case surprise (chance reglages.gains.surprise.frequence),
// tant qu'aucune n'existe, ni sur la grille ni dans une pièce en main ou en aperçu : une
// seule à la fois. Le hasard vient de la suite des gains.
function marquerSurprise(etat, pieces) {
  const { frequence } = etat.reglages.gains.surprise
  let existe = etat.surprise !== null || [...etat.enCours, ...etat.suivantes].some((x) => x && x.surprise)
  return pieces.map((x) => {
    if (existe || !(aleatoire(etat, 'hasardGains') < frequence)) return x
    existe = true
    const cases = piece(x.id).cases
    const c = cases[Math.floor(aleatoire(etat, 'hasardGains') * cases.length)]
    return { ...x, surprise: { ligne: c.ligne, col: c.col } }
  })
}

const rangs = (n) => Array.from({ length: n }, (_, i) => i)

// Générateur reproductible (mulberry32) : sa graine vit dans l'état, qui reste
// ainsi un objet simple qu'on peut enregistrer et rejouer.
// Deux suites : `hasard` (le tirage) et `hasardGains` (les gains), pour que l'une
// n'avance pas quand l'autre sert.
function aleatoire(etat, suite = 'hasard') {
  let t = (etat[suite] = (etat[suite] + 0x6d2b79f5) >>> 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function cloner(etat) {
  return {
    ...etat,
    grille: etat.grille.map((r) => [...r]),
    enCours: etat.enCours.map((x) => x && copiePiece(x)),
    suivantes: etat.suivantes.map((x) => x && copiePiece(x)),
    reserve: { ...etat.reserve },
    couleurs: { ...etat.couleurs },
  }
}

// Après une grille vidée (BS60) : les pièces visibles (main en cours et aperçu) prennent
// aussitôt leurs couleurs d'après la nouvelle entrée, tirées dans la suite des couleurs ; le
// tirage des pièces et leur surprise ne changent pas.
function recolorer(e) {
  const visibles = [...(e.enCours || []), ...(e.suivantes || [])].filter(Boolean)
  const couleurs = couleursDePieces(e.couleurs, visibles.map((x) => piece(x.id).cases.length), () => aleatoire(e, 'hasardCouleurs'))
  visibles.forEach((x, i) => {
    delete x.couleurs
    Object.assign(x, couleurs[i])
  })
}

// Une pièce en main copiée, avec ses couleurs par case et sa surprise.
function copiePiece(x) {
  return { ...x, ...(x.couleurs && { couleurs: [...x.couleurs] }), ...(x.surprise && { surprise: { ...x.surprise } }) }
}

// Les couleurs par case d'une pièce après un quart de tour : chaque case garde sa couleur en
// tournant avec la pièce (même rotation que le catalogue, pieces.js).
function couleursTournees(avant) {
  const p = piece(avant.id)
  const suivante = piece(pieceSuivante(avant.id))
  return suivante.cases.map((n) => {
    const i = p.cases.findIndex((c) => c.col === n.ligne && p.hauteur - 1 - c.ligne === n.col)
    return avant.couleurs[i]
  })
}
