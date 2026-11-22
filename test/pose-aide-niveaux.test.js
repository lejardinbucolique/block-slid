// Aides des niveaux faciles de block-pose (BS51) : la main qui arrive est toujours posable en
// entier aux niveaux 1 à 6 (le filet du moteur), le tirage donne les pièces qui finissent des
// lignes, et les niveaux difficiles (7 à 10) ne changent pas du tout.
//
// Le solveur est celui de pose-verificateur.js, indépendant du code du tirage.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  REGLAGES,
  NIVEAU_MIN,
  NIVEAU_MAX,
  NIVEAU_DIFFICILE,
  aideDuNiveau,
  CATALOGUE,
  poidsDesPieces,
  nouvellePartie,
  poser,
  piecesJouables,
  positionsPossibles,
  depuisTexte,
} from '../src/pose/index.js'
import { tirageGaranti, mainPosable } from '../src/pose/tirage-garanti.js'
import { suite, poserV, grilleDe } from './pose-verificateur.js'

const H = REGLAGES.lignes
const L = REGLAGES.colonnes
const FACILES = Array.from({ length: NIVEAU_DIFFICILE - NIVEAU_MIN }, (_, i) => NIVEAU_MIN + i)
const DIFFICILES = Array.from({ length: NIVEAU_MAX - NIVEAU_DIFFICILE + 1 }, (_, i) => NIVEAU_DIFFICILE + i)

function generateur(graine) {
  let s = graine >>> 0
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296
}

const damier = Array.from({ length: H }, (_, i) => Array.from({ length: L }, (_, j) => (i + j) % 2 === 0))
const enTexte = (g) => g.map((r) => r.map((v) => (v ? '#' : '.')).join(''))

// --- Le seuil et la force de l'aide ---------------------------------------------------

test('le seuil : le niveau 7 est le premier difficile, l\'aide est pleine au niveau 1 et nulle dès le seuil', () => {
  assert.equal(NIVEAU_DIFFICILE, 7)
  assert.equal(aideDuNiveau(NIVEAU_MIN), 1)
  for (const n of DIFFICILES) assert.equal(aideDuNiveau(n), 0, `niveau ${n}`)
  for (let n = NIVEAU_MIN + 1; n < NIVEAU_DIFFICILE; n++) {
    assert.ok(aideDuNiveau(n) > 0 && aideDuNiveau(n) < aideDuNiveau(n - 1), `niveau ${n}`)
  }
})

// --- Le filet du moteur -------------------------------------------------------------------

test('mainPosable : voit une main posable et une main qui ne l\'est pas, sans épuiser son budget', () => {
  const grille = damier.map((r) => r.map((v) => (v ? 'x' : null)))
  assert.deepEqual(mainPosable(grille, ['bloc.0', 'bloc.0', 'bloc.0']), { posable: true, epuise: false })
  assert.deepEqual(mainPosable(grille, ['carre3.0', 'bloc.0', 'bloc.0']), { posable: false, epuise: false })
})

// Une grille en damier ne laisse que des blocs : l'aperçu de trois carrés de 3x3 est impossible.
function apresLaDernierePose(niveau) {
  const e = depuisTexte({
    rangees: enTexte(damier),
    enCours: ['bloc.0', null, null],
    suivantes: ['carre3.0', 'carre3.0', 'carre3.0'],
    niveau,
    graine: 5,
  })
  return poser(e, 0, 0, 1)
}

test('le filet : aux niveaux 1 à 6, l\'aperçu impossible est remplacé par une main posable', () => {
  for (const niveau of FACILES) {
    const e = apresLaDernierePose(niveau)
    assert.equal(e.dernierCoup.nouveauTour, true)
    assert.equal(e.dernierCoup.mainRemplacee, true, `niveau ${niveau}`)
    const main = e.enCours.map((x) => x.id)
    assert.equal(main.length, 3)
    assert.ok(suite(grilleDe(e), [main]), `niveau ${niveau} : ${main}`)
    // L'aperçu suivant est tiré à partir de la nouvelle main : main puis aperçu se posent.
    assert.ok(suite(grilleDe(e), [main, e.suivantes.map((x) => x.id)]), `niveau ${niveau} : aperçu`)
  }
})

test('le filet : aux niveaux 7 à 10, l\'aperçu devient la main tel quel, même impossible', () => {
  for (const niveau of DIFFICILES) {
    const e = apresLaDernierePose(niveau)
    assert.equal(e.dernierCoup.mainRemplacee, false)
    assert.deepEqual(e.enCours.map((x) => x.id), ['carre3.0', 'carre3.0', 'carre3.0'])
    assert.equal(suite(grilleDe(e), [e.enCours.map((x) => x.id)]), null)
  }
})

test('le filet : un aperçu posable reste la vérité, la main n\'est pas remplacée', () => {
  const e = depuisTexte({
    rangees: [],
    enCours: ['bloc.0', null, null],
    suivantes: ['carre3.0', 'barre5.0', 'barre2.0'],
    niveau: 2,
    graine: 5,
  })
  const apres = poser(e, 0, 0, 0)
  assert.equal(apres.dernierCoup.mainRemplacee, false)
  assert.deepEqual(apres.enCours.map((x) => x.id), ['carre3.0', 'barre5.0', 'barre2.0'])
})

// --- L'invariant : une partie jouée sans suivre le témoin ----------------------------------------

