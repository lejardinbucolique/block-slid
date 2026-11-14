import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  REGLAGES,
  nouvellePartie,
  jouer,
  deplacementsPossibles,
  exporterPartie,
  importerPartie,
  changerFigure,
  figureValide,
  figureComplexe,
  figureEnTexte,
  versTexte,
} from '../src/moteur/index.js'
import { construireSignalement, nettoyerTexte, resumeSignalements, RAISONS, MAX_TEXTE } from '../src/ui/signalement.js'
import {
  MAX_SIGNALEMENTS,
  signalements,
  ajouterSignalement,
  viderSignalements,
  contenuSignalements,
} from '../src/ui/stockage.js'

const formes = (l) => [...l].sort((x, y) => x.col - y.col).map((b) => `${b.col}:${b.largeur}`).join()
const cles = (f) => JSON.stringify(f.cases)
const viaJson = (x) => JSON.parse(JSON.stringify(x))

// Un premier coup possible : [id, dx].
function premierCoup(e) {
  for (const b of e.blocs) {
    const p = deplacementsPossibles(e, b.id)
    if (p.droite) return [b.id, 1]
    if (p.gauche) return [b.id, -1]
  }
  return null
}

// --- Moteur -------------------------------------------------------------------

test('changerFigure : figure valide et autre, bonus de départ, tout le reste intact', () => {
  for (let graine = 1; graine <= 50; graine++) {
    let e = nouvellePartie({ graine })
    const coup = premierCoup(e)
    const apres = coup && jouer(e, ...coup)
    if (apres && !apres.finie) e = apres // le bonus a déjà baissé
    const f = changerFigure(e)
    assert.ok(f, `graine ${graine}`)
    assert.notEqual(cles(f.figure), cles(e.figure), `graine ${graine} : même figure`)
    assert.ok(figureValide(f.figure, REGLAGES.figures))
    const depart = figureComplexe(f.figure) ? REGLAGES.figures.bonusDepartComplexe : REGLAGES.figures.bonusDepart
    assert.equal(f.bonus, depart)
    assert.equal(f.figure.depart, depart)
    for (const champ of ['coups', 'score', 'hasard', 'prochainId', 'finie']) assert.equal(f[champ], e[champ], champ)
    assert.deepEqual(f.blocs, e.blocs)
    assert.deepEqual(f.aVenir, e.aVenir)
    // L'état d'avant n'est pas touché.
    assert.notEqual(f, e)
    assert.notEqual(f.figure, e.figure)
  }
})

test('changerFigure : refuse sans figure ou partie finie', () => {
  const sansFigure = nouvellePartie({ graine: 3, reglages: { ...REGLAGES, figures: null } })
  assert.equal(changerFigure(sansFigure), null)
  const finie = { ...nouvellePartie({ graine: 3 }), finie: true }
  assert.equal(changerFigure(finie), null)
})

test('changerFigure : 20 appels de suite, des figures qui ne se répètent pas toutes, chacune autre que la précédente', () => {
  let e = nouvellePartie({ graine: 11 })
  const vues = new Set([cles(e.figure)])
  for (let i = 0; i < 20; i++) {
    const suivant = changerFigure(e)
    assert.notEqual(cles(suivant.figure), cles(e.figure))
    vues.add(cles(suivant.figure))
    e = suivant
  }
  assert.ok(vues.size >= 15, `seulement ${vues.size} figures différentes sur 21`)
  assert.ok(e.figuresTirees >= 20)
})

test('changerFigure : la partie se sauve et se rouvre, avec son compteur', () => {
  const e = changerFigure(changerFigure(nouvellePartie({ graine: 5 })))
  const repris = importerPartie(viaJson(exporterPartie(e)))
  assert.ok(repris)
  assert.deepEqual(repris.figure, e.figure)
  assert.equal(repris.bonus, e.bonus)
  assert.equal(repris.figuresTirees, e.figuresTirees)
  // La suite est la même : un nouveau changement donne la même figure.
  assert.deepEqual(changerFigure(repris).figure, changerFigure(e).figure)
})

test('une partie gardée sans compteur (avant BS19) se rouvre avec 0', () => {
  const donnees = viaJson(exporterPartie(nouvellePartie({ graine: 8 })))
  delete donnees.figuresTirees
  assert.equal(importerPartie(donnees).figuresTirees, 0)
  donnees.figuresTirees = -3
  assert.equal(importerPartie(donnees).figuresTirees, 0)
})

