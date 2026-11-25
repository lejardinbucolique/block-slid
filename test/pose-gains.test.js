// Gains de bonus de block-pose (BS43) : les six manières de gagner un bonus, leur
// faisabilité avec le catalogue, le défi, les paliers, la case surprise, l'annulation des
// gains, la partie exportée, la reproductibilité, et le simulateur de calage.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  REGLAGES,
  GAINS,
  AU_CHOIX,
  CAUSES,
  SORTES,
  CATALOGUE,
  LIGNES_MAX_PAR_COUP,
  COLONNES_MAX_PAR_COUP,
  NIVEAU_MIN,
  NIVEAU_MAX,
  RESERVE_MAX,
  reserveVide,
  reserveInitiale,
  piece,
  pieceSuivante,
  nouveauDefi,
  compteSurprise,
  duNiveau,
  pointsMaxParPose,
  pointsMaxEnCoups,
  nouvellePartie,
  depuisTexte,
  poser,
  perdue,
  choisirBonus,
  tournerPiece,
  annulerCoup,
  supprimerPiece,
  changerPieces,
  exporterPartie,
  importerPartie,
  piecesJouables,
  positionsPossibles,
  SCHEMA_PARTIE,
} from '../src/pose/index.js'
import { jouer, mesurerNiveau, rapport } from '../tools/simulateur-pose.js'

const NIVEAUX = Array.from({ length: NIVEAU_MAX - NIVEAU_MIN + 1 }, (_, i) => NIVEAU_MIN + i)
const BLOCS = ['bloc.0', 'bloc.0', 'bloc.0']
const VIDE = '..........'
const enBas = (...rangees) => [...Array(10 - rangees.length).fill(VIDE), ...rangees]
const causes = (etat) => etat.dernierCoup.gains.map((g) => g.cause)
const gain = (etat, cause) => etat.dernierCoup.gains.find((g) => g.cause === cause)

// Un état d'essai où seul ce qu'on veut mesurer peut arriver : défi et palier hors de portée.
function partie(options = {}) {
  return depuisTexte({
    enCours: BLOCS,
    suivantes: BLOCS,
    defi: { points: 1e9, coups: 1e6, scoreDebut: 0, coupsFaits: 0 },
    palier: 1e9,
    ...options,
  })
}

// Les cases d'une pièce posée en (0, 0) sont les seules à manquer aux lignes et colonnes
// données : la pose les efface toutes. Rend le dessin de la grille, avec une case témoin
// en (9, 9), hors de ces lignes, pour que la grille ne se vide pas (ce qui donnerait aussi
// le gain de la grille vidée).
function grillePourEffacer(id, lignes, colonnes) {
  const p = piece(id)
  const manque = new Set(p.cases.map((c) => `${c.ligne},${c.col}`))
  assert.ok(!lignes.includes(9) && !colonnes.includes(9))
  return Array.from({ length: 10 }, (_, l) => [...VIDE].map((_, k) => (
    ((lignes.includes(l) || colonnes.includes(k)) && !manque.has(`${l},${k}`)) || (l === 9 && k === 9) ? '#' : '.'
  )).join(''))
}

// --- Les conditions et leur faisabilité ------------------------------------------

test('constantes : seuils de lignes dans ce que le catalogue permet, tables de dix niveaux', () => {
  for (const niveau of NIVEAUX) {
    const lignes = duNiveau(GAINS.lignesPourAnnuler, niveau)
    assert.ok(lignes <= LIGNES_MAX_PAR_COUP && lignes <= COLONNES_MAX_PAR_COUP,
      'jamais plus de lignes (colonnes) d\'un coup que la plus grande hauteur (largeur) d\'une pièce')
    const [l, c] = [duNiveau(GAINS.croisementLignes, niveau), duNiveau(GAINS.croisementColonnes, niveau)]
    assert.ok(l <= LIGNES_MAX_PAR_COUP && c <= COLONNES_MAX_PAR_COUP)
    assert.ok(CATALOGUE.some((p) => p.hauteur >= l && p.largeur >= c), `${l} lignes et ${c} colonnes doivent être réalisables par une pièce du catalogue`)
  }
  assert.equal(duNiveau(GAINS.lignesPourAnnuler, NIVEAU_MAX), 5, 'au dernier niveau, 5 lignes d\'un coup')
  for (const table of [GAINS.lignesPourAnnuler, GAINS.croisementLignes, GAINS.croisementColonnes, GAINS.defis, GAINS.surprise.compte, GAINS.palier]) {
    assert.equal(table.length, NIVEAU_MAX - NIVEAU_MIN + 1)
  }
  assert.equal(duNiveau(GAINS.palier, 5), 50000)
  assert.equal(duNiveau(7, 3), 7, 'un nombre vaut pour tous les niveaux')
  assert.equal(REGLAGES.gains, GAINS, 'les gains se règlent avec les autres réglages')
})

test('les conditions de bonus ne se relâchent jamais d\'un niveau au suivant (BS57)', () => {
  const monte = (table, nom, sens = 1) => {
    for (let i = 1; i < table.length; i++) assert.ok(sens * (table[i] - table[i - 1]) >= 0, `${nom} : niveau ${i + 1}`)
    assert.ok(sens * (table[table.length - 1] - table[0]) > 0, `${nom} : du premier au dernier niveau`)
  }
  monte(GAINS.lignesPourAnnuler, 'lignes pour annuler')
  monte(GAINS.croisementLignes, 'lignes du croisement')
  monte(GAINS.croisementColonnes, 'colonnes du croisement')
  monte(GAINS.palier, 'palier')
  monte(GAINS.surprise.compte, 'compte de la surprise', -1)
})

