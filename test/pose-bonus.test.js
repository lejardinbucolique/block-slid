// Bonus de block-pose (BS42) : la réserve, les quatre effets, la fin de partie avec
// bonus, la partie exportée avec sa réserve et son instantané d'annulation.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  REGLAGES,
  SORTES,
  RESERVE_MAX,
  BONUS_OFFERTS,
  reserveVide,
  reserveInitiale,
  ajouterBonus,
  lireReserve,
  piece,
  pieceSuivante,
  nouvellePartie,
  poser,
  bloquee,
  perdue,
  piecesJouables,
  positionsPossibles,
  gagnerBonus,
  peutUtiliser,
  supprimerPiece,
  tournerPiece,
  changerPieces,
  annulerCoup,
  bonusUtiles,
  exporterPartie,
  importerPartie,
  depuisTexte,
  NIVEAU_MIN,
  NIVEAU_MAX,
} from '../src/pose/index.js'
import { suite, grilleDe } from './pose-verificateur.js'

const NIVEAUX = Array.from({ length: NIVEAU_MAX - NIVEAU_MIN + 1 }, (_, i) => NIVEAU_MIN + i)
const ids = (liste) => liste.map((x) => x && x.id)
const tout = (n) => Object.fromEntries(SORTES.map((s) => [s, n]))
const avec = (reserve) => ({ ...reserveVide(), ...reserve })
const VIDE = '..........'
const enBas = (...rangees) => [...Array(10 - rangees.length).fill(VIDE), ...rangees]
// Damier : aucune case vide n'en touche une autre, seul le bloc de 1 case se pose.
const DAMIER = Array.from({ length: 10 }, (_, l) => (l % 2 ? '.#.#.#.#.#' : '#.#.#.#.#.'))

// Hasard des essais, à part de celui de la partie.
function generateur(graine) {
  let s = graine >>> 0
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296
}

// Joue un coup au hasard parmi ceux qui se posent.
function coupAuHasard(etat, alea) {
  const jouables = piecesJouables(etat)
  const index = jouables[Math.floor(alea() * jouables.length)]
  const places = positionsPossibles(etat, index)
  const { ligne, col } = places[Math.floor(alea() * places.length)]
  return poser(etat, index, ligne, col)
}

// Une partie sans sa réserve ni son instantané d'annulation, pour comparer ce que
// l'annulation doit rendre exactement.
function partieSeule(etat) {
  const { reserve, annulation, ...reste } = exporterPartie(etat)
  return reste
}

// --- La réserve -----------------------------------------------------------------

test('la réserve : quatre sortes, dix au plus de chaque, trois offerts de chaque la première fois', () => {
  assert.deepEqual(SORTES, ['supprimer', 'tourner', 'changer', 'annuler'])
  assert.equal(RESERVE_MAX, 10)
  assert.equal(BONUS_OFFERTS, 3)
  assert.deepEqual(reserveVide(), tout(0))
  assert.deepEqual(reserveInitiale(), tout(3))
  assert.notEqual(reserveInitiale(), reserveInitiale())
})

test('un gain au-delà de 10 est perdu, sans erreur, et la réserve n\'est jamais modifiée en place', () => {
  const r = avec({ supprimer: 9 })
  assert.equal(ajouterBonus(r, 'supprimer').supprimer, 10)
  assert.equal(ajouterBonus(r, 'supprimer', 5).supprimer, 10)
  assert.equal(ajouterBonus(ajouterBonus(r, 'supprimer'), 'supprimer').supprimer, 10)
  assert.equal(ajouterBonus(r, 'tourner', 4).tourner, 4)
  assert.equal(r.supprimer, 9)
  // Sorte inconnue ou quantité illisible : rien ne change.
  assert.equal(ajouterBonus(r, 'pioche'), r)
  assert.equal(ajouterBonus(r, 'supprimer', -1), r)
  assert.equal(ajouterBonus(r, 'supprimer', 1.5), r)

  const e = nouvellePartie({ graine: 1, reserve: avec({ annuler: 10, changer: 2 }) })
  const f = gagnerBonus(e, 'annuler', 3)
  assert.equal(f.reserve.annuler, 10)
  assert.equal(gagnerBonus(e, 'changer').reserve.changer, 3)
  assert.equal(e.reserve.changer, 2)
  assert.equal(gagnerBonus(e, 'pioche'), e)
})

