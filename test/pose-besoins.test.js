// Le besoin (BS62) : aux niveaux faciles, le tirage regarde les lignes et les colonnes à qui il manque au plus
// trois cases et met dans la main la pièce exacte (forme et orientation) qui les termine, petites pièces comprises.
// Au niveau 1 c'est une quasi-garantie, qui s'estompe avec l'aide jusqu'au niveau 5 ; aux niveaux difficiles rien.
//
// Les vérifications sont indépendantes du tirage : `finit` rejoue les poses à la main sur la grille.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  REGLAGES,
  NIVEAU_MIN,
  NIVEAU_DIFFICILE,
  NIVEAU_MAX,
  CATALOGUE,
  depuisTexte,
  poser,
} from '../src/pose/index.js'
import { tirageGaranti, mainBesoins, mainPosable } from '../src/pose/tirage-garanti.js'
import { suite } from './pose-verificateur.js'

const H = REGLAGES.lignes
const L = REGLAGES.colonnes

function generateur(graine) {
  let s = graine >>> 0
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296
}

const grilleDeTexte = (rangees) => rangees.map((r) => [...r].map((c) => (c === '#' ? 'x' : null)))
const boolDeTexte = (rangees) => rangees.map((r) => [...r].map((c) => c === '#'))

// Les lignes et colonnes (« l9 », « c3 ») à qui il manque au plus trois cases qu'une pose de la pièce termine.
function finit(rangees, id) {
  const g = boolDeTexte(rangees)
  const p = CATALOGUE.find((q) => q.id === id)
  const libresL = g.map((r) => r.filter((v) => !v).length)
  const libresC = g[0].map((_, j) => g.filter((r) => !r[j]).length)
  const trouves = new Set()
  for (let l = 0; l + p.hauteur <= H; l++) {
    for (let k = 0; k + p.largeur <= L; k++) {
      if (p.cases.some((c) => g[l + c.ligne][k + c.col])) continue
      for (let r = 0; r < p.hauteur; r++) {
        const n = p.cases.filter((c) => c.ligne === r).length
        if (n === libresL[l + r] && n <= 3) trouves.add(`l${l + r}`)
      }
      for (let q = 0; q < p.largeur; q++) {
        const n = p.cases.filter((c) => c.col === q).length
        if (n === libresC[k + q] && n <= 3) trouves.add(`c${k + q}`)
      }
    }
  }
  return trouves
}
const finitMain = (rangees, ids) => new Set(ids.flatMap((id) => [...finit(rangees, id)]))

// Un seul besoin : la dernière rangée n'a plus qu'une case libre, en cinquième colonne, et la case au-dessus est
// prise : seul le bloc de 1 case la comble.
const UN_TROU = ['..........', '..........', '..........', '..........', '..........', '..........', '..........', '..........', '....#.....', '####.#####']
// Deux besoins : ce trou-là (le bloc seul), et la dernière colonne à qui il manque trois cases (rangées 5 à 7).
const DEUX_BESOINS = ['.........#', '.........#', '.........#', '.........#', '.........#', '..........', '..........', '..........', '....#....#', '####.#####']

test('les besoins de la grille : le tirage et la vérification à la main sont d\'accord', () => {
  const tous = new Set(CATALOGUE.filter((p) => finit(UN_TROU, p.id).has('l9')).map((p) => p.id))
  assert.deepEqual([...tous], ['bloc.0'])
  assert.deepEqual(mainBesoins(grilleDeTexte(UN_TROU), ['bloc.0', 'barre5.0']), { besoins: 1, couverts: 1, atteignables: 1 })
  assert.deepEqual(mainBesoins(grilleDeTexte(UN_TROU), ['barre5.0', 'barre4.0', 'carre3.0']), { besoins: 1, couverts: 0, atteignables: 1 })
  // Deux besoins, qu'aucune pièce seule ne termine : il faut deux pièces de la main.
  const g = grilleDeTexte(DEUX_BESOINS)
  assert.equal(mainBesoins(g, ['bloc.0', 'barre3.1', 'barre5.0']).besoins, 2)
  assert.deepEqual(mainBesoins(g, ['bloc.0', 'barre3.1', 'barre5.0']), { besoins: 2, couverts: 2, atteignables: 2 })
  assert.deepEqual(mainBesoins(g, ['barre3.1', 'barre5.0', 'barre4.0']), { besoins: 2, couverts: 1, atteignables: 2 })
  // Une grille sans ligne presque pleine n'a pas de besoin.
  assert.deepEqual(mainBesoins(grilleDeTexte(Array(H).fill('..........')), ['bloc.0']), { besoins: 0, couverts: 0, atteignables: 0 })
})

test('au niveau 1, la main termine toujours le trou que seul le bloc de 1 case comble', () => {
  const g = grilleDeTexte(UN_TROU)
  const alea = generateur(3)
  for (let i = 0; i < 300; i++) {
    const ids = tirageGaranti({ aleatoire: alea, niveau: NIVEAU_MIN, nombre: 3, grille: g, enCours: [], reglages: REGLAGES })
    assert.ok(ids.includes('bloc.0'), `main ${ids}`)
    assert.ok(finitMain(UN_TROU, ids).has('l9'))
    assert.ok(mainPosable(g, ids).posable, `main ${ids}`)
  }
})

test('au niveau 1, la main termine deux besoins à la fois, chacun par sa pièce', () => {
  const g = grilleDeTexte(DEUX_BESOINS)
  const alea = generateur(5)
  const places = new Set()
  for (let i = 0; i < 300; i++) {
    const ids = tirageGaranti({ aleatoire: alea, niveau: NIVEAU_MIN, nombre: 3, grille: g, enCours: [], reglages: REGLAGES })
    const finis = finitMain(DEUX_BESOINS, ids)
    assert.ok(finis.has('l9') && finis.has('c9'), `main ${ids} : ${[...finis]}`)
    assert.ok(mainPosable(g, ids).posable, `main ${ids}`)
    places.add(ids.indexOf('bloc.0'))
  }
  // Le bloc ne tombe pas toujours à la même place de la main.
  assert.ok(places.size >= 2, `${[...places]}`)
})

