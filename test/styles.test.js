import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REGLAGES, nouvellePartie, jouer, deplacementsPossibles } from '../src/moteur/index.js'
import {
  PALIERS,
  STYLES,
  STYLE_UNI,
  stylesDebloques,
  prochainStyle,
  nouveauxStyles,
  choisirStyle,
  styleLu,
  styleAutorise,
  resumeStyles,
} from '../src/ui/styles.js'
import { styleGarde, retenirStyle } from '../src/ui/stockage.js'

const ids = (liste) => liste.map((s) => s.id)

function faussePile(initial = {}) {
  const m = new Map(Object.entries(initial))
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: (k) => { m.delete(k) },
  }
  return m
}

test('paliers : dix, croissants, les quatre premiers donnés par le joueur', () => {
  assert.equal(PALIERS.length, 10)
  assert.deepEqual(PALIERS.slice(0, 4), [10000, 100000, 250000, 500000])
  for (let i = 1; i < PALIERS.length; i++) assert.ok(PALIERS[i] > PALIERS[i - 1])
})

test('déblocage : la laine au premier palier, le béton au deuxième, pas en dessous', () => {
  assert.deepEqual(ids(stylesDebloques(0)), ['uni'])
  assert.deepEqual(ids(stylesDebloques(PALIERS[0] - 1)), ['uni'])
  assert.deepEqual(ids(stylesDebloques(PALIERS[0])), ['uni', 'laine'])
  assert.deepEqual(ids(stylesDebloques(PALIERS[1] - 1)), ['uni', 'laine'])
  assert.deepEqual(ids(stylesDebloques(PALIERS[1])), ['uni', 'laine', 'beton'])
  assert.deepEqual(ids(stylesDebloques(PALIERS[2] - 1)), ['uni', 'laine', 'beton'])
  assert.deepEqual(ids(stylesDebloques(PALIERS[2])), ['uni', 'laine', 'beton', 'bois'])
  assert.deepEqual(ids(stylesDebloques(PALIERS[3] - 1)), ['uni', 'laine', 'beton', 'bois'])
  assert.deepEqual(ids(stylesDebloques(PALIERS[3])), ['uni', 'laine', 'beton', 'bois', 'bonbon'])
  assert.deepEqual(ids(stylesDebloques(10 ** 9)), ids(STYLES))
})

test('déblocage en cours de partie : nouveauxStyles au passage du palier seulement', () => {
  assert.deepEqual(ids(nouveauxStyles(0, PALIERS[0] - 1)), [])
  assert.deepEqual(ids(nouveauxStyles(PALIERS[0] - 1, PALIERS[0])), ['laine'])
  assert.deepEqual(ids(nouveauxStyles(PALIERS[1] - 1, PALIERS[1])), ['beton'])
  assert.deepEqual(ids(nouveauxStyles(PALIERS[2] - 1, PALIERS[2])), ['bois'])
  assert.deepEqual(ids(nouveauxStyles(PALIERS[3] - 1, PALIERS[3])), ['bonbon'])
  assert.deepEqual(ids(nouveauxStyles(0, 10 ** 9)), ['laine', 'beton', 'bois', 'bonbon'])
  assert.deepEqual(ids(nouveauxStyles(PALIERS[0], PALIERS[0] + 500)), [])
})

test('prochain style : seulement s\'il existe, aucune promesse au-delà du bonbon', () => {
  assert.equal(prochainStyle(0).id, 'laine')
  assert.equal(prochainStyle(PALIERS[0]).id, 'beton')
  assert.equal(prochainStyle(PALIERS[1]).id, 'bois')
  assert.equal(prochainStyle(PALIERS[2]).id, 'bonbon')
  assert.equal(prochainStyle(PALIERS[3]), null)
  assert.match(resumeStyles(0), /0 sur 4.*Laine/)
  assert.match(resumeStyles(PALIERS[0]), /1 sur 4.*Béton, à 100000/)
  assert.match(resumeStyles(PALIERS[1]), /2 sur 4.*Bois, à 250000/)
  assert.match(resumeStyles(PALIERS[2]), /3 sur 4.*Bonbon, à 500000/)
  assert.match(resumeStyles(PALIERS[3]), /4 sur 4/)
  assert.doesNotMatch(resumeStyles(PALIERS[3]), /Prochain/)
})

