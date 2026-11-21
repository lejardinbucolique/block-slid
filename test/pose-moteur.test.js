import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  REGLAGES,
  LISTE_COULEURS,
  piece,
  LIGNES_MAX_PAR_COUP,
  COLONNES_MAX_PAR_COUP,
  nouvellePartie,
  poser,
  peutPoser,
  positionsPossibles,
  piecesJouables,
  bloquee,
  exporterPartie,
  importerPartie,
  versTexte,
  depuisTexte,
} from '../src/pose/index.js'

const VIDE = '..........'
const ids = (liste) => liste.map((x) => x && x.id)

// Une grille de 10 rangées : les rangées données en bas, vides au-dessus.
const enBas = (...rangees) => [...Array(10 - rangees.length).fill(VIDE), ...rangees]

// Joue au hasard (hasard des essais, à part de celui de la partie) jusqu'à
// `coups` poses ou jusqu'au blocage ; rend la suite des états.
function jouerAuHasard(etat, coups, graine = 1) {
  let s = graine >>> 0
  const hasard = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
  const etats = [etat]
  for (let i = 0; i < coups && !bloquee(etat); i++) {
    const jouables = piecesJouables(etat)
    const index = jouables[Math.floor(hasard() * jouables.length)]
    const places = positionsPossibles(etat, index)
    const { ligne, col } = places[Math.floor(hasard() * places.length)]
    etat = poser(etat, index, ligne, col)
    etats.push(etat)
  }
  return etats
}

// --- Partie neuve ---------------------------------------------------------

test('une partie neuve : grille 10x10 vide, trois pièces en main et trois en aperçu', () => {
  const e = nouvellePartie({ graine: 42, niveau: 4 })
  assert.equal(e.grille.length, 10)
  assert.ok(e.grille.every((r) => r.length === 10 && r.every((v) => v === null)))
  assert.equal(e.enCours.length, 3)
  assert.equal(e.suivantes.length, 3)
  assert.ok([...e.enCours, ...e.suivantes].every((x) => piece(x.id) && x.couleur === LISTE_COULEURS[0].couleur))
  assert.deepEqual([e.score, e.coups, e.tours, e.serie, e.niveau], [0, 0, 0, 0, 4])
})

test('un niveau illisible retombe sur le niveau 1', () => {
  assert.equal(nouvellePartie({ graine: 1, niveau: 0 }).niveau, 1)
  assert.equal(nouvellePartie({ graine: 1, niveau: 11 }).niveau, 1)
  assert.equal(nouvellePartie({ graine: 1, niveau: '3' }).niveau, 1)
})

test('hasard reproductible : même graine, même suite de pièces et même partie', () => {
  const a = jouerAuHasard(nouvellePartie({ graine: 2026, niveau: 7 }), 120)
  const b = jouerAuHasard(nouvellePartie({ graine: 2026, niveau: 7 }), 120)
  assert.deepEqual(a.map(exporterPartie), b.map(exporterPartie))
  const c = nouvellePartie({ graine: 2027, niveau: 7 })
  assert.notDeepEqual(exporterPartie(c), exporterPartie(a[0]))
})

// --- Pose -----------------------------------------------------------------

test('une pose valide occupe les cases de la pièce, de sa couleur, sans gravité', () => {
  const e = depuisTexte({ enCours: ['t.0', 'bloc.0', 'bloc.0'], suivantes: ['bloc.0', 'bloc.0', 'bloc.0'] })
  assert.ok(peutPoser(e, 0, 2, 3))
  const apres = poser(e, 0, 2, 3)
  assert.deepEqual(versTexte(apres).slice(0, 5), [VIDE, VIDE, '...###....', '....#.....', VIDE])
  assert.deepEqual(ids(apres.enCours), [null, 'bloc.0', 'bloc.0'])
  assert.deepEqual(apres.dernierCoup.casesPosees, [
    { ligne: 2, col: 3 }, { ligne: 2, col: 4 }, { ligne: 2, col: 5 }, { ligne: 3, col: 4 },
  ])
  assert.deepEqual([apres.score, apres.coups, apres.dernierCoup.points, apres.dernierCoup.serie], [4, 1, 4, 0])
  assert.equal(apres.grille[2][3], REGLAGES.couleurPiece)
  // L'état d'avant n'a pas bougé.
  assert.deepEqual(versTexte(e), Array(10).fill(VIDE))
})

