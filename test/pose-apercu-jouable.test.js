// La future main se joue aux niveaux 1 et 2 de block-pose (BS58) : six pièces posables à la fois,
// dans l'ordre qu'on veut ; à partir du niveau 3, seule la main en cours se pose.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  REGLAGES,
  NIVEAU_APERCU_JOUABLE,
  nouvellePartie,
  poser,
  peutPoser,
  positionsPossibles,
  piecesJouables,
  apercuJouable,
  pieceA,
  indicesEnJeu,
  bloquee,
  perdue,
  peutUtiliser,
  supprimerPiece,
  tournerPiece,
  changerPieces,
  changerNiveau,
  annulerCoup,
  exporterPartie,
  importerPartie,
  depuisTexte,
  reserveVide,
} from '../src/pose/index.js'
import { meilleurCoup } from '../tools/simulateur-pose.js'
import { suite, grilleDe } from './pose-verificateur.js'

const ids = (liste) => liste.map((x) => x && x.id)
const avec = (reserve) => ({ ...reserveVide(), ...reserve })
const copie = (x) => JSON.parse(JSON.stringify(x))

// Une partie sur grille vide : trois barres de 2 en main, trois blocs de 1 case en aperçu.
const partie = (niveau, extra = {}) => depuisTexte({
  niveau,
  enCours: ['barre2.0', 'barre2.0', 'barre2.0'],
  suivantes: ['bloc.0', 'carre2.0', 't.0'],
  ...extra,
})

test('l\'aperçu se joue aux niveaux 1 et 2, pas à partir du niveau 3', () => {
  assert.equal(NIVEAU_APERCU_JOUABLE, 2)
  for (const niveau of [1, 2]) assert.equal(apercuJouable(partie(niveau)), true, `niveau ${niveau}`)
  for (const niveau of [3, 4, 7, 10]) assert.equal(apercuJouable(partie(niveau)), false, `niveau ${niveau}`)
})

test('six places aux niveaux 1 et 2 : les trois de la main puis les trois de l\'aperçu', () => {
  const e = partie(1)
  assert.deepEqual(indicesEnJeu(e), [0, 1, 2, 3, 4, 5])
  assert.deepEqual(piecesJouables(e), [0, 1, 2, 3, 4, 5])
  assert.equal(pieceA(e, 0).id, 'barre2.0')
  assert.equal(pieceA(e, 3).id, 'bloc.0')
  assert.equal(pieceA(e, 4).id, 'carre2.0')
  assert.equal(pieceA(e, 6), null)
  assert.equal(pieceA(e, -1), null)
  assert.equal(pieceA(e, 1.5), null)
  assert.ok(positionsPossibles(e, 4).length > 0)
  assert.equal(peutPoser(e, 5, 0, 0), true)
})

test('à partir du niveau 3, l\'aperçu se montre mais ne se joue pas', () => {
  const e = partie(3)
  assert.deepEqual(indicesEnJeu(e), [0, 1, 2])
  assert.deepEqual(piecesJouables(e), [0, 1, 2])
  assert.equal(pieceA(e, 3), null)
  assert.equal(poser(e, 3, 0, 0), null)
  assert.equal(peutPoser(e, 3, 0, 0), false)
  assert.deepEqual(positionsPossibles(e, 3), [])
  assert.equal(e.suivantes.length, 3)
})