test('la réserve relue : une copie, ou null si ce n\'en est pas une', () => {
  const r = avec({ tourner: 7 })
  assert.deepEqual(lireReserve(JSON.parse(JSON.stringify(r))), r)
  assert.notEqual(lireReserve(r), r)
  assert.equal(lireReserve(null), null)
  assert.equal(lireReserve('3'), null)
  assert.equal(lireReserve({ supprimer: 1, tourner: 1, changer: 1 }), null)
  assert.equal(lireReserve({ ...r, annuler: -1 }), null)
  assert.equal(lireReserve({ ...r, annuler: 11 }), null)
  assert.equal(lireReserve({ ...r, annuler: 1.5 }), null)
  assert.equal(lireReserve({ ...r, annuler: '2' }), null)
})

test('le moteur reçoit la réserve, ne l\'invente jamais, et la rend pour la partie suivante', () => {
  assert.deepEqual(nouvellePartie({ graine: 1 }).reserve, tout(0))
  const donnee = reserveInitiale()
  const e = nouvellePartie({ graine: 1, reserve: donnee })
  assert.deepEqual(e.reserve, tout(3))
  // L'état garde sa propre copie.
  assert.notEqual(e.reserve, donnee)
  assert.throws(() => nouvellePartie({ graine: 1, reserve: { supprimer: 3 } }), TypeError)
  assert.throws(() => nouvellePartie({ graine: 1, reserve: avec({ annuler: 11 }) }), TypeError)

  // Une partie : un bonus employé, un autre gagné ; la suivante repart de cette réserve.
  const f = supprimerPiece(gagnerBonus(e, 'changer', 2), 0)
  assert.ok(f)
  const rendue = JSON.parse(JSON.stringify(f.reserve))
  assert.equal(Object.values(rendue).reduce((a, b) => a + b, 0), 12 + 2 - 1)
  const suivante = nouvellePartie({ graine: 2, niveau: 4, reserve: rendue })
  assert.deepEqual(suivante.reserve, rendue)
})

// --- Supprimer --------------------------------------------------------------------

test('supprimer : la pièce disparaît, le tour continue avec les autres, un bonus de moins', () => {
  const e = depuisTexte({ enCours: ['carre2.0', 'barre3.0', 't.0'], suivantes: ['bloc.0', 'barre2.0', 'z.0'], reserve: avec({ supprimer: 2 }) })
  const f = supprimerPiece(e, 1)
  assert.deepEqual(ids(f.enCours), ['carre2.0', null, 't.0'])
  assert.deepEqual(ids(f.suivantes), ['bloc.0', 'barre2.0', 'z.0'])
  assert.equal(f.reserve.supprimer, 1)
  assert.equal(f.tours, 0)
  assert.deepEqual(f.dernierBonus, { sorte: 'supprimer', index: 1, piece: 'barre3.0', nouveauTour: false })
  assert.equal(f.dernierCoup, null)
  // L'ancien état n'a pas bougé.
  assert.deepEqual(ids(e.enCours), ['carre2.0', 'barre3.0', 't.0'])
  assert.equal(e.reserve.supprimer, 2)
  // La place libérée ne se pose plus ; les autres, si.
  assert.equal(poser(f, 1, 0, 0), null)
  assert.ok(poser(f, 0, 0, 0))
  assert.deepEqual(piecesJouables(f), [0, 2])
})

test('supprimer : un tour finit quand les trois pièces sont posées ou retirées', () => {
  const e = depuisTexte({ enCours: ['carre2.0', 'barre3.0', 't.0'], suivantes: ['bloc.0', 'barre2.0', 'z.0'], reserve: avec({ supprimer: 3 }) })
  const f = poser(supprimerPiece(e, 2), 0, 0, 0)
  assert.equal(f.dernierCoup.nouveauTour, false)
  const g = supprimerPiece(f, 1)
  assert.equal(g.dernierBonus.nouveauTour, true)
  assert.deepEqual(ids(g.enCours), ['bloc.0', 'barre2.0', 'z.0'])
  assert.equal(g.suivantes.length, 3)
  assert.ok(g.suivantes.every((x) => piece(x.id)))
  assert.equal(g.tours, 1)
  assert.equal(g.coups, 1)
  // Trois retirées : un nouveau tour aussi.
  const h = supprimerPiece(supprimerPiece(supprimerPiece(e, 0), 1), 2)
  assert.deepEqual(ids(h.enCours), ['bloc.0', 'barre2.0', 'z.0'])
  assert.equal(h.tours, 1)
  assert.equal(h.reserve.supprimer, 0)
})