test('une pose qui sort de la grille, qui recouvre une case ou sans pièce est refusée sans rien changer', () => {
  const e = depuisTexte({ rangees: enBas('#.........'), enCours: ['barre4.0', 'carre2.0', null], suivantes: ['bloc.0', 'bloc.0', 'bloc.0'] })
  const avant = exporterPartie(e)
  assert.equal(poser(e, 0, 0, 7), null) // dépasse à droite
  assert.equal(poser(e, 0, -1, 0), null)
  assert.equal(poser(e, 0, 0, -1), null)
  assert.equal(poser(e, 1, 9, 0), null) // dépasse en bas
  assert.equal(poser(e, 1, 8, 0), null) // recouvre la case occupée
  assert.equal(poser(e, 0, 1.5, 0), null)
  assert.equal(poser(e, 2, 0, 0), null) // déjà posée
  assert.equal(poser(e, 3, 0, 0), null) // pas de place 3
  assert.equal(peutPoser(e, 1, 8, 0), false)
  assert.deepEqual(exporterPartie(e), avant)
  assert.ok(poser(e, 0, 0, 6))
  assert.ok(poser(e, 1, 8, 1))
})

test('positions possibles : toutes les places où la pièce tient', () => {
  const e = depuisTexte({ rangees: enBas('#.........'), enCours: ['carre4.0', 'bloc.0', null], suivantes: ['bloc.0', 'bloc.0', 'bloc.0'] })
  assert.equal(positionsPossibles(e, 0).length, 7 * 7 - 1)
  assert.equal(positionsPossibles(e, 1).length, 99)
  assert.deepEqual(positionsPossibles(e, 2), [])
})

// --- Effacement et score --------------------------------------------------

test('score : une barre de 4 qui complète une ligne rapporte 104, 208 en deuxième de série', () => {
  const e = depuisTexte({
    rangees: enBas('######....', '######....'),
    enCours: ['barre4.0', 'barre4.0', 'bloc.0'],
    suivantes: ['bloc.0', 'bloc.0', 'bloc.0'],
  })
  const un = poser(e, 0, 9, 6)
  assert.deepEqual(un.dernierCoup.lignes, [9])
  assert.deepEqual(un.dernierCoup.colonnes, [])
  assert.equal(un.dernierCoup.casesDisparues.length, 10)
  assert.deepEqual([un.dernierCoup.points, un.dernierCoup.serie, un.dernierCoup.multiplicateur], [104, 1, 1])
  assert.equal(versTexte(un)[9], VIDE)
  const deux = poser(un, 1, 8, 6)
  assert.deepEqual([deux.dernierCoup.points, deux.dernierCoup.serie, deux.dernierCoup.multiplicateur], [208, 2, 2])
  assert.equal(deux.score, 312)
  assert.equal(deux.dernierCoup.grilleVidee, true)
})

test('score : une barre verticale de 3 qui complète trois lignes rapporte 903', () => {
  const e = depuisTexte({
    rangees: enBas('#########.', '#########.', '#########.'),
    enCours: ['barre3.1', 'bloc.0', 'bloc.0'],
    suivantes: ['bloc.0', 'bloc.0', 'bloc.0'],
  })
  const apres = poser(e, 0, 7, 9)
  assert.deepEqual(apres.dernierCoup.lignes, [7, 8, 9])
  assert.equal(apres.dernierCoup.casesDisparues.length, 30)
  assert.equal(apres.dernierCoup.points, 903)
  assert.equal(apres.dernierCoup.grilleVidee, true)
})