test('poser une pièce de l\'aperçu : sa place se vide, la main ne bouge pas, le tour continue', () => {
  const e = partie(2)
  const f = poser(e, 4, 0, 0)
  assert.ok(f)
  assert.deepEqual(ids(f.suivantes), ['bloc.0', null, 't.0'])
  assert.deepEqual(ids(f.enCours), ['barre2.0', 'barre2.0', 'barre2.0'])
  assert.equal(f.dernierCoup.apercu, true)
  assert.equal(f.dernierCoup.index, 4)
  assert.equal(f.dernierCoup.piece, 'carre2.0')
  assert.equal(f.dernierCoup.nouveauTour, false)
  assert.equal(f.tours, 0)
  assert.equal(f.grille[0][0] !== null && f.grille[1][1] !== null, true)
  assert.deepEqual(piecesJouables(f), [0, 1, 2, 3, 5])
  // L'ancien état n'a pas bougé, et la place vidée ne se repose pas.
  assert.deepEqual(ids(e.suivantes), ['bloc.0', 'carre2.0', 't.0'])
  assert.equal(poser(f, 4, 5, 5), null)
  // Une pose de la main n'est pas « de l'aperçu ».
  assert.equal(poser(e, 0, 0, 0).dernierCoup.apercu, false)
})

test('la main finie, l\'aperçu passe en main tel qu\'il est : les pièces déjà posées ne reviennent pas', () => {
  let e = partie(1)
  e = poser(e, 3, 9, 9) // le bloc de l'aperçu
  e = poser(e, 0, 0, 0)
  e = poser(e, 1, 2, 0)
  assert.equal(e.tours, 0)
  e = poser(e, 2, 4, 0)
  assert.equal(e.dernierCoup.nouveauTour, true)
  assert.equal(e.tours, 1)
  assert.deepEqual(ids(e.enCours), [null, 'carre2.0', 't.0'])
  assert.equal(e.suivantes.length, 3)
  assert.ok(e.suivantes.every(Boolean))
  // Le tour n'a que deux pièces à poser ; la troisième place est vide, et l'on ne perd pas.
  assert.deepEqual(indicesEnJeu(e).slice(0, 2), [1, 2])
  assert.equal(perdue(e), false)
})

test('les trois pièces de l\'aperçu déjà posées : la main suivante est un tirage neuf de trois pièces', () => {
  let e = partie(2)
  for (const [index, ligne, col] of [[3, 9, 9], [4, 7, 7], [5, 0, 7]]) e = poser(e, index, ligne, col)
  assert.deepEqual(ids(e.suivantes), [null, null, null])
  assert.equal(e.tours, 0)
  for (const [index, ligne, col] of [[0, 0, 0], [1, 2, 0]]) e = poser(e, index, ligne, col)
  assert.equal(e.tours, 0)
  e = poser(e, 2, 4, 0)
  assert.equal(e.dernierCoup.nouveauTour, true)
  assert.equal(e.dernierCoup.mainRemplacee, true)
  assert.equal(e.tours, 1)
  assert.equal(e.enCours.filter(Boolean).length, 3)
  assert.equal(e.suivantes.filter(Boolean).length, 3)
  assert.equal(bloquee(e), false)
})

test('changer le niveau vaut tout de suite : l\'aperçu se joue, ou non, sans perdre une pièce', () => {
  const e3 = partie(3)
  const e2 = changerNiveau(e3, 2)
  assert.deepEqual(piecesJouables(e2), [0, 1, 2, 3, 4, 5])
  assert.deepEqual(ids(e2.enCours), ids(e3.enCours))
  assert.deepEqual(ids(e2.suivantes), ids(e3.suivantes))
  assert.ok(poser(e2, 3, 0, 0))
  // Une pièce de l'aperçu posée à un niveau bas, puis le niveau monte : l'aperçu ne se joue plus,
  // la place posée reste vide et les autres pièces restent là.
  const posee = poser(e2, 4, 0, 0)
  const e5 = changerNiveau(posee, 5)
  assert.deepEqual(piecesJouables(e5), [0, 1, 2])
  assert.deepEqual(ids(e5.suivantes), ['bloc.0', null, 't.0'])
  assert.equal(poser(e5, 3, 9, 9), null)
  // Et la main suivante est cet aperçu entamé.
  let f = e5
  for (const [index, ligne, col] of [[0, 4, 0], [1, 6, 0], [2, 8, 0]]) f = poser(f, index, ligne, col)
  assert.deepEqual(ids(f.enCours), ['bloc.0', null, 't.0'])
  // Revenir au niveau bas rend l'aperçu jouable tout de suite.
  assert.deepEqual(piecesJouables(changerNiveau(posee, 1)), [0, 1, 2, 3, 5])
})

