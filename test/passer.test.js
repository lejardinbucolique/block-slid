import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SANS_FIGURES } from './partie-type.js'
import {
  REGLAGES,
  nouvellePartie,
  jouer,
  passerCoup,
  deplacerAVenir,
  deplacementsPossibles,
  versTexte,
  ligneVersTexte,
  depuisTexte,
} from '../src/moteur/index.js'

// Passer le coup (BS20) : la ligne monte sans qu'aucun bloc ne bouge.

const LIGNE_TIREE = '333.333.'
function tirageFixe(aleatoire, reglages) {
  return depuisTexte({ rangees: [LIGNE_TIREE], aVenir: [], reglages: { ...reglages, tirage: () => [] } }).blocs
    .map(({ col, largeur, couleur }) => ({ col, largeur, couleur }))
}
const PETITE = { ...REGLAGES, lignes: 6, tirage: tirageFixe }
const position = (rangees, aVenir = [LIGNE_TIREE, '1.1.1.1.'], options = {}) =>
  depuisTexte({ rangees, aVenir, reglages: PETITE, ...options })

// Une figure de six cases d'une case sur deux lignes : jaune, orange, rouge, vert, bleu, bleu clair.
const COULEURS = ['jaune', 'orange', 'rouge', 'vert', 'bleu', 'bleu clair']
const SIX = { cases: [0, 1, 2, 3, 4, 5].flatMap((col) => [0, 1].map((ligne) => ({ ligne, col, couleur: COULEURS[col] }))), depart: 10000 }
const AUTRE = { cases: SIX.cases.map((c) => ({ ...c, couleur: 'violet' })), depart: 10000 }

test('passer : la ligne monte, rien ne bouge, le coup compte et le bonus baisse de 100', () => {
  const e = position(['22......', '111111..'], ['111111..', '1.1.1.1.'], { figure: AUTRE })
  const apres = passerCoup(e)
  assert.deepEqual(versTexte(apres), ['........', '........', '........', '22......', '111111..', '111111..'])
  assert.equal(apres.coups, e.coups + 1)
  assert.equal(apres.bonus, 9900)
  assert.equal(apres.score, 0)
  assert.equal(apres.finie, false)
  assert.equal(ligneVersTexte(apres.aVenir[0], 8), '1.1.1.1.')
  // L'état de départ n'est pas touché.
  assert.equal(e.coups, 0)
  assert.equal(e.bonus, 10000)
  assert.equal(versTexte(e)[5], '111111..')
})

test("passer : les blocs gardent leur identité et leur colonne, sans geste il n'y a pas d'étape de glisse", () => {
  const e = position(['22......', '111111..'], ['111111..', '1.1.1.1.'])
  const apres = passerCoup(e)
  for (const b of e.blocs) {
    const apresB = apres.blocs.find((x) => x.id === b.id)
    assert.equal(apresB.col, b.col)
    assert.equal(apresB.ligne, b.ligne - 1)
  }
  assert.deepEqual(apres.dernierCoup.etapes.map((x) => x.genre), ['montee'])
})

test("passer : c'est la ligne arrangée par le joueur qui monte", () => {
  const e = position(['22......', '22......'], ['4444....', LIGNE_TIREE])
  const b = e.aVenir[0].find((x) => deplacementsPossibles(e, x.id).droite > 0)
  const arrange = deplacerAVenir(e, b.id, 1)
  const texte = ligneVersTexte(arrange.aVenir[0], 8)
  assert.equal(texte, '.4444...')
  const apres = passerCoup(arrange)
  assert.equal(versTexte(apres)[5], texte)
})

test('passer : le score ne monte que par les lignes complétées', () => {
  // La ligne qui monte est pleine : elle disparaît (10 points), les autres retombent à leur place.
  const e = position(['22......', '11......'], ['44444444', LIGNE_TIREE])
  const apres = passerCoup(e)
  assert.equal(apres.dernierCoup.lignesEffacees, 1)
  assert.equal(apres.dernierCoup.points, 10)
  assert.equal(apres.score, 10)
  assert.equal(apres.coups, 1)
  assert.deepEqual(versTexte(apres).slice(4), ['22......', '11......'])
})

test('passer : la défaite arrive comme après un déplacement, puis la partie finie refuse', () => {
  const e = position(Array(6).fill('22......'))
  const apres = passerCoup(e)
  assert.equal(apres.finie, true)
  assert.equal(apres.dernierCoup.defaite, true)
  assert.equal(apres.dernierCoup.etapes.at(-1).genre, 'defaite')
  assert.equal(passerCoup(apres), null)
  assert.equal(jouer(apres, apres.blocs[0].id, 1), null)
})

