// Coût du tirage de fin de tour de block-pose (BS61) : le robot glouton du simulateur joue des parties, et l'on
// chronomètre chaque pose qui renouvelle la main (poser rend alors la main suivante et en tire l'aperçu).
// Rapporte, par niveau : le nombre de renouvellements, le temps moyen, le médian, le 95e centile, le pire cas,
// la part des renouvellements où le filet remplace la main, et une empreinte de tout ce qui a été tiré
// (même graine, mêmes pièces : l'empreinte ne doit pas changer quand on optimise).
// Usage : [ESSAIS=3] node tirage-fin-de-tour-pose.mjs [niveaux=1,2] [parties=40] [poses=300]
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { REGLAGES, nouvellePartie, poser, reserveInitiale, bloquee, choisirBonus } from '../../src/pose/index.js'
import { meilleurCoup } from '../simulateur-pose.js'

const niveaux = (process.argv[2] ?? '1,2').split(',').map(Number)
const PARTIES = Number(process.argv[3] ?? 40)
const POSES = Number(process.argv[4] ?? 300)
const ESSAIS = Number(process.env.ESSAIS ?? 3)

const ids = (liste) => liste.map((x) => (x ? x.id : '-')).join('+')
const pct = (t, p) => t[Math.min(t.length - 1, Math.floor(t.length * p))]

for (const niveau of niveaux) {
  const temps = []
  let remplacees = 0
  const h = createHash('sha256')
  for (let i = 0; i < PARTIES; i++) {
    let etat = nouvellePartie({ niveau, graine: 1000 * niveau + i + 1, reserve: reserveInitiale(), reglages: REGLAGES })
    h.update(`${ids(etat.enCours)}|${ids(etat.suivantes)};`)
    for (let n = 0; n < POSES; n++) {
      while (etat.choix > 0) etat = choisirBonus(etat, 'changer')
      if (bloquee(etat)) break
      const coup = meilleurCoup(etat)
      const avant = performance.now()
      const apres = poser(etat, coup.index, coup.ligne, coup.col)
      let duree = performance.now() - avant
      // Poser ne modifie pas l'état : un renouvellement se rejoue, et le plus court des essais écarte
      // les interruptions d'un poste chargé.
      if (apres.dernierCoup.nouveauTour) {
        for (let r = 1; r < ESSAIS; r++) {
          const debut = performance.now()
          poser(etat, coup.index, coup.ligne, coup.col)
          duree = Math.min(duree, performance.now() - debut)
        }
      }
      etat = apres
      h.update(`${ids(etat.enCours)}|${ids(etat.suivantes)};`)
      if (etat.dernierCoup.nouveauTour) {
        temps.push(duree)
        if (etat.dernierCoup.mainRemplacee) remplacees++
      }
    }
  }
  temps.sort((a, b) => a - b)
  const moyenne = temps.reduce((s, t) => s + t, 0) / temps.length
  console.log(
    `niveau ${niveau}  ${temps.length} renouvellements  moyenne ${moyenne.toFixed(1)} ms  médian ${pct(temps, 0.5).toFixed(1)}  ` +
    `95e ${pct(temps, 0.95).toFixed(1)}  pire ${temps[temps.length - 1].toFixed(1)}  filet ${(100 * remplacees / temps.length).toFixed(0)} %  ` +
    `empreinte ${h.digest('hex').slice(0, 12)}`,
  )
}
