import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  REGLAGES,
  CATALOGUE,
  piece,
  nouvellePartie,
  poser,
  positionsPossibles,
  piecesJouables,
  bloquee,
  depuisTexte,
  TOLERANCE_HORS_GRILLE,
  caseVisee,
  apercuCoup,
  casesElevees,
  centreEffacement,
  tailleCellule,
} from '../src/pose/index.js'

const VIDE = '..........'
const enBas = (...rangees) => [...Array(10 - rangees.length).fill(VIDE), ...rangees]
const grilleDe = (etat) => etat.grille

// --- De la position du doigt à la case visée ------------------------------------------------

// Grille de 10 x 10 cases de 30 px dont le coin haut gauche est en (20, 100) ; la pièce se
// montre 40 px au-dessus du doigt.
const base = { cellule: 30, origine: { x: 20, y: 100 }, decalage: 40, lignes: 10, colonnes: 10 }

// Où poser le doigt pour que la pièce (hauteur x largeur) ait son coin haut gauche pile en (ligne, col).
const doigtPour = (ligne, col, hauteur, largeur) => ({
  x: base.origine.x + (col + largeur / 2) * base.cellule,
  y: base.origine.y + (ligne + hauteur) * base.cellule + base.decalage,
})

test('case visée : le doigt pile sous une case donne cette case, pour toute taille de pièce', () => {
  for (const [hauteur, largeur] of [[1, 1], [2, 3], [3, 3], [1, 5], [5, 1], [4, 4]]) {
    for (const [ligne, col] of [[0, 0], [3, 4], [10 - hauteur, 10 - largeur], [0, 10 - largeur]]) {
      const { x, y } = doigtPour(ligne, col, hauteur, largeur)
      assert.deepEqual(caseVisee({ ...base, x, y, hauteur, largeur }), { ligne, col }, `${hauteur}x${largeur} en ${ligne},${col}`)
    }
  }
})

test('case visée : la pièce prend la case la plus proche (arrondi à la demi-case)', () => {
  const { x, y } = doigtPour(4, 4, 2, 2)
  const vise = (dx, dy) => caseVisee({ ...base, x: x + dx, y: y + dy, hauteur: 2, largeur: 2 })
  assert.deepEqual(vise(14, 0), { ligne: 4, col: 4 })
  assert.deepEqual(vise(16, 0), { ligne: 4, col: 5 })
  assert.deepEqual(vise(-14, -14), { ligne: 4, col: 4 })
  assert.deepEqual(vise(-16, -16), { ligne: 3, col: 3 })
})

test('case visée : un peu au-delà du bord vise la case du bord, plus loin la pièce est hors de la grille', () => {
  const tol = TOLERANCE_HORS_GRILLE
  assert.ok(tol > 0 && tol < 1)
  const { x, y } = doigtPour(0, 0, 2, 2)
  const vise = (dx, dy) => caseVisee({ ...base, x: x + dx, y: y + dy, hauteur: 2, largeur: 2 })
  assert.deepEqual(vise(-0.5 * 30, 0), { ligne: 0, col: 0 })
  assert.deepEqual(vise(-(tol - 0.05) * 30, 0), { ligne: 0, col: 0 })
  assert.equal(vise(-(tol + 0.05) * 30, 0), null)
  assert.equal(vise(0, -(tol + 0.05) * 30), null)
  assert.equal(vise(-300, 0), null)
  // Même chose à l'autre bout : la dernière case possible pour une pièce 2x2 est (8, 8).
  const bas = doigtPour(8, 8, 2, 2)
  assert.deepEqual(caseVisee({ ...base, ...bas, hauteur: 2, largeur: 2 }), { ligne: 8, col: 8 })
  assert.deepEqual(caseVisee({ ...base, x: bas.x + (tol - 0.05) * 30, y: bas.y, hauteur: 2, largeur: 2 }), { ligne: 8, col: 8 })
  assert.equal(caseVisee({ ...base, x: bas.x + (tol + 0.05) * 30, y: bas.y, hauteur: 2, largeur: 2 }), null)
  assert.equal(caseVisee({ ...base, x: bas.x, y: bas.y + (tol + 0.05) * 30, hauteur: 2, largeur: 2 }), null)
})

test('case visée : tout autre cas absurde rend null (grille trop petite, valeurs illisibles)', () => {
  assert.equal(caseVisee({ ...base, x: 100, y: 200, hauteur: 5, largeur: 5, lignes: 4, colonnes: 10 }), null)
  assert.equal(caseVisee({ ...base, x: NaN, y: 200, hauteur: 1, largeur: 1 }), null)
  assert.equal(caseVisee({ ...base, x: 100, y: 200, hauteur: 1, largeur: 1, cellule: 0 }), null)
})

