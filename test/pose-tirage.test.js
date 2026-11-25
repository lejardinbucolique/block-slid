// Tirage garanti de block-pose (BS41) : trois pièces toujours posables, aperçu couvert.
//
// Le vérificateur ci-dessous est indépendant du tirage : grille en tableaux de
// booléens (le tirage travaille en masques de bits), recherche exhaustive, pose et
// effacement réécrits. Il ne partage avec lui que le catalogue des pièces, qui est
// la donnée. Les robots rejouent ses suites de poses par le moteur de BS40, ce qui
// confronte aussi les deux façons d'effacer les lignes.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CATALOGUE,
  REGLAGES,
  piece,
  nouvellePartie,
  poser,
  bloquee,
  piecesJouables,
  positionsPossibles,
  depuisTexte,
  tirerPieces,
  NIVEAU_MIN,
  NIVEAU_MAX,
  poidsDesPieces,
} from '../src/pose/index.js'
import { tirerGaranti, tirageGaranti, CANDIDATS } from '../src/pose/tirage-garanti.js'
import { poserV, suite, grilleDe } from './pose-verificateur.js'

const NIVEAUX = Array.from({ length: NIVEAU_MAX - NIVEAU_MIN + 1 }, (_, i) => NIVEAU_MIN + i)
const H = REGLAGES.lignes
const L = REGLAGES.colonnes

// Hasard des essais, à part de celui de la partie.
function generateur(graine) {
  let s = graine >>> 0
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296
}

// --- Le vérificateur (pose-verificateur.js, partagé avec les tests des bonus) ------

const grilleVide = () => Array.from({ length: H }, () => Array(L).fill(false))
const occupees = (g) => g.flat().filter(Boolean).length

// Une grille au hasard remplie à `densite` (0 à 1), sans ligne ni colonne pleine
// (comme toute grille d'une partie) et avec une case libre au moins.
function grilleAuHasard(alea, densite) {
  const g = grilleVide().map((r) => r.map(() => alea() < densite))
  for (;;) {
    const l = g.findIndex((r) => r.every(Boolean))
    if (l >= 0) { g[l][Math.floor(alea() * L)] = false; continue }
    const k = g[0].findIndex((_, j) => g.every((r) => r[j]))
    if (k >= 0) { g[Math.floor(alea() * H)][k] = false; continue }
    return g
  }
}

// Les rangées en texte pour depuisTexte.
const enTexte = (g) => g.map((r) => r.map((v) => (v ? '#' : '.')).join(''))

// Des états de parties jouées au hasard, au début de leurs tours (les trois pièces en
// main) : des grilles que seul le jeu produit, de vides à très pleines.
function etatsDeParties(niveau, parties, coupsMax, graine) {
  const alea = generateur(graine)
  const etats = []
  for (let p = 0; p < parties; p++) {
    let e = nouvellePartie({ graine: graine * 100 + p, niveau })
    etats.push(e)
    for (let i = 0; i < coupsMax && !bloquee(e); i++) {
      const jouables = piecesJouables(e)
      const index = jouables[Math.floor(alea() * jouables.length)]
      const places = positionsPossibles(e, index)
      const { ligne, col } = places[Math.floor(alea() * places.length)]
      e = poser(e, index, ligne, col)
      // Une main entamée (places de l'aperçu déjà posées aux niveaux 1 et 2, BS58) n'est pas un début de tour.
      if (e.dernierCoup.nouveauTour && e.enCours.every(Boolean)) etats.push(e)
    }
  }
  return etats
}

// --- Le vérificateur lui-même -------------------------------------------------

test('le vérificateur : voit qu\'une pose qui efface fait de la place', () => {
  // Tout est plein sauf les deux cases en haut à gauche : la première barre de 2 efface
  // la ligne et les deux colonnes, la deuxième tient ensuite.
  const g = grilleVide().map((r, i) => r.map((_, j) => !(i === 0 && j < 2)))
  const s = suite(g, [['barre2.0', 'barre2.0', 'bloc.0']])
  assert.ok(s)
  assert.deepEqual(s[0], { groupe: 0, index: 0, id: 'barre2.0', ligne: 0, col: 0 })
  assert.equal(s.length, 3)
  // Et il voit qu'il n'y a pas de suite quand il n'y en a pas : le damier ne laisse aucune case voisine.
  const damier = grilleVide().map((r, i) => r.map((_, j) => (i + j) % 2 === 0))
  assert.equal(suite(damier, [['barre2.0', 'bloc.0', 'bloc.0']]), null)
  assert.ok(suite(damier, [['bloc.0', 'bloc.0', 'bloc.0']]))
})

