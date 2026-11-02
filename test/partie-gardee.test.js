import { test } from 'node:test'
import assert from 'node:assert/strict'
import { partie, resume } from './partie-type.js'
import {
  nouvellePartie,
  jouer,
  deplacerAVenir,
  exporterPartie,
  importerPartie,
  REGLAGES,
} from '../src/moteur/index.js'

// Passe par du vrai texte JSON, comme le fait localStorage.
const viaTexte = (etat) => importerPartie(JSON.parse(JSON.stringify(exporterPartie(etat))))

test('partie gardée : à chaque coup, la reprise donne exactement la suite de la partie d\'origine', () => {
  let coups = 0
  for (let graine = 1; graine <= 300; graine++) {
    let repris = null
    for (const { avant, apres, id, dx } of partie(graine)) {
      // La reprise de l'état d'avant, rejouée avec le même geste, rend le même état après.
      repris = viaTexte(avant)
      assert.ok(repris, `graine ${graine} : état d'avant illisible`)
      const suite = jouer(repris, id, dx)
      assert.equal(resume(suite), resume(apres), `graine ${graine}, coup ${apres.coups}`)
      coups++
    }
  }
  assert.ok(coups > 5000, `seulement ${coups} coups éprouvés`)
})

test('partie gardée : la ligne à venir déplacée se retrouve, avec son indicateur', () => {
  let e = nouvellePartie({ graine: 7 })
  const b = e.aVenir[0].find((x) => x.col > 0) ?? e.aVenir[0][0]
  for (const dx of [-1, 1]) {
    const suivant = deplacerAVenir(e, b.id, dx)
    if (suivant) { e = suivant; break }
  }
  const repris = viaTexte(e)
  assert.equal(repris.aVenirDeplace, e.aVenirDeplace)
  assert.deepEqual(repris.aVenir, e.aVenir)
  assert.equal(deplacerAVenir(repris, b.id, 1), null, 'un seul déplacement par coup, même après reprise')
})

test('partie gardée : les données ne contiennent que du JSON simple', () => {
  const donnees = exporterPartie(nouvellePartie({ graine: 3 }))
  assert.equal(JSON.stringify(donnees).includes('function'), false)
  assert.equal('reglages' in donnees, false)
  assert.deepEqual(JSON.parse(JSON.stringify(donnees)), donnees)
})

test('partie gardée : une partie neuve se reprend à l\'identique', () => {
  const e = nouvellePartie({ graine: 11 })
  const repris = viaTexte(e)
  assert.deepEqual(exporterPartie(repris), exporterPartie(e))
  assert.equal(repris.reglages, REGLAGES)
})

test('partie gardée : autre numéro de schéma, forme invalide ou incohérence : null', () => {
  const bon = exporterPartie(nouvellePartie({ graine: 5 }))
  const copie = () => JSON.parse(JSON.stringify(bon))
  assert.ok(importerPartie(copie()))

  const cas = {
    rien: null,
    texte: 'abc',
    nombre: 3,
    tableau: [],
    objetVide: {},
    'autre schéma': { ...copie(), schema: bon.schema + 1 },
    'schéma absent': (() => { const d = copie(); delete d.schema; return d })(),
    'score négatif': { ...copie(), score: -1 },
    'score fractionnaire': { ...copie(), score: 1.5 },
    'score texte': { ...copie(), score: '10' },
    'hasard hors bornes': { ...copie(), hasard: 2 ** 32 },
    'prochainId nul': { ...copie(), prochainId: 0 },
    'finie texte': { ...copie(), finie: 'non' },
    'blocs absents': { ...copie(), blocs: undefined },
    'une seule ligne à venir': { ...copie(), aVenir: [copie().aVenir[0]] },
    'ligne à venir vide': { ...copie(), aVenir: [[], copie().aVenir[1]] },
    'ligne à venir pas un tableau': { ...copie(), aVenir: [3, copie().aVenir[1]] },
  }
  const alterer = (fn) => { const d = copie(); fn(d); return d }
  cas['bloc nul'] = alterer((d) => { d.blocs[0] = null })
  cas['bloc hors grille (colonne)'] = alterer((d) => { d.blocs[0].col = REGLAGES.colonnes })
  cas['bloc qui déborde à droite'] = alterer((d) => { d.blocs[0].col = REGLAGES.colonnes - 1; d.blocs[0].largeur = 3 })
  cas['bloc de largeur nulle'] = alterer((d) => { d.blocs[0].largeur = 0 })
  cas['bloc hors grille (ligne)'] = alterer((d) => { d.blocs[0].ligne = REGLAGES.lignes })
  cas['ligne négative'] = alterer((d) => { d.blocs[0].ligne = -1 })
  cas['couleur inconnue'] = alterer((d) => { d.blocs[0].couleur = 'noir' })
  cas['id en double'] = alterer((d) => { d.blocs[1].id = d.blocs[0].id })
  cas['id au-delà de prochainId'] = alterer((d) => { d.blocs[0].id = d.prochainId })
  cas['chevauchement'] = alterer((d) => {
    d.blocs[1].ligne = d.blocs[0].ligne
    d.blocs[1].col = d.blocs[0].col
  })
  cas['chevauchement à venir'] = alterer((d) => {
    const l = d.aVenir[0]
    l.push({ ...l[0], id: d.prochainId - 1000 + l[0].id })
    l[l.length - 1].id = 999999
    d.prochainId = 1000000
  })
  for (const [nom, donnees] of Object.entries(cas)) {
    assert.equal(importerPartie(donnees), null, nom)
  }
})

test('partie gardée : importer ne lève jamais, même sur n\'importe quoi', () => {
  for (const v of [undefined, null, 0, '', true, [], [[]], { schema: 1, blocs: 'x', aVenir: 'y' }, { schema: 1, blocs: [{}], aVenir: [[], []] }]) {
    assert.equal(importerPartie(v), null)
  }
})