test('5 lignes d\'un coup donnent annuler, et 5 colonnes de même (par symétrie)', () => {
  // Cinq lignes : une barre debout dans la colonne que les rangées 0 à 4 attendent (la première).
  const e = poser(partie({ enCours: ['barre5.1', 'bloc.0', 'bloc.0'], rangees: grillePourEffacer('barre5.1', [0, 1, 2, 3, 4], []) }), 0, 0, 0)
  assert.equal(e.dernierCoup.lignes.length, 5)
  assert.deepEqual(causes(e), ['lignes'])
  assert.deepEqual(gain(e, 'lignes'), { cause: 'lignes', sorte: 'annuler', ajoute: true })
  assert.equal(e.reserve.annuler, 1)

  // Cinq colonnes : la barre couchée, sur la rangée que les colonnes 0 à 4 attendent.
  const c = poser(partie({ enCours: ['barre5.0', 'bloc.0', 'bloc.0'], rangees: grillePourEffacer('barre5.0', [], [0, 1, 2, 3, 4]) }), 0, 0, 0)
  assert.equal(c.dernierCoup.colonnes.length, 5)
  assert.deepEqual(causes(c), ['lignes'])
  assert.equal(c.reserve.annuler, 1)
})

test('le seuil de lignes pour annuler suit le niveau : une ligne de moins ne donne rien', () => {
  const lignes = (n) => Array.from({ length: n }, (_, i) => i)
  for (const niveau of NIVEAUX) {
    const seuil = duNiveau(GAINS.lignesPourAnnuler, niveau)
    const id = seuil === 5 ? 'barre5.1' : 'carre4.0'
    const avec = poser(partie({ niveau, enCours: [id, 'bloc.0', 'bloc.0'], rangees: grillePourEffacer(id, lignes(seuil), []) }), 0, 0, 0)
    assert.equal(avec.dernierCoup.lignes.length, seuil)
    assert.deepEqual(causes(avec), ['lignes'], `niveau ${niveau}`)
    const sans = poser(partie({ niveau, enCours: [id, 'bloc.0', 'bloc.0'], rangees: grillePourEffacer(id, lignes(seuil - 1), []) }), 0, 0, 0)
    assert.equal(sans.dernierCoup.lignes.length, seuil - 1)
    assert.deepEqual(causes(sans), [], `niveau ${niveau}`)
    assert.deepEqual(sans.reserve, reserveVide())
  }
})

test('lignes ET colonnes d\'un coup donnent tourner, avec chaque pièce du catalogue qui le permet', () => {
  const rang = (n) => Array.from({ length: n }, (_, i) => i)
  for (const niveau of NIVEAUX) {
    const [l, c] = [duNiveau(GAINS.croisementLignes, niveau), duNiveau(GAINS.croisementColonnes, niveau)]
    const candidates = CATALOGUE.filter((p) => p.hauteur >= l && p.largeur >= c)
    assert.ok(candidates.length >= 3, `niveau ${niveau} : au moins le 4x4, le 3x3 et le grand L`)
    for (const p of candidates) {
      const e = poser(partie({ niveau, enCours: [p.id, 'bloc.0', 'bloc.0'], rangees: grillePourEffacer(p.id, rang(l), rang(c)) }), 0, 0, 0)
      assert.ok(e.dernierCoup.lignes.length >= l && e.dernierCoup.colonnes.length >= c, p.id)
      assert.deepEqual(gain(e, 'croisement'), { cause: 'croisement', sorte: 'tourner', ajoute: true }, `${p.id} niveau ${niveau}`)
      assert.equal(e.reserve.tourner, 1, p.id)
    }
    for (const id of ['carre4.0', 'carre3.0', 'grandL.0']) assert.ok(candidates.some((p) => p.id === id), id)
  }
})

test('une ligne ou une colonne de moins que le seuil du niveau ne donne pas tourner', () => {
  const rang = (n) => Array.from({ length: n }, (_, i) => i)
  for (const niveau of NIVEAUX) {
    const [l, c] = [duNiveau(GAINS.croisementLignes, niveau), duNiveau(GAINS.croisementColonnes, niveau)]
    const a = poser(partie({ niveau, enCours: ['carre4.0', 'bloc.0', 'bloc.0'], rangees: grillePourEffacer('carre4.0', rang(l - 1), rang(c)) }), 0, 0, 0)
    assert.equal(a.dernierCoup.lignes.length, l - 1)
    assert.equal(a.dernierCoup.colonnes.length, c)
    assert.ok(!causes(a).includes('croisement'), `niveau ${niveau}`)
    const b = poser(partie({ niveau, enCours: ['carre4.0', 'bloc.0', 'bloc.0'], rangees: grillePourEffacer('carre4.0', rang(l), rang(c - 1)) }), 0, 0, 0)
    assert.equal(b.dernierCoup.lignes.length, l)
    assert.equal(b.dernierCoup.colonnes.length, c - 1)
    assert.ok(!causes(b).includes('croisement'), `niveau ${niveau}`)
  }
})