test('supprimer : refusé sans rien changer ni consommer, sans bonus ou sans pièce à cette place', () => {
  const e = depuisTexte({ enCours: ['carre2.0', null, 't.0'], reserve: avec({ supprimer: 1 }) })
  assert.equal(supprimerPiece(e, 1), null)
  assert.equal(supprimerPiece(e, 3), null)
  assert.equal(supprimerPiece(e, -1), null)
  assert.equal(peutUtiliser(e, 'supprimer', 1), false)
  assert.equal(peutUtiliser(e, 'supprimer', 0), true)
  const sans = depuisTexte({ enCours: ['carre2.0', 'barre3.0', 't.0'], reserve: reserveVide() })
  assert.equal(supprimerPiece(sans, 0), null)
  assert.equal(peutUtiliser(sans, 'supprimer', 0), false)
  assert.deepEqual(e.reserve, avec({ supprimer: 1 }))
})

// --- Tourner ----------------------------------------------------------------------

test('tourner : la pièce passe à son orientation suivante, en gardant sa couleur', () => {
  const e = depuisTexte({ enCours: ['barre3.0', 'coin.0', 'bloc.0'], reserve: avec({ tourner: 5 }) })
  const f = tournerPiece(e, 0)
  assert.equal(f.enCours[0].id, 'barre3.1')
  assert.equal(f.enCours[0].id, pieceSuivante('barre3.0'))
  assert.equal(f.enCours[0].couleur, e.enCours[0].couleur)
  assert.deepEqual(ids(f.enCours).slice(1), ['coin.0', 'bloc.0'])
  assert.equal(f.reserve.tourner, 4)
  assert.deepEqual(f.dernierBonus, { sorte: 'tourner', index: 0, avant: 'barre3.0', apres: 'barre3.1' })
  assert.equal(e.enCours[0].id, 'barre3.0')
  // Quatre quarts de tour ramènent le coin à lui-même.
  let g = e
  for (let i = 0; i < 4; i++) g = tournerPiece(g, 1)
  assert.equal(g.enCours[1].id, 'coin.0')
  assert.equal(g.reserve.tourner, 1)
  // La pièce tournée se pose dans sa nouvelle orientation, qui n'a pas la même emprise.
  assert.equal(poser(e, 0, 8, 0).enCours[0], null)
  assert.equal(poser(f, 0, 8, 0), null)
  assert.ok(poser(f, 0, 7, 9))
})

test('tourner : refusé sans consommer pour une pièce qui n\'a qu\'une orientation, sans bonus ou sans pièce', () => {
  const e = depuisTexte({ enCours: ['bloc.0', 'carre3.0', null], reserve: avec({ tourner: 2 }) })
  assert.equal(tournerPiece(e, 0), null)
  assert.equal(tournerPiece(e, 1), null)
  assert.equal(tournerPiece(e, 2), null)
  assert.equal(peutUtiliser(e, 'tourner', 0), false)
  assert.deepEqual(e.reserve, avec({ tourner: 2 }))
  const sans = depuisTexte({ enCours: ['barre3.0', 'coin.0', 'bloc.0'], reserve: avec({ supprimer: 3 }) })
  assert.equal(tournerPiece(sans, 0), null)
  assert.equal(peutUtiliser(sans, 'tourner', 0), false)
})

// --- Changer les pièces -----------------------------------------------------------

test('changer : les pièces restantes et l\'aperçu sont tirés de nouveau, le tour garde ses places', () => {
  const e = nouvellePartie({ graine: 11, niveau: 5, reserve: avec({ changer: 2 }) })
  const f = changerPieces(e)
  assert.equal(f.reserve.changer, 1)
  assert.equal(f.enCours.length, 3)
  assert.equal(f.suivantes.length, 3)
  assert.ok([...f.enCours, ...f.suivantes].every((x) => x && piece(x.id)))
  assert.equal(f.dernierBonus.sorte, 'changer')
  assert.deepEqual(f.dernierBonus.anciennes, ids(e.enCours))
  assert.deepEqual(f.dernierBonus.neuves, ids(f.enCours))
  assert.deepEqual(e.reserve, avec({ changer: 2 }))
  assert.equal(f.tours, e.tours)
  // Le hasard avance : deux changements de suite ne redonnent pas toujours la même main.
  const mains = new Set([ids(f.enCours).join(), ids(changerPieces(f).enCours).join(), ids(e.enCours).join()])
  assert.ok(mains.size > 1)
})

