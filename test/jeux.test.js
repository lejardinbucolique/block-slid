import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  JEUX,
  JEU_BLOCK_SLID,
  JEU_BLOCK_POSE,
  JEU_PAR_DEFAUT,
  jeuxDisponibles,
  choixDeJeuVisible,
  jeuLu,
} from '../src/jeux.js'
import {
  PALIERS,
  PALIERS_BLOCK_POSE,
  STYLES,
  stylesDuJeu,
  stylesDebloques,
  prochainStyle,
  nouveauxStyles,
  styleAutorise,
  resumeStyles,
} from '../src/ui/styles.js'
import {
  CLES_BLOCK_POSE,
  jeuChoisi,
  retenirJeu,
  retenirMeilleurScore,
  retenirStyle,
  garderPartie,
  retenirNiveauVibration,
  niveauVibration,
  meilleurScorePose,
  retenirMeilleurScorePose,
  niveauPose,
  retenirNiveauPose,
  stylePoseGarde,
  retenirStylePose,
  couleurPoseGardee,
  retenirCouleurPose,
  reservePose,
  garderReservePose,
  partiePoseGardee,
  garderPartiePose,
  oublierPartiePose,
} from '../src/ui/stockage.js'

function faussePile(initial = {}) {
  const m = new Map(Object.entries(initial))
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: (k) => { m.delete(k) },
  }
  return m
}

const ids = (liste) => liste.map((s) => s.id)

test('registre des jeux : block-slid disponible, block-pose pas encore', () => {
  assert.deepEqual(ids(JEUX), [JEU_BLOCK_SLID, JEU_BLOCK_POSE])
  assert.equal(JEU_PAR_DEFAUT, JEU_BLOCK_SLID)
  assert.deepEqual(JEUX.map((j) => j.nom), ['Block slid', 'Block pose'])
  assert.deepEqual(ids(jeuxDisponibles()), [JEU_BLOCK_SLID])
})

test('registre des jeux : avec un seul jeu disponible, la ligne « Jeu » reste cachée', () => {
  assert.equal(choixDeJeuVisible(), false)
})

test('jeu lu : absent, abîmé, inconnu ou pas disponible = block-slid', () => {
  for (const valeur of [null, undefined, '', 'nimportequoi', '{"jeu":1}', 42, {}, JEU_BLOCK_POSE, 'BLOCK-SLID']) {
    assert.equal(jeuLu(valeur), JEU_BLOCK_SLID, String(valeur))
  }
  assert.equal(jeuLu(JEU_BLOCK_SLID), JEU_BLOCK_SLID)
})

test('jeu choisi : le premier lancement ouvre block-slid, le choix retenu se relit', () => {
  const pile = faussePile()
  assert.equal(jeuChoisi(), JEU_BLOCK_SLID)
  retenirJeu(JEU_BLOCK_SLID)
  assert.equal(pile.get('appli.jeu'), JEU_BLOCK_SLID)
  assert.equal(jeuChoisi(), JEU_BLOCK_SLID)
})

test('jeu choisi : une valeur gardée pour un jeu pas disponible retombe sur block-slid', () => {
  faussePile({ 'appli.jeu': JEU_BLOCK_POSE })
  assert.equal(jeuChoisi(), JEU_BLOCK_SLID)
  faussePile({ 'appli.jeu': '\u0000{abîmé' })
  assert.equal(jeuChoisi(), JEU_BLOCK_SLID)
})

test('jeu choisi : un stockage qui refuse (navigation privée) ne casse rien', () => {
  const refus = () => { throw new Error('refusé') }
  globalThis.localStorage = { getItem: refus, setItem: refus, removeItem: refus }
  assert.equal(jeuChoisi(), JEU_BLOCK_SLID)
  assert.doesNotThrow(() => retenirJeu(JEU_BLOCK_SLID))
  assert.equal(meilleurScorePose(), 0)
  assert.equal(niveauPose(), 1)
  assert.deepEqual(reservePose(), {})
  assert.equal(partiePoseGardee(), null)
  assert.doesNotThrow(() => garderPartiePose({ a: 1 }))
  delete globalThis.localStorage
  assert.equal(jeuChoisi(), JEU_BLOCK_SLID)
})

test('stockage : block-slid garde ses clés block-slid.* inchangées', () => {
  const pile = faussePile()
  retenirMeilleurScore(1234)
  retenirStyle('laine')
  garderPartie({ a: 1 })
  retenirNiveauVibration(3)
  assert.deepEqual([...pile.keys()].sort(), [
    'block-slid.meilleur',
    'block-slid.partie',
    'block-slid.style',
    'block-slid.vibration',
  ])
})

test('stockage : block-pose range tout sous block-pose.*, jamais chez block-slid', () => {
  assert.ok(Object.values(CLES_BLOCK_POSE).every((c) => c.startsWith('block-pose.')))
  const pile = faussePile()
  retenirMeilleurScorePose(500)
  retenirStylePose('laine')
  retenirNiveauPose(4)
  retenirCouleurPose('rose')
  garderReservePose({ annuler: 3 })
  garderPartiePose({ grille: [] })
  assert.deepEqual([...pile.keys()].sort(), Object.values(CLES_BLOCK_POSE).sort())
  oublierPartiePose()
  assert.equal(pile.has(CLES_BLOCK_POSE.partie), false)
})