test('grille entièrement vidée : un gain au choix en attente, puis choisirBonus', () => {
  const e = poser(partie({ rangees: enBas('#########.') }), 0, 9, 9)
  assert.equal(e.dernierCoup.grilleVidee, true)
  assert.deepEqual(gain(e, 'grilleVidee'), { cause: 'grilleVidee', sorte: AU_CHOIX, ajoute: false })
  assert.equal(e.choix, 1)
  assert.deepEqual(e.reserve, reserveVide(), 'rien n\'entre dans la réserve avant le choix')

  for (const sorte of SORTES) {
    const c = choisirBonus(e, sorte)
    assert.equal(c.choix, 0)
    assert.equal(c.reserve[sorte], 1)
    assert.equal(SORTES.filter((s) => c.reserve[s] > 0).length, 1)
    assert.deepEqual(c.dernierBonus, { sorte: 'choisir', choisie: sorte, ajoute: true })
  }
  assert.equal(e.choix, 1, 'l\'état d\'avant n\'est pas modifié')
})

test('choisirBonus : refusé sans choix en attente ou pour une sorte inconnue ; le plafond s\'applique', () => {
  assert.equal(choisirBonus(partie(), 'tourner'), null)
  const e = poser(partie({ rangees: enBas('#########.'), reserve: { ...reserveVide(), tourner: RESERVE_MAX } }), 0, 9, 9)
  assert.equal(choisirBonus(e, 'magie'), null)
  assert.equal(choisirBonus(e, undefined), null)
  const c = choisirBonus(e, 'tourner')
  assert.equal(c.reserve.tourner, RESERVE_MAX, 'au-delà du plafond, le gain est perdu')
  assert.equal(c.choix, 0, 'le choix est tout de même consommé')
  assert.equal(c.dernierBonus.ajoute, false)
  assert.equal(choisirBonus(c, 'tourner'), null, 'un seul choix était en attente')
})

test('une partie avec un choix en attente n\'est pas perdue, même bloquée', () => {
  const e = { ...partie({ rangees: DAMIER_PLEIN, enCours: ['carre2.0', 'carre2.0', 'carre2.0'], niveau: 3 }), choix: 1 }
  assert.equal(piecesJouables(e).length, 0)
  assert.equal(perdue(e), false)
  assert.equal(perdue({ ...e, choix: 0 }), true)
})
const DAMIER_PLEIN = Array.from({ length: 10 }, (_, l) => (l % 2 ? '.#.#.#.#.#' : '#.#.#.#.#.'))

// --- Le défi ----------------------------------------------------------------------

test('le défi : un par partie, du niveau, affiché par etat.defi', () => {
  for (const niveau of NIVEAUX) {
    const e = nouvellePartie({ graine: 3, niveau })
    const [points, coups] = GAINS.defis[niveau - 1]
    assert.deepEqual(e.defi, { points, coups, scoreDebut: 0, coupsFaits: 0 })
    assert.deepEqual(e.defi, nouveauDefi(niveau, 0))
  }
  assert.equal(nouvellePartie({ graine: 3, niveau: 99 }).defi.points, GAINS.defis[0][0], 'un niveau illisible retombe sur le niveau 1')
})

test('défi réussi : points de tous les coups depuis son début, supprimer en gain, nouveau défi aussitôt', () => {
  // 3 points en 5 coups : trois blocs d'un point chacun suffisent.
  let e = partie({ defi: { points: 3, coups: 5, scoreDebut: 0, coupsFaits: 0 } })
  e = poser(e, 0, 0, 0)
  assert.equal(e.dernierCoup.defiFini, null)
  assert.deepEqual(e.defi, { points: 3, coups: 5, scoreDebut: 0, coupsFaits: 1 })
  e = poser(e, 1, 0, 1)
  assert.deepEqual(causes(e), [])
  e = poser(e, 2, 0, 2)
  assert.equal(e.dernierCoup.defiFini, 'reussi')
  assert.deepEqual(gain(e, 'defi'), { cause: 'defi', sorte: 'supprimer', ajoute: true })
  assert.equal(e.reserve.supprimer, 1)
  // Un nouveau défi, compté à partir d'ici.
  assert.deepEqual(e.defi, { ...nouveauDefi(1, e.score), scoreDebut: 3, coupsFaits: 0 })
})

test('défi réussi sur les points d\'un effacement, bien plus que ceux d\'une pose simple', () => {
  const e = poser(partie({ rangees: enBas('#########.'), defi: { points: 100, coups: 2, scoreDebut: 0, coupsFaits: 0 } }), 0, 9, 9)
  assert.ok(e.dernierCoup.points >= 100)
  assert.equal(e.dernierCoup.defiFini, 'reussi')
  assert.ok(causes(e).includes('defi'))
})