test('case visée : la pièce est toujours au-dessus du doigt (le doigt ne la cache pas)', () => {
  // Le doigt est sous le bord bas de la pièce : plus bas que la grille quand la pièce est tout en bas.
  const { y } = doigtPour(8, 3, 2, 2)
  assert.ok(y >= base.origine.y + 10 * base.cellule + base.decalage)
})

// --- Aperçu du coup : validité, lignes et colonnes complétées -----------------------------------

const casesDe = (id) => piece(id).cases

test('aperçu : pose valide sur grille vide, rien ne se complète', () => {
  const etat = depuisTexte({ enCours: ['barre3.0', null, null] })
  const a = apercuCoup(grilleDe(etat), casesDe('barre3.0'), 4, 2)
  assert.equal(a.valide, true)
  assert.deepEqual(a.cases, [{ ligne: 4, col: 2 }, { ligne: 4, col: 3 }, { ligne: 4, col: 4 }])
  assert.deepEqual(a.lignes, [])
  assert.deepEqual(a.colonnes, [])
})

test('aperçu : une ligne qui se complète est annoncée, avec le croisement de colonnes', () => {
  // Rangée du bas pleine sauf trois cases ; une barre de 3 la complète.
  const etat = depuisTexte({ rangees: enBas('XXXXXXX...'), enCours: ['barre3.0', null, null] })
  const a = apercuCoup(grilleDe(etat), casesDe('barre3.0'), 9, 7)
  assert.equal(a.valide, true)
  assert.deepEqual(a.lignes, [9])
  assert.deepEqual(a.colonnes, [])
  assert.deepEqual(casesElevees(a, 10, 10), Array.from({ length: 10 }, (_, k) => ({ ligne: 9, col: k })))
})

test('aperçu : lignes et colonnes ensemble, le croisement n\'est élevé qu\'une fois', () => {
  const etat = depuisTexte({
    rangees: [
      '.X........', '.X........', '.X........', '.X........', '.X........',
      '.X........', '.X........', '.X........', '..........', '.X........',
    ],
    enCours: ['bloc.0', null, null],
  })
  // La case (8, 1) complète la colonne 1 ; on y ajoute la ligne 8 presque pleine.
  etat.grille[8] = etat.grille[8].map((v, k) => (k === 1 ? null : 'X'))
  const a = apercuCoup(grilleDe(etat), casesDe('bloc.0'), 8, 1)
  assert.deepEqual(a.lignes, [8])
  assert.deepEqual(a.colonnes, [1])
  const elevees = casesElevees(a, 10, 10)
  assert.equal(elevees.length, 10 + 10 - 1)
  assert.equal(new Set(elevees.map((c) => `${c.ligne},${c.col}`)).size, elevees.length)
})

test('aperçu : une pose impossible ne complète rien et se dit invalide', () => {
  const etat = depuisTexte({ rangees: enBas('XXXXXXXXX.'), enCours: ['barre2.0', null, null] })
  const sur = apercuCoup(grilleDe(etat), casesDe('barre2.0'), 9, 8)
  assert.equal(sur.valide, false)
  assert.deepEqual(sur.lignes, [])
  assert.deepEqual(sur.colonnes, [])
  const dehors = apercuCoup(grilleDe(etat), casesDe('barre2.0'), 9, 9)
  assert.equal(dehors.valide, false)
  const hors = apercuCoup(grilleDe(etat), casesDe('barre2.0'), -1, 0)
  assert.equal(hors.valide, false)
  assert.equal(apercuCoup(grilleDe(etat), [], 0, 0).valide, false)
})

test('aperçu : ne modifie jamais la grille', () => {
  const etat = depuisTexte({ rangees: enBas('XXXXXXX...'), enCours: ['barre3.0', null, null] })
  const avant = JSON.stringify(etat.grille)
  apercuCoup(etat.grille, casesDe('barre3.0'), 9, 7)
  assert.equal(JSON.stringify(etat.grille), avant)
})

