// La fluidité du glisser de block-pose (BS59) : ce que le code ne doit plus faire, sous peine de rendre la pièce
// saccadée sous le doigt. Les mesures elles-mêmes sont dans tools/perf (glisse-fluide-pose.mjs) ; ici, des gardes
// sur la forme du code, qui cassent si on revient en arrière sans le vouloir.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const lire = (chemin) => readFileSync(join(RACINE, chemin), 'utf8').replace(/\r\n/g, '\n')

// Le corps d'une fonction de ecran.js (de sa ligne « function nom( » jusqu'à la suivante, au même retrait).
function corps(source, nom) {
  const debut = source.indexOf(`  function ${nom}(`)
  assert.notEqual(debut, -1, `function ${nom} introuvable`)
  const fin = source.indexOf('\n  }\n', debut)
  return source.slice(debut, fin + 5)
}

test('ecran.js : l\'aperçu du glisser ne touche aucune case de la grille (ni classe, ni couleur)', () => {
  const ecran = lire('src/pose/ecran.js')
  for (const nom of ['montrerApercu', 'effacerApercu', 'montrerBandes', 'masquerBandes', 'mouvementGlisse', 'placerFantome', 'viser']) {
    const f = corps(ecran, nom)
    assert.doesNotMatch(f, /laCase\(/, `${nom} ne doit pas toucher les cases`)
    assert.doesNotMatch(f, /\.classList\.(add|remove|toggle)\(['"](ombre|vise|eleve)/, nom)
  }
})

test('ecran.js : le rectangle de la grille se mesure une fois par glisser, pas à chaque mouvement du doigt', () => {
  const ecran = lire('src/pose/ecran.js')
  assert.doesNotMatch(corps(ecran, 'viser'), /getBoundingClientRect/)
  assert.doesNotMatch(corps(ecran, 'mouvementGlisse'), /getBoundingClientRect|offsetWidth|offsetHeight|clientWidth/)
  assert.match(corps(ecran, 'debutGlisse'), /grille: grilleEl\.getBoundingClientRect\(\)/)
})

test('ecran.js : la pose ne lève plus les cases des lignes effacées, elle éclaire leurs bandes', () => {
  const ecran = lire('src/pose/ecran.js')
  assert.doesNotMatch(ecran, /classList\.add\('eleve'\)/)
  assert.match(corps(ecran, 'jouerCoup'), /montrerBandes\(coup\.lignes, coup\.colonnes\)/)
})

test('ecran.js : redessiner la grille n\'écrit que ce qui change (une couleur identique ne recalcule pas la texture)', () => {
  const f = corps(lire('src/pose/ecran.js'), 'dessinerGrille')
  assert.match(f, /el\.className !== classe/)
  assert.match(f, /getPropertyValue\('--couleur'\) !== couleur/)
  assert.doesNotMatch(f, /\n\s*bloc\.className = 'pose-bloc'\n/)
})

test('pose.css : les couches de l\'aperçu sont à part (ombre et bandes), et les bandes tiennent sur une ligne ou une colonne', () => {
  const css = lire('src/pose/pose.css')
  assert.match(css, /#pose-ombre \{[^}]*will-change: opacity/)
  assert.match(css, /#pose-lignes \{[^}]*will-change: opacity/)
  assert.match(css, /#pose \.pose-bande-ligne \{[^}]*var\(--cols\)/)
  assert.match(css, /#pose \.pose-bande-colonne \{[^}]*var\(--lignes\)/)
  const ecran = lire('src/pose/ecran.js')
  assert.ok(ecran.indexOf('id="pose-lignes"') !== -1 && ecran.indexOf('id="pose-lignes"') < ecran.indexOf('id="pose-ombre"'),
    'les bandes se peignent sous l\'ombre de la pièce')
  assert.match(ecran, /fixer\('--lignes'/)
  assert.match(ecran, /fixer\('--cols'/)
})

test('style.css : une déclaration qui lit une variable n\'embarque pas une grosse image (elle serait relue pour chaque bloc)', () => {
  // Une déclaration avec var() est analysée de nouveau pour chaque élément qui la reçoit, image intégrée comprise :
  // l'image de 45 Ko du Marbre figeait l'effacement plus d'une demi-seconde (BS59). Les grosses images vont dans un fichier.
  const css = lire('style.css')
  const trop = []
  for (const m of css.matchAll(/url\("data:[^"]*"\)/g)) {
    const debut = css.lastIndexOf(';', m.index)
    const fin = css.indexOf(';', m.index + m[0].length)
    const declaration = css.slice(debut + 1, fin === -1 ? css.length : fin).replace(m[0], '')
    if (declaration.includes('var(') && m[0].length > 2000) trop.push(m[0].length)
  }
  assert.deepEqual(trop, [])
  assert.ok(existsSync(join(RACINE, 'textures/marbre-veines.svg')))
  assert.match(css, /url\("textures\/marbre-veines\.svg"\)/)
})

test("ecran.js : l'ombre du glisser ne se prépare pas dans l'image où la pièce se détache de la main (BS61)", () => {
  const ecran = lire('src/pose/ecran.js')
  // Elle se dessine (textures par bloc) deux images plus tard, ou tout de suite si le doigt entre aussitôt sur la grille.
  assert.doesNotMatch(corps(ecran, 'debutGlisse'), /preparerOmbre\(/)
  assert.match(corps(ecran, 'debutGlisse'), /requestAnimationFrame\(\(\) => requestAnimationFrame\(/)
  assert.match(corps(ecran, 'montrerApercu'), /preparerOmbreDuGlisse\(\)/)
  assert.match(corps(ecran, 'preparerOmbreDuGlisse'), /preparerOmbre\(glisse\.enMain\)/)
})

test('pose.css : la pièce prise dans la main a sa couche, la griser ne repeint pas ses textures (BS61)', () => {
  const css = lire('src/pose/pose.css')
  assert.match(css, /#pose \.pose-emplacement \.pose-piece \{ will-change: opacity; \}/)
  assert.match(css, /#pose \.pose-emplacement\.leve \.pose-piece \{ opacity: \.18; \}/)
})

test("ecran.js : la main qui se renouvelle ne force qu'une mesure de la page, non une par pièce (BS61)", () => {
  const f = corps(lire('src/pose/ecran.js'), 'dessinerPieces')
  assert.equal((f.match(/offsetWidth/g) ?? []).length, 1)
  assert.doesNotMatch(f, /slot\.offsetWidth/)
})
