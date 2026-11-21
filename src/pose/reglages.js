// Réglages de block-pose (BS40), en un seul endroit.
// Pour essayer d'autres valeurs : nouvellePartie({ reglages: { ...REGLAGES, plafondSerie: 8 } }).

import { tirerPieces } from './tirage.js'

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

  // Couleur que reçoit une pièce tirée, transmise telle quelle à ses cases posées.
  // Les modes de couleur viendront en BS44.
  couleurPiece: 'uni',

  // Remplaçable (BS41 : tirage garanti) ; voir tirage.js pour son interface.
  tirage: tirerPieces,
})
