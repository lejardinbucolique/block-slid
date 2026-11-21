import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { PALETTE } from '../src/pose/index.js'
import { stylesDuJeu } from '../src/ui/styles.js'
import { JEU_BLOCK_POSE } from '../src/jeux.js'

// Les décors de block-pose (BS47) : un par style, en variables CSS sur #pose[data-style].
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const lire = (chemin) => readFileSync(join(RACINE, chemin), 'utf8').replace(/\r\n/g, '\n')
const brut = lire('src/pose/pose.css')
const css = brut.replace(/\/\*[\s\S]*?\*\//g, '') // sans les commentaires, qui citent des exemples

const STYLES = stylesDuJeu(JEU_BLOCK_POSE).map((s) => s.id).filter((id) => id !== 'uni')
const SOMBRES = ['anthracite', 'marine', 'bordeaux', 'prune', 'sapin']
const CLAIRES = ['menthe', 'citron', 'jaune']

// Les variables d'un style : le corps de `#pose[data-style="x"] { ... }` (la règle sans pseudo-élément).
function variables(style) {
  const m = css.match(new RegExp(`#pose\\[data-style="${style}"\\] \\{([\\s\\S]*?)\\n\\}`))
  assert.ok(m, `${style} : pas de règle de décor`)
  const out = {}
  for (const [, nom, valeur] of m[1].matchAll(/(--pose-[a-z-]+):\s*([^;]+);/g)) out[nom] = valeur.trim()
  return out
}

function couleur(texte) {
  let m = texte.match(/^#([0-9a-f]{6})$/i)
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4), 16), a: 1 }
  m = texte.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/)
  assert.ok(m, `couleur illisible : ${texte}`)
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] }
}
const lineaire = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
const luminance = (c) => 0.2126 * lineaire(c.r) + 0.7152 * lineaire(c.g) + 0.0722 * lineaire(c.b)
const contraste = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
// Une couleur translucide posée sur un fond.
const sur = (c, fond) => ({ r: c.r * c.a + fond.r * (1 - c.a), g: c.g * c.a + fond.g * (1 - c.a), b: c.b * c.a + fond.b * (1 - c.a), a: 1 })

test('chaque style a son décor, avec toutes les variables qu\'il doit surcharger', () => {
  assert.equal(STYLES.length, 10)
  for (const style of STYLES) {
    const v = variables(style)
    for (const nom of ['--pose-fond', '--pose-texte', '--pose-accent', '--pose-cadre', '--pose-grille-fond', '--pose-case-vide', '--pose-case-vide-haut', '--pose-bouton', '--pose-bouton-bord', '--pose-liseret', '--pose-liseret-l']) {
      assert.ok(v[nom], `${style} : ${nom} manque`)
    }
    assert.notEqual(v['--pose-liseret-l'], '0px', `${style} : un liseré d'épaisseur nulle`)
    // Le fond de la page a son motif, et le style quitté garde le sien pendant le fondu.
    assert.ok(css.includes(`#pose[data-style="${style}"]::before,\n#pose[data-avant="${style}"]::after {`), `${style} : le motif de la page`)
  }
})

test('les textes se lisent sur le fond de chaque décor', () => {
  for (const style of STYLES) {
    const v = variables(style)
    const fond = couleur(v['--pose-fond'])
    assert.ok(contraste(couleur(v['--pose-texte']), fond) >= 4.5, `${style} : le score sur le fond`)
    assert.ok(contraste(couleur(v['--pose-accent']), fond) >= 3, `${style} : le record et le défi sur le fond`)
  }
})

test('le liseré des pièces contraste avec les cases du décor : sombre sur clair, clair sur sombre', () => {
  for (const style of STYLES) {
    const v = variables(style)
    const case_ = couleur(v['--pose-case-vide'])
    const fond = couleur(v['--pose-fond'])
    const trait = couleur(v['--pose-liseret'])
    assert.ok(trait.a >= 0.45, `${style} : un liseré trop discret`)
    // Le liseré est à cheval sur la pièce et sur la case : il doit trancher sur la case libre comme sur le fond.
    for (const [nom, support] of [['la case libre', case_], ['le fond', fond]]) {
      assert.ok(contraste(sur(trait, support), support) >= 2, `${style} : le liseré se perd sur ${nom}`)
    }
  }
})

test('huit couleurs extrêmes : sur chaque décor, une pièce se lit (couleur ou liseré)', () => {
  for (const style of STYLES) {
    const v = variables(style)
    const supports = [couleur(v['--pose-case-vide']), couleur(v['--pose-fond'])]
    const trait = couleur(v['--pose-liseret'])
    for (const id of [...SOMBRES, ...CLAIRES]) {
      const c = couleur(PALETTE.find((p) => p.id === id).valeur)
      for (const support of supports) {
        const bord = contraste(sur(trait, support), support) // le liseré se détache du support
        assert.ok(contraste(c, support) >= 1.6 || bord >= 2.5, `${style} : ${id} se perd (couleur ${contraste(c, support).toFixed(2)}, liseré ${bord.toFixed(2)})`)
      }
    }
  }
})

test('Uni garde le décor sobre de BS45 : ni motif ni liseré', () => {
  const tete = css.match(/#pose \{([\s\S]*?)--cw:/)[1]
  assert.match(tete, /--pose-liseret: transparent;/)
  assert.match(tete, /--pose-liseret-l: 0px;/)
  for (const nom of ['cadre', 'grille', 'case']) assert.match(tete, new RegExp(`--pose-motif-${nom}: none;`))
  assert.doesNotMatch(css, /#pose\[data-style="uni"\] \{/)
})

test('le décor change au fondu, sans saut, et respecte le mouvement réduit', () => {
  const ecran = lire('src/pose/ecran.js')
  assert.match(ecran, /function changerDecor\(avant, apres\)/)
  assert.match(ecran, /changerDecor\(avant, style\)/)
  assert.match(ecran, /racine\.dataset\.avant = avant/)
  assert.match(css, /#pose\.decor-change::before \{ animation: pose-decor-entre/)
  assert.match(css, /#pose\.decor-change::after \{ animation: pose-decor-sort/)
  const media = css.slice(css.indexOf('@media (prefers-reduced-motion'))
  assert.match(media, /#pose::before, #pose::after/)
  assert.match(media, /animation-duration: \.01s !important/)
})

test('pas de filtre SVG lourd dans les décors, et block-slid n\'est pas touché', () => {
  assert.doesNotMatch(css, /feTurbulence|feDisplacementMap|feGaussianBlur/i)
  const decors = css.slice(css.indexOf('/* --- Décors'))
  assert.doesNotMatch(decors, /filter:|backdrop-filter/)
  // Tous les sélecteurs de pose.css restent sous #pose (déjà éprouvé par pose-ecran.test.js), jamais ceux de block-slid.
  assert.doesNotMatch(decors, /#plateau|#app(?!\.jeu-pose)/)
})
