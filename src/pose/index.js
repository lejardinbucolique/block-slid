export { REGLAGES, PLAFOND_SERIE } from './reglages.js'
export { FORMES, CATALOGUE, piece, pieceSuivante, LIGNES_MAX_PAR_COUP, COLONNES_MAX_PAR_COUP } from './pieces.js'
export { NIVEAU_MIN, NIVEAU_MAX, NIVEAU_PAR_DEFAUT, POIDS_NIVEAUX, NIVEAU_DIFFICILE, aideDuNiveau, niveauValide, poidsDesPieces } from './niveaux.js'
export { tirerPieces } from './tirage.js'
export {
  TOLERANCE_HORS_GRILLE,
  caseVisee,
  apercuCoup,
  casesElevees,
  centreEffacement,
  sensEffacement,
  tailleCellule,
} from './geste.js'
export {
  PALETTE,
  LISTE as LISTE_COULEURS,
  FOND_ROSE_REFERENCE,
  MODE_UNIE,
  MODE_PAR_PIECE,
  MODE_MELANGEE,
  couleursDepart,
  couleursSuivantes,
  couleursDePieces,
  lireCouleurs,
} from './couleurs.js'
export {
  SORTES,
  RESERVE_MAX,
  BONUS_OFFERTS,
  reserveVide,
  reserveInitiale,
  ajouterBonus,
  lireReserve,
} from './bonus.js'
export { GAINS, AU_CHOIX, CAUSES, nouveauDefi, compteSurprise, pointsMaxParPose, pointsMaxEnCoups } from './gains.js'
export {
  nouvellePartie,
  poser,
  peutPoser,
  positionsPossibles,
  piecesJouables,
  bloquee,
  perdue,
  gagnerBonus,
  choisirBonus,
  peutUtiliser,
  supprimerPiece,
  tournerPiece,
  changerPieces,
  changerNiveau,
  annulerCoup,
  bonusUtiles,
  exporterPartie,
  importerPartie,
  SCHEMA_PARTIE,
  versTexte,
  depuisTexte,
} from './moteur.js'
