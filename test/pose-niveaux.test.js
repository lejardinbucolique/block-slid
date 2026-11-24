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

test('niveau 1 : surtout de grandes pièces simples, ni petites ni tordues ; niveau 10 : surtout des petites et des tordues, de tout dans le catalogue', () => {
  // BS55 : la difficulté 1 est celle des grandes pièces simples (barres de 4 et 5, rectangle, carré de 3).
  const formes = (d) => new Set(CATALOGUE.filter((p) => p.difficulte === d).map((p) => p.forme))
  assert.deepEqual([...formes(1)].sort(), ['barre4', 'barre5', 'carre3', 'rectangle'])
  assert.deepEqual([...formes(4)].sort(), ['coin', 's', 'z'])
  assert.ok(1 - partAuMoins(1, 2) >= 0.5, `niveau 1 : ${1 - partAuMoins(1, 2)} de grandes pièces simples`)
  assert.ok(partAuMoins(1, 3) <= 0.1)
  assert.equal(partAuMoins(1, 4), 0, 'ni S, ni Z, ni coin au niveau 1')
  for (const p of poidsDesPieces(10)) assert.ok(p.poids > 0, p.id)
  assert.ok(partAuMoins(10, 4) >= 0.5, `niveau 10 : ${partAuMoins(10, 4)} de pièces tordues`)
  assert.ok(1 - partAuMoins(10, 2) <= 0.05, 'presque plus de grandes pièces simples au niveau 10')
})

test('la taille des pièces suit le niveau : les grandes aux niveaux faciles, de moins en moins vers le niveau 10', () => {
  const casesMoyennes = (n) => {
    const poids = poidsDesPieces(n)
    const total = poids.reduce((s, p) => s + p.poids, 0)
    return poids.reduce((s, p) => s + p.poids * piece(p.id).cases.length, 0) / total
  }
  const moyennes = niveaux.map(casesMoyennes)
  for (let i = 1; i < niveaux.length; i++) assert.ok(moyennes[i] < moyennes[i - 1], `niveau ${niveaux[i]} : ${moyennes}`)
  assert.ok(moyennes[0] - moyennes[9] > 0.8, `${moyennes}`)
  // Les barres de 4 et de 5, le rectangle et le carré de 3 : jamais plus rares qu'au niveau suivant.
  const grandesSimples = (n) => poidsDesPieces(n).filter((p) => piece(p.id).difficulte === 1).reduce((s, p) => s + p.poids, 0)
  for (const n of niveaux.slice(1)) assert.ok(grandesSimples(n) < grandesSimples(n - 1), `niveau ${n}`)
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