test('effacement de colonnes seules', () => {
  const e = depuisTexte({
    rangees: ['#.........', '#.........', '#.........', '#.........', '#.........', '#.........', '#.........', '#.........', VIDE, '..#.......'],
    enCours: ['barre2.1', 'bloc.0', 'bloc.0'],
    suivantes: ['bloc.0', 'bloc.0', 'bloc.0'],
  })
  const apres = poser(e, 0, 8, 0)
  assert.deepEqual(apres.dernierCoup.lignes, [])
  assert.deepEqual(apres.dernierCoup.colonnes, [0])
  assert.equal(apres.dernierCoup.points, 2 + 10 * 10 * 1)
  assert.equal(apres.dernierCoup.grilleVidee, false)
  assert.deepEqual(versTexte(apres), [...Array(9).fill(VIDE), '..#.......'])
})

test('lignes et colonnes effacées ensemble : la case du croisement ne compte qu\'une fois', () => {
  const colonne = '.........#'
  const e = depuisTexte({
    rangees: [...Array(9).fill(colonne), '#########.'],
    enCours: ['bloc.0', 'bloc.0', 'bloc.0'],
    suivantes: ['bloc.0', 'bloc.0', 'bloc.0'],
  })
  const apres = poser(e, 0, 9, 9)
  assert.deepEqual(apres.dernierCoup.lignes, [9])
  assert.deepEqual(apres.dernierCoup.colonnes, [9])
  assert.equal(apres.dernierCoup.casesDisparues.length, 19)
  assert.equal(apres.dernierCoup.points, 1 + 19 * 10 * 2)
  assert.equal(apres.dernierCoup.grilleVidee, true)
})

test('plusieurs lignes et plusieurs colonnes d\'un coup avec un carré 3x3', () => {
  const plein = '#######...'
  const e = depuisTexte({
    rangees: [
      '.......###', '.......###', '.......###', '.......###', '.......###', '.......###', '.......###',
      plein, plein, plein,
    ],
    enCours: ['carre3.0', 'bloc.0', 'bloc.0'],
    suivantes: ['bloc.0', 'bloc.0', 'bloc.0'],
  })
  const apres = poser(e, 0, 7, 7)
  assert.deepEqual(apres.dernierCoup.lignes, [7, 8, 9])
  assert.deepEqual(apres.dernierCoup.colonnes, [7, 8, 9])
  assert.equal(apres.dernierCoup.casesDisparues.length, 30 + 30 - 9)
  assert.equal(apres.dernierCoup.points, 9 + 51 * 10 * 6)
  assert.equal(apres.dernierCoup.grilleVidee, true)
})

test('une barre debout de 5 efface jusqu\'à 5 lignes d\'un coup, le maximum du catalogue', () => {
  const e = depuisTexte({
    rangees: enBas(...Array(5).fill('.#########')),
    enCours: ['barre5.1', 'bloc.0', 'bloc.0'],
    suivantes: ['bloc.0', 'bloc.0', 'bloc.0'],
  })
  const apres = poser(e, 0, 5, 0)
  assert.equal(apres.dernierCoup.lignes.length, LIGNES_MAX_PAR_COUP)
})

test('un coup qui n\'efface rien casse la série', () => {
  const e = depuisTexte({
    rangees: enBas('#########.', '#########.'),
    enCours: ['bloc.0', 'bloc.0', 'bloc.0'],
    suivantes: ['bloc.0', 'bloc.0', 'bloc.0'],
  })
  const un = poser(e, 0, 9, 9)
  const rien = poser(un, 1, 0, 0)
  assert.deepEqual([rien.dernierCoup.points, rien.dernierCoup.serie, rien.dernierCoup.multiplicateur], [1, 0, 1])
  const encore = poser(rien, 2, 8, 9)
  assert.deepEqual([encore.dernierCoup.points, encore.dernierCoup.serie], [101, 1])
})

