// Vérificateur indépendant de la garantie de pose de block-pose (BS41), partagé par les
// tests du tirage et des bonus : grille en tableaux de booléens (le tirage travaille en
// masques de bits), recherche exhaustive, pose et effacement réécrits. Il ne partage
// avec le moteur que le catalogue des pièces, qui est la donnée.

import { REGLAGES, piece } from '../src/pose/index.js'

const H = REGLAGES.lignes
const L = REGLAGES.colonnes

export const grilleDe = (etat) => etat.grille.map((r) => r.map((v) => v !== null))

// La grille après la pose, lignes et colonnes pleines effacées en même temps, ou null.
export function poserV(g, id, l, k) {
  const p = piece(id)
  if (l < 0 || k < 0 || l + p.hauteur > H || k + p.largeur > L) return null
  if (p.cases.some((c) => g[l + c.ligne][k + c.col])) return null
  const n = g.map((r) => [...r])
  for (const c of p.cases) n[l + c.ligne][k + c.col] = true
  const lignes = n.map((r, i) => (r.every(Boolean) ? i : -1)).filter((i) => i >= 0)
  const colonnes = n[0].map((_, j) => (n.every((r) => r[j]) ? j : -1)).filter((j) => j >= 0)
  for (let i = 0; i < H; i++) for (let j = 0; j < L; j++) if (lignes.includes(i) || colonnes.includes(j)) n[i][j] = false
  return n
}

// Une suite de poses qui place toutes les pièces du premier groupe (dans n'importe quel
// ordre), puis toutes celles du deuxième, etc. ; null s'il n'y en a pas. Exhaustif :
// pour chaque ordre, chaque place, avec l'effacement entre deux poses. Les états déjà
// perdus sont retenus pour ne pas les refaire.
// Rend [{ groupe, index, id, ligne, col }] (index : la place dans son groupe).
export function suite(g, groupes) {
  const perdus = new Set()
  function pas(grille, gi, restant) {
    if (restant.length === 0) {
      if (gi + 1 === groupes.length) return []
      return pas(grille, gi + 1, groupes[gi + 1].map((_, i) => i))
    }
    const cle = `${gi}|${restant}|${grille.map((r) => r.map(Number).join('')).join('/')}`
    if (perdus.has(cle)) return null
    for (const i of restant) {
      const id = groupes[gi][i]
      for (let l = 0; l < H; l++) {
        for (let k = 0; k < L; k++) {
          const n = poserV(grille, id, l, k)
          if (!n) continue
          const reste = pas(n, gi, restant.filter((x) => x !== i))
          if (reste) return [{ groupe: gi, index: i, id, ligne: l, col: k }, ...reste]
        }
      }
    }
    perdus.add(cle)
    return null
  }
  return pas(g, 0, groupes[0].map((_, i) => i))
}