test('bonus : supprimer et tourner visent aussi une pièce de l\'aperçu quand il se joue', () => {
  const e = partie(1, { reserve: avec({ supprimer: 2, tourner: 2 }), enCours: ['barre2.0', 'bloc.0', 'bloc.0'], suivantes: ['barre3.0', 'bloc.0', 'carre2.0'] })
  assert.equal(peutUtiliser(e, 'supprimer', 3), true)
  assert.equal(peutUtiliser(e, 'tourner', 3), true)
  assert.equal(peutUtiliser(e, 'tourner', 4), false) // le bloc n'a qu'une orientation
  const s = supprimerPiece(e, 3)
  assert.deepEqual(ids(s.suivantes), [null, 'bloc.0', 'carre2.0'])
  assert.deepEqual(s.dernierBonus, { sorte: 'supprimer', index: 3, piece: 'barre3.0', nouveauTour: false })
  assert.equal(s.reserve.supprimer, 1)
  assert.deepEqual(ids(s.enCours), ids(e.enCours))
  const t = tournerPiece(e, 3)
  assert.equal(t.suivantes[0].id, 'barre3.1')
  assert.equal(t.dernierBonus.index, 3)
  assert.deepEqual(ids(t.enCours), ids(e.enCours))
  // À partir du niveau 3, l'aperçu n'est pas visable.
  const haut = changerNiveau(e, 3)
  assert.equal(peutUtiliser(haut, 'supprimer', 3), false)
  assert.equal(supprimerPiece(haut, 3), null)
  assert.equal(tournerPiece(haut, 3), null)
  assert.deepEqual(haut.reserve, e.reserve)
})

test('changer : l\'aperçu entamé reste entamé, seules les pièces restantes sont tirées de nouveau', () => {
  const appels = []
  const reglages = { ...REGLAGES, tirage: (ctx) => { appels.push({ nombre: ctx.nombre, enCours: ctx.enCours }); return Array(ctx.nombre).fill('barre2.0') } }
  const e = depuisTexte({ niveau: 1, enCours: ['carre2.0', null, 't.0'], suivantes: ['bloc.0', null, 'bloc.0'], reserve: avec({ changer: 1 }), reglages })
  const f = changerPieces(e)
  assert.deepEqual(ids(f.enCours), ['barre2.0', null, 'barre2.0'])
  assert.deepEqual(ids(f.suivantes), ['barre2.0', null, 'barre2.0'])
  assert.deepEqual(appels, [{ nombre: 2, enCours: [] }, { nombre: 2, enCours: ['barre2.0', 'barre2.0'] }])
  assert.equal(f.reserve.changer, 0)
})

test('annuler après une pose de l\'aperçu : la place revient, la main aussi', () => {
  const e = partie(1, { reserve: avec({ annuler: 1 }) })
  const f = poser(e, 5, 0, 0)
  assert.deepEqual(ids(f.suivantes), ['bloc.0', 'carre2.0', null])
  const g = annulerCoup(f)
  assert.ok(g)
  assert.deepEqual(ids(g.suivantes), ['bloc.0', 'carre2.0', 't.0'])
  assert.deepEqual(g.grille, e.grille)
  assert.deepEqual(ids(g.enCours), ids(e.enCours))
  // Annuler la pose qui finit la main : l'aperçu entamé revient tel qu'il était.
  let h = partie(2, { reserve: avec({ annuler: 1 }) })
  h = poser(h, 3, 9, 9)
  h = poser(h, 0, 0, 0)
  h = poser(h, 1, 2, 0)
  const fin = poser(h, 2, 4, 0)
  assert.equal(fin.dernierCoup.nouveauTour, true)
  const retour = annulerCoup(fin)
  assert.deepEqual(ids(retour.enCours), [null, null, 'barre2.0'])
  assert.deepEqual(ids(retour.suivantes), [null, 'carre2.0', 't.0'])
})