test('défi raté : rien ne se perd, un nouveau défi arrive aussitôt, ses points repartent de zéro', () => {
  let e = partie({ defi: { points: 100000, coups: 2, scoreDebut: 0, coupsFaits: 0 }, reserve: { ...reserveVide(), supprimer: 2 } })
  e = poser(e, 0, 0, 0)
  assert.equal(e.dernierCoup.defiFini, null)
  e = poser(e, 1, 0, 1)
  assert.equal(e.dernierCoup.defiFini, 'rate')
  assert.deepEqual(causes(e), [])
  assert.deepEqual(e.reserve, { ...reserveVide(), supprimer: 2 }, 'rien n\'est retiré')
  assert.deepEqual(e.defi, { ...nouveauDefi(1, e.score), coupsFaits: 0 })
  assert.equal(e.defi.scoreDebut, e.score)
  // Les deux points déjà gagnés ne comptent pas pour le défi suivant.
  e = poser(e, 2, 0, 2)
  assert.equal(e.defi.coupsFaits, 1)
  assert.equal(e.score - e.defi.scoreDebut, 1)
})

test('défi réussi au plafond de la réserve : le gain est perdu, sans erreur', () => {
  const e = poser(partie({ defi: { points: 1, coups: 3, scoreDebut: 0, coupsFaits: 0 }, reserve: { ...reserveVide(), supprimer: RESERVE_MAX } }), 0, 0, 0)
  assert.deepEqual(gain(e, 'defi'), { cause: 'defi', sorte: 'supprimer', ajoute: false })
  assert.equal(e.reserve.supprimer, RESERVE_MAX)
})

test('défi : le seuil de chaque niveau est atteignable dans ses coups (borne théorique du score)', () => {
  assert.ok(pointsMaxParPose(REGLAGES) > 0)
  for (const niveau of NIVEAUX) {
    const [points, coups] = GAINS.defis[niveau - 1]
    assert.ok(Number.isInteger(points) && points > 0 && Number.isInteger(coups) && coups >= 1, `niveau ${niveau}`)
    assert.ok(points <= pointsMaxEnCoups(coups, REGLAGES), `niveau ${niveau} : ${points} points en ${coups} coups dépasse la borne théorique`)
  }
  // BS55 : les seuils ne montent plus avec le niveau. Le robot marque plus aux niveaux faciles, où le
  // tirage lui donne des pièces qui effacent, que vers le niveau 10 ; chaque seuil suit ce que le robot
  // marque (voir GAINS.defis), la difficulté du défi reste la même.
  // Et il faut vraiment enchaîner des lignes : une pose simple (au plus quelques points)
  // est très loin du seuil.
  assert.ok(Math.max(...CATALOGUE.map((p) => p.cases.length)) * REGLAGES.pointsParCase * GAINS.defis[0][1] < GAINS.defis[0][0] / 4)
})

test('la borne théorique est bien une borne : la meilleure pose réalisable du catalogue la respecte', () => {
  // Le 4x4 qui efface 4 lignes et 4 colonnes d'un coup, au multiplicateur 1.
  const e = poser(partie({ enCours: ['carre4.0', 'bloc.0', 'bloc.0'], rangees: grillePourEffacer('carre4.0', [0, 1, 2, 3], [0, 1, 2, 3]) }), 0, 0, 0)
  assert.equal(e.dernierCoup.lignes.length, 4)
  assert.equal(e.dernierCoup.colonnes.length, 4)
  assert.ok(e.dernierCoup.points <= pointsMaxParPose(REGLAGES))
  assert.ok(e.dernierCoup.points >= 5000, 'un tel coup vaut des milliers de points')
})

// --- Les paliers de score ---------------------------------------------------------

test('palier : changer tous les 30 000 points au niveau 1, et le prochain palier avance', () => {
  const P = duNiveau(GAINS.palier, 1)
  assert.equal(P, 30000)
  assert.equal(nouvellePartie({ graine: 1 }).palier, P)
  const e = poser(partie({ rangees: enBas('#########.'), score: P - 50, palier: P, defi: { points: 1e9, coups: 1e6, scoreDebut: P - 50, coupsFaits: 0 } }), 0, 9, 9)
  assert.ok(e.score >= P)
  assert.deepEqual(gain(e, 'palier'), { cause: 'palier', sorte: 'changer', palier: P, ajoute: true })
  assert.equal(e.reserve.changer, 1)
  assert.equal(e.palier, 2 * P)
  // Pas de nouveau gain tant que le palier suivant n\'est pas atteint.
  const suite = poser(e, 1, 0, 0)
  assert.deepEqual(causes(suite), [])
  assert.equal(suite.palier, 2 * P)
})

test('palier : plus loin quand le niveau monte, et chaque niveau avance de son propre palier', () => {
  const P = duNiveau(GAINS.palier, 10)
  assert.equal(P, 75000)
  assert.equal(nouvellePartie({ graine: 1, niveau: 10 }).palier, P)
  const e = poser(partie({ niveau: 10, rangees: enBas('#########.'), score: P - 50, palier: P, defi: { points: 1e9, coups: 1e6, scoreDebut: P - 50, coupsFaits: 0 } }), 0, 9, 9)
  assert.equal(e.palier, 2 * P)
})

test('un gros coup qui franchit deux paliers donne deux bonus', () => {
  const reglages = { ...REGLAGES, gains: { ...GAINS, palier: 50 } }
  const e = poser(partie({ reglages, rangees: enBas('#########.'), score: 20, palier: 50, defi: { points: 1e9, coups: 1e6, scoreDebut: 20, coupsFaits: 0 } }), 0, 9, 9)
  assert.ok(e.score >= 100 && e.score < 150, `score ${e.score}`)
  const paliers = e.dernierCoup.gains.filter((g) => g.cause === 'palier')
  assert.deepEqual(paliers.map((g) => g.palier), [50, 100])
  assert.equal(e.reserve.changer, 2)
  assert.equal(e.palier, 150)
})

