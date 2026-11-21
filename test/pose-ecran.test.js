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

// --- Les textures de block-slid, aussi sur les cases de block-pose (BS46) ---------------------------------

// Découpe un CSS en règles de premier niveau : { selecteurs: [...], corps }, sans les @-règles.
function regles(css) {
  const sans = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out = []
  let prof = 0
  let prelude = ''
  let chaine = null
  for (let i = 0; i < sans.length; i++) {
    const c = sans[i]
    if (chaine) {
      if (prof === 0) prelude += c
      if (c === '\\') { i++; if (prof === 0) prelude += sans[i] } else if (c === chaine) chaine = null
      continue
    }
    if (c === '"' || c === '\'') { chaine = c; if (prof === 0) prelude += c; continue }
    if (c === '{') { prof++; continue }
    if (c === '}') {
      prof--
      if (prof === 0) {
        const texte = prelude.trim()
        if (!texte.startsWith('@')) out.push({ selecteurs: separer(texte) })
        prelude = ''
      }
      continue
    }
    if (prof === 0) prelude += c
  }
  return out
}

// Sépare une liste de sélecteurs sur les virgules hors crochets, parenthèses et chaînes.
function separer(texte) {
  const liste = []
  let courant = ''
  let prof = 0
  let chaine = null
  for (const c of texte) {
    if (chaine) { courant += c; if (c === chaine) chaine = null; continue }
    if (c === '"' || c === '\'') chaine = c
    if (c === '(' || c === '[') prof++
    if (c === ')' || c === ']') prof--
    if (c === ',' && prof === 0) { liste.push(courant.trim()); courant = ''; continue }
    courant += c
  }
  liste.push(courant.trim())
  return liste
}

const jumeau = (sel) => sel.replace(/#plateau/g, '#pose').replace(/\.bloc(?![\w-])/g, '.pose-bloc')
const original = (sel) => sel.replace(/#pose/g, '#plateau').replace(/\.pose-bloc/g, '.bloc')

test('style.css : chaque règle d\'un style de block-slid vaut aussi pour les cases de block-pose', () => {
  const toutes = regles(lire('style.css'))
  const presents = new Set(toutes.flatMap((r) => r.selecteurs))
  const styles = [...presents].filter((s) => /^#plateau\[data-style="[a-z]+"\]/.test(s) && !s.includes('.instant'))
  assert.ok(styles.length > 150, `${styles.length} sélecteurs de styles trouvés`)
  assert.deepEqual(styles.filter((s) => !presents.has(jumeau(s))), [])
  // Un jumeau ne vit jamais seul : il est dans la même règle que son original, donc avec les mêmes déclarations.
  for (const r of toutes) {
    for (const s of r.selecteurs) {
      if (s.startsWith('#pose[data-style=')) assert.ok(r.selecteurs.includes(original(s)), s)
    }
  }
})

test('style.css : les dix textures ont leur jumeau, avec leur effacement', () => {
  const css = lire('style.css')
  for (const style of ['laine', 'beton', 'bois', 'bonbon', 'papier', 'metal', 'verre', 'marbre', 'neon', 'gemme']) {
    assert.ok(css.includes(`#pose[data-style="${style}"] .pose-bloc > i`), `${style} : le dessin`)
    assert.ok(css.includes(`#pose[data-style="${style}"] .pose-bloc.efface`), `${style} : l'effacement`)
  }
})

test('pose.css : les effets qui balaient une ligne ont leur version pour une colonne, sous les mêmes styles', () => {
  const css = lire('src/pose/pose.css')
  for (const style of ['laine', 'beton', 'bois', 'papier', 'metal', 'verre', 'marbre', 'gemme']) {
    assert.match(css, new RegExp(`#pose\\[data-style="${style}"\\] \\.pose-bloc\\.(allume|efface)\\.v`), style)
  }
  // Chaque animation verticale nommée existe.
  const noms = [...css.matchAll(/animation-name: ([a-z-]+-v);/g)].map((m) => m[1])
  assert.ok(noms.length >= 8)
  for (const nom of noms) assert.ok(css.includes(`@keyframes ${nom} {`), nom)
})

test('l\'écran donne à chaque case un bloc à deux éléments, et allume puis efface comme block-slid', () => {
  const source = lire('src/pose/ecran.js')
  assert.match(source, /bloc\.append\(document\.createElement\('i'\)\)/)
  assert.match(source, /sensEffacement\(coup\)/)
  assert.match(source, /marquerEffacement\(coup, 'allume'\)/)
  assert.match(source, /marquerEffacement\(coup, 'efface'\)/)
  // Le style Uni garde son effacement direct, sans temps d'allumage.
  assert.match(source, /if \(style === STYLE_UNI\)/)
  // Les textures lisent le nombre de cases d'une ligne.
  assert.match(source, /fixer\('--cols'/)
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
