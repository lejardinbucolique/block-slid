// Mesure de la difficulté ressentie des niveaux de block-pose (BS51) : un robot glouton, sans
// bonus et sans regard sur l'aperçu, joue des parties à chaque niveau et rapporte la survie,
// le remplissage moyen de la grille, les effacements par pose, la part de mains dont une pose
// efface quelque chose, la taille des pièces et le temps de tirage.
//
//   node tools/mesure-niveaux-pose.js [parties=60] [plafond=1500] [niveaux=1,2,3,4,5,6,7,10]

import { fileURLToPath } from 'node:url'
import { nouvellePartie, poser, bloquee, piece, positionsPossibles, piecesJouables } from '../src/pose/index.js'
import { meilleurCoup } from './simulateur-pose.js'

const mediane = (t) => [...t].sort((a, b) => a - b)[Math.floor(t.length / 2)]

// Une pose de la main efface-t-elle quelque chose, à l'ouverture du tour ?
function mainQuiEfface(etat) {
  for (const index of piecesJouables(etat)) {
    for (const { ligne, col } of positionsPossibles(etat, index)) {
      const e = poser(etat, index, ligne, col)
      if (e.dernierCoup.lignes.length + e.dernierCoup.colonnes.length > 0) return true
    }
  }
  return false
}

export function mesurer({ niveau, parties, plafond }) {
  const survies = []
  const t = { bloquees: 0, poses: 0, remplissage: 0, effaces: 0, cases: 0, mains: 0, mainsQuiEffacent: 0, tirage: 0, finsDeTour: 0, dureeFinsDeTour: 0, remplacees: 0 }
  for (let i = 0; i < parties; i++) {
    let etat = nouvellePartie({ niveau, graine: 1000 * niveau + i + 1 })
    let poses = 0
    while (poses < plafond) {
      if (bloquee(etat)) { t.bloquees++; break }
      if (etat.enCours.every((x) => x !== null)) {
        t.mains++
        if (mainQuiEfface(etat)) t.mainsQuiEffacent++
      }
      const coup = meilleurCoup(etat)
      const t0 = performance.now()
      etat = poser(etat, coup.index, coup.ligne, coup.col)
      const duree = performance.now() - t0
      t.tirage = Math.max(t.tirage, duree)
      poses++
      const d = etat.dernierCoup
      if (d.nouveauTour) { t.finsDeTour++; t.dureeFinsDeTour += duree }
      if (d.mainRemplacee) t.remplacees++
      t.effaces += d.lignes.length + d.colonnes.length
      t.cases += piece(d.piece).cases.length
      t.remplissage += etat.grille.flat().filter((v) => v !== null).length
    }
    t.poses += poses
    survies.push(poses)
  }
  return {
    niveau, mediane: mediane(survies), min: Math.min(...survies), bloquees: t.bloquees, parties,
    remplissage: t.remplissage / t.poses, effacesParPose: t.effaces / t.poses, casesParPiece: t.cases / t.poses,
    mainsQuiEffacent: t.mainsQuiEffacent / t.mains, pirePose: t.tirage, moyenneFinDeTour: t.dureeFinsDeTour / t.finsDeTour, remplacees: t.remplacees, tours: t.finsDeTour,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const parties = Number(process.argv[2] ?? 60)
  const plafond = Number(process.argv[3] ?? 1500)
  const niveaux = process.argv[4] ? process.argv[4].split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7, 10]
  console.log('niveau | survie méd. (min) | bloquées | remplissage | effacés/pose | cases/pièce | mains qui effacent | fin de tour moy. ms | max ms | mains remplacées')
  for (const niveau of niveaux) {
    const m = mesurer({ niveau, parties, plafond })
    console.log([
      String(m.niveau).padStart(6), `${m.mediane} (${m.min})`, `${m.bloquees}/${m.parties}`, m.remplissage.toFixed(1),
      m.effacesParPose.toFixed(3), m.casesParPiece.toFixed(2), `${(100 * m.mainsQuiEffacent).toFixed(0)} %`, m.moyenneFinDeTour.toFixed(2), m.pirePose.toFixed(1), `${m.remplacees}/${m.tours}`,
    ].join(' | '))
  }
}