test('palier réglable : 100 000 se pose avec les réglages, sans toucher au code', () => {
  const reglages = { ...REGLAGES, gains: { ...GAINS, palier: 100000 } }
  assert.equal(nouvellePartie({ graine: 1, reglages }).palier, 100000)
})

// --- La case surprise -------------------------------------------------------------

test('surprise effacée à temps : un bonus au hasard, la case redevient ordinaire', () => {
  // La surprise est en (9, 0), dans la rangée 9 que le bloc posé en (9, 9) complète.
  const e = poser(partie({ rangees: enBas('#########.'), surprise: { ligne: 9, col: 0, reste: 4 } }), 0, 9, 9)
  assert.equal(e.dernierCoup.surprise, 'gagnee')
  assert.equal(e.surprise, null)
  const g = gain(e, 'surprise')
  assert.ok(SORTES.includes(g.sorte))
  assert.equal(g.ajoute, true)
  assert.equal(e.reserve[g.sorte], 1)
})

test('surprise effacée aussi par la colonne qui la contient', () => {
  const rangees = Array.from({ length: 10 }, (_, l) => (l === 9 ? VIDE : '#........' + '.'))
  const e = poser(partie({ rangees, surprise: { ligne: 3, col: 0, reste: 2 } }), 0, 9, 0)
  assert.equal(e.dernierCoup.colonnes.length, 1)
  assert.equal(e.dernierCoup.surprise, 'gagnee')
})

test('surprise : le numéro baisse à chaque pose, la dernière pose qui l\'efface compte, à zéro elle est perdue', () => {
  let e = partie({ surprise: { ligne: 9, col: 0, reste: 3 }, rangees: enBas('#.........') })
  e = poser(e, 0, 0, 0)
  assert.equal(e.surprise.reste, 2)
  assert.equal(e.dernierCoup.surprise, null)
  e = poser(e, 1, 0, 1)
  assert.equal(e.surprise.reste, 1)
  e = poser(e, 2, 0, 2)
  assert.equal(e.surprise, null)
  assert.equal(e.dernierCoup.surprise, 'perdue')
  assert.deepEqual(causes(e), [])
  assert.deepEqual(e.reserve, reserveVide())

  // Même numéro, mais la dernière pose efface la ligne : gagnée.
  let g = partie({ surprise: { ligne: 9, col: 0, reste: 1 }, rangees: enBas('#########.') })
  g = poser(g, 0, 9, 9)
  assert.equal(g.dernierCoup.surprise, 'gagnee')
})

test('surprise perdue : la case devient ordinaire, on peut encore effacer sa ligne sans rien gagner', () => {
  let e = partie({ surprise: { ligne: 9, col: 0, reste: 1 }, rangees: enBas('#########.') })
  e = poser(e, 0, 0, 0)
  assert.equal(e.surprise, null)
  e = poser(e, 1, 9, 9)
  assert.equal(e.dernierCoup.lignes.length, 1)
  assert.deepEqual(causes(e), [])
})

test('la case surprise est portée par une pièce du tirage et prend sa place à la pose, compte à rebours du niveau', () => {
  for (const niveau of NIVEAUX) {
    const e0 = partie({ niveau, enCours: [{ id: 'barre3.0', surprise: { ligne: 0, col: 2 } }, 'bloc.0', 'bloc.0'] })
    const e = poser(e0, 0, 4, 3)
    assert.equal(e.dernierCoup.surprise, 'posee')
    assert.deepEqual(e.surprise, { ligne: 4, col: 5, reste: compteSurprise(niveau) })
    assert.equal(e.grille[4][5], 'uni', 'la case surprise est une case de la pièce')
    // Le décompte ne baisse pas à la pose qui la place, mais à la suivante.
    assert.equal(poser(e, 1, 0, 0).surprise.reste, compteSurprise(niveau) - 1)
  }
  assert.ok(GAINS.surprise.compte.every((n) => n >= 3 && n <= 10), 'de l@ordre de 3 à 10 poses'.replace('@', "'"))
  assert.ok(GAINS.surprise.compte.every((n, i, t) => i === 0 || n <= t[i - 1]), 'moins de temps aux niveaux difficiles')
  assert.ok(GAINS.surprise.compte[0] > GAINS.surprise.compte[9], 'bien moins de temps au niveau 10 qu@au niveau 1'.replace('@', "'"))
})

test('une pièce à surprise qui complète sa ligne en la posant gagne tout de suite', () => {
  const e = poser(partie({ rangees: enBas('#########.'), enCours: [{ id: 'bloc.0', surprise: { ligne: 0, col: 0 } }, 'bloc.0', 'bloc.0'] }), 0, 9, 9)
  assert.equal(e.dernierCoup.surprise, 'gagnee')
  assert.equal(e.surprise, null)
  assert.equal(causes(e).filter((c) => c === 'surprise').length, 1)
})

