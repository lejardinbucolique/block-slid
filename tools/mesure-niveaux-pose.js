// Mesure de la difficulté ressentie des niveaux de block-pose (BS51) : un robot glouton, sans
// bonus et sans regard sur l'aperçu, joue des parties à chaque niveau et rapporte la survie,
// (aux niveaux 1 et 2 où l'aperçu se joue, BS58, le robot pose les six pièces comme elles viennent),
// le remplissage moyen de la grille, les effacements par pose, la part de mains dont une pose
// efface quelque chose, la taille des pièces et le temps de tirage. Depuis BS62, aussi le vrai besoin à l'ouverture de
// chaque tour : parmi les lignes et colonnes à qui il manque au plus trois cases, la part que la main termine (puis la
// main et l'aperçu), à côté de ce qu'une main du catalogue en terminerait au mieux.
//
//   node tools/mesure-niveaux-pose.js [parties=60] [plafond=1500] [niveaux=1,2,3,4,5,6,7,10]

import { fileURLToPath } from 'node:url'
import { nouvellePartie, poser, bloquee, piece, CATALOGUE, positionsPossibles, piecesJouables } from '../src/pose/index.js'
import { meilleurCoup } from './simulateur-pose.js'

const mediane = (t) => [...t].sort((a, b) => a - b)[Math.floor(t.length / 2)]

// Une pose de la main efface-t-elle quelque chose, à l'ouverture du tour ? Seule la main compte,
// pas l'aperçu qui se joue aux niveaux 1 et 2 (BS58).
function mainQuiEfface(etat) {
  for (const index of piecesJouables(etat).filter((i) => i < etat.reglages.piecesParTour)) {
    for (const { ligne, col } of positionsPossibles(etat, index)) {
      const e = poser(etat, index, ligne, col)
      if (e.dernierCoup.lignes.length + e.dernierCoup.colonnes.length > 0) return true
    }
  }
  return false
}

// Le vrai besoin (BS62) : les lignes et colonnes à qui il manque au plus MANQUE_MAX cases. `finissables`
// rend, pour une pièce, celles qu'une de ses poses termine (toutes leurs cases libres comblées) ; calculé
// à la main sur la grille, sans rien emprunter au tirage qu'on mesure.
const MANQUE_MAX = 3

function finissables(grille, id) {
  const p = piece(id)
  const H = grille.length
  const L = grille[0].length
  const libresL = grille.map((r) => r.filter((v) => v === null).length)
  const libresC = grille[0].map((_, j) => grille.filter((r) => r[j] === null).length)
  const trouves = new Set()
  for (let l = 0; l + p.hauteur <= H; l++) {
    for (let k = 0; k + p.largeur <= L; k++) {
      if (!p.cases.every((c) => grille[l + c.ligne][k + c.col] === null)) continue
      for (let r = 0; r < p.hauteur; r++) {
        const n = p.cases.filter((c) => c.ligne === r).length
        if (n === libresL[l + r] && n <= MANQUE_MAX) trouves.add(`l${l + r}`)
      }
      for (let q = 0; q < p.largeur; q++) {
        const n = p.cases.filter((c) => c.col === q).length
        if (n === libresC[k + q] && n <= MANQUE_MAX) trouves.add(`c${k + q}`)
      }
    }
  }
  return trouves
}

// Au début d'un tour : { possibles, couverts, atteignables, couvertsApercu } : les lignes et colonnes
// qu'une pièce du catalogue pourrait terminer, celles qu'une pièce de la main termine, le plus qu'une
// main de même taille prise au catalogue en terminerait (au mieux, glouton), puis celles qu'une pièce de
// la main ou de l'aperçu termine (là où l'aperçu se joue).
function mesureBesoin(etat, catalogue) {
  const grille = etat.grille
  const memo = new Map()
  const de = (id) => {
    if (!memo.has(id)) memo.set(id, finissables(grille, id))
    return memo.get(id)
  }
  const possibles = new Set()
  const parPiece = new Map()
  for (const p of catalogue) {
    const s = de(p.id)
    parPiece.set(p.id, s)
    for (const x of s) possibles.add(x)
  }
  const main = etat.enCours.filter(Boolean).map((x) => x.id)
  const apercu = etat.suivantes.filter(Boolean).map((x) => x.id)
  const union = (ids) => new Set(ids.flatMap((id) => [...de(id)]))
  const couverts = union(main).size
  const couvertsApercu = union([...main, ...apercu]).size
  // Le plus qu'une main de `main.length` pièces du catalogue termine : glouton.
  const pris = new Set()
  for (let i = 0; i < main.length; i++) {
    let meilleur = 0
    let choisi = null
    for (const s of parPiece.values()) {
      const n = [...s].filter((x) => !pris.has(x)).length
      if (n > meilleur) { meilleur = n; choisi = s }
    }
    if (!choisi) break
    for (const x of choisi) pris.add(x)
  }
  return { possibles: possibles.size, couverts, atteignables: pris.size, couvertsApercu }
}

