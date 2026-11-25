// Calage des défis de block-pose, niveau par niveau (BS57) : un défi « X points en N coups » doit
// être plus dur à réussir quand le niveau monte. Le robot glouton (simulateur-pose.js) joue des
// parties à chaque niveau ; on relève les points marqués par fenêtres de N poses de suite (un défi
// qui finit, réussi ou raté, est aussitôt remplacé par un autre), puis, pour une part de réussite
// visée par niveau, le nombre de points qui la donne.
//
//   node tools/calage-defis-pose.js [parties=60] [poses=300] [niveaux=1,...,10] [coups=8] [reussites=35,...,3]
//
// `reussites` : la part (en %) de défis réussis visée à chaque niveau, une valeur par niveau.

import { fileURLToPath } from 'node:url'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { NIVEAU_MIN, NIVEAU_MAX } from '../src/pose/index.js'
import { jouer } from './simulateur-pose.js'

// Les points gagnés par chaque fenêtre de `coups` poses de suite, sur `parties` parties.
export function fenetres({ niveau, parties, poses, coups }) {
  const gains = []
  for (let i = 0; i < parties; i++) {
    let debut = 0
    let n = 0
    jouer({
      niveau, graine: 7000 * niveau + i + 1, poses,
      suivre: (etat) => {
        if (++n % coups === 0) { gains.push(etat.score - debut); debut = etat.score }
      },
    })
  }
  return gains.sort((a, b) => a - b)
}

// Les points qu'une fenêtre atteint dans `part` (0 à 1) des cas.
export const quantile = (tries, part) => tries[Math.min(tries.length - 1, Math.floor((1 - part) * tries.length))]

if (!isMainThread) {
  parentPort.postMessage(fenetres(workerData))
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const parties = Number(process.argv[2] ?? 60)
  const poses = Number(process.argv[3] ?? 300)
  const niveaux = process.argv[4] ? process.argv[4].split(',').map(Number) : Array.from({ length: NIVEAU_MAX - NIVEAU_MIN + 1 }, (_, i) => NIVEAU_MIN + i)
  const coups = Number(process.argv[5] ?? 8)
  const visees = process.argv[6] ? process.argv[6].split(',').map(Number) : null
  const resultats = await Promise.all(niveaux.map((niveau) => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { niveau, parties, poses, coups } })
    w.on('message', resolve)
    w.on('error', reject)
  })))
  console.log(`niveau | fenêtres de ${coups} coups | points atteints par 50 % / 25 % / 10 % / 5 % / 2 % des fenêtres${visees ? ' | points pour la part visée' : ''}`)
  niveaux.forEach((niveau, i) => {
    const t = resultats[i]
    const ligne = [50, 25, 10, 5, 2].map((p) => quantile(t, p / 100))
    const vise = visees ? ` | ${quantile(t, visees[i] / 100)} (${visees[i]} %)` : ''
    console.log(`${String(niveau).padStart(6)} | ${t.length} | ${ligne.join(' / ')}${vise}`)
  })
}