test("l'aide du besoin s'estompe avec le niveau : aucune main ne manque le trou au niveau 1, quelques-unes au niveau 5", () => {
  const g = grilleDeTexte(UN_TROU)
  const manquees = []
  for (let niveau = NIVEAU_MIN; niveau < NIVEAU_DIFFICILE; niveau++) {
    const alea = generateur(40 + niveau)
    let manque = 0
    for (let i = 0; i < 400; i++) {
      if (!tirageGaranti({ aleatoire: alea, niveau, nombre: 3, grille: g, enCours: [], reglages: REGLAGES }).includes('bloc.0')) manque++
    }
    manquees.push(manque / 400)
  }
  assert.equal(manquees[0], 0)
  for (let i = 1; i < manquees.length; i++) assert.ok(manquees[i] >= manquees[i - 1] - 0.03, `niveaux 1 à 5 : ${manquees}`)
  // Le poids de la pièce qui efface (BS51) tient les niveaux 2 à 4 : c'est ici la seule pièce qui efface.
  assert.ok(manquees[4] > 0 && manquees[4] < 0.3, `niveaux 1 à 5 : ${manquees}`)
})

test('aux niveaux difficiles, le tirage ne regarde pas le besoin : le bloc ne sort que rarement', () => {
  const g = grilleDeTexte(UN_TROU)
  for (let niveau = NIVEAU_DIFFICILE; niveau <= NIVEAU_MAX; niveau++) {
    const alea = generateur(70 + niveau)
    let avec = 0
    for (let i = 0; i < 300; i++) if (tirageGaranti({ aleatoire: alea, niveau, nombre: 3, grille: g, enCours: [], reglages: REGLAGES }).includes('bloc.0')) avec++
    assert.ok(avec / 300 < 0.7, `niveau ${niveau} : ${avec / 300}`)
  }
})

test("l'aperçu aussi : le tirage des pièces suivantes finit le besoin de la grille où la main arrive", () => {
  // La main (un bloc, deux barres de 5 couchées) se pose sur la grille ; l'aperçu se tire sur la grille d'arrivée,
  // qui garde un trou d'une case à finir : il contient le bloc.
  const rangees = ['..........', '..........', '..........', '..........', '..........', '..........', '..........', '..........', '....#.....', '####.#####']
  const g = grilleDeTexte(rangees)
  const alea = generateur(9)
  let avec = 0
  const N = 120
  for (let i = 0; i < N; i++) {
    const suivantes = tirageGaranti({ aleatoire: alea, niveau: NIVEAU_MIN, nombre: 3, grille: g, enCours: ['barre5.0', 'barre5.0', 'barre4.0'], reglages: REGLAGES })
    assert.equal(suivantes.length, 3)
    if (suivantes.includes('bloc.0')) avec++
    const garde = suite(boolDeTexte(rangees), [['barre5.0', 'barre5.0', 'barre4.0'], suivantes])
    assert.ok(garde, `aperçu ${suivantes}`)
  }
  assert.equal(avec, N)
})

test('le moteur : une main qui efface mais manque un besoin que le catalogue comblerait est tirée de nouveau', () => {
  // La main prévue (barre de 3 debout, deux barres de 5) efface la dernière colonne mais ne finit pas le trou de
  // la dernière rangée : le moteur la remplace par une main qui finit les deux.
  const e = depuisTexte({
    rangees: DEUX_BESOINS.map((r, i) => (i === 0 ? '.........#' : r)),
    enCours: ['bloc.0', null, null],
    suivantes: ['barre3.1', 'barre5.0', 'barre5.0'],
    niveau: 1,
    graine: 5,
  })
  const apres = poser(e, 0, 0, 0)
  assert.equal(apres.dernierCoup.nouveauTour, true)
  assert.equal(apres.dernierCoup.mainRemplacee, true)
  const main = apres.enCours.map((x) => x.id)
  const rangees = apres.grille.map((r) => r.map((v) => (v === null ? '.' : '#')).join(''))
  const finis = finitMain(rangees, main)
  assert.ok(finis.has('l9') && finis.has('c9'), `main ${main} : ${[...finis]}`)
})

test('le moteur : une main qui finit déjà ce que le catalogue finirait au mieux est gardée telle quelle', () => {
  const e = depuisTexte({
    rangees: DEUX_BESOINS,
    enCours: ['barre5.0', null, null],
    suivantes: ['bloc.0', 'barre3.1', 'barre5.0'],
    niveau: 1,
    graine: 5,
  })
  const apres = poser(e, 0, 0, 0)
  assert.equal(apres.dernierCoup.nouveauTour, true)
  assert.equal(apres.dernierCoup.mainRemplacee, false)
  assert.deepEqual(apres.enCours.map((x) => x.id), ['bloc.0', 'barre3.1', 'barre5.0'])
})

test('le moteur : aux niveaux difficiles, la main n\'est jamais remplacée pour un besoin', () => {
  for (let niveau = NIVEAU_DIFFICILE; niveau <= NIVEAU_MAX; niveau++) {
    const e = depuisTexte({ rangees: DEUX_BESOINS, enCours: ['barre5.0', null, null], suivantes: ['barre3.1', 'barre5.0', 'barre5.0'], niveau, graine: 5 })
    const apres = poser(e, 0, 0, 0)
    assert.equal(apres.dernierCoup.mainRemplacee, false, `niveau ${niveau}`)
  }
})