test('changer : à mi-tour, seules les pièces restantes sont remplacées, aux mêmes places', () => {
  const appels = []
  const tirage = (ctx) => {
    appels.push({ nombre: ctx.nombre, enCours: ctx.enCours })
    return Array(ctx.nombre).fill('barre2.0')
  }
  const reglages = { ...REGLAGES, tirage }
  const e = depuisTexte({ enCours: ['carre2.0', null, 't.0'], suivantes: ['bloc.0', 'bloc.0', 'bloc.0'], reserve: avec({ changer: 1 }), reglages })
  const f = changerPieces(e)
  assert.deepEqual(ids(f.enCours), ['barre2.0', null, 'barre2.0'])
  assert.deepEqual(ids(f.suivantes), ['barre2.0', 'barre2.0', 'barre2.0'])
  // Deux pièces neuves tirées sans pièces en main, puis l'aperçu avec elles en main.
  assert.deepEqual(appels, [
    { nombre: 2, enCours: [] },
    { nombre: 3, enCours: ['barre2.0', 'barre2.0'] },
  ])
  // Un tirage qui rend le mauvais nombre de pièces est refusé.
  const faux = { ...REGLAGES, tirage: () => ['bloc.0', 'bloc.0', 'bloc.0'] }
  const g = depuisTexte({ enCours: ['carre2.0', null, 't.0'], suivantes: ['bloc.0', 'bloc.0', 'bloc.0'], reserve: avec({ changer: 1 }), reglages: faux })
  assert.throws(() => changerPieces(g))
})

test('changer : refusé sans bonus, sans rien changer', () => {
  const e = nouvellePartie({ graine: 11, reserve: avec({ supprimer: 2 }) })
  assert.equal(changerPieces(e), null)
  assert.equal(peutUtiliser(e, 'changer'), false)
  assert.equal(peutUtiliser(gagnerBonus(e, 'changer'), 'changer'), true)
})

test('changer : la garantie de pose tient (main puis aperçu), à chaque niveau, en début et en milieu de tour', () => {
  const alea = generateur(2026)
  let verifies = 0
  for (const niveau of NIVEAUX) {
    for (let p = 0; p < 6; p++) {
      let e = nouvellePartie({ graine: niveau * 100 + p, niveau, reserve: tout(10) })
      for (let i = 0; i < 40 && !bloquee(e); i++) {
        const c = changerPieces(e)
        const main = c.enCours.filter(Boolean)
        assert.equal(main.length, e.enCours.filter(Boolean).length)
        assert.ok(suite(grilleDe(c), [ids(main), ids(c.suivantes)]),
          `niveau ${niveau}, partie ${p}, coup ${i} : ${ids(main)} puis ${ids(c.suivantes)}`)
        verifies++
        e = coupAuHasard(e, alea)
      }
    }
  }
  assert.ok(verifies > 300, `${verifies}`)
})

test('changer : un robot qui change souvent puis suit les témoins n\'est jamais bloqué', () => {
  // Main puis aperçu ont une suite de poses (même après changer) : le robot suit celle
  // de la main, qui laisse l'aperçu posable, tour après tour.
  for (const niveau of [1, 5, 10]) {
    let e = nouvellePartie({ graine: 900 + niveau, niveau, reserve: tout(10) })
    for (let tour = 0; tour < 60; tour++) {
      if (tour % 3 === 0 && e.reserve.changer > 0) e = changerPieces(e)
      const main = e.enCours.filter(Boolean)
      const plan = suite(grilleDe(e), [ids(main), ids(e.suivantes)])?.filter((pas) => pas.groupe === 0)
      assert.ok(plan, `niveau ${niveau}, tour ${tour}`)
      const debut = e.tours
      for (const pas of plan) {
        const place = e.enCours.findIndex((x, i) => x && x.id === pas.id && positionsPossibles(e, i).some((q) => q.ligne === pas.ligne && q.col === pas.col))
        assert.ok(place >= 0)
        e = poser(e, place, pas.ligne, pas.col)
        assert.ok(e)
      }
      assert.equal(e.tours, debut + 1)
    }
  }
})

