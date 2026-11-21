// Niveaux de block-pose (BS40) : de 1 à 10, réglés par le joueur et fixes tant
// qu'il ne les change pas (BS38). Le niveau ne change pas le score : il ne sert
// qu'à choisir le mélange des pièces tirées.

import { CATALOGUE } from './pieces.js'

export const NIVEAU_MIN = 1
export const NIVEAU_MAX = 10
export const NIVEAU_PAR_DEFAUT = 1

// La seule table à retoucher pour caler la difficulté : pour chaque niveau, la part
// des pièces tirées (sur 100) de chaque difficulté du catalogue (1 facile à 4
// grosse ou tordue). Au niveau 1, presque seulement des pièces faciles ; au
// niveau 10, tout le catalogue. D'un niveau au suivant, la part des difficultés
// 2 et plus, 3 et plus, 4 ne baisse jamais (un test le vérifie). Valeurs de
// départ, à caler en jouant.
export const POIDS_NIVEAUX = Object.freeze([
  //  1   2   3   4
  [85, 15, 0, 0],
  [75, 22, 3, 0],
  [65, 27, 6, 2],
  [55, 30, 10, 5],
  [47, 31, 14, 8],
  [40, 31, 18, 11],
  [34, 30, 21, 15],
  [28, 30, 24, 18],
  [24, 28, 26, 22],
  [20, 27, 28, 25],
].map(Object.freeze))

export const niveauValide = (n) => Number.isInteger(n) && n >= NIVEAU_MIN && n <= NIVEAU_MAX

// Le poids de tirage de chaque pièce à un niveau : [{ id, poids }], dans l'ordre
// du catalogue. La part d'une difficulté se partage à égalité entre ses formes,
// celle d'une forme entre ses orientations : une forme à quatre orientations ne
// sort pas plus souvent qu'une barre qui n'en a que deux.
export function poidsDesPieces(niveau) {
  if (!niveauValide(niveau)) throw new RangeError(`niveau hors de ${NIVEAU_MIN} à ${NIVEAU_MAX} : ${niveau}`)
  return PAR_NIVEAU[niveau - NIVEAU_MIN]
}

const PAR_NIVEAU = POIDS_NIVEAUX.map((parts) => {
  const formes = (d) => new Set(CATALOGUE.filter((p) => p.difficulte === d).map((p) => p.forme)).size
  const orientations = (forme) => CATALOGUE.filter((p) => p.forme === forme).length
  return Object.freeze(CATALOGUE.map((p) => Object.freeze({
    id: p.id,
    poids: parts[p.difficulte - 1] / formes(p.difficulte) / orientations(p.forme),
  })))
})