test('la série multiplie jusqu\'à son plafond, sans le dépasser', () => {
  const ligne = '#########.'
  const e = depuisTexte({
    rangees: enBas(ligne, ligne, ligne),
    enCours: ['bloc.0', 'bloc.0', 'bloc.0'],
    suivantes: ['bloc.0', 'bloc.0', 'bloc.0'],
    reglages: { ...REGLAGES, plafondSerie: 2 },
  })
  const a = poser(e, 0, 9, 9)
  const b = poser(a, 1, 8, 9)
  const c = poser(b, 2, 7, 9)
  assert.deepEqual([a, b, c].map((x) => x.dernierCoup.points), [101, 202, 202])
  assert.deepEqual([a, b, c].map((x) => x.dernierCoup.serie), [1, 2, 3])
  assert.equal(REGLAGES.plafondSerie >= 2, true)
})

test('faisabilité : un coup n\'efface jamais plus de lignes ou de colonnes que la pièce n\'en traverse', () => {
  for (let graine = 1; graine <= 40; graine++) {
    for (const e of jouerAuHasard(nouvellePartie({ graine, niveau: 1 + (graine % 10) }), 300, graine).slice(1)) {
      const { lignes, colonnes, piece: id } = e.dernierCoup
      assert.ok(lignes.length <= piece(id).hauteur && lignes.length <= LIGNES_MAX_PAR_COUP)
      assert.ok(colonnes.length <= piece(id).largeur && colonnes.length <= COLONNES_MAX_PAR_COUP)
    }
  }
})

// --- Tours et fin ---------------------------------------------------------

test('le tour finit quand les trois pièces sont posées, dans n\'importe quel ordre : l\'aperçu passe en main', () => {
  const e = depuisTexte({ enCours: ['bloc.0', 'barre2.0', 'carre2.0'], suivantes: ['t.0', 's.0', 'z.0'], graine: 9 })
  const a = poser(e, 2, 0, 0)
  const b = poser(a, 0, 5, 5)
  assert.equal(b.dernierCoup.nouveauTour, false)
  assert.deepEqual(ids(b.enCours), [null, 'barre2.0', null])
  const c = poser(b, 1, 9, 0)
  assert.equal(c.dernierCoup.nouveauTour, true)
  assert.deepEqual(ids(c.enCours), ['t.0', 's.0', 'z.0'])
  assert.equal(c.suivantes.length, 3)
  assert.ok(c.suivantes.every((x) => piece(x.id)))
  assert.deepEqual([c.tours, c.coups], [1, 3])
})

test('le tirage est remplaçable : il reçoit niveau, grille et pièces en main', () => {
  const vus = []
  const tirage = (ctx) => {
    vus.push({ niveau: ctx.niveau, nombre: ctx.nombre, enCours: ctx.enCours, occupees: ctx.grille.flat().filter(Boolean).length })
    return ['carre2.0', 'carre2.0', 'carre2.0']
  }
  const e = nouvellePartie({ graine: 3, niveau: 6, reglages: { ...REGLAGES, tirage } })
  assert.deepEqual(ids(e.enCours), ['carre2.0', 'carre2.0', 'carre2.0'])
  const f = poser(poser(poser(e, 0, 0, 0), 1, 0, 2), 2, 0, 4)
  assert.deepEqual(ids(f.enCours), ['carre2.0', 'carre2.0', 'carre2.0'])
  assert.deepEqual(vus, [
    { niveau: 6, nombre: 3, enCours: [], occupees: 0 },
    { niveau: 6, nombre: 3, enCours: ['carre2.0', 'carre2.0', 'carre2.0'], occupees: 0 },
    { niveau: 6, nombre: 3, enCours: ['carre2.0', 'carre2.0', 'carre2.0'], occupees: 12 },
  ])
  const mauvais = { ...REGLAGES, tirage: () => ['pas-une-piece', 'bloc.0', 'bloc.0'] }
  assert.throws(() => nouvellePartie({ graine: 1, reglages: mauvais }))
})

