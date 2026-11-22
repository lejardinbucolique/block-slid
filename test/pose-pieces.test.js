import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FORMES,
  CATALOGUE,
  piece,
  pieceSuivante,
  LIGNES_MAX_PAR_COUP,
  COLONNES_MAX_PAR_COUP,
} from '../src/pose/index.js'

const dessin = (p) => p.cases.map((c) => `${c.ligne},${c.col}`).join(' ')

test('le catalogue a chaque forme cadrée dans toutes ses orientations, 38 pièces (L et J de BS50) en tout', () => {
  const attendues = {
    bloc: 1, barre2: 2, barre3: 2, barre4: 2, barre5: 2,
    rectangle: 2, carre2: 1, carre3: 1, carre4: 1,
    coin: 4, grandL: 4, t: 4, l: 4, j: 4, s: 2, z: 2,
  }
  const comptees = {}
  for (const p of CATALOGUE) comptees[p.forme] = (comptees[p.forme] ?? 0) + 1
  assert.deepEqual(comptees, attendues)
  assert.equal(CATALOGUE.length, 38)
})

test('aucune pièce en double, ni par son id ni par son dessin', () => {
  assert.equal(new Set(CATALOGUE.map((p) => p.id)).size, CATALOGUE.length)
  assert.equal(new Set(CATALOGUE.map(dessin)).size, CATALOGUE.length)
})

test('une barre couchée et une barre debout sont deux pièces', () => {
  assert.deepEqual([piece('barre4.0').hauteur, piece('barre4.0').largeur], [1, 4])
  assert.deepEqual([piece('barre4.1').hauteur, piece('barre4.1').largeur], [4, 1])
  assert.deepEqual([piece('rectangle.0').hauteur, piece('rectangle.0').largeur], [2, 3])
  assert.deepEqual([piece('rectangle.1').hauteur, piece('rectangle.1').largeur], [3, 2])
})

test('chaque pièce a le nombre de cases de sa forme, collées au coin haut gauche', () => {
  for (const f of FORMES) {
    const cases = f.motif.join('').replaceAll('.', '').length
    for (const p of CATALOGUE.filter((q) => q.forme === f.forme)) {
      assert.equal(p.cases.length, cases, p.id)
      assert.equal(Math.min(...p.cases.map((c) => c.ligne)), 0, p.id)
      assert.equal(Math.min(...p.cases.map((c) => c.col)), 0, p.id)
    }
  }
  assert.equal(piece('grandL.0').cases.length, 5)
  assert.equal(piece('carre4.0').cases.length, 16)
})

test('la rotation passe à l\'orientation suivante d\'un quart de tour horaire, en boucle', () => {
  for (const p of CATALOGUE) {
    const suivante = piece(pieceSuivante(p.id))
    assert.equal(suivante.forme, p.forme)
    // Quart de tour horaire du dessin de p, ramené au coin haut gauche.
    const tournees = p.cases.map((c) => ({ ligne: c.col, col: p.hauteur - 1 - c.ligne }))
      .sort((a, b) => a.ligne - b.ligne || a.col - b.col)
    assert.equal(dessin({ cases: tournees }), dessin(suivante), p.id)
  }
  // Le coin revient sur lui-même après quatre quarts de tour, la barre après deux.
  let id = 'coin.0'
  for (let i = 0; i < 4; i++) id = pieceSuivante(id)
  assert.equal(id, 'coin.0')
  assert.equal(pieceSuivante(pieceSuivante('barre5.0')), 'barre5.0')
  assert.equal(pieceSuivante('carre3.0'), 'carre3.0')
  assert.equal(pieceSuivante('inconnue.0'), undefined)
})

test('faisabilité : au plus autant de lignes (colonnes) d\'un coup que la plus haute (large) pièce', () => {
  // Calculé d'après le catalogue, pour suivre si on y ajoute des pièces.
  assert.equal(LIGNES_MAX_PAR_COUP, Math.max(...CATALOGUE.map((p) => p.hauteur)))
  assert.equal(COLONNES_MAX_PAR_COUP, Math.max(...CATALOGUE.map((p) => p.largeur)))
  assert.equal(LIGNES_MAX_PAR_COUP, 5)
  assert.equal(COLONNES_MAX_PAR_COUP, 5)
})