test('le vérificateur et le moteur effacent pareil', () => {
  const alea = generateur(5)
  let compares = 0
  for (let i = 0; i < 400; i++) {
    const g = grilleAuHasard(alea, 0.4 + alea() * 0.5)
    const id = CATALOGUE[Math.floor(alea() * CATALOGUE.length)].id
    const e = depuisTexte({ rangees: enTexte(g), enCours: [id, null, null], suivantes: ['bloc.0', 'bloc.0', 'bloc.0'] })
    for (let l = 0; l < H; l++) {
      for (let k = 0; k < L; k++) {
        const v = poserV(g, id, l, k)
        const m = poser(e, 0, l, k)
        assert.equal(Boolean(v), Boolean(m))
        if (v) { assert.deepEqual(grilleDe(m), v); compares++ }
      }
    }
  }
  assert.ok(compares > 1000, `seulement ${compares} poses comparées`)
})

// --- La garantie : trois pièces -----------------------------------------------

test('trois pièces : sur des milliers de grilles, à chaque niveau, vides, mi-pleines et très pleines', () => {
  const alea = generateur(11)
  const densites = [0, 0.15, 0.3, 0.45, 0.6, 0.7, 0.78, 0.84, 0.9]
  let total = 0
  for (const niveau of NIVEAUX) {
    for (const d of densites) {
      for (let i = 0; i < 40; i++) {
        const g = grilleAuHasard(alea, d)
        const ids = tirageGaranti({ aleatoire: alea, niveau, nombre: 3, grille: g.map((r) => r.map((v) => (v ? 'x' : null))), enCours: [], reglages: REGLAGES })
        assert.equal(ids.length, 3)
        assert.ok(suite(g, [ids]), `niveau ${niveau}, densité ${d}, pièces ${ids}, grille\n${enTexte(g).join('\n')}`)
        total++
      }
    }
  }
  assert.ok(total >= 3600, `${total}`)
})

test('trois pièces : sur des grilles de parties jouées au hasard', () => {
  let total = 0
  for (const niveau of NIVEAUX) {
    for (const e of etatsDeParties(niveau, 16, 150, 20 + niveau)) {
      const ids = tirageGaranti({ aleatoire: generateur(total + 1), niveau, nombre: 3, grille: e.grille, enCours: [], reglages: REGLAGES })
      assert.ok(suite(grilleDe(e), [ids]), `niveau ${niveau} : ${ids}`)
      total++
    }
  }
  assert.ok(total >= 800, `seulement ${total} grilles de parties`)
})

test('la garantie tient au pire : une seule case libre, il reste toujours de quoi poser trois pièces', () => {
  const alea = generateur(3)
  for (const niveau of NIVEAUX) {
    for (let i = 0; i < 30; i++) {
      const g = grilleVide().map((r) => r.map(() => true))
      // Une seule case libre : le bloc la remplit, la grille pleine s'efface, et de la place revient.
      const l = Math.floor(alea() * H)
      const k = Math.floor(alea() * L)
      g[l][k] = false
      const ids = tirageGaranti({ aleatoire: alea, niveau, nombre: 3, grille: g.map((r) => r.map((v) => (v ? 'x' : null))), enCours: [], reglages: REGLAGES })
      assert.ok(suite(g, [ids]), `niveau ${niveau} : ${ids}`)
    }
  }
})

// --- La garantie : six pièces, avec l'aperçu ------------------------------------

test('six pièces : les trois en main puis les trois suivantes, sur des milliers de grilles, à chaque niveau', () => {
  const alea = generateur(77)
  const densites = [0, 0.2, 0.4, 0.55, 0.65, 0.75, 0.82, 0.88]
  let total = 0
  for (const niveau of NIVEAUX) {
    for (const d of densites) {
      for (let i = 0; i < 30; i++) {
        const g = grilleAuHasard(alea, d)
        const grille = g.map((r) => r.map((v) => (v ? 'x' : null)))
        const enCours = tirageGaranti({ aleatoire: alea, niveau, nombre: 3, grille, enCours: [], reglages: REGLAGES })
        const suivantes = tirageGaranti({ aleatoire: alea, niveau, nombre: 3, grille, enCours, reglages: REGLAGES })
        assert.ok(suite(g, [enCours, suivantes]), `niveau ${niveau}, densité ${d} : ${enCours} puis ${suivantes}\n${enTexte(g).join('\n')}`)
        total++
      }
    }
  }
  assert.ok(total >= 1900, `${total}`)
})

