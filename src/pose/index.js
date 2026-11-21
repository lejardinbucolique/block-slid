export { REGLAGES, PLAFOND_SERIE } from './reglages.js'
export { FORMES, CATALOGUE, piece, pieceSuivante, LIGNES_MAX_PAR_COUP, COLONNES_MAX_PAR_COUP } from './pieces.js'
export { NIVEAU_MIN, NIVEAU_MAX, NIVEAU_PAR_DEFAUT, POIDS_NIVEAUX, niveauValide, poidsDesPieces } from './niveaux.js'
export { tirerPieces } from './tirage.js'
export {
  nouvellePartie,
  poser,
  peutPoser,
  positionsPossibles,
  piecesJouables,
  bloquee,
  exporterPartie,
  importerPartie,
  SCHEMA_PARTIE,
  versTexte,
  depuisTexte,
} from './moteur.js'
