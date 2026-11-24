// Aides des niveaux faciles de block-pose (BS51) : la main qui arrive est toujours posable en
// entier aux niveaux 1 à 6 (le filet du moteur), le tirage donne les pièces qui finissent des
// lignes, et la garantie d'effacement de BS55 : la main qui arrive offre une pièce qui efface quand la
// grille le permet. Les niveaux difficiles (7 à 10) n'ont aucune de ces aides.
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
  changerNiveau,
  annulerCoup,
  exporterPartie,
  importerPartie,
  nouveauDefi,
  reserveInitiale,
} from '../src/pose/index.js'
import { tirageGaranti, mainPosable, mainEfface } from '../src/pose/tirage-garanti.js'
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
// chaque début de tour, si la main est posable en entier d'après le solveur indépendant (aux niveaux 1 et 2,
// où l'aperçu se joue, BS58, la main peut compter moins de trois pièces : celles qui restent).
function mainsDeParties(niveau, graines, poses) {
  const alea = generateur(niveau * 31)
  const mains = []
  for (const graine of graines) {
    let e = nouvellePartie({ graine, niveau })
    for (let i = 0; i < poses; i++) {
      if (i === 0 || e.dernierCoup.nouveauTour) mains.push(Boolean(suite(grilleDe(e), [e.enCours.filter(Boolean).map((x) => x.id)])))
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
  assert.ok(tours > 400, `${tours}`)
})

test('invariant : aux niveaux 7 à 10, on retrouve des impasses (main impossible à poser en entier)', () => {
  const impasses = DIFFICILES.flatMap((niveau) => mainsDeParties(niveau, [1, 2, 3, 4, 5, 6, 7, 8], 240)).filter((m) => !m)
  assert.ok(impasses.length > 0, 'aucune impasse aux niveaux difficiles')
})

// --- Le tirage qui aide à remplir ---------------------------------------------------------

// Une grille où il ne manque que trois cases, à gauche de la dernière rangée.
const RANGEES_TROIS_MANQUANTES = ['..........', '..........', '..........', '..........', '..........', '..........', '..........', '..........', '..........', '...#######']
const RANGEES_DEUX_MANQUANTES = ['..........', '..........', '..........', '..........', '..........', '..........', '..........', '..........', '..........', '########..']
const grilleDeTexte = (rangees) => rangees.map((r) => [...r].map((c) => (c === '#' ? 'x' : null)))

// Les pièces du catalogue qui effacent la dernière rangée de cette grille (en la comblant d'une pose).
function piecesQuiEffacent(rangees) {
  const g = rangees.map((r) => [...r].map((c) => c === '#'))
  const avant = g.flat().filter(Boolean).length
  return new Set(CATALOGUE.filter((p) => {
    for (let l = 0; l < H; l++) {
      for (let k = 0; k < L; k++) {
        const n = poserV(g, p.id, l, k)
        if (n && n.flat().filter(Boolean).length < avant + 1) return true
      }
    }
    return false
  }).map((p) => p.id))
}

test("le tirage d'aide : au niveau 1, les mains où une pièce finit une ligne sont bien plus nombreuses que par la table de poids", () => {
  const grille = grilleDeTexte(RANGEES_TROIS_MANQUANTES)
  const utiles = piecesQuiEffacent(RANGEES_TROIS_MANQUANTES)
  assert.ok(utiles.has('barre3.0') && !utiles.has('bloc.0') && !utiles.has('barre5.0'))
  const poids = poidsDesPieces(NIVEAU_MIN)
  // Chance, par la table seule, qu'une main de trois pièces en compte au moins une d'utile.
  const part = poids.filter((p) => utiles.has(p.id)).reduce((s, p) => s + p.poids, 0) / poids.reduce((s, p) => s + p.poids, 0)
  const parLaTable = 1 - (1 - part) ** 3
  const alea = generateur(7)
  let avecUtile = 0
  for (let i = 0; i < 300; i++) {
    const ids = tirageGaranti({ aleatoire: alea, niveau: NIVEAU_MIN, nombre: 3, grille, enCours: [], reglages: REGLAGES })
    if (ids.some((id) => utiles.has(id))) avecUtile++
  }
  assert.ok(avecUtile / 300 > Math.min(0.95, parLaTable + 0.1), `${avecUtile / 300} des mains contre ${parLaTable} par la table`)
})

test("garantie d'effacement : avec `exigerEfface`, chaque main des niveaux faciles a une pièce qui efface, à toutes les places", () => {
  const grille = grilleDeTexte(RANGEES_TROIS_MANQUANTES)
  const utiles = piecesQuiEffacent(RANGEES_TROIS_MANQUANTES)
  const places = new Set()
  for (const niveau of FACILES) {
    const alea = generateur(40 + niveau)
    for (let i = 0; i < 120; i++) {
      const ids = tirageGaranti({ aleatoire: alea, niveau, nombre: 3, grille, enCours: [], reglages: REGLAGES, exigerEfface: true })
      assert.ok(ids.some((id) => utiles.has(id)), `niveau ${niveau} : ${ids}`)
      ids.forEach((id, j) => { if (utiles.has(id)) places.add(j) })
    }
  }
  // La pièce qui efface ne tombe pas toujours à la même place de la main.
  assert.equal(places.size, 3)
})

test("garantie d'effacement : l'orientation utile compte, pas seulement la forme", () => {
  // La dernière rangée n'a plus qu'une case libre, en deuxième colonne : le L et le J qui la
  // comblent y posent un pied, dans une seule de leurs orientations. Une main garantie ne
  // porte que des pièces posables, et ses pièces qui effacent sont dans l'orientation qui convient.
  const rangees = ['..........', '..........', '..........', '..........', '..........', '..........', '..........', '..........', '#.........', '#.########']
  const grille = grilleDeTexte(rangees)
  const utiles = piecesQuiEffacent(rangees)
  assert.ok(utiles.has('l.1') || utiles.has('l.0') || utiles.has('l.2') || utiles.has('l.3'))
  const alea = generateur(11)
  let mainsAvecUtile = 0
  for (let i = 0; i < 200; i++) {
    const ids = tirageGaranti({ aleatoire: alea, niveau: NIVEAU_MIN, nombre: 3, grille, enCours: [], reglages: REGLAGES, exigerEfface: true })
    if (ids.some((id) => utiles.has(id))) mainsAvecUtile++
    // Une pièce de la forme d'un L qui n'efface rien ici peut sortir, mais seulement comme pièce posable.
    for (const id of ids) assert.ok(mainPosable(grille, [id]).posable, id)
  }
  assert.equal(mainsAvecUtile, 200)
})

test("la garantie d'effacement dans le moteur : au niveau 1, la main qui arrive efface quand la grille le permet", () => {
  // Il manque deux cases à droite de la dernière rangée : la main prévue (des barres de 5)
  // n'efface rien, le moteur la remplace par une main qui efface.
  const e = depuisTexte({
    rangees: RANGEES_DEUX_MANQUANTES,
    enCours: ['bloc.0', null, null],
    suivantes: ['barre5.0', 'barre5.0', 'barre5.0'],
    niveau: 1,
    graine: 5,
  })
  // Le bloc posé loin de la rangée : rien n'est effacé, la grille reste la même.
  const apres = poser(e, 0, 0, 0)
  assert.equal(apres.dernierCoup.nouveauTour, true)
  assert.equal(apres.dernierCoup.mainRemplacee, true)
  const main = apres.enCours.map((x) => x.id)
  assert.ok(mainEfface(apres.grille, main, main).efface, `main ${main}`)
  assert.ok(suite(grilleDe(apres), [main]), 'et elle reste posable en entier')
})

test("la garantie d'effacement : une main qui efface déjà est gardée telle qu'elle est", () => {
  const e = depuisTexte({
    rangees: RANGEES_DEUX_MANQUANTES,
    enCours: ['bloc.0', null, null],
    suivantes: ['barre2.0', 'barre5.0', 'barre5.0'],
    niveau: 1,
    graine: 5,
  })
  const apres = poser(e, 0, 0, 0)
  assert.equal(apres.dernierCoup.mainRemplacee, false)
  assert.deepEqual(apres.enCours.map((x) => x.id), ['barre2.0', 'barre5.0', 'barre5.0'])
})

test("la garantie d'effacement : aux niveaux difficiles, la main n'est jamais remplacée pour cela", () => {
  for (const niveau of DIFFICILES) {
    const e = depuisTexte({ rangees: RANGEES_DEUX_MANQUANTES, enCours: ['bloc.0', null, null], suivantes: ['barre5.0', 'barre5.0', 'barre5.0'], niveau, graine: 5 })
    const apres = poser(e, 0, 0, 0)
    assert.equal(apres.dernierCoup.mainRemplacee, false, `niveau ${niveau}`)
  }
})

test("mainEfface : dit si une pièce de la main efface, et si l'une de celles du tirage le ferait", () => {
  const grille = grilleDeTexte(RANGEES_TROIS_MANQUANTES)
  assert.deepEqual(mainEfface(grille, ['barre3.0', 'bloc.0'], ['barre3.0']), { efface: true, possible: true })
  assert.deepEqual(mainEfface(grille, ['barre5.0', 'bloc.0'], ['barre3.0']), { efface: false, possible: true })
  assert.deepEqual(mainEfface(grille, ['barre5.0'], ['barre5.0']), { efface: false, possible: false })
})

test('au niveau 1, bien plus de mains qui effacent qu\'au niveau 10, pour un même joueur', () => {
  const part = (niveau) => {
    const alea = generateur(niveau * 17)
    let mains = 0
    let efface = 0
    for (let graine = 1; graine <= 8; graine++) {
      let e = nouvellePartie({ graine, niveau })
      for (let i = 0; i < 120 && piecesJouables(e).length > 0; i++) {
        if (i === 0 || e.dernierCoup.nouveauTour) {
          mains++
          const main = e.enCours.map((x) => x.id)
          if (mainEfface(e.grille, main, main).efface) efface++
        }
        const index = piecesJouables(e)[0]
        const places = positionsPossibles(e, index)
        const { ligne, col } = places[Math.floor(alea() * places.length)]
        e = poser(e, index, ligne, col)
      }
    }
    return efface / mains
  }
  assert.ok(part(1) > part(10) + 0.1, `${part(1)} contre ${part(10)}`)
})

// --- Le niveau change en cours de partie (BS55) ----------------------------------------------

test("changerNiveau : vaut tout de suite, sans toucher aux pièces en main ni à l'aperçu", () => {
  const e = nouvellePartie({ graine: 9, niveau: 7 })
  const f = changerNiveau(e, 1)
  assert.equal(f.niveau, 1)
  assert.equal(e.niveau, 7, "l'état d'avant n'est pas modifié")
  assert.deepEqual(f.enCours, e.enCours)
  assert.deepEqual(f.suivantes, e.suivantes)
  assert.deepEqual(f.grille, e.grille)
  assert.equal(changerNiveau(e, 7), e, 'le même niveau ne change rien')
  for (const mauvais of [0, 11, 2.5, '3', null, undefined]) assert.equal(changerNiveau(e, mauvais), null, String(mauvais))
})

test('changerNiveau : les tirages suivants et le défi suivant suivent le nouveau niveau', () => {
  const depart = depuisTexte({ rangees: RANGEES_DEUX_MANQUANTES, enCours: ['bloc.0', null, null], suivantes: ['barre5.0', 'barre5.0', 'barre5.0'], niveau: 10, graine: 5 })
  const facile = changerNiveau(depart, 1)
  const apres = poser(facile, 0, 0, 0)
  assert.equal(apres.niveau, 1)
  assert.equal(apres.dernierCoup.mainRemplacee, true, 'la garantie du niveau 1 joue dans la partie commencée au niveau 10')
  assert.equal(poser(depart, 0, 0, 0).dernierCoup.mainRemplacee, false)
  assert.deepEqual([apres.defi.points, apres.defi.coups], [depart.defi.points, depart.defi.coups], "le défi en cours ne change pas avant d'être fini")
  // Un défi fini : le suivant est celui du niveau réglé.
  const fini = { ...facile, defi: { ...facile.defi, points: 1, scoreDebut: 0 } }
  const suivant = poser(fini, 0, 0, 0)
  assert.equal(suivant.dernierCoup.defiFini, 'reussi')
  assert.equal(suivant.defi.points, nouveauDefi(1, 0).points)
})

test("changerNiveau : annuler un coup ne ramène pas l'ancien niveau, et la partie gardée porte le niveau réglé", () => {
  let e = nouvellePartie({ graine: 21, niveau: 7, reserve: reserveInitiale() })
  const index = piecesJouables(e)[0]
  const { ligne, col } = positionsPossibles(e, index)[0]
  e = poser(e, index, ligne, col)
  e = changerNiveau(e, 2)
  const annulee = annulerCoup(e)
  assert.ok(annulee)
  assert.equal(annulee.niveau, 2)
  assert.equal(exporterPartie(e).niveau, 2)
  assert.equal(importerPartie(exporterPartie(e)).niveau, 2)
  assert.equal(importerPartie(exporterPartie(annulee)).niveau, 2)
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

// Les mains et aperçus des premiers tours de parties jouées de façon fixe, résumés par un hachage.
// Relevés lors de BS55 (table de poids, tirage hostile) : un changement du tirage des niveaux
// difficiles doit être voulu, puis les valeurs de AVANT recalées ici.
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

const AVANT = { 7: { h: 3958814698, tours: 157 }, 8: { h: 1114786648, tours: 155 }, 9: { h: 2320583078, tours: 147 }, 10: { h: 3933838289, tours: 116 } }

test('niveaux 7 à 10 : mêmes tirages que lors du dernier calage, pour une même graine', () => {
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
