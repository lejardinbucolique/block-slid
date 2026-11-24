// Niveaux de block-pose (BS40) : de 1 à 10, réglés par le joueur ; un changement vaut tout
// de suite pour les tirages suivants (BS55, il valait avant pour la partie suivante, BS38).
// Le niveau ne change pas le score : il ne sert qu'à choisir le mélange des pièces tirées.

import { CATALOGUE } from './pieces.js'

export const NIVEAU_MIN = 1
export const NIVEAU_MAX = 10
export const NIVEAU_PAR_DEFAUT = 1

// La seule table à retoucher pour caler la difficulté : pour chaque niveau, la part
// des pièces tirées (sur 100) de chaque difficulté du catalogue (1 : grandes pièces simples
// qui remplissent vite une ligne, à 4 : petites ou tordues, voir pieces.js). Au niveau 1,
// surtout des grandes pièces simples ; au niveau 10, surtout des petites et des tordues
// (S, Z, coin), qui ne bouchent rien d'un coup. D'un niveau au suivant, la part des
// difficultés 2 et plus, 3 et plus, 4 ne baisse jamais (un test le vérifie). L'écart entre
// le niveau 1 et le niveau 10 est grand à dessein (BS55). Valeurs à caler en jouant.
export const POIDS_NIVEAUX = Object.freeze([
  //  1   2   3   4
  [60, 32, 8, 0],
  [51, 35, 12, 2],
  [42, 37, 16, 5],
  [34, 36, 20, 10],
  [26, 34, 24, 16],
  [19, 31, 27, 23],
  [13, 27, 29, 31],
  [8, 21, 30, 41],
  [4, 14, 30, 52],
  [2, 8, 28, 62],
].map(Object.freeze))

// Le premier niveau « difficile » (BS51) : à partir de lui, le joueur planifie avec les six
// pièces (main et aperçu) et peut se mettre dans l'impasse. En dessous, deux aides : la main
// qui arrive est toujours posable en entier (le filet du moteur), et le tirage cherche les
// pièces qui comblent les espaces libres et finissent des lignes. Le seul endroit où changer ce seuil.
export const NIVEAU_DIFFICILE = 7

// Le dernier niveau où la future main (l'aperçu) se joue aussi (BS58) : jusqu'à lui, les six pièces
// sont posables à la fois, dans l'ordre qu'on veut ; au-dessus, seule la main en cours l'est et l'aperçu
// ne fait que se montrer. Le seul endroit où changer ce seuil.
export const NIVEAU_APERCU_JOUABLE = 2

// La force de l'aide au tirage : 1 au niveau 1, qui s'estompe d'un niveau à l'autre, 0 dès
// le niveau difficile (pas de marche brutale).
export const aideDuNiveau = (niveau) => (niveau >= NIVEAU_DIFFICILE ? 0 : (NIVEAU_DIFFICILE - niveau) / (NIVEAU_DIFFICILE - NIVEAU_MIN))

// La force du tirage hostile (BS55) : 0 aux niveaux faciles, puis de plus en plus forte jusqu'au
// niveau 10 (1) : il favorise les pièces qui gênent, celles qui n'effacent rien sur la grille du moment.
export const hostiliteDuNiveau = (niveau) => (niveau < NIVEAU_DIFFICILE ? 0 : (niveau - NIVEAU_DIFFICILE + 1) / (NIVEAU_MAX - NIVEAU_DIFFICILE + 1))

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
