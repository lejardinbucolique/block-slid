// Simulateur de calage des gains de block-pose (BS43) : un robot glouton joue des centaines
// de parties à chaque niveau et rapporte, pour caler les constantes de src/pose/gains.js :
// la fréquence de chaque gain, le nombre moyen de pièces posées par bonus gagné (cible :
// environ quarante), le taux de réussite des défis et le sort des cases surprises.
//
//   node tools/simulateur-pose.js [parties=200] [poses=400] [niveaux=1,5,10] [gains]
//
// `gains` : un JSON qui remplace des constantes de GAINS pour l'essai, sans toucher au code,
// par exemple '{"palier":100000,"surprise":{"frequence":0.03,"compte":[8,8,8,8,8,8,8,8,8,8]}}'.
//
// Le robot maximise ses points à chaque coup (à égalité, il préfère la pose la plus
// compacte) ; bloqué, il emploie un bonus de sa réserve s'il en a un, et choisit
// « changer » pour un gain au choix. C'est un joueur moyen, pas un joueur qui prépare ses
// coups : les nombres sont des ordres de grandeur pour caler, pas des promesses.
// Une partie s'arrête perdue, ou après `poses` pièces posées (le jeu peut durer très longtemps).

import { fileURLToPath } from 'node:url'
import {
  REGLAGES, GAINS, SORTES, CAUSES, NIVEAU_MIN, NIVEAU_MAX, reserveInitiale,
  nouvellePartie, poser, positionsPossibles, piecesJouables, perdue, bloquee,
  supprimerPiece, tournerPiece, changerPieces, annulerCoup, choisirBonus, bonusUtiles, piece,
} from '../src/pose/index.js'

// Les points d'une pose, d'après la formule de reglages.js, sans la jouer (la jouer tire
// de nouvelles pièces quand le tour finit, ce qui coûterait cher pour chaque candidat).
function evaluer(etat, id, ligne, col) {
  const { lignes: H, colonnes: L, pointsParCase, pointsParCaseEffacee, plafondSerie } = etat.reglages
  const p = piece(id)
  const g = etat.grille.map((r) => r.map((v) => v !== null))
  for (const c of p.cases) g[ligne + c.ligne][col + c.col] = true
  const pleinesL = g.flatMap((r, i) => (r.every(Boolean) ? [i] : []))
  const pleinesC = g[0].flatMap((_, j) => (g.every((r) => r[j]) ? [j] : []))
  let disparues = 0
  for (let i = 0; i < H; i++) for (let j = 0; j < L; j++) if (pleinesL.includes(i) || pleinesC.includes(j)) disparues++
  const effaces = pleinesL.length + pleinesC.length
  const mult = effaces > 0 ? Math.min(etat.serie + 1, plafondSerie) : 1
  // Compacité : les côtés des cases posées qui touchent un bord ou une case occupée.
  let contact = 0
  for (const c of p.cases) {
    for (const [dl, dk] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const i = ligne + c.ligne + dl
      const j = col + c.col + dk
      const dedans = p.cases.some((q) => ligne + q.ligne === i && col + q.col === j)
      if (!dedans && (i < 0 || j < 0 || i >= H || j >= L || etat.grille[i][j] !== null)) contact++
    }
  }
  return { points: mult * (p.cases.length * pointsParCase + disparues * pointsParCaseEffacee * effaces), contact }
}

// Le meilleur coup du robot : { index, ligne, col, points } ou null.
function meilleurCoup(etat) {
  let meilleur = null
  for (const index of piecesJouables(etat)) {
    for (const { ligne, col } of positionsPossibles(etat, index)) {
      const { points, contact } = evaluer(etat, etat.enCours[index].id, ligne, col)
      if (!meilleur || points > meilleur.points || (points === meilleur.points && contact > meilleur.contact)) {
        meilleur = { index, ligne, col, points, contact }
      }
    }
  }
  return meilleur
}

// Sort d'une partie bloquée : un bonus utile de la réserve, ou null (partie perdue).
function debloquer(etat) {
  const utiles = bonusUtiles(etat)
  const premier = etat.enCours.findIndex(Boolean)
  for (const sorte of ['changer', 'supprimer', 'annuler', 'tourner']) {
    if (!utiles.includes(sorte)) continue
    if (sorte === 'changer') return changerPieces(etat)
    if (sorte === 'supprimer') return supprimerPiece(etat, premier)
    if (sorte === 'annuler') return annulerCoup(etat)
    for (let i = 0; i < etat.enCours.length; i++) {
      const e = etat.enCours[i] && tournerPiece(etat, i)
      if (e) return e
    }
  }
  return null
}

