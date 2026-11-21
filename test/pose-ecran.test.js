import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { lireSw } from '../tools/empreinte.js'
import {
  reservePose,
  reservePoseExiste,
  garderReservePose,
  retenirNiveauPose,
  niveauPose,
} from '../src/ui/stockage.js'
import { reserveInitiale, reserveVide, SORTES } from '../src/pose/index.js'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const lire = (chemin) => readFileSync(join(RACINE, chemin), 'utf8').replace(/\r\n/g, '\n')

function faussePile(initial = {}) {
  const m = new Map(Object.entries(initial))
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: (k) => { m.delete(k) },
  }
  return m
}

// --- La réserve de bonus, créée une seule fois -------------------------------------------------

test('réserve : « jamais créée » se distingue de « épuisée », seule la première reçoit les 3 de chaque', () => {
  faussePile()
  assert.equal(reservePoseExiste(), false)
  // La première utilisation la crée, avec 3 de chaque sorte (BS38).
  garderReservePose(reserveInitiale())
  assert.equal(reservePoseExiste(), true)
  assert.deepEqual(reservePose(), { supprimer: 3, tourner: 3, changer: 3, annuler: 3 })
  // Tous les bonus employés : la réserve vaut zéro partout, mais elle existe : rien n'est offert de nouveau.
  garderReservePose(reserveVide())
  assert.equal(reservePoseExiste(), true)
  assert.deepEqual(reservePose(), {})
})

test('réserve : un stockage qui refuse ne casse rien', () => {
  const refus = () => { throw new Error('refusé') }
  globalThis.localStorage = { getItem: refus, setItem: refus, removeItem: refus }
  assert.equal(reservePoseExiste(), false)
  assert.doesNotThrow(() => garderReservePose(reserveInitiale()))
  delete globalThis.localStorage
  assert.equal(reservePoseExiste(), false)
})

test('niveau : un seul réglage, 1 par défaut, borné de 1 à 10', () => {
  faussePile()
  assert.equal(niveauPose(), 1)
  retenirNiveauPose(7)
  assert.equal(niveauPose(), 7)
  retenirNiveauPose(99)
  assert.equal(niveauPose(), 10)
  retenirNiveauPose(-3)
  assert.equal(niveauPose(), 1)
})

test('les quatre sortes de bonus ont toutes une icône et un nom dans l\'écran', () => {
  const source = lire('src/pose/ecran.js')
  for (const sorte of SORTES) assert.match(source, new RegExp(`\\b${sorte}: \\{\\s*nom:`), sorte)
})

// --- Block-slid ne change pas : rien du nouvel écran ne croise le sien ----------------------------------

test('les identifiants créés par l\'écran de block-pose ne croisent aucun identifiant de la page', () => {
  const page = new Set([...lire('index.html').matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))
  const ecran = [...lire('src/pose/ecran.js').matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])
  assert.ok(ecran.length > 20)
  assert.deepEqual(ecran.filter((id) => page.has(id)), [])
  assert.equal(new Set(ecran).size, ecran.length, 'un identifiant est donné deux fois')
  for (const id of ecran) assert.match(id, /^pose(-|$)/, id)
})

test('pose.css : tous les sélecteurs sont sous l\'identifiant du jeu, jamais ceux de block-slid', () => {
  const css = lire('src/pose/pose.css').replace(/\/\*[\s\S]*?\*\//g, '')
  let profondeur = 0
  let prelude = ''
  const hors = []
  for (const c of css) {
    if (c === '{') {
      if (profondeur === 0) {
        const texte = prelude.trim()
        if (!texte.startsWith('@')) for (const sel of texte.split(',')) if (!/^#(pose\b|app\.jeu-pose)/.test(sel.trim())) hors.push(sel.trim())
      }
      profondeur++
      prelude = ''
    } else if (c === '}') {
      profondeur--
      prelude = ''
    } else if (profondeur === 0) {
      prelude += c
    }
  }
  assert.deepEqual(hors, [])
  // Les règles du @media du mouvement réduit visent aussi #pose.
  const media = css.match(/@media[^{]*\{([\s\S]*)\}\s*$/)[1]
  for (const sel of media.split('{')[0].split(',')) assert.match(sel.trim(), /^#pose/)
})

test('pose.css : le décor est en variables sur #pose (fond, grille, cadre, case vide) pour qu\'un style les surcharge', () => {
  const css = lire('src/pose/pose.css')
  for (const v of ['--pose-fond', '--pose-grille-fond', '--pose-cadre', '--pose-case-vide']) {
    assert.match(css, new RegExp(`${v}:`), v)
  }
  // Et l'écran porte la texture en cours sur sa racine, qui porte aussi le fond et la grille.
  assert.match(lire('src/pose/ecran.js'), /racine\.dataset\.style = style/)
  assert.match(css, /#pose \{[^}]*background: var\(--pose-fond\)/)
})

test('pose.css : le mouvement réduit garde l\'élévation, sans animation', () => {
  const css = lire('src/pose/pose.css')
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /#pose \.pose-case\.eleve \{[^}]*transform: translateY/)
  const media = css.slice(css.indexOf('@media (prefers-reduced-motion'))
  assert.doesNotMatch(media, /\.eleve/)
  assert.match(media, /transition-duration: \.01s !important/)
  assert.match(media, /animation-duration: \.01s !important/)
})

// --- Mise en ligne ---------------------------------------------------------------------------------

test('sw.js précache tout ce que l\'écran de block-pose charge, et chaque fichier existe', () => {
  const { fichiers } = lireSw()
  for (const f of fichiers) assert.ok(existsSync(join(RACINE, f)), `${f} est précaché mais n'existe pas`)
  for (const f of readdirSync(join(RACINE, 'src', 'pose'))) {
    assert.ok(fichiers.includes(`src/pose/${f}`), `src/pose/${f} n'est pas précaché`)
  }
  assert.ok(fichiers.includes('src/ui/jeu-pose.js'))
})

test('chaque module importé par l\'écran ou le point d\'entrée est précaché', () => {
  const { fichiers } = lireSw()
  for (const [source, dossier] of [['src/pose/ecran.js', 'src/pose'], ['src/ui/jeu-pose.js', 'src/ui']]) {
    for (const [, relatif] of lire(source).matchAll(/from '(\.[^']+)'/g)) {
      const chemin = join(dossier, relatif).replace(/\\/g, '/')
      assert.ok(fichiers.includes(chemin), `${source} importe ${chemin}, qui n'est pas précaché`)
    }
  }
})

test('block-pose est disponible : app.js le démarre par son point d\'entrée', () => {
  const app = lire('app.js')
  assert.match(app, /'block-pose': \(\) => import\('\.\/src\/ui\/jeu-pose\.js'\)/)
  assert.match(lire('src/ui/jeu-pose.js'), /export \{ demarrerJeu \} from '\.\.\/pose\/ecran\.js'/)
})