// --- Annuler le dernier coup --------------------------------------------------------

test('annuler : rend l\'état exact d\'avant la pose (score, série, pièces, aperçu, hasard), sans rendre le bonus', () => {
  let e = depuisTexte({
    rangees: enBas('#########.', '#########.'),
    enCours: ['bloc.0', 'bloc.0', 'carre2.0'],
    suivantes: ['t.0', 's.0', 'z.0'],
    graine: 9,
    reserve: avec({ annuler: 2 }),
  })
  const premier = poser(e, 0, 9, 9)
  assert.equal(premier.score, 101)
  const second = poser(premier, 1, 8, 9)
  assert.equal(second.score, 101 + 202)
  assert.equal(second.serie, 2)

  const f = annulerCoup(second)
  assert.deepEqual(partieSeule(f), partieSeule(premier))
  assert.equal(f.score, 101)
  assert.equal(f.serie, 1)
  assert.deepEqual(ids(f.enCours), [null, 'bloc.0', 'carre2.0'])
  assert.equal(f.reserve.annuler, 1)
  assert.equal(f.dernierCoup, null)
  assert.deepEqual(f.dernierBonus, { sorte: 'annuler' })
  // L'état d'avant n'a pas bougé.
  assert.equal(second.score, 303)

  // Rejouer le même coup donne le même résultat.
  const rejoue = poser(f, 1, 8, 9)
  assert.deepEqual(partieSeule(rejoue), partieSeule(second))
})

test('annuler : rend le hasard, donc la suite des tirages reste la même, même en fin de tour', () => {
  const alea = generateur(5)
  for (const niveau of [2, 6, 10]) {
    let e = nouvellePartie({ graine: 40 + niveau, niveau, reserve: tout(10) })
    let verifies = 0
    for (let i = 0; i < 80 && !bloquee(e); i++) {
      const apres = coupAuHasard(e, alea)
      const rendu = annulerCoup(apres)
      assert.deepEqual(partieSeule(rendu), partieSeule(e), `niveau ${niveau}, coup ${i}`)
      assert.equal(rendu.reserve.annuler, apres.reserve.annuler - 1)
      if (apres.dernierCoup.nouveauTour) {
        // Le tirage de l'aperçu d'après a été défait, puis se refait à l'identique.
        const { ligne, col, index } = apres.dernierCoup
        assert.deepEqual(partieSeule(poser(rendu, index, ligne, col)), partieSeule(apres))
        verifies++
      }
      e = apres
    }
    assert.ok(verifies > 3, `niveau ${niveau} : ${verifies}`)
  }
})

test('annuler : un seul coup en arrière, jamais deux de suite', () => {
  const e = depuisTexte({ enCours: ['bloc.0', 'bloc.0', 'bloc.0'], reserve: avec({ annuler: 5 }) })
  const f = poser(poser(e, 0, 0, 0), 1, 0, 1)
  const g = annulerCoup(f)
  assert.ok(g)
  assert.equal(g.annulation, null)
  assert.equal(annulerCoup(g), null)
  assert.equal(peutUtiliser(g, 'annuler'), false)
  assert.equal(g.reserve.annuler, 4)
  // Une nouvelle pose rouvre l'annulation, d'un coup seulement.
  const h = poser(g, 1, 0, 1)
  assert.equal(peutUtiliser(h, 'annuler'), true)
  assert.equal(annulerCoup(annulerCoup(h)), null)
})

test('annuler : refusé sans coup à annuler (début de partie), sans bonus, ou après un autre bonus', () => {
  const debut = nouvellePartie({ graine: 3, reserve: tout(3) })
  assert.equal(annulerCoup(debut), null)
  assert.equal(peutUtiliser(debut, 'annuler'), false)
  assert.deepEqual(debut.reserve, tout(3))

  const e = depuisTexte({ enCours: ['bloc.0', 'barre2.0', 'carre2.0'], reserve: avec({ supprimer: 1, tourner: 1, changer: 1 }) })
  const posee = poser(e, 0, 0, 0)
  assert.equal(annulerCoup(posee), null, 'pas d\'annuler en réserve')
  const avecAnnuler = gagnerBonus(posee, 'annuler')
  assert.ok(annulerCoup(avecAnnuler))
  // Un bonus qui touche aux pièces ôte l'annulation de la pose d'avant.
  assert.equal(annulerCoup(supprimerPiece(avecAnnuler, 1)), null)
  assert.equal(annulerCoup(tournerPiece(avecAnnuler, 1)), null)
  assert.equal(annulerCoup(changerPieces(avecAnnuler)), null)
})

