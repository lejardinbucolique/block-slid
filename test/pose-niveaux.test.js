import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CATALOGUE,
  piece,
  POIDS_NIVEAUX,
  NIVEAU_MIN,
  NIVEAU_MAX,
  poidsDesPieces,
  tirerPieces,
} from '../src/pose/index.js'

const niveaux = Array.from({ length: NIVEAU_MAX - NIVEAU_MIN + 1 }, (_, i) => NIVEAU_MIN + i)

// La part (sur 1) des pièces tirées dont la difficulté est au moins `d`.
function partAuMoins(niveau, d) {
  const poids = poidsDesPieces(niveau)
  const total = poids.reduce((s, p) => s + p.poids, 0)
  return poids.filter((p) => piece(p.id).difficulte >= d).reduce((s, p) => s + p.poids, 0) / total
}

test('dix niveaux, chacun une part sur 100 par difficulté du catalogue', () => {
  assert.equal(POIDS_NIVEAUX.length, 10)
  const difficultes = Math.max(...CATALOGUE.map((p) => p.difficulte))
  for (const parts of POIDS_NIVEAUX) {
    assert.equal(parts.length, difficultes)
    assert.equal(parts.reduce((s, x) => s + x, 0), 100)
  }
})

test('la difficulté croît sans jamais décroître d\'un niveau au suivant', () => {
  for (let d = 2; d <= 4; d++) {
    for (const n of niveaux.slice(1)) {
      assert.ok(partAuMoins(n, d) >= partAuMoins(n - 1, d) - 1e-12, `difficulté ${d}+ au niveau ${n}`)
    }
  }
  // Et la difficulté moyenne monte vraiment à chaque niveau.
  const moyenne = (n) => [2, 3, 4].reduce((s, d) => s + partAuMoins(n, d), 1)
  for (const n of niveaux.slice(1)) assert.ok(moyenne(n) > moyenne(n - 1), `niveau ${n}`)
})

test('niveau 1 : surtout des pièces faciles, ni grosses ni tordues ; niveau 10 : tout le catalogue', () => {
  assert.ok(partAuMoins(1, 2) <= 0.35)
  assert.ok(partAuMoins(1, 3) <= 0.1)
  for (const p of poidsDesPieces(10)) assert.ok(p.poids > 0, p.id)
  assert.ok(partAuMoins(10, 4) >= 0.2)
})

test('le tirage simple ne sort que des pièces de poids non nul, à peu près dans leurs parts', () => {
  let s = 7
  const aleatoire = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
  for (const niveau of [1, 10]) {
    const ids = tirerPieces({ aleatoire, niveau, nombre: 6000 })
    const permis = new Set(poidsDesPieces(niveau).filter((p) => p.poids > 0).map((p) => p.id))
    assert.ok(ids.every((id) => permis.has(id)), `niveau ${niveau}`)
    const faciles = ids.filter((id) => piece(id).difficulte === 1).length / ids.length
    assert.ok(Math.abs(faciles - (1 - partAuMoins(niveau, 2))) < 0.03, `niveau ${niveau} : ${faciles}`)
  }
})

test('un niveau hors de 1 à 10 est refusé par la table', () => {
  assert.throws(() => poidsDesPieces(0), RangeError)
  assert.throws(() => poidsDesPieces(11), RangeError)
  assert.throws(() => poidsDesPieces(2.5), RangeError)
})