// Une partie du robot, rend ses mesures.
export function jouer({ niveau, graine, poses, reglages = REGLAGES }) {
  let etat = nouvellePartie({ niveau, graine, reserve: reserveInitiale(), reglages })
  const m = {
    poses: 0, bonus: 0, perdue: false, score: 0,
    gains: Object.fromEntries(CAUSES.map((c) => [c, 0])),
    defisReussis: 0, defisRates: 0, surprises: { posee: 0, gagnee: 0, perdue: 0 },
  }
  while (m.poses < poses) {
    // Un gain au choix en attente : « changer », la sorte qui sert le plus.
    while (etat.choix > 0) etat = choisirBonus(etat, 'changer')
    if (bloquee(etat)) {
      const suite = perdue(etat) ? null : debloquer(etat)
      if (!suite) { m.perdue = true; break }
      etat = suite
      continue
    }
    const coup = meilleurCoup(etat)
    const apres = poser(etat, coup.index, coup.ligne, coup.col)
    if (apres.dernierCoup.points !== coup.points) throw new Error(`score évalué ${coup.points}, joué ${apres.dernierCoup.points}`)
    etat = apres
    m.poses++
    const d = etat.dernierCoup
    for (const g of d.gains) {
      m.gains[g.cause]++
      m.bonus++
    }
    if (d.defiFini === 'reussi') m.defisReussis++
    if (d.defiFini === 'rate') m.defisRates++
    if (d.surprise) m.surprises[d.surprise]++
  }
  m.score = etat.score
  return m
}

// Les mesures de `parties` parties à ce niveau, additionnées.
export function mesurerNiveau({ niveau, parties, poses, reglages = REGLAGES }) {
  const t = {
    niveau, parties, poses: 0, bonus: 0, perdues: 0, score: 0,
    gains: Object.fromEntries(CAUSES.map((c) => [c, 0])),
    defisReussis: 0, defisRates: 0, surprises: { posee: 0, gagnee: 0, perdue: 0 },
  }
  for (let i = 0; i < parties; i++) {
    const m = jouer({ niveau, graine: 1000 * niveau + i + 1, poses, reglages })
    t.poses += m.poses
    t.bonus += m.bonus
    t.score += m.score
    if (m.perdue) t.perdues++
    for (const c of CAUSES) t.gains[c] += m.gains[c]
    t.defisReussis += m.defisReussis
    t.defisRates += m.defisRates
    for (const k of Object.keys(t.surprises)) t.surprises[k] += m.surprises[k]
  }
  t.posesParBonus = t.bonus ? t.poses / t.bonus : Infinity
  const defis = t.defisReussis + t.defisRates
  t.tauxDefi = defis ? t.defisReussis / defis : 0
  return t
}

export function rapport(t) {
  const par = (n) => (n ? (t.poses / n).toFixed(0) : '-')
  const lignes = [
    `niveau ${String(t.niveau).padStart(2)} : ${t.parties} parties, ${t.poses} pièces, ${t.perdues} perdues, ${(t.poses / t.parties).toFixed(0)} pièces par partie`,
    `  bonus : ${t.bonus}, une pièce posée sur ${t.posesParBonus === Infinity ? '-' : t.posesParBonus.toFixed(1)} en moyenne`,
    `  par cause (une pièce sur) : ${CAUSES.map((c) => `${c} ${t.gains[c]} (${par(t.gains[c])})`).join(', ')}`,
    `  défis : ${t.defisReussis} réussis, ${t.defisRates} ratés, taux de réussite ${(100 * t.tauxDefi).toFixed(0)} %`,
    `  surprises : ${t.surprises.posee} posées, ${t.surprises.gagnee} gagnées, ${t.surprises.perdue} perdues`,
  ]
  return lignes.join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const parties = Number(process.argv[2] ?? 200)
  const poses = Number(process.argv[3] ?? 400)
  const niveaux = process.argv[4] ? process.argv[4].split(',').map(Number) : [1, 5, 10]
  const reglages = process.argv[5] ? { ...REGLAGES, gains: { ...GAINS, ...JSON.parse(process.argv[5]) } } : REGLAGES
  for (const niveau of niveaux) {
    if (!(niveau >= NIVEAU_MIN && niveau <= NIVEAU_MAX)) throw new RangeError(`niveau hors de ${NIVEAU_MIN} à ${NIVEAU_MAX} : ${niveau}`)
    console.log(rapport(mesurerNiveau({ niveau, parties, poses, reglages })))
  }
  console.log(`sortes de bonus : ${SORTES.join(', ')} ; cible : une pièce posée sur 40 environ`)
}