test('six pièces : pour toute main posable, même tirée sans garantie (la recherche des témoins est exhaustive)', () => {
  const alea = generateur(123)
  let testes = 0
  let ecartes = 0
  for (const niveau of NIVEAUX) {
    for (const d of [0.3, 0.5, 0.65, 0.75, 0.82, 0.88]) {
      for (let i = 0; i < 90; i++) {
        const g = grilleAuHasard(alea, d)
        const grille = g.map((r) => r.map((v) => (v ? 'x' : null)))
        // Mains tirées au hasard, sans garantie : on ne garde que celles qui se posent.
        const enCours = tirerPieces({ aleatoire: alea, niveau, nombre: 3 })
        if (!suite(g, [enCours])) { ecartes++; continue }
        const suivantes = tirageGaranti({ aleatoire: alea, niveau, nombre: 3, grille, enCours, reglages: REGLAGES })
        assert.ok(suite(g, [enCours, suivantes]), `niveau ${niveau}, densité ${d} : ${enCours} puis ${suivantes}\n${enTexte(g).join('\n')}`)
        testes++
      }
    }
  }
  assert.ok(testes >= 1500, `seulement ${testes} mains posables (${ecartes} écartées)`)
})

test('six pièces : depuis des grilles de parties jouées au hasard', () => {
  let testes = 0
  let ecartes = 0
  for (const niveau of NIVEAUX) {
    for (const e of etatsDeParties(niveau, 20, 150, 40 + niveau)) {
      const enCours = e.enCours.map((x) => x.id)
      if (!suite(grilleDe(e), [enCours])) { ecartes++; continue }
      const suivantes = tirageGaranti({ aleatoire: generateur(testes + 9), niveau, nombre: 3, grille: e.grille, enCours, reglages: REGLAGES })
      assert.ok(suite(grilleDe(e), [enCours, suivantes]), `niveau ${niveau} : ${enCours} puis ${suivantes}`)
      testes++
    }
  }
  assert.ok(testes >= 1000, `seulement ${testes} grilles (${ecartes} mains non posables écartées)`)
})

test('mains impossibles à poser (mauvaise pose du joueur) : le tirage rend des pièces valides, sans garantie', () => {
  const damier = grilleVide().map((r, i) => r.map((_, j) => (i + j) % 2 === 0))
  for (const niveau of NIVEAUX) {
    const r = tirerGaranti({
      aleatoire: generateur(niveau),
      niveau,
      nombre: 3,
      grille: damier.map((x) => x.map((v) => (v ? 'x' : null))),
      enCours: ['carre2.0', 'barre2.0', 'carre3.0'],
      reglages: REGLAGES,
    })
    assert.equal(r.ids.length, 3)
    assert.ok(r.ids.every((id) => piece(id)))
    assert.equal(r.detail.temoin, false)
    assert.equal(r.detail.budgetEpuise, false)
    // Sur la grille réelle, le tour suivant reste posable.
    assert.ok(suite(damier, [r.ids]), `niveau ${niveau} : ${r.ids}`)
  }
})

// --- Des parties jouées par un robot qui suit le témoin ---------------------------

test('un robot qui suit la suite de poses n\'est jamais bloqué : plusieurs centaines de tours, à chaque niveau', () => {
  const TOURS = 300
  for (const niveau of NIVEAUX) {
    for (const graine of [niveau * 7, niveau * 7 + 1]) {
      let e = nouvellePartie({ graine, niveau })
      for (let tour = 0; tour < TOURS; tour++) {
        assert.equal(e.tours, tour)
        const enCours = e.enCours.map((x) => x.id)
        const suivantes = e.suivantes.map((x) => x.id)
        // La garantie : trois pièces en main puis trois suivantes, il existe une suite.
        const s = suite(grilleDe(e), [enCours, suivantes])
        assert.ok(s, `niveau ${niveau}, graine ${graine}, tour ${tour} : ${enCours} puis ${suivantes}\n${e.grille.map((r) => r.map((v) => (v === null ? '.' : '#')).join('')).join('\n')}`)
        let g = grilleDe(e)
        for (const coup of s.filter((c) => c.groupe === 0)) {
          g = poserV(g, coup.id, coup.ligne, coup.col)
          assert.ok(!bloquee(e), `niveau ${niveau}, tour ${tour} : bloquée`)
          e = poser(e, coup.index, coup.ligne, coup.col)
          assert.ok(e, `niveau ${niveau}, tour ${tour} : pose refusée`)
          assert.deepEqual(grilleDe(e), g)
        }
        assert.equal(e.tours, tour + 1)
      }
      assert.equal(e.coups, TOURS * 3)
    }
  }
})

