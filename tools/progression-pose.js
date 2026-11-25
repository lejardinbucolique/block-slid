// Mesure de la progression de difficulté de block-pose du niveau 1 au niveau 10 (BS57) : un
// processus par niveau, en parallèle, qui joue des parties du robot glouton (mesure-niveaux-pose.js),
// puis le tableau des dix niveaux et les marches d'un niveau au suivant.
//
//   node tools/progression-pose.js [parties=40] [plafond=1500] [niveaux=1,2,...,10]
//
// La difficulté lue : les pertes pour mille poses (plus elle est grande, plus le niveau est dur), qui
// doit monter régulièrement ; le remplissage moyen et la part de mains qui effacent la confirment. BS62 : la part des lignes et colonnes
// presque pleines (au plus trois cases à combler) que la main termine, puis la main et l'aperçu.

import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mesurer } from './mesure-niveaux-pose.js'

if (process.send) {
  process.on('message', ({ niveau, parties, plafond }) => {
    process.send(mesurer({ niveau, parties, plafond }))
    process.exit(0)
  })
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const parties = Number(process.argv[2] ?? 40)
  const plafond = Number(process.argv[3] ?? 1500)
  const niveaux = process.argv[4] ? process.argv[4].split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  const resultats = await Promise.all(niveaux.map((niveau) => new Promise((resolve, reject) => {
    const enfant = fork(fileURLToPath(import.meta.url))
    enfant.on('message', resolve)
    enfant.on('error', reject)
    enfant.send({ niveau, parties, plafond })
  })))
  console.log('niveau | pertes/1000 poses | survie méd. (min) | bloquées | remplissage | effacés/pose | cases/pièce | mains qui effacent | mains remplacées | fin de tour ms | main finit (atteignable) | avec aperçu')
  let precedent = null
  for (const m of resultats) {
    const marche = precedent === null ? '' : ` (x${(m.pertesPourMille / precedent).toFixed(2)})`
    precedent = m.pertesPourMille || precedent
    console.log([
      String(m.niveau).padStart(6), `${m.pertesPourMille.toFixed(2)}${marche}`, `${m.mediane} (${m.min})`, `${m.bloquees}/${m.parties}`, m.remplissage.toFixed(1),
      m.effacesParPose.toFixed(3), m.casesParPiece.toFixed(2), `${(100 * m.mainsQuiEffacent).toFixed(0)} %`, `${m.remplacees}/${m.tours}`, m.moyenneFinDeTour.toFixed(2),
      `${(100 * m.besoinsCouverts).toFixed(0)} % (${(100 * m.besoinsAtteignables).toFixed(0)} %)`, `${(100 * m.besoinsCouvertsApercu).toFixed(0)} %`,
    ].join(' | '))
  }
}