test('rotation : jamais deux fois le même d\'affilée, uni compris', () => {
  const debloques = stylesDebloques(PALIERS[3])
  let courant = STYLE_UNI
  const vus = new Set()
  for (let i = 0; i < 20; i++) {
    const suivant = choisirStyle(debloques, courant, Math.random)
    assert.notEqual(suivant, courant)
    vus.add(suivant)
    courant = suivant
  }
  assert.deepEqual([...vus].sort(), ['beton', 'bois', 'bonbon', 'laine', 'uni'])
})

test('rotation : avec trois styles, le choix suit le nombre tiré et exclut le courant', () => {
  const trois = ['uni', 'laine', 'bois']
  assert.equal(choisirStyle(trois, 'uni', () => 0), 'laine')
  assert.equal(choisirStyle(trois, 'uni', () => 0.99), 'bois')
  assert.equal(choisirStyle(trois, 'laine', () => 0), 'uni')
  assert.equal(choisirStyle(trois, 'laine', () => 0.99), 'bois')
  assert.equal(choisirStyle(trois, 'bois', () => 0.99), 'laine')
  // Un tirage hors de [0, 1[ ou illisible ne sort jamais de la liste.
  assert.equal(choisirStyle(trois, 'uni', () => 1), 'bois')
  assert.equal(choisirStyle(trois, 'uni', () => -3), 'laine')
  assert.equal(choisirStyle(trois, 'uni', () => NaN), 'laine')
})

test('rotation : un seul style, ou aucun, ne change rien', () => {
  assert.equal(choisirStyle(stylesDebloques(0), 'uni', () => 0.7), 'uni')
  assert.equal(choisirStyle([], 'uni', () => 0.7), 'uni')
  assert.equal(choisirStyle(['laine'], 'laine', () => 0.1), 'laine')
})

test('style lu : absent, abîmé ou inconnu = uni ; un style plus débloqué retombe sur uni', () => {
  assert.equal(styleLu(null), 'uni')
  assert.equal(styleLu(''), 'uni')
  assert.equal(styleLu('{"a":1}'), 'uni')
  assert.equal(styleLu('bois-inconnu'), 'uni')
  assert.equal(styleLu('laine'), 'laine')
  assert.equal(styleAutorise('laine', 0), 'uni')
  assert.equal(styleAutorise('laine', PALIERS[0]), 'laine')
  assert.equal(styleLu('beton'), 'beton')
  assert.equal(styleAutorise('beton', PALIERS[1] - 1), 'uni')
  assert.equal(styleAutorise('beton', PALIERS[1]), 'beton')
  assert.equal(styleLu('bois'), 'bois')
  assert.equal(styleAutorise('bois', PALIERS[2] - 1), 'uni')
  assert.equal(styleAutorise('bois', PALIERS[2]), 'bois')
})

test('stockage du style : lecture tolérante, sans stockage rien ne casse', () => {
  faussePile()
  assert.equal(styleGarde(), 'uni')
  retenirStyle('laine')
  assert.equal(styleGarde(), 'laine')
  faussePile({ 'block-slid.style': 'n\'importe quoi' })
  assert.equal(styleGarde(), 'uni')
  const refus = () => { throw new Error('refusé') }
  globalThis.localStorage = { getItem: refus, setItem: refus, removeItem: refus }
  assert.equal(styleGarde(), 'uni')
  retenirStyle('laine')
})

test('le moteur ne connaît pas les styles : aucun changement de partie ni de format', () => {
  const sans = nouvellePartie({ graine: 11 })
  const avec = nouvellePartie({ graine: 11, reglages: REGLAGES })
  assert.deepEqual(JSON.parse(JSON.stringify(sans)), JSON.parse(JSON.stringify(avec)))
  for (const b of sans.blocs) {
    const p = deplacementsPossibles(sans, b.id)
    if (p.droite || p.gauche) {
      const e = jouer(sans, b.id, p.droite ? 1 : -1)
      assert.ok(!('style' in e))
      return
    }
  }
})