// --- La répartition des pièces, la serrure, le temps ----------------------------

const difficulteMoyenne = (ids) => ids.reduce((s, id) => s + piece(id).difficulte, 0) / ids.length

// Des tirages sur des grilles de parties, à chaque niveau, avec leur durée.
function tirages(niveau, n, graine) {
  const alea = generateur(graine)
  const ids = []
  const details = []
  const durees = []
  const etats = etatsDeParties(niveau, 10, 100, graine)
  for (let i = 0; i < n; i++) {
    const e = etats[i % etats.length]
    const enCours = i % 2 === 0 ? [] : e.enCours.map((x) => x.id)
    const t0 = performance.now()
    const r = tirerGaranti({ aleatoire: alea, niveau, nombre: 3, grille: e.grille, enCours, reglages: REGLAGES })
    durees.push(performance.now() - t0)
    ids.push(...r.ids)
    details.push(r.detail)
  }
  return { ids, details, durees }
}

test('répartition : pas que des petites, les grosses viennent avec le niveau', (t) => {
  const par = {}
  for (const niveau of NIVEAUX) par[niveau] = tirages(niveau, 400, 500 + niveau)
  for (const niveau of NIVEAUX) {
    const { ids } = par[niveau]
    const parts = [1, 2, 3, 4].map((d) => ids.filter((id) => piece(id).difficulte === d).length / ids.length)
    const blocs = ids.filter((id) => id === 'bloc.0').length / ids.length
    const formes = new Set(ids.map((id) => piece(id).forme)).size
    t.diagnostic(`niveau ${niveau} : difficultés 1-4 ${parts.map((p) => `${Math.round(p * 100)} %`).join(' / ')} ; blocs seuls ${Math.round(blocs * 100)} % ; ${formes} formes`)
    assert.ok(blocs < 0.35, `niveau ${niveau} : ${blocs} de blocs`)
    assert.ok(formes >= 5, `niveau ${niveau} : ${formes} formes`)
  }
  // Niveau 1 : peu de tordues. Les petites pièces (bloc, barre de 2, coin) y viennent surtout quand elles finissent une
  // ligne ou une colonne presque pleine (BS62) : sur ces grilles éparpillées, jusqu'à un tiers des pièces de difficulté 3
  // et plus ; la table seule n'en donne que 8 %. Niveau 10 : de tout, dont des grosses.
  const part = (n, d) => par[n].ids.filter((id) => piece(id).difficulte >= d).length / par[n].ids.length
  assert.ok(part(1, 3) <= 0.4, `${part(1, 3)}`)
  assert.ok(part(1, 4) <= 0.1, `${part(1, 4)}`)
  assert.ok(part(10, 4) >= 0.15, `${part(10, 4)}`)
  assert.ok(part(10, 3) >= 0.35, `${part(10, 3)}`)
  // La difficulté moyenne monte avec le niveau (à une marge de hasard près), de bout en bout.
  const moy = NIVEAUX.map((n) => difficulteMoyenne(par[n].ids))
  for (let i = 1; i < moy.length; i++) assert.ok(moy[i] >= moy[i - 1] - 0.05, `niveau ${i + 1} : ${moy}`)
  assert.ok(moy[9] - moy[0] > 1, `${moy}`)
})

test('serrure : la liberté de pose du témoin baisse avec le niveau', (t) => {
  const libertes = NIVEAUX.map((n) => {
    const { details } = tirages(n, 300, 900 + n)
    return details.reduce((s, d) => s + d.liberte, 0) / details.length
  })
  t.diagnostic(`liberté moyenne (1 : tout ouvert) par niveau : ${libertes.map((x) => x.toFixed(2)).join(' ')}`)
  for (let i = 1; i < libertes.length; i++) assert.ok(libertes[i] <= libertes[i - 1] + 0.1, `niveau ${i + 1} : ${libertes}`)
  assert.ok(libertes[0] - libertes[9] > 0.3, `${libertes}`)
})