test('aperçu : même verdict que le moteur, sur des parties tirées au hasard, pour toutes les places', () => {
  let s = 12345
  const hasard = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
  let compares = 0
  let avecEffacement = 0
  for (let partie = 0; partie < 12; partie++) {
    let etat = nouvellePartie({ graine: 100 + partie, niveau: 1 + (partie % 10) })
    for (let coup = 0; coup < 60 && !bloquee(etat); coup++) {
      // Toutes les places de la grille, valides ou non, pour chaque pièce en main.
      etat.enCours.forEach((x, index) => {
        if (!x) return
        const cases = casesDe(x.id)
        for (let l = -1; l <= 10; l++) {
          for (let k = -1; k <= 10; k++) {
            const a = apercuCoup(etat.grille, cases, l, k)
            const suivant = poser(etat, index, l, k)
            assert.equal(a.valide, suivant !== null, `valide ${x.id} en ${l},${k}`)
            if (!suivant) continue
            compares++
            assert.deepEqual(a.lignes, suivant.dernierCoup.lignes)
            assert.deepEqual(a.colonnes, suivant.dernierCoup.colonnes)
            assert.deepEqual(a.cases, suivant.dernierCoup.casesPosees)
            if (a.lignes.length + a.colonnes.length > 0) avecEffacement++
          }
        }
      })
      const jouables = piecesJouables(etat)
      const index = jouables[Math.floor(hasard() * jouables.length)]
      const places = positionsPossibles(etat, index)
      const { ligne, col } = places[Math.floor(hasard() * places.length)]
      etat = poser(etat, index, ligne, col)
    }
  }
  assert.ok(compares > 5000, `${compares} comparaisons`)
  assert.ok(avecEffacement > 50, `${avecEffacement} poses qui effacent quelque chose`)
})

test('aperçu : toutes les pièces du catalogue, sur toute la grille vide, restent dans la grille ou sont refusées', () => {
  const vide = nouvellePartie({ graine: 1 }).grille
  for (const p of CATALOGUE) {
    for (let l = 0; l < 10; l++) {
      for (let k = 0; k < 10; k++) {
        const dedans = l + p.hauteur <= 10 && k + p.largeur <= 10
        assert.equal(apercuCoup(vide, p.cases, l, k).valide, dedans, `${p.id} en ${l},${k}`)
      }
    }
  }
})

// --- Où montent les points ---------------------------------------------------------------------

test('centre de l\'effacement : le milieu des lignes, des colonnes, ou de la grille quand elles se croisent', () => {
  assert.equal(centreEffacement({ lignes: [], colonnes: [] }, 10, 10), null)
  assert.deepEqual(centreEffacement({ lignes: [9], colonnes: [] }, 10, 10), { ligne: 9.5, col: 5 })
  assert.deepEqual(centreEffacement({ lignes: [2, 3, 4], colonnes: [] }, 10, 10), { ligne: 3.5, col: 5 })
  assert.deepEqual(centreEffacement({ lignes: [], colonnes: [0, 1] }, 10, 10), { ligne: 5, col: 1 })
  assert.deepEqual(centreEffacement({ lignes: [1], colonnes: [8] }, 10, 10), { ligne: 5, col: 5 })
})

// --- Taille d'une case -------------------------------------------------------------------------------

test('taille d\'une case : limitée par la largeur ou par la hauteur, entière, jamais sous le minimum', () => {
  const rangees = 5 * (0.5 + 0.3)
  const t = (largeur, hauteur) => tailleCellule({ largeur, hauteur, fixe: 200, colonnes: 10, lignes: 10, piecesEnCases: rangees })
  // Téléphone étroit et haut : la largeur décide.
  assert.equal(t(344, 900), 34)
  // Écran large et bas : la hauteur décide. (500 - 200) / 14 = 21,4.
  assert.equal(t(800, 500), 21)
  assert.ok(Number.isInteger(t(361, 733)))
  // Aucun écran ne descend sous le minimum, même absurde.
  assert.equal(t(100, 100), 18)
  assert.equal(tailleCellule({ largeur: 100, hauteur: 100, fixe: 200, colonnes: 10, lignes: 10, piecesEnCases: rangees, minimum: 12 }), 12)
})

test('taille d\'une case : tout ce qu\'on empile tient dans la hauteur (360 x 640 et 412 x 915)', () => {
  const fixe = 200
  for (const [largeur, hauteur] of [[360, 640], [360, 740], [412, 915], [390, 700]]) {
    const c = tailleCellule({ largeur: largeur - 26, hauteur, fixe, colonnes: 10, lignes: 10, piecesEnCases: 5 * (0.5 + 0.3) })
    assert.ok(c * 10 + fixe + c * 5 * 0.8 <= hauteur + 1, `${largeur}x${hauteur} : case de ${c}`)
    assert.ok(c * 10 <= largeur - 26, `${largeur}x${hauteur} : grille de ${c * 10}`)
  }
})

test('la plus large des pièces tient dans un emplacement, aux deux échelles de pièce', () => {
  // Un emplacement vaut un tiers de la largeur de la grille (ecran.js : trois pièces par rangée).
  const largeurMax = Math.max(...CATALOGUE.map((p) => p.largeur))
  for (const echelle of [0.5, 0.3]) {
    assert.ok(largeurMax * echelle <= REGLAGES.colonnes / REGLAGES.piecesParTour, `échelle ${echelle}`)
  }
})
