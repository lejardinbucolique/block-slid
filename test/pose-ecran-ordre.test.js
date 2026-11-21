// BS49 : l'ordre des blocs de l'écran de block-pose, lu dans le source (sans navigateur).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/pose/ecran.js', import.meta.url), 'utf8')
const racine = source.slice(source.indexOf('const HTML_RACINE'), source.indexOf('id="pose-infos"'))

test('BS49 : nom du jeu, grille, pièces, aperçu, aide puis bonus, de haut en bas', () => {
  const ids = ['pose-nom', 'pose-score', 'pose-zone', 'pose-main', 'pose-apercu', 'pose-aide', 'pose-bonus']
  const places = ids.map((id) => racine.indexOf(`id="${id}"`))
  assert.ok(places.every((p) => p >= 0), 'chaque bloc est présent')
  assert.deepEqual([...places].sort((a, b) => a - b), places)
})

test('BS49 : le nom du jeu vient du registre des jeux, pas d une copie en dur', () => {
  assert.match(racine, /id="pose-nom">\$\{NOM_JEU\}</)
})