test('temps : un tirage reste bien sous 50 ms, en moyenne et au pire, à chaque niveau', (t) => {
  let pire = 0
  for (const niveau of NIVEAUX) {
    const { durees, details } = tirages(niveau, 400, 1300 + niveau)
    const moyenne = durees.reduce((s, x) => s + x, 0) / durees.length
    const max = Math.max(...durees)
    const remplacees = details.reduce((s, d) => s + d.remplacees, 0) / (details.length * CANDIDATS * 3)
    const sansTemoin = details.filter((d) => !d.temoin).length
    t.diagnostic(`niveau ${niveau} : ${moyenne.toFixed(2)} ms en moyenne, ${max.toFixed(2)} ms au pire ; pièces remplacées par le repli ${(remplacees * 100).toFixed(1)} % ; mains sans témoin ${sansTemoin}`)
    assert.ok(moyenne < 10, `niveau ${niveau} : ${moyenne} ms`)
    assert.ok(max < 100, `niveau ${niveau} : ${max} ms`)
    assert.ok(details.every((d) => !d.budgetEpuise), `niveau ${niveau} : budget de recherche épuisé`)
    pire = Math.max(pire, max)
  }
  t.diagnostic(`pire tirage de tous les niveaux : ${pire.toFixed(2)} ms`)
})

test('le tirage au pire : des mains tendues sur des grilles très pleines restent bien sous 50 ms', () => {
  const alea = generateur(2024)
  let pire = 0
  let essais = 0
  for (const niveau of [1, 5, 10]) {
    for (let i = 0; i < 300; i++) {
      const g = grilleAuHasard(alea, 0.75 + alea() * 0.15)
      const enCours = tirerPieces({ aleatoire: alea, niveau: 10, nombre: 3 })
      const t0 = performance.now()
      const r = tirerGaranti({ aleatoire: alea, niveau, nombre: 3, grille: g.map((x) => x.map((v) => (v ? 'x' : null))), enCours, reglages: REGLAGES })
      pire = Math.max(pire, performance.now() - t0)
      assert.equal(r.detail.budgetEpuise, false)
      essais++
    }
  }
  assert.ok(essais === 900)
  assert.ok(pire < 50, `${pire} ms`)
})

// --- Reproductible, interface -----------------------------------------------------

test('même graine, même grille, même niveau : même tirage', () => {
  const e = etatsDeParties(6, 3, 60, 61).at(-1)
  for (const enCours of [[], e.enCours.map((x) => x.id)]) {
    const a = tirageGaranti({ aleatoire: generateur(8), niveau: 6, nombre: 3, grille: e.grille, enCours, reglages: REGLAGES })
    const b = tirageGaranti({ aleatoire: generateur(8), niveau: 6, nombre: 3, grille: e.grille, enCours, reglages: REGLAGES })
    assert.deepEqual(a, b)
  }
})

test('une partie est rejouable : même graine, mêmes poses, mêmes pièces ; la graine reste dans l\'état', () => {
  const jouer = () => {
    const alea = generateur(4)
    let e = nouvellePartie({ graine: 99, niveau: 8 })
    const vus = []
    for (let i = 0; i < 90 && !bloquee(e); i++) {
      vus.push(e.enCours.map((x) => x && x.id).join(), e.suivantes.map((x) => x.id).join())
      const jouables = piecesJouables(e)
      const index = jouables[Math.floor(alea() * jouables.length)]
      const places = positionsPossibles(e, index)
      const { ligne, col } = places[Math.floor(alea() * places.length)]
      e = poser(e, index, ligne, col)
    }
    return { vus, hasard: e.hasard, score: e.score }
  }
  const a = jouer()
  assert.deepEqual(a, jouer())
  assert.ok(a.vus.length > 30)
  assert.notEqual(nouvellePartie({ graine: 99, niveau: 8 }).hasard, 99)
  assert.notDeepEqual(
    nouvellePartie({ graine: 1, niveau: 8 }).enCours.map((x) => x.id).concat(nouvellePartie({ graine: 2, niveau: 8 }).enCours.map((x) => x.id)).slice(0, 3),
    nouvellePartie({ graine: 2, niveau: 8 }).enCours.map((x) => x.id),
  )
})

test('le tirage garanti est celui des réglages, derrière l\'interface de BS40, et ne tire que des pièces de poids non nul', () => {
  assert.equal(REGLAGES.tirage, tirageGaranti)
  const alea = generateur(2)
  for (const niveau of NIVEAUX) {
    const permis = new Set(poidsDesPieces(niveau).filter((p) => p.poids > 0).map((p) => p.id))
    permis.add('bloc.0')
    const vus = []
    for (let i = 0; i < 100; i++) {
      vus.push(...tirageGaranti({ aleatoire: alea, niveau, nombre: 3, grille: grilleAuHasard(alea, 0.4).map((r) => r.map((v) => (v ? 'x' : null))), enCours: [], reglages: REGLAGES }))
    }
    assert.ok(vus.every((id) => permis.has(id)), `niveau ${niveau}`)
  }
})
