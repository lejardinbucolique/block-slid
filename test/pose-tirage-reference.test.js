// Le tirage garanti rend les mêmes pièces que celles gardées dans test/tirage-reference.json : soixante tirages
// (tous niveaux, grilles de toutes densités, avec ou sans pièces en main, avec ou sans garantie d'effacement)
// rejoués avec le même hasard. Un tirage qui change fait changer toutes les parties : si c'est voulu, régénérer le
// fichier ; sinon, le code est en tort. Écrit avant l'accélération de BS61 (qui n'a rien changé), puis régénéré en
// BS62 pour les niveaux 1 à 5 seulement (le tirage regarde les lignes presque pleines) : les niveaux 6 à 10 sont
// restés tels que BS55 les rendait.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { tirerGaranti } from '../src/pose/tirage-garanti.js'

const reference = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tirage-reference.json'), 'utf8'))

// Un hasard simple, reproductible (xorshift).
function hasard(graine) {
  let x = graine >>> 0 || 1
  return () => {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0
    return x / 4294967296
  }
}

test('le tirage garanti rend les mêmes pièces que la référence', () => {
  assert.equal(reference.length, 60)
  for (const c of reference) {
    const grille = c.rangees.map((r) => [...r].map((v) => (v === 'x' ? 'x' : null)))
    const { ids, detail } = tirerGaranti({ aleatoire: hasard(c.graine), niveau: c.niveau, nombre: 3, grille, enCours: c.enCours, reglages: {}, exigerEfface: c.exiger })
    assert.deepEqual(ids, c.ids, `graine ${c.graine}, niveau ${c.niveau}`)
    assert.equal(Math.round(detail.liberte * 1e6) / 1e6, c.liberte, `liberté, graine ${c.graine}`)
    assert.equal(detail.fragilite, c.fragilite, `fragilité, graine ${c.graine}`)
  }
})