// Joue jusqu'à 60 coups déterministes ; avec `bouton`, change de figure 1 à 2 fois avant chaque coup.
function jouerPartie(graine, bouton) {
  let s = (graine * 7919 + 13) >>> 0
  const alea = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), s | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  let e = nouvellePartie({ graine })
  const trace = []
  for (let n = 0; n < 60 && !e.finie; n++) {
    if (bouton) for (let k = 0; k <= n % 2; k++) e = changerFigure(e)
    const coups = []
    for (const b of e.blocs) {
      const p = deplacementsPossibles(e, b.id)
      if (p.gauche) coups.push([b.id, -1])
      if (p.droite) coups.push([b.id, 1])
    }
    if (!coups.length) break
    const [id, dx] = coups[Math.floor(alea() * coups.length)]
    e = jouer(e, id, dx)
    trace.push([e.coups, e.hasard, e.prochainId, versTexte(e).join('/'), e.aVenir.map(formes).join('|')].join(';'))
  }
  return trace
}

test('le bouton ne change pas les lignes qui arrivent : même graine, mêmes coups, mêmes formes', () => {
  let coups = 0
  for (let graine = 1; graine <= 30; graine++) {
    const avec = jouerPartie(graine, true)
    assert.deepEqual(avec, jouerPartie(graine, false), `graine ${graine}`)
    coups += avec.length
  }
  assert.ok(coups > 500, `seulement ${coups} coups éprouvés`)
})

test('figureEnTexte : deux lignes de texte et la légende', () => {
  const figure = {
    cases: [
      { ligne: 0, col: 1, couleur: 'rouge' },
      { ligne: 0, col: 2, couleur: 'bleu clair' },
      ...['rouge', 'rouge', 'bleu clair', 'bleu clair', 'vert', 'vert'].map((couleur, col) => ({ ligne: 1, col, couleur })),
    ],
    depart: 10000,
  }
  assert.deepEqual(figureEnTexte(figure), { haut: '.RC...', bas: 'RRCCVV', legende: { R: 'rouge', C: 'bleu clair', V: 'vert' } })
})

// --- Signalement et stockage ----------------------------------------------------

function faussePile() {
  const m = new Map()
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: (k) => { m.delete(k) },
  }
  return m
}

test('signalement : date, version, figure en clair, bonus, coups, score et partie complète', () => {
  const depart = nouvellePartie({ graine: 21 })
  const e = jouer(depart, ...premierCoup(depart))
  const s = viaJson(construireSignalement(e, { version: 'v17', date: new Date('2026-11-13T10:00:00Z') }))
  assert.equal(s.date, '2026-11-13T10:00:00.000Z')
  assert.equal(s.version, 'v17')
  assert.deepEqual(s.figure.cases, e.figure.cases)
  assert.equal(s.figure.depart, e.figure.depart)
  assert.equal(s.figure.texte.bas.length, s.figure.texte.haut.length)
  assert.equal(s.bonus, e.bonus)
  assert.equal(s.coups, 1)
  assert.equal(s.score, e.score)
  assert.deepEqual(s.partie, viaJson(exporterPartie(e)))
  // De quoi rejouer la situation.
  assert.deepEqual(importerPartie(s.partie).figure, e.figure)
})

test('stockage des signalements : ajout, plafond de 100, vidage, export en JSON lisible', () => {
  faussePile()
  assert.deepEqual(signalements(), [])
  const e = nouvellePartie({ graine: 2 })
  for (let i = 0; i < MAX_SIGNALEMENTS + 5; i++) ajouterSignalement(construireSignalement(e, { version: `n${i}` }))
  const liste = signalements()
  assert.equal(liste.length, MAX_SIGNALEMENTS)
  assert.equal(liste[0].version, 'n5', 'les plus anciens partent d\'abord')
  assert.equal(liste.at(-1).version, `n${MAX_SIGNALEMENTS + 4}`)
  const exporte = JSON.parse(contenuSignalements())
  assert.equal(exporte.signalements.length, MAX_SIGNALEMENTS)
  assert.deepEqual(exporte.signalements[0].figure.cases, e.figure.cases)
  viderSignalements()
  assert.deepEqual(signalements(), [])
  assert.deepEqual(JSON.parse(contenuSignalements()), { signalements: [] })
})

test('stockage des signalements : un contenu abîmé donne une liste vide, un ajout repart proprement', () => {
  const m = faussePile()
  for (const abime of ['{pas du json', '42', '{"a":1}', 'null', '']) {
    m.set('block-slid.signalements', abime)
    assert.deepEqual(signalements(), [], abime)
  }
  m.set('block-slid.signalements', '[1,"x",null,{"version":"ok"}]')
  assert.deepEqual(signalements(), [{ version: 'ok' }])
  m.set('block-slid.signalements', '{pas du json')
  ajouterSignalement({ version: 'neuf' })
  assert.deepEqual(signalements(), [{ version: 'neuf' }])
})

test('stockage des signalements : sans stockage, rien ne casse', () => {
  const refus = () => { throw new Error('refusé') }
  globalThis.localStorage = { getItem: refus, setItem: refus, removeItem: refus }
  assert.deepEqual(signalements(), [])
  ajouterSignalement({ version: 'x' })
  viderSignalements()
})

// --- Raison, texte libre, geste (BS22) -------------------------------------------