// --- Fin de partie avec bonus -------------------------------------------------------

const bloquee3 = (reserve, enCours = ['carre2.0', 'barre2.0', 'barre2.1']) =>
  depuisTexte({ rangees: DAMIER, enCours, suivantes: ['bloc.0', 'bloc.0', 'bloc.0'], reserve: avec(reserve) })

test('fin de partie : bloquée sans bonus, c\'est perdu', () => {
  const e = bloquee3({})
  assert.equal(bloquee(e), true)
  assert.deepEqual(bonusUtiles(e), [])
  assert.equal(perdue(e), true)
  // Pas bloquée : pas perdue, bonus ou non.
  const f = depuisTexte({ rangees: DAMIER, enCours: ['carre2.0', 'bloc.0', null] })
  assert.equal(perdue(f), false)
})

test('fin de partie : tant qu\'un bonus qui peut aider existe, la partie continue', () => {
  for (const sorte of ['supprimer', 'changer']) {
    const e = bloquee3({ [sorte]: 1 })
    assert.equal(perdue(e), false, sorte)
    assert.deepEqual(bonusUtiles(e), [sorte])
  }
  // Annuler aide s'il y a un coup à annuler, pas sinon.
  const sans = bloquee3({ annuler: 1 })
  assert.equal(perdue(sans), true)
  const avantPose = depuisTexte({ rangees: DAMIER.map((r, l) => (l === 0 ? '..#.#.#.#.' : r)), enCours: ['bloc.0', 'barre2.0', null], suivantes: ['bloc.0', 'bloc.0', 'bloc.0'], reserve: avec({ annuler: 1 }) })
  const pose = poser(avantPose, 0, 0, 0)
  assert.equal(pose.dernierCoup.bloquee, true)
  assert.equal(pose.dernierCoup.perdue, false)
  assert.equal(perdue(pose), false)
  assert.deepEqual(bonusUtiles(pose), ['annuler'])
  const apres = annulerCoup(pose)
  assert.equal(bloquee(apres), false)
  // Sans le bonus d'annuler, le même coup perd la partie.
  const sansBonus = poser(depuisTexte({ rangees: DAMIER.map((r, l) => (l === 0 ? '..#.#.#.#.' : r)), enCours: ['bloc.0', 'barre2.0', null], suivantes: ['bloc.0', 'bloc.0', 'bloc.0'] }), 0, 0, 0)
  assert.equal(sansBonus.dernierCoup.perdue, true)
})

test('fin de partie : tourner aide seulement si une orientation atteignable d\'une pièce se pose', () => {
  // Une colonne libre : la barre debout y entre, pas la barre couchée.
  const colonne = Array.from({ length: 10 }, () => '.#########')
  const couchee = depuisTexte({ rangees: colonne, enCours: ['barre3.0', null, null], reserve: avec({ tourner: 1 }) })
  assert.equal(bloquee(couchee), true)
  assert.deepEqual(bonusUtiles(couchee), ['tourner'])
  assert.equal(perdue(couchee), false)
  const tournee = tournerPiece(couchee, 0)
  assert.equal(bloquee(tournee), false)
  assert.equal(perdue(depuisTexte({ rangees: colonne, enCours: ['barre3.0', null, null] })), true)
  // Une pièce qui n'a qu'une orientation ne profite pas du bonus.
  const carre = depuisTexte({ rangees: colonne, enCours: ['carre3.0', null, null], reserve: avec({ tourner: 4 }) })
  assert.equal(perdue(carre), true)
  // Une orientation à deux quarts de tour : il faut deux bonus pour l'atteindre.
  const demi = piece(pieceSuivante(pieceSuivante('coin.0')))
  const libres = demi.cases.map((c) => `${c.ligne},${c.col}`)
  const rangees = Array.from({ length: 10 }, (_, l) => [...'##########'].map((_, k) => (libres.includes(`${l},${k}`) ? '.' : '#')).join(''))
  const deux = (n) => depuisTexte({ rangees, enCours: ['coin.0', null, null], reserve: avec({ tourner: n }) })
  assert.equal(bloquee(deux(1)), true)
  assert.equal(perdue(deux(1)), true)
  assert.equal(perdue(deux(2)), false)
  assert.equal(perdue(deux(9)), false)
})

