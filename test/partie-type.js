// Parties jouées par programme, déterministes, pour comparer des versions du moteur.
import { REGLAGES, nouvellePartie, jouer, deplacerAVenir, deplacementsPossibles, versTexte } from '../src/moteur/index.js'

// Les parties de référence (points normaux, tirage) se jouent sans figures : le
// tirage des figures consomme le hasard de la partie (BS10).
export const SANS_FIGURES = Object.freeze({ ...REGLAGES, figures: null })

function prng(graine) {
  let s = graine >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), s | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function empreinte(texte) {
  let h = 2166136261
  for (let i = 0; i < texte.length; i++) h = Math.imul(h ^ texte.charCodeAt(i), 16777619) >>> 0
  return h
}

// Joue une partie de la graine donnée ; rend, coup après coup, l'état et son
// résumé (grille, score, file à venir, hasard).
export function* partie(graine, maxCoups = 150, reglages = SANS_FIGURES) {
  const alea = prng(graine * 7919 + 13)
  let etat = nouvellePartie({ graine, reglages })
  for (let n = 0; n < maxCoups && !etat.finie; n++) {
    // Un déplacement de la première ligne à venir au plus par tour, comme avant BS17 :
    // les parties de référence (reference-parties.json) restent ainsi les mêmes,
    // ce qui prouve que le tirage n'a pas changé.
    if (alea() < 0.3) {
      const b = etat.aVenir[0][Math.floor(alea() * etat.aVenir[0].length)]
      const p = deplacementsPossibles(etat, b.id)
      const dx = alea() < 0.5 ? -p.gauche : p.droite
      const suivant = dx ? deplacerAVenir(etat, b.id, dx) : null
      if (suivant) etat = suivant
    }
    const coups = []
    for (const b of etat.blocs) {
      const p = deplacementsPossibles(etat, b.id)
      if (p.gauche) coups.push([b.id, -1 - Math.floor(alea() * p.gauche)])
      if (p.droite) coups.push([b.id, 1 + Math.floor(alea() * p.droite)])
    }
    if (!coups.length) return
    const [id, dx] = coups[Math.floor(alea() * coups.length)]
    const avant = etat
    etat = jouer(etat, id, dx)
    yield { avant, apres: etat, id, dx }
  }
}

export function resume(etat) {
  const lignes = (l) => l.map((b) => `${b.col}:${b.largeur}`).join(',')
  return [
    etat.score, etat.coups, etat.finie, etat.hasard, etat.prochainId,
    versTexte(etat).join('/'),
    etat.aVenir.map(lignes).join('|'),
    etat.dernierCoup.lignesEffacees, etat.dernierCoup.points, etat.dernierCoup.secours, etat.dernierCoup.defaite,
  ].join(';')
}