test('passer : un bloc sur la ligne du haut ne fait perdre que quand la ligne monte dessous', () => {
  const e = position(['1.......', ...Array(5).fill('22......')])
  assert.equal(e.finie, false)
  assert.equal(passerCoup(e).finie, true)
})

test('passer : même règle de secours qu’après un déplacement', () => {
  // Une seule ligne occupée : elle est recopiée avant l'arrivée de la ligne à venir.
  const e = position(['4444.22.'])
  const apres = passerCoup(e)
  assert.equal(apres.dernierCoup.secours, 'une ligne')
  assert.deepEqual(versTexte(apres).slice(3), ['4444.22.', '4444.22.', LIGNE_TIREE])
  assert.equal(ligneVersTexte(apres.aVenir[0], 8), '1.1.1.1.')
  const ids = apres.blocs.map((b) => b.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('passer : une figure complétée par la ligne qui monte rapporte son bonus', () => {
  // Avant : les deux lignes du bas ne portent pas la figure. La ligne qui monte, jaune à bleu clair,
  // donne la même rangée « 111111.. » que celle d'en dessous : la figure est faite.
  const e = position(['22......', '111111..'], ['111111..', LIGNE_TIREE], { figure: SIX })
  const apres = passerCoup(e)
  assert.deepEqual(versTexte(apres).slice(3), ['22......', '111111..', '111111..'])
  assert.equal(apres.dernierCoup.figure.issue, 'reussie')
  assert.equal(apres.dernierCoup.figure.gain, 9900)
  assert.equal(apres.score, 9900)
  assert.notDeepEqual(apres.figure, SIX)
  assert.equal(apres.bonus, apres.figure.depart)
})

test('passer : le bonus tombé à 0 expire la figure', () => {
  const e = position(['22......', '111111..'], ['111111..', '1.1.1.1.'], { figure: AUTRE, bonus: 100 })
  const apres = passerCoup(e)
  assert.equal(apres.dernierCoup.figure.issue, 'expiree')
  assert.equal(apres.score, 0)
})

test('passer : sans figures, rien de plus que la montée', () => {
  const e = nouvellePartie({ graine: 3, reglages: SANS_FIGURES })
  const apres = passerCoup(e)
  assert.equal(apres.dernierCoup.figure, null)
  assert.equal(apres.coups, 1)
})

test('passer : les étapes finissent exactement sur l’état final', () => {
  for (let graine = 1; graine <= 30; graine++) {
    const apres = passerCoup(nouvellePartie({ graine }))
    const derniere = apres.dernierCoup.etapes.at(-1)
    const ids = (blocs) => blocs.map((b) => `${b.id}:${b.ligne}:${b.col}`).sort()
    assert.deepEqual(ids(derniere.blocs), ids(apres.blocs), `graine ${graine}`)
  }
})

test('passer : le tirage des lignes suivantes est celui d’un déplacement', () => {
  let comparees = 0
  for (const reglages of [SANS_FIGURES, REGLAGES]) {
    for (let graine = 1; graine <= 60; graine++) {
      let e = nouvellePartie({ graine, reglages })
      for (let tour = 0; tour < 15 && !e.finie; tour++) {
        const coup = e.blocs
          .map((b) => ({ b, p: deplacementsPossibles(e, b.id) }))
          .find(({ p }) => p.gauche || p.droite)
        if (!coup) break
        const dx = coup.p.droite ? 1 : -1
        const passe = passerCoup(e)
        const joue = jouer(e, coup.b.id, dx)
        assert.ok(passe && joue)
        // Hors secours (qui tire une ligne de plus), les deux coups tirent une seule ligne, la même.
        if (passe.dernierCoup.secours === null && joue.dernierCoup.secours === null) {
          assert.equal(passe.hasard, joue.hasard, `graine ${graine}, tour ${tour}`)
          assert.equal(passe.prochainId, joue.prochainId)
          assert.deepEqual(passe.aVenir[1], joue.aVenir[1])
          // La première place est prise par la ligne qui était deuxième.
          assert.deepEqual(passe.aVenir[0], e.aVenir[1])
          comparees++
        }
        e = joue
      }
    }
  }
  assert.ok(comparees > 500, `seulement ${comparees} tirages comparés`)
})

test('passer : une partie jouée à coups passés ne casse pas l’état', () => {
  for (let graine = 1; graine <= 30; graine++) {
    let e = nouvellePartie({ graine })
    for (let n = 0; n < 40 && !e.finie; n++) {
      e = passerCoup(e)
      const ids = e.blocs.map((b) => b.id)
      assert.equal(new Set(ids).size, ids.length)
      assert.ok(e.finie || new Set(e.blocs.map((b) => b.ligne)).size >= 2)
    }
  }
})