test('signalement : raison, texte libre, geste, figure complexe ou non', () => {
  const e = nouvellePartie({ graine: 4 })
  for (const { id } of RAISONS) {
    const s = viaJson(construireSignalement(e, { raison: id, texte: '  pas de place  ', geste: 'gardee' }))
    assert.equal(s.raison, id)
    assert.equal(s.texte, 'pas de place')
    assert.equal(s.geste, 'gardee')
    assert.equal(s.figure.complexe, figureComplexe(e.figure))
    assert.equal(s.figure.depart, e.figure.depart)
    assert.equal(s.bonus, e.bonus)
  }
  assert.deepEqual(RAISONS.map((r) => r.libelle), ['Infaisable', 'Trop simple pour 15000', 'Devrait valoir 15000', 'Trop difficile', 'Autre'])
})

test('signalement : sans raison ni geste, ou avec des valeurs inconnues, rien de faux n\'est gardé', () => {
  const e = nouvellePartie({ graine: 4 })
  const s = construireSignalement(e)
  assert.equal(s.raison, null)
  assert.equal(s.texte, '')
  assert.equal(s.geste, 'refusee')
  const t = construireSignalement(e, { raison: 'inventee', geste: 'autre', texte: 42 })
  assert.equal(t.raison, null)
  assert.equal(t.geste, 'refusee')
  assert.equal(t.texte, '')
})

test('signalement : un texte libre très long est coupé, sans casser un caractère', () => {
  assert.equal(nettoyerTexte('a'.repeat(5000)).length, MAX_TEXTE)
  const emojis = nettoyerTexte('😀'.repeat(MAX_TEXTE + 50))
  assert.equal(Array.from(emojis).length, MAX_TEXTE)
  assert.ok(emojis.isWellFormed(), 'pas de demi-caractère')
  const e = nouvellePartie({ graine: 4 })
  assert.equal(construireSignalement(e, { texte: 'x'.repeat(2000) }).texte.length, MAX_TEXTE)
})

test('signalements : les deux gestes et les anciens se gardent, se relisent et s\'exportent', () => {
  faussePile()
  const e = nouvellePartie({ graine: 6 })
  ajouterSignalement(construireSignalement(e, { raison: 'infaisable', geste: 'refusee' }))
  ajouterSignalement(construireSignalement(e, { raison: 'trop-simple', texte: 'deux couleurs', geste: 'gardee' }))
  const ancien = { date: '2026-11-01T00:00:00.000Z', version: 'v17', figure: { cases: [], depart: 10000 }, bonus: 9000, coups: 3, score: 40 }
  ajouterSignalement(ancien)
  const liste = signalements()
  assert.equal(liste.length, 3)
  assert.deepEqual(liste[2], ancien, 'un ancien signalement reste tel quel')
  const exporte = JSON.parse(contenuSignalements())
  assert.deepEqual(exporte.signalements.map((x) => x.geste), ['refusee', 'gardee', undefined])
  assert.equal(exporte.signalements[1].texte, 'deux couleurs')
  assert.equal(resumeSignalements(liste), '3 figures signalées (2 refusées, 1 gardée).')
})

test('resumeSignalements : libellés', () => {
  const r = { geste: 'refusee' }
  const g = { geste: 'gardee' }
  assert.equal(resumeSignalements([]), 'Aucune figure signalée.')
  assert.equal(resumeSignalements([r]), '1 figure signalée.')
  assert.equal(resumeSignalements([{}, r]), '2 figures signalées.')
  assert.equal(resumeSignalements([g]), '1 figure signalée (1 gardée).')
  assert.equal(resumeSignalements([g, g]), '2 figures signalées (2 gardées).')
  assert.equal(resumeSignalements([r, g]), '2 figures signalées (1 refusée, 1 gardée).')
})

test('les gestes : signaler seulement ne touche pas à la partie, refuser change la figure seulement', () => {
  faussePile()
  const depart = nouvellePartie({ graine: 9 })
  const e = jouer(depart, ...premierCoup(depart))
  const avant = JSON.stringify(exporterPartie(e))
  // Signaler seulement : un enregistrement, la partie n'est pas touchée.
  ajouterSignalement(construireSignalement(e, { raison: 'trop-simple', geste: 'gardee' }))
  assert.equal(JSON.stringify(exporterPartie(e)), avant)
  assert.equal(signalements().length, 1)
  // Refuser : le signalement garde la figure refusée, la suivante change seule.
  const suivant = changerFigure(e)
  ajouterSignalement(construireSignalement(e, { raison: 'infaisable', geste: 'refusee' }))
  assert.notEqual(cles(suivant.figure), cles(e.figure))
  for (const champ of ['coups', 'score']) assert.equal(suivant[champ], e[champ])
  assert.deepEqual(signalements()[1].figure.cases, e.figure.cases)
  assert.equal(signalements().length, 2)
})