test('une seule case surprise à la fois : jamais deux, sur la grille et les pièces confondues', () => {
  let vues = 0
  let sur = 0
  for (let graine = 1; graine <= 40; graine++) {
    let e = nouvellePartie({ graine, niveau: 1 + (graine % 10), reserve: reserveInitiale() })
    for (let n = 0; n < 120 && piecesJouables(e).length > 0; n++) {
      const portees = [...e.enCours, ...e.suivantes].filter((x) => x && x.surprise).length
      const total = portees + (e.surprise ? 1 : 0)
      assert.ok(total <= 1, `graine ${graine}, pose ${n} : ${total} cases surprises`)
      vues += total
      sur++
      const index = piecesJouables(e)[0]
      const places = positionsPossibles(e, index)
      const { ligne, col } = places[(n * 7) % places.length]
      e = poser(e, index, ligne, col)
    }
  }
  assert.ok(vues > sur / 10, `des surprises apparaissent bien (${vues} sur ${sur} états)`)
})

test('la pièce qui porte la surprise est visible et la case est l\'une des siennes', () => {
  for (let graine = 1; graine <= 60; graine++) {
    const e = nouvellePartie({ graine })
    for (const x of [...e.enCours, ...e.suivantes]) {
      if (!x.surprise) continue
      assert.ok(piece(x.id).cases.some((c) => c.ligne === x.surprise.ligne && c.col === x.surprise.col))
    }
  }
})

test('la case surprise tourne avec sa pièce, et quatre quarts de tour la ramènent', () => {
  for (const p of CATALOGUE) {
    if (pieceSuivante(p.id) === p.id) continue
    for (const c of p.cases) {
      let e = partie({ enCours: [{ id: p.id, surprise: { ligne: c.ligne, col: c.col } }, 'bloc.0', 'bloc.0'], reserve: { ...reserveVide(), tourner: 4 } })
      for (let i = 0; i < 4; i++) {
        e = tournerPiece(e, 0)
        const s = e.enCours[0].surprise
        assert.ok(piece(e.enCours[0].id).cases.some((q) => q.ligne === s.ligne && q.col === s.col), `${p.id} tourne : la surprise reste sur une case de la pièce`)
      }
      assert.equal(e.enCours[0].id, p.id)
      assert.deepEqual(e.enCours[0].surprise, { ligne: c.ligne, col: c.col }, p.id)
    }
  }
})

test('supprimer ou changer la pièce qui porte la surprise la fait disparaître', () => {
  const avec = () => partie({ enCours: [{ id: 'bloc.0', surprise: { ligne: 0, col: 0 } }, 'bloc.0', 'bloc.0'], reserve: tout1() })
  const s = supprimerPiece(avec(), 0)
  assert.equal(s.enCours.some((x) => x && x.surprise), false)
  const c = changerPieces(avec())
  assert.equal(c.surprise, null)
})
const tout1 = () => Object.fromEntries(SORTES.map((s) => [s, 1]))

// --- Annuler le coup qui a rapporté des gains -------------------------------------

test('annuler un coup retire ce qu\'il avait rapporté, défi, palier, choix et surprise compris', () => {
  const avant = partie({
    rangees: enBas('#########.'),
    surprise: { ligne: 9, col: 0, reste: 5 },
    defi: { points: 50, coups: 3, scoreDebut: 0, coupsFaits: 0 },
    score: 10,
    palier: 50,
    reserve: { ...reserveVide(), annuler: 1 },
  })
  const apres = poser(avant, 0, 9, 9)
  assert.deepEqual(causes(apres).sort(), ['defi', 'grilleVidee', 'palier', 'surprise'].sort())
  const gagneSurprise = gain(apres, 'surprise').sorte

  const retour = annulerCoup(apres)
  assert.ok(retour)
  assert.equal(retour.choix, 0)
  assert.deepEqual(retour.defi, avant.defi)
  assert.equal(retour.palier, 50)
  assert.deepEqual(retour.surprise, { ligne: 9, col: 0, reste: 5 })
  assert.equal(retour.score, 10)
  // La réserve : tout ce que la pose avait rapporté s'en va, et l'annulation coûte son bonus.
  assert.deepEqual(retour.reserve, reserveVide())
  assert.ok(apres.reserve[gagneSurprise] >= 1)
})

test('annuler : un bonus gagné par la pose elle-même ne rend pas gratuit le coup annulé', () => {
  // Les 5 lignes donnent annuler : on l'emploie aussitôt, il s'en va avec la pose.
  const e = poser(partie({ enCours: ['barre5.1', 'bloc.0', 'bloc.0'], rangees: grillePourEffacer('barre5.1', [0, 1, 2, 3, 4], []) }), 0, 0, 0)
  assert.equal(e.reserve.annuler, 1)
  const r = annulerCoup(e)
  assert.deepEqual(r.reserve, reserveVide())
  assert.equal(r.score, 0)
})

test('choisir un bonus empêche d\'annuler la pose qui l\'a donné', () => {
  const e = poser(partie({ rangees: enBas('#########.'), reserve: { ...reserveVide(), annuler: 1 } }), 0, 9, 9)
  assert.ok(annulerCoup(e), 'avant le choix, on peut encore annuler')
  assert.equal(annulerCoup(choisirBonus(e, 'changer')), null)
})

// --- Reproductibilité, hasard à part ----------------------------------------------