test('bloquée quand aucune pièce restante ne tient nulle part, sans conclure la défaite', () => {
  // Damier : aucune case vide n'en touche une autre.
  const damier = Array.from({ length: 10 }, (_, l) => (l % 2 ? '.#.#.#.#.#' : '#.#.#.#.#.'))
  const e = depuisTexte({ rangees: damier, enCours: ['carre2.0', 'barre2.0', 'barre2.1'], suivantes: ['bloc.0', 'bloc.0', 'bloc.0'] })
  assert.equal(bloquee(e), true)
  assert.deepEqual(piecesJouables(e), [])
  const f = depuisTexte({ rangees: damier, enCours: ['carre2.0', 'bloc.0', null], suivantes: ['bloc.0', 'bloc.0', 'bloc.0'] })
  assert.equal(bloquee(f), false)
  assert.deepEqual(piecesJouables(f), [1])
  // Le coup qui bloque le dit, et la partie reste un état comme un autre.
  const g = depuisTexte({ rangees: damier.map((r, l) => (l === 0 ? '..#.#.#.#.' : r)), enCours: ['bloc.0', 'barre2.0', null], suivantes: ['bloc.0', 'bloc.0', 'bloc.0'] })
  const h = poser(g, 0, 0, 0)
  assert.equal(h.dernierCoup.bloquee, true)
  assert.equal(bloquee(h), true)
  assert.equal(poser(g, 0, 0, 1).dernierCoup.bloquee, true)
})

// --- Garder une partie ----------------------------------------------------

test('export puis import rendent la même partie, qui continue à l\'identique', () => {
  const etats = jouerAuHasard(nouvellePartie({ graine: 77, niveau: 8 }), 40)
  const e = etats.at(-1)
  const donnees = JSON.parse(JSON.stringify(exporterPartie(e)))
  const relue = importerPartie(donnees)
  assert.ok(relue)
  assert.deepEqual(exporterPartie(relue), exporterPartie(e))
  const suite = (x) => jouerAuHasard(x, 60, 5).map(exporterPartie)
  assert.deepEqual(suite(relue), suite(e))
})

test('l\'import tolérant rend null pour des données illisibles ou incohérentes', () => {
  const bon = exporterPartie(depuisTexte({ rangees: enBas('#.........'), enCours: ['bloc.0', null, 'carre3.0'], suivantes: ['t.0', 's.0', 'z.0'] }))
  assert.ok(importerPartie(bon))
  const avec = (modif) => importerPartie({ ...structuredClone(bon), ...modif })
  assert.equal(importerPartie(null), null)
  assert.equal(importerPartie('partie'), null)
  assert.equal(avec({ schema: 99 }), null)
  assert.equal(avec({ niveau: 11 }), null)
  assert.equal(avec({ score: -1 }), null)
  assert.equal(avec({ hasard: 2 ** 32 }), null)
  assert.equal(avec({ grille: bon.grille.slice(1) }), null)
  assert.equal(avec({ grille: bon.grille.map((r) => r.slice(1)) }), null)
  assert.equal(avec({ grille: bon.grille.map((r) => r.map(() => 3)) }), null)
  assert.equal(avec({ enCours: [null, null, null] }), null)
  assert.equal(avec({ enCours: [{ id: 'triangle.0', couleur: 'uni' }, null, null] }), null)
  assert.equal(avec({ suivantes: [null, { id: 'bloc.0', couleur: 'uni' }, { id: 'bloc.0', couleur: 'uni' }] }), null)
  assert.equal(avec({ suivantes: bon.suivantes.slice(1) }), null)
  assert.equal(avec({ grille: undefined }), null)
})