export function mesurer({ niveau, parties, plafond }) {
  const survies = []
  const t = { bloquees: 0, poses: 0, remplissage: 0, effaces: 0, cases: 0, mains: 0, mainsQuiEffacent: 0, tirage: 0, finsDeTour: 0, dureeFinsDeTour: 0, remplacees: 0, besoins: 0, couverts: 0, atteignables: 0, couvertsApercu: 0, toursAvecBesoin: 0, toursCouverts: 0, toursMesures: 0 }
  for (let i = 0; i < parties; i++) {
    let etat = nouvellePartie({ niveau, graine: 1000 * niveau + i + 1 })
    let poses = 0
    while (poses < plafond) {
      if (bloquee(etat)) { t.bloquees++; break }
      if (etat.enCours.every((x) => x !== null)) {
        t.mains++
        if (mainQuiEfface(etat)) t.mainsQuiEffacent++
      }
      // Le besoin se mesure à l'ouverture du tour : aux niveaux où l'aperçu se joue, le robot peut poser
      // des pièces de l'aperçu avant celles de la main, et la grille change sous une main entière.
      if ((poses === 0 || etat.dernierCoup.nouveauTour) && etat.enCours.every((x) => x !== null)) {
        t.toursMesures++
        const b = mesureBesoin(etat, CATALOGUE)
        t.besoins += b.possibles
        t.couverts += b.couverts
        t.atteignables += b.atteignables
        t.couvertsApercu += b.couvertsApercu
        if (b.possibles > 0) { t.toursAvecBesoin++; if (b.couverts > 0) t.toursCouverts++ }
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
    niveau, mediane: mediane(survies), min: Math.min(...survies), bloquees: t.bloquees, parties, poses: t.poses,
    // Les pertes pour mille poses : la mesure de difficulté la plus fine (la médiane plafonne dès que
    // la moitié des parties va au bout), à comparer d'un niveau au suivant (BS57).
    pertesPourMille: (1000 * t.bloquees) / t.poses,
    remplissage: t.remplissage / t.poses, effacesParPose: t.effaces / t.poses, casesParPiece: t.cases / t.poses,
    mainsQuiEffacent: t.mainsQuiEffacent / t.mains,
    // BS62 : la part des lignes et colonnes presque pleines (au plus trois cases à combler) qu'une pièce
    // du catalogue pourrait terminer et que la main termine (puis la main et l'aperçu), ce que la main
    // pouvait atteindre au mieux, et la part des tours avec un besoin où la main en termine au moins un.
    besoinsCouverts: t.couverts / t.besoins, besoinsAtteignables: t.atteignables / t.besoins, besoinsCouvertsApercu: t.couvertsApercu / t.besoins,
    toursAvecBesoin: t.toursAvecBesoin / t.toursMesures, toursCouverts: t.toursCouverts / (t.toursAvecBesoin || 1), besoinsParTour: t.besoins / t.toursMesures,
    pirePose: t.tirage, moyenneFinDeTour: t.dureeFinsDeTour / t.finsDeTour, remplacees: t.remplacees, tours: t.finsDeTour,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const parties = Number(process.argv[2] ?? 60)
  const plafond = Number(process.argv[3] ?? 1500)
  const niveaux = process.argv[4] ? process.argv[4].split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7, 10]
  console.log('niveau | survie méd. (min) | bloquées | pertes/1000 poses | remplissage | effacés/pose | cases/pièce | mains qui effacent | fin de tour moy. ms | max ms | mains remplacées | besoins/tour | main finit (atteignable) | avec aperçu | tours avec besoin finis')
  for (const niveau of niveaux) {
    const m = mesurer({ niveau, parties, plafond })
    console.log([
      String(m.niveau).padStart(6), `${m.mediane} (${m.min})`, `${m.bloquees}/${m.parties}`, m.pertesPourMille.toFixed(2), m.remplissage.toFixed(1),
      m.effacesParPose.toFixed(3), m.casesParPiece.toFixed(2), `${(100 * m.mainsQuiEffacent).toFixed(0)} %`, m.moyenneFinDeTour.toFixed(2), m.pirePose.toFixed(1), `${m.remplacees}/${m.tours}`,
      m.besoinsParTour.toFixed(2), `${(100 * m.besoinsCouverts).toFixed(0)} % (${(100 * m.besoinsAtteignables).toFixed(0)} %)`, `${(100 * m.besoinsCouvertsApercu).toFixed(0)} %`, `${(100 * m.toursCouverts).toFixed(0)} %`,
    ].join(' | '))
  }
}