function partieJouee(graine, options = {}) {
  let e = nouvellePartie({ graine, niveau: 1, reserve: reserveInitiale(), ...options })
  const trace = []
  for (let n = 0; n < 300 && piecesJouables(e).length > 0; n++) {
    const index = piecesJouables(e)[0]
    const places = positionsPossibles(e, index)
    const { ligne, col } = places[(n * 5) % places.length]
    e = poser(e, index, ligne, col)
    trace.push(e.dernierCoup.gains.map((g) => `${g.cause}:${g.sorte}`).join(','))
  }
  return { e, trace }
}

test('reproductible : même graine, mêmes coups, mêmes gains (la sorte d\'une surprise gagnée y compris)', () => {
  const a = partieJouee(82)
  const b = partieJouee(82)
  assert.deepEqual(exporterPartie(a.e), exporterPartie(b.e))
  assert.deepEqual(a.trace, b.trace)
  assert.notDeepEqual(exporterPartie(partieJouee(83).e), exporterPartie(a.e))
  assert.ok(a.trace.some((t) => t !== ''), 'la partie d\'essai gagne bien quelque chose')
})

test('les gains ont leur propre hasard : le tirage des pièces ne change pas, avec ou sans surprise', () => {
  const sans = { ...REGLAGES, gains: { ...GAINS, surprise: { ...GAINS.surprise, frequence: 0 } } }
  const toujours = { ...REGLAGES, gains: { ...GAINS, surprise: { ...GAINS.surprise, frequence: 1 } } }
  const a = nouvellePartie({ graine: 12, reglages: sans })
  const b = nouvellePartie({ graine: 12, reglages: toujours })
  assert.deepEqual(a.enCours.map((x) => x.id), b.enCours.map((x) => x.id))
  assert.deepEqual(a.suivantes.map((x) => x.id), b.suivantes.map((x) => x.id))
  assert.equal(a.hasard, b.hasard, 'la suite du tirage n\'a pas avancé pour les gains')
  assert.equal([...a.enCours, ...a.suivantes].some((x) => x.surprise), false)
  assert.equal([...b.enCours, ...b.suivantes].filter((x) => x.surprise).length, 1, 'fréquence 1 : une surprise, jamais deux')
})

// --- Réserve et plafond -----------------------------------------------------------

test('plusieurs gains dans un coup entrent dans la réserve, chacun plafonné à 10', () => {
  const reglages = { ...REGLAGES, gains: { ...GAINS, palier: 10 } }
  const e = poser(partie({ reglages, palier: 10, rangees: enBas('#########.'), reserve: { ...reserveVide(), changer: 9 } }), 0, 9, 9)
  const paliers = e.dernierCoup.gains.filter((g) => g.cause === 'palier')
  assert.ok(paliers.length >= 3)
  assert.equal(e.reserve.changer, RESERVE_MAX)
  assert.deepEqual(paliers.map((g) => g.ajoute), paliers.map((_, i) => i === 0))
})

test('un coup sans gain : liste vide, état du défi avancé, rien d\'autre ne bouge', () => {
  const e = poser(partie({ defi: { points: 100000, coups: 9, scoreDebut: 0, coupsFaits: 0 } }), 0, 0, 0)
  assert.deepEqual(e.dernierCoup.gains, [])
  assert.equal(e.dernierCoup.defiFini, null)
  assert.equal(e.dernierCoup.surprise, null)
  assert.deepEqual(e.reserve, reserveVide())
  assert.equal(e.defi.coupsFaits, 1)
})

test('les causes de gain sont les six de BS43', () => {
  assert.deepEqual(CAUSES, ['lignes', 'croisement', 'grilleVidee', 'defi', 'palier', 'surprise'])
})

// --- La partie exportée -----------------------------------------------------------

test('la partie exportée porte le défi, le palier, la surprise, les choix et le hasard des gains', () => {
  assert.equal(SCHEMA_PARTIE, 4)
  const e = partie({
    surprise: { ligne: 9, col: 0, reste: 5 },
    rangees: enBas('#.........'),
    defi: { points: 800, coups: 8, scoreDebut: 0, coupsFaits: 2 },
    score: 120,
    palier: 50000,
    choix: 2,
    enCours: ['bloc.0', 'bloc.0', 'bloc.0'],
  })
  const d = exporterPartie(e)
  assert.deepEqual(d.defi, { points: 800, coups: 8, scoreDebut: 0, coupsFaits: 2 })
  assert.deepEqual(d.surprise, { ligne: 9, col: 0, reste: 5 })
  assert.equal(d.palier, 50000)
  assert.equal(d.choix, 2)
  assert.equal(typeof d.hasardGains, 'number')
  assert.deepEqual(exporterPartie(importerPartie(JSON.parse(JSON.stringify(d)))), d)
})

test('la partie exportée garde la pièce qui porte la surprise, et l\'annulation avec ses gains', () => {
  let e = partie({ enCours: [{ id: 'bloc.0', surprise: { ligne: 0, col: 0 } }, 'bloc.0', 'bloc.0'], rangees: enBas('#########.'), defi: { points: 100, coups: 3, scoreDebut: 0, coupsFaits: 0 } })
  let d = JSON.parse(JSON.stringify(exporterPartie(e)))
  assert.deepEqual(d.enCours[0].surprise, { ligne: 0, col: 0 })
  assert.deepEqual(exporterPartie(importerPartie(d)), d)

  e = poser(e, 1, 9, 9)
  d = JSON.parse(JSON.stringify(exporterPartie(e)))
  assert.ok(d.annulation.gagnes.supprimer >= 1, 'les bonus rapportés par la pose sont gardés avec l\'annulation')
  const lue = importerPartie(d)
  assert.deepEqual(exporterPartie(lue), d)
  // Relancée, la partie peut toujours annuler, avec ses gains.
  const retour = annulerCoup({ ...lue, reserve: { ...lue.reserve, annuler: 1 } })
  assert.ok(retour)
  assert.deepEqual(retour.defi, { points: 100, coups: 3, scoreDebut: 0, coupsFaits: 0 })
})