test('stockage : les données des deux jeux ne se mélangent pas, la vibration est commune', () => {
  faussePile()
  retenirMeilleurScore(900)
  retenirMeilleurScorePose(40)
  assert.equal(meilleurScorePose(), 40)
  retenirStyle('bois')
  retenirStylePose('laine')
  assert.equal(stylePoseGarde(), 'laine')
  retenirNiveauVibration(4)
  assert.equal(niveauVibration(), 4)
})

test('stockage block-pose : lectures tolérantes (texte abîmé, hors bornes, mauvais type)', () => {
  faussePile({
    [CLES_BLOCK_POSE.meilleur]: 'beaucoup',
    [CLES_BLOCK_POSE.niveau]: '99',
    [CLES_BLOCK_POSE.style]: 'inconnu',
    [CLES_BLOCK_POSE.couleur]: '',
    [CLES_BLOCK_POSE.reserve]: '{pas du json',
    [CLES_BLOCK_POSE.partie]: '[1,2]',
  })
  assert.equal(meilleurScorePose(), 0)
  assert.equal(niveauPose(), 10)
  assert.equal(stylePoseGarde(), 'uni')
  assert.equal(couleurPoseGardee(), null)
  assert.deepEqual(reservePose(), {})
  assert.equal(partiePoseGardee(), null)
  faussePile({ [CLES_BLOCK_POSE.niveau]: '-5', [CLES_BLOCK_POSE.reserve]: '[1]', [CLES_BLOCK_POSE.partie]: 'null' })
  assert.equal(niveauPose(), 1)
  assert.deepEqual(reservePose(), {})
  assert.equal(partiePoseGardee(), null)
})

test('stockage block-pose : la réserve garde au plus dix de chaque sorte, sans valeur douteuse', () => {
  faussePile()
  garderReservePose({ annuler: 25, tourner: 3, vide: 0, faux: 'x', neg: -2, demi: 1.5 })
  assert.deepEqual(reservePose(), { annuler: 10, tourner: 3 })
})

test('stockage block-pose : ce qui est retenu se relit à l\'identique', () => {
  faussePile()
  retenirMeilleurScorePose(98765)
  retenirNiveauPose(7)
  retenirCouleurPose('melangees')
  garderPartiePose({ grille: [[0, 1]], score: 12 })
  assert.equal(meilleurScorePose(), 98765)
  assert.equal(niveauPose(), 7)
  assert.equal(couleurPoseGardee(), 'melangees')
  assert.deepEqual(partiePoseGardee(), { grille: [[0, 1]], score: 12 })
})

test('paliers par jeu : la table de block-slid ne change pas', () => {
  assert.deepEqual([...PALIERS], [10000, 100000, 250000, 500000, 1000000, 2000000, 3500000, 5000000, 7500000, 10000000])
  assert.deepEqual(STYLES.map((s) => s.palier), [0, ...PALIERS])
  assert.deepEqual(ids(STYLES), ['uni', 'laine', 'beton', 'bois', 'bonbon', 'papier', 'metal', 'verre', 'marbre', 'neon', 'gemme'])
  assert.deepEqual(stylesDuJeu(), STYLES)
  assert.deepEqual(stylesDuJeu('jeu-inconnu'), STYLES)
  assert.deepEqual(ids(stylesDebloques(PALIERS[1])), ['uni', 'laine', 'beton'])
})

test('paliers par jeu : block-pose a les siens, mêmes dessins, autre échelle', () => {
  assert.deepEqual([...PALIERS_BLOCK_POSE], [1000, 5000, 10000, 25000, 50000, 100000, 200000, 350000, 500000, 1000000])
  const pose = stylesDuJeu(JEU_BLOCK_POSE)
  assert.deepEqual(ids(pose), ids(STYLES))
  assert.deepEqual(pose.map((s) => s.palier), [0, ...PALIERS_BLOCK_POSE])
  assert.deepEqual(ids(stylesDebloques(999, JEU_BLOCK_POSE)), ['uni'])
  assert.deepEqual(ids(stylesDebloques(1000, JEU_BLOCK_POSE)), ['uni', 'laine'])
  assert.deepEqual(ids(stylesDebloques(5000, JEU_BLOCK_POSE)), ['uni', 'laine', 'beton'])
  // Le même score ne débloque pas la même chose dans les deux jeux.
  assert.deepEqual(ids(stylesDebloques(1000, JEU_BLOCK_SLID)), ['uni'])
  assert.equal(prochainStyle(1000, JEU_BLOCK_POSE).id, 'beton')
  assert.equal(prochainStyle(1000).id, 'laine')
  assert.deepEqual(ids(nouveauxStyles(4999, 5000, JEU_BLOCK_POSE)), ['beton'])
  assert.deepEqual(ids(nouveauxStyles(4999, 5000)), [])
  assert.equal(styleAutorise('beton', 1000, JEU_BLOCK_POSE), 'uni')
  assert.equal(styleAutorise('beton', 5000, JEU_BLOCK_POSE), 'beton')
  assert.match(resumeStyles(1000, JEU_BLOCK_POSE), /Prochain : Béton, à 5000 points/)
  assert.match(resumeStyles(0), /Prochain : Laine, à 10000 points/)
})
