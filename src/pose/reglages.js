// Réglages de block-pose (BS40), en un seul endroit.
// Pour essayer d'autres valeurs : nouvellePartie({ reglages: { ...REGLAGES, plafondSerie: 8 } }).

import { tirageGaranti, mainPosable } from './tirage-garanti.js'
import { GAINS } from './gains.js'

// Multiplicateur le plus haut d'une série de coups qui effacent : le deuxième
// coup de suite double tout, le troisième triple... jusqu'à ce plafond.
// Valeur provisoire, à caler en jouant.
export const PLAFOND_SERIE = 5

export const REGLAGES = Object.freeze({
  lignes: 10,
  colonnes: 10,
  // Pièces en main à chaque tour, et autant dans l'aperçu du tour suivant.
  piecesParTour: 3,

  // Score (BS38) : par case posée ; par case qui disparaît, multiplié par le nombre
  // de lignes et de colonnes effacées d'un seul coup ; puis tout par la série.
  pointsParCase: 1,
  pointsParCaseEffacee: 10,
  plafondSerie: PLAFOND_SERIE,

  // Gains de bonus (BS43) : conditions, défi, palier, cases surprises, voir gains.js.
  gains: GAINS,

  // Couleur des pièces données à la main aux essais (depuisTexte). Les pièces tirées en
  // partie prennent celle de l'entrée en cours de la liste des couleurs (couleurs.js, BS44).
  couleurPiece: 'uni',

  // Tirage garanti (BS41, tirage-garanti.js) : les pièces d'un tour, puis celles de
  // l'aperçu, peuvent toujours toutes se poser. Remplaçable ; interface dans tirage.js
  // (tirerPieces, le tirage simple sans garantie, reste pour les essais).
  tirage: tirageGaranti,
  // Le filet des niveaux faciles (BS51, moteur.js) : la main qui arrive est-elle posable en
  // entier ? Sans cette fonction, aucun filet.
  mainPosable,
})