test('une partie jouée longtemps se garde et se relit à l\'identique', () => {
  const { e } = partieJouee(5)
  const d = JSON.parse(JSON.stringify(exporterPartie(e)))
  assert.deepEqual(exporterPartie(importerPartie(d)), d)
})

test('import : les données de gains incohérentes sont refusées (null)', () => {
  const base = exporterPartie(partie({ rangees: enBas('#.........'), surprise: { ligne: 9, col: 0, reste: 5 }, enCours: BLOCS }))
  const copie = () => JSON.parse(JSON.stringify(base))
  assert.ok(importerPartie(copie()))
  const cas = {
    'schéma 3': (d) => { d.schema = 3 },
    'défi manquant': (d) => { delete d.defi },
    'défi sans points': (d) => { d.defi.points = 0 },
    'défi commencé dans le futur': (d) => { d.defi.scoreDebut = d.score + 1 },
    'défi déjà fini': (d) => { d.defi.coupsFaits = d.defi.coups },
    'palier déjà dépassé': (d) => { d.score = 60000; d.palier = 50000 },
    'choix négatif': (d) => { d.choix = -1 },
    'hasard des gains illisible': (d) => { d.hasardGains = 'x' },
    'surprise hors grille': (d) => { d.surprise = { ligne: 10, col: 0, reste: 5 } },
    'surprise sur une case vide': (d) => { d.surprise = { ligne: 0, col: 0, reste: 5 } },
    'surprise sans compte à rebours': (d) => { d.surprise = { ligne: 9, col: 0, reste: 0 } },
    'surprise sur la grille et sur une pièce': (d) => { d.enCours[0].surprise = { ligne: 0, col: 0 } },
    'surprise de pièce hors de la pièce': (d) => { d.surprise = null; d.enCours[0].surprise = { ligne: 3, col: 3 } },
    'deux surprises sur des pièces': (d) => { d.surprise = null; d.enCours[0].surprise = { ligne: 0, col: 0 }; d.enCours[1].surprise = { ligne: 0, col: 0 } },
    'gains de l\'annulation illisibles': (d) => { d.annulation = { ...d.annulation, gagnes: { supprimer: 'x' } } },
  }
  const avecAnnulation = exporterPartie(poser(partie({ rangees: enBas('#.........') }), 0, 0, 1))
  for (const [nom, abime] of Object.entries(cas)) {
    const d = nom.startsWith('gains de l') ? JSON.parse(JSON.stringify(avecAnnulation)) : copie()
    abime(d)
    assert.equal(importerPartie(d), null, nom)
  }
})

// --- Le simulateur de calage ------------------------------------------------------

test('le simulateur joue des parties et rapporte les mesures de calage', () => {
  const m = jouer({ niveau: 3, graine: 9, poses: 60 })
  assert.equal(m.poses, 60)
  assert.deepEqual(Object.keys(m.gains), CAUSES)
  const t = mesurerNiveau({ niveau: 2, parties: 3, poses: 50 })
  assert.equal(t.parties, 3)
  assert.equal(t.poses, 150)
  assert.ok(t.posesParBonus > 0)
  const texte = rapport(t)
  assert.match(texte, /niveau  2/)
  assert.match(texte, /défis/)
  assert.match(texte, /surprises/)
  // Mêmes graines, mêmes mesures.
  assert.deepEqual(mesurerNiveau({ niveau: 2, parties: 3, poses: 50 }), t)
})

test('calage : un bonus toutes les 18 à 45 pièces au niveau 1, bien plus rarement au niveau 10, pour le robot glouton (BS57)', () => {
  const t1 = mesurerNiveau({ niveau: NIVEAU_MIN, parties: 12, poses: 200 })
  const t10 = mesurerNiveau({ niveau: NIVEAU_MAX, parties: 12, poses: 200 })
  assert.ok(t1.posesParBonus > 18 && t1.posesParBonus < 45, `niveau 1 : une pièce posée sur ${t1.posesParBonus.toFixed(1)}`)
  assert.ok(t10.posesParBonus > 40 && t10.posesParBonus < 120, `niveau 10 : une pièce posée sur ${t10.posesParBonus.toFixed(1)}`)
  assert.ok(t10.posesParBonus > 1.5 * t1.posesParBonus, `niveau 10 : ${t10.posesParBonus.toFixed(1)} contre ${t1.posesParBonus.toFixed(1)} au niveau 1`)
  assert.ok(t1.tauxDefi > 2 * t10.tauxDefi, `défis réussis : ${t1.tauxDefi.toFixed(3)} au niveau 1 contre ${t10.tauxDefi.toFixed(3)} au niveau 10`)
  for (const t of [t1, t10]) assert.ok(t.tauxDefi < 0.25, `niveau ${t.niveau} : les défis restent difficiles (${t.tauxDefi})`)
})