test('fin de partie : le joueur sort du blocage par les bonus, ou perd quand ils sont épuisés', () => {
  let e = bloquee3({ supprimer: 3 })
  for (let i = 0; i < 3; i++) {
    assert.equal(perdue(e), false)
    e = supprimerPiece(e, i)
  }
  // Les trois retirées : le tour suivant (le bloc, qui tient) commence.
  assert.deepEqual(ids(e.enCours), ['bloc.0', 'bloc.0', 'bloc.0'])
  assert.equal(bloquee(e), false)

  // Un seul « supprimer » pour trois pièces bloquées : il faut quand même l'employer,
  // puis la partie est perdue.
  let f = bloquee3({ supprimer: 1 })
  assert.equal(perdue(f), false)
  f = supprimerPiece(f, 0)
  assert.equal(bloquee(f), true)
  assert.equal(perdue(f), true)
})

// --- Garder une partie avec ses bonus -----------------------------------------------

test('export puis import : la réserve et l\'instantané d\'annulation reviennent, on peut annuler après', () => {
  const alea = generateur(31)
  let e = nouvellePartie({ graine: 77, niveau: 7, reserve: reserveInitiale() })
  for (let i = 0; i < 25 && !bloquee(e); i++) e = coupAuHasard(e, alea)
  e = gagnerBonus(e, 'tourner', 2)
  assert.ok(e.annulation)
  const donnees = JSON.parse(JSON.stringify(exporterPartie(e)))
  assert.deepEqual(donnees.reserve, e.reserve)
  assert.ok(donnees.annulation)
  const relue = importerPartie(donnees)
  assert.ok(relue)
  assert.deepEqual(exporterPartie(relue), exporterPartie(e))
  assert.deepEqual(relue.reserve, e.reserve)
  // Annuler après la relance donne la même chose que sans relance.
  assert.deepEqual(exporterPartie(annulerCoup(relue)), exporterPartie(annulerCoup(e)))
  assert.deepEqual(partieSeule(annulerCoup(relue)), partieSeule(annulerCoup(e)))
  // Et la partie continue à l'identique.
  const suite2 = (x) => { let s = x; const a = generateur(8); const t = []; for (let i = 0; i < 30 && !bloquee(s); i++) { s = coupAuHasard(s, a); t.push(exporterPartie(s)) } return t }
  assert.deepEqual(suite2(relue), suite2(e))
})

test('export puis import : sans coup à annuler, l\'instantané est null', () => {
  const e = nouvellePartie({ graine: 5, reserve: tout(2) })
  const donnees = JSON.parse(JSON.stringify(exporterPartie(e)))
  assert.equal(donnees.annulation, null)
  const relue = importerPartie(donnees)
  assert.equal(relue.annulation, null)
  assert.deepEqual(relue.reserve, tout(2))
})

test('l\'import tolérant refuse une réserve ou un instantané illisibles, et l\'ancien schéma', () => {
  const e = poser(depuisTexte({ enCours: ['bloc.0', 'bloc.0', 'bloc.0'], reserve: tout(1) }), 0, 0, 0)
  const bon = exporterPartie(e)
  assert.ok(importerPartie(bon))
  const avecDonnees = (modif) => importerPartie({ ...structuredClone(bon), ...modif })
  assert.equal(avecDonnees({ reserve: undefined }), null)
  assert.equal(avecDonnees({ reserve: { ...bon.reserve, annuler: 11 } }), null)
  assert.equal(avecDonnees({ reserve: { supprimer: 1 } }), null)
  assert.equal(avecDonnees({ annulation: undefined }), null)
  assert.equal(avecDonnees({ annulation: 3 }), null)
  assert.equal(avecDonnees({ annulation: { ...bon.annulation, grille: bon.annulation.grille.slice(1) } }), null)
  assert.equal(avecDonnees({ annulation: { ...bon.annulation, enCours: [null, null, null] } }), null)
  assert.equal(avecDonnees({ annulation: { ...bon.annulation, hasard: -1 } }), null)
  assert.equal(avecDonnees({ schema: 1 }), null)
})