test('partie gardée : une place de l\'aperçu déjà posée se garde et se relit, la partie continue à l\'identique', () => {
  let e = partie(2)
  e = poser(e, 4, 0, 0)
  e = poser(e, 0, 5, 5)
  const donnees = copie(exporterPartie(e))
  assert.equal(donnees.suivantes[1], null)
  const relue = importerPartie(donnees)
  assert.ok(relue)
  assert.deepEqual(exporterPartie(relue), exporterPartie(e))
  const suiteDe = (x) => {
    let s = x
    const vus = [exporterPartie(s)]
    for (let i = 0; i < 20 && !bloquee(s); i++) {
      const c = meilleurCoup(s)
      s = poser(s, c.index, c.ligne, c.col)
      vus.push(exporterPartie(s))
    }
    return vus
  }
  assert.deepEqual(suiteDe(relue), suiteDe(e))
  // Tout l'aperçu posé est lisible aussi ; une pièce illisible, non.
  assert.ok(importerPartie({ ...donnees, suivantes: [null, null, null] }))
  assert.equal(importerPartie({ ...donnees, suivantes: [null, { id: 'triangle.0', couleur: 'uni' }, null] }), null)
})

test('le robot joue les six pièces aux niveaux 1 et 2 : toujours un état valide, relu à l\'identique', () => {
  for (const niveau of [1, 2]) {
    for (let graine = 1; graine <= 6; graine++) {
      let e = nouvellePartie({ niveau, graine: 40 * niveau + graine })
      let depuisApercu = 0
      for (let i = 0; i < 150 && !bloquee(e); i++) {
        const c = meilleurCoup(e)
        e = poser(e, c.index, c.ligne, c.col)
        assert.ok(e.enCours.some(Boolean), `niveau ${niveau}, graine ${graine}, coup ${i} : main vide`)
        if (e.dernierCoup.apercu) depuisApercu++
        const relue = importerPartie(copie(exporterPartie(e)))
        assert.ok(relue, `niveau ${niveau}, graine ${graine}, coup ${i} : partie illisible`)
        assert.deepEqual(exporterPartie(relue), exporterPartie(e))
      }
      assert.ok(depuisApercu > 0, `niveau ${niveau}, graine ${graine} : l'aperçu n'a jamais servi`)
    }
  }
})

test('la garantie reste vraie : les six pièces d\'un tour ont toujours une suite de poses', () => {
  let verifies = 0
  for (const niveau of [1, 2]) {
    for (let graine = 1; graine <= 12; graine++) {
      const e = nouvellePartie({ niveau, graine: 700 + 20 * niveau + graine })
      assert.ok(suite(grilleDe(e), [ids(e.enCours), ids(e.suivantes)]), `niveau ${niveau}, graine ${graine}`)
      // Et, jouée dans le désordre (l'aperçu d'abord), au moins une pose reste possible partout.
      assert.deepEqual(piecesJouables(e), [0, 1, 2, 3, 4, 5])
      verifies++
    }
  }
  assert.equal(verifies, 24)
})

test('aux niveaux 3 et plus, jouer comme avant : une partie du robot ne pose jamais depuis l\'aperçu', () => {
  for (const niveau of [3, 7, 10]) {
    let e = nouvellePartie({ niveau, graine: 90 + niveau })
    for (let i = 0; i < 60 && !bloquee(e); i++) {
      const c = meilleurCoup(e)
      assert.ok(c.index < REGLAGES.piecesParTour)
      e = poser(e, c.index, c.ligne, c.col)
      assert.equal(e.dernierCoup.apercu, false)
      assert.equal(e.suivantes.filter(Boolean).length, 3)
    }
  }
})