// Un joueur qui pose au hasard, sans jamais suivre la suite de poses du tirage. Rend, pour
// chaque début de tour, si la main est posable en entier d'après le solveur indépendant.
function mainsDeParties(niveau, graines, poses) {
  const alea = generateur(niveau * 31)
  const mains = []
  for (const graine of graines) {
    let e = nouvellePartie({ graine, niveau })
    for (let i = 0; i < poses; i++) {
      if (i === 0 || e.dernierCoup.nouveauTour) mains.push(Boolean(suite(grilleDe(e), [e.enCours.map((x) => x.id)])))
      const jouables = piecesJouables(e)
      if (jouables.length === 0) break
      const index = jouables[Math.floor(alea() * jouables.length)]
      const places = positionsPossibles(e, index)
      const { ligne, col } = places[Math.floor(alea() * places.length)]
      e = poser(e, index, ligne, col)
    }
  }
  return mains
}

test('invariant : aux niveaux 1 à 6, la main est posable en entier à chaque début de tour, quelles que soient les poses', () => {
  let tours = 0
  for (const niveau of FACILES) {
    const mains = mainsDeParties(niveau, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 240)
    assert.ok(mains.length > 60, `niveau ${niveau} : ${mains.length} tours`)
    assert.ok(mains.every(Boolean), `niveau ${niveau} : ${mains.filter((m) => !m).length} mains impossibles sur ${mains.length}`)
    tours += mains.length
  }
  assert.ok(tours > 600, `${tours}`)
})

test('invariant : aux niveaux 7 à 10, on retrouve des impasses (main impossible à poser en entier)', () => {
  const impasses = DIFFICILES.flatMap((niveau) => mainsDeParties(niveau, [1, 2, 3, 4, 5, 6, 7, 8], 240)).filter((m) => !m)
  assert.ok(impasses.length > 0, 'aucune impasse aux niveaux difficiles')
})

// --- Le tirage qui aide à remplir ---------------------------------------------------------

test('le tirage d\'aide : au niveau 1, les pièces qui finissent une ligne sortent bien plus que par la table de poids', () => {
  // Rien que la dernière ligne, à laquelle il manque trois cases à gauche.
  const rangees = ['..........', '..........', '..........', '..........', '..........', '..........', '..........', '..........', '..........', '...#######']
  const grille = rangees.map((r) => [...r].map((c) => (c === '#' ? 'x' : null)))
  const g = rangees.map((r) => [...r].map((c) => c === '#'))
  const avant = g.flat().filter(Boolean).length
  const efface = (id) => {
    for (let l = 0; l < H; l++) {
      for (let k = 0; k < L; k++) {
        const n = poserV(g, id, l, k)
        if (n && n.flat().filter(Boolean).length < avant + 1) return true
      }
    }
    return false
  }
  const utiles = new Set(CATALOGUE.filter((p) => efface(p.id)).map((p) => p.id))
  assert.ok(utiles.has('barre3.0') && !utiles.has('bloc.0') && !utiles.has('barre5.0'))
  const poids = poidsDesPieces(NIVEAU_MIN)
  const part = poids.filter((p) => utiles.has(p.id)).reduce((s, p) => s + p.poids, 0) / poids.reduce((s, p) => s + p.poids, 0)
  const alea = generateur(7)
  let tires = 0
  let utilesTires = 0
  for (let i = 0; i < 300; i++) {
    for (const id of tirageGaranti({ aleatoire: alea, niveau: NIVEAU_MIN, nombre: 3, grille, enCours: [], reglages: REGLAGES })) {
      tires++
      if (utiles.has(id)) utilesTires++
    }
  }
  assert.ok(utilesTires / tires > part * 1.5, `${utilesTires / tires} contre ${part} par la table`)
})

test('le tirage d\'aide : les pièces tirées aux niveaux 1 à 6 sont celles de la table de poids (aucune pièce hors table)', () => {
  const alea = generateur(3)
  for (const niveau of FACILES) {
    const permis = new Set(poidsDesPieces(niveau).filter((p) => p.poids > 0).map((p) => p.id))
    permis.add('bloc.0')
    for (let i = 0; i < 80; i++) {
      for (const id of tirageGaranti({ aleatoire: alea, niveau, nombre: 3, grille: damier.map((r) => r.map(() => null)), enCours: [], reglages: REGLAGES })) {
        assert.ok(permis.has(id), `niveau ${niveau} : ${id}`)
      }
    }
  }
})

// --- Les niveaux difficiles ne changent pas ----------------------------------------------------

// Les mains et aperçus des premiers tours de parties jouées de façon fixe, résumés par un hachage,
// tels que les rendait le jeu avant BS51 (relevés sur c2afe10).
function empreinte(niveau, graine) {
  let e = nouvellePartie({ graine, niveau })
  const vus = []
  for (let n = 0; n < 150 && piecesJouables(e).length > 0; n++) {
    if (e.dernierCoup === null || e.dernierCoup.nouveauTour) vus.push(e.enCours.map((x) => x.id).join('+'), e.suivantes.map((x) => x.id).join('+'))
    const index = piecesJouables(e)[0]
    const places = positionsPossibles(e, index)
    const { ligne, col } = places[(n * 7) % places.length]
    e = poser(e, index, ligne, col)
  }
  let h = 2166136261
  for (const c of vus.join('|')) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  return { tours: vus.length / 2, h }
}

const AVANT = { 7: { h: 1901730792, tours: 113 }, 8: { h: 2877182414, tours: 126 }, 9: { h: 1859127821, tours: 105 }, 10: { h: 1296729093, tours: 88 } }

test('niveaux 7 à 10 : mêmes tirages qu\'avant, pour une même graine', () => {
  for (const niveau of DIFFICILES) {
    let h = 0
    let tours = 0
    for (let g = 11; g <= 30; g++) {
      const r = empreinte(niveau, g)
      h = (Math.imul(h ^ r.h, 16777619) + r.tours) >>> 0
      tours += r.tours
    }
    assert.deepEqual({ h, tours }, AVANT[niveau], `niveau ${niveau}`)
  }
})
