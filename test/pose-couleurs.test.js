import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PALETTE,
  LISTE_COULEURS,
  FOND_ROSE_REFERENCE,
  MODE_UNIE,
  MODE_PAR_PIECE,
  MODE_MELANGEE,
  couleursDepart,
  couleursSuivantes,
  couleursDePieces,
  lireCouleurs,
  piece,
  nouvellePartie,
  depuisTexte,
  poser,
  tournerPiece,
  changerPieces,
  annulerCoup,
  exporterPartie,
  importerPartie,
} from '../src/pose/index.js'
import {
  PALIERS,
  PALIERS_BLOCK_POSE,
  STYLES,
  stylesDuJeu,
  stylesDebloques,
  prochainStyle,
  resumeStyles,
} from '../src/ui/styles.js'
import { JEU_BLOCK_SLID, JEU_BLOCK_POSE } from '../src/jeux.js'

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const distance = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]))
const ids = (liste) => liste.map((x) => x.id)

// --- La palette -------------------------------------------------------------------

test('la palette : vingt couleurs, identifiants et valeurs tous différents', () => {
  assert.equal(PALETTE.length, 20)
  assert.equal(new Set(PALETTE.map((c) => c.id)).size, 20)
  assert.equal(new Set(PALETTE.map((c) => c.valeur)).size, 20)
  assert.equal(new Set(PALETTE.map((c) => c.nom)).size, 20)
  assert.ok(PALETTE.every((c) => /^#[0-9a-f]{6}$/.test(c.valeur) && c.id.length > 0 && c.id.length <= 40))
})

test('la palette : des couleurs bien distinctes entre elles et du fond rose', () => {
  for (let i = 0; i < PALETTE.length; i++) {
    for (let j = i + 1; j < PALETTE.length; j++) {
      assert.ok(distance(PALETTE[i].valeur, PALETTE[j].valeur) >= 50, `${PALETTE[i].id} et ${PALETTE[j].id} se ressemblent`)
    }
    assert.ok(distance(PALETTE[i].valeur, FOND_ROSE_REFERENCE) >= 120, `${PALETTE[i].id} se confond avec le fond rose`)
  }
})

// --- La liste de choix ------------------------------------------------------------

test('la liste : vingt-deux entrées, les vingt unies et deux spéciales, dans un ordre fixé', () => {
  assert.equal(LISTE_COULEURS.length, 22)
  assert.equal(new Set(ids(LISTE_COULEURS)).size, 22)
  const unies = LISTE_COULEURS.filter((e) => e.mode === MODE_UNIE)
  assert.deepEqual(unies.map((e) => e.couleur).sort(), ids(PALETTE).sort(), 'chaque couleur a son entrée unie')
  assert.deepEqual(LISTE_COULEURS.filter((e) => e.mode !== MODE_UNIE).map((e) => e.mode), [MODE_PAR_PIECE, MODE_MELANGEE])
  assert.deepEqual(ids(LISTE_COULEURS), [
    'bleu', 'orange', 'vert', 'violet', 'par-piece', 'jaune', 'turquoise', 'rouge', 'citron', 'marine', 'melangee',
    'framboise', 'menthe', 'marron', 'ciel', 'brique', 'indigo', 'sapin', 'bordeaux', 'ardoise', 'prune', 'anthracite',
  ])
  // Une entrée unie porte une couleur de la palette ; les spéciales n'en portent pas.
  assert.ok(unies.every((e) => PALETTE.some((c) => c.id === e.couleur)))
})

// --- L'avancement de la liste -------------------------------------------------------

test('le départ est la première entrée, sans grille vidée passée', () => {
  assert.deepEqual(couleursDepart(), { entree: 0, avances: 0 })
  assert.equal(LISTE_COULEURS[couleursDepart().entree].id, 'bleu')
})

test('le premier tour suit la liste dans l\'ordre, sans jamais tirer au hasard', () => {
  let c = couleursDepart()
  const vues = [LISTE_COULEURS[c.entree].id]
  for (let i = 1; i < LISTE_COULEURS.length; i++) {
    c = couleursSuivantes(c, () => assert.fail('pas de hasard pendant le premier tour'))
    vues.push(LISTE_COULEURS[c.entree].id)
  }
  assert.deepEqual(vues, ids(LISTE_COULEURS))
  assert.equal(c.avances, 21)
})

test('après le tour de la liste : une entrée au hasard, jamais la même qu\'avant', () => {
  let c = { entree: 21, avances: 21 }
  const tirees = new Set()
  for (let essai = 0; essai < 200; essai++) {
    const suivant = couleursSuivantes(c, () => (essai * 0.00499) % 1)
    assert.notEqual(suivant.entree, c.entree)
    assert.ok(suivant.entree >= 0 && suivant.entree < 22)
    assert.equal(suivant.avances, c.avances + 1)
    tirees.add(suivant.entree)
    c = suivant
  }
  assert.ok(tirees.size > 15, 'le hasard parcourt la liste')
  // Les bornes du hasard : de 0 à presque 1, et une valeur absurde ne casse rien.
  for (const entree of [0, 7, 21]) {
    for (const r of [0, 0.5, 0.999999999, NaN, -1, 2]) {
      const s = couleursSuivantes({ entree, avances: 40 }, () => r)
      assert.ok(Number.isInteger(s.entree) && s.entree >= 0 && s.entree < 22 && s.entree !== entree, `entrée ${entree}, hasard ${r}`)
    }
  }
  // Toutes les autres entrées sont atteignables.
  const atteintes = new Set(Array.from({ length: 21 }, (_, i) => couleursSuivantes({ entree: 5, avances: 40 }, () => (i + 0.5) / 21).entree))
  assert.deepEqual([...atteintes].sort((a, b) => a - b), Array.from({ length: 22 }, (_, i) => i).filter((i) => i !== 5))
})

test('lireCouleurs : refuse l\'abîmé et l\'incohérent', () => {
  assert.deepEqual(lireCouleurs({ entree: 3, avances: 3 }), { entree: 3, avances: 3 })
  assert.deepEqual(lireCouleurs({ entree: 3, avances: 30 }), { entree: 3, avances: 30 })
  for (const mauvais of [null, undefined, 'x', 4, {}, { entree: 3 }, { avances: 3 }, { entree: 22, avances: 30 }, { entree: -1, avances: 30 },
    { entree: 1.5, avances: 30 }, { entree: 3, avances: -1 }, { entree: 3, avances: '3' }, { entree: 3, avances: 5 }]) {
    assert.equal(lireCouleurs(mauvais), null, JSON.stringify(mauvais))
  }
})

// --- Les couleurs des pièces tirées -------------------------------------------------------

const suite = () => { let n = 0; return () => ((n++ * 0.6180339887) % 1) }

test('entrée unie : toutes les pièces de la couleur de l\'entrée', () => {
  const rouge = LISTE_COULEURS.findIndex((e) => e.id === 'rouge')
  const r = couleursDePieces({ entree: rouge, avances: 40 }, [4, 1, 9], () => assert.fail('pas de hasard'))
  assert.deepEqual(r, [{ couleur: 'rouge' }, { couleur: 'rouge' }, { couleur: 'rouge' }])
})

test('une couleur par pièce : des couleurs de la palette, différentes d\'une pièce à l\'autre', () => {
  const entree = LISTE_COULEURS.findIndex((e) => e.mode === MODE_PAR_PIECE)
  const aleatoire = suite()
  for (let essai = 0; essai < 50; essai++) {
    const r = couleursDePieces({ entree, avances: 40 }, [3, 3, 3], aleatoire)
    assert.ok(r.every((x) => PALETTE.some((c) => c.id === x.couleur) && x.couleurs === undefined))
    assert.equal(new Set(r.map((x) => x.couleur)).size, 3)
  }
  // Même avec plus de pièces que de couleurs, rien ne casse.
  assert.equal(couleursDePieces({ entree, avances: 40 }, Array(25).fill(1), aleatoire).length, 25)
})

test('couleurs mélangées : une couleur par case, deux cases voisines de la liste jamais pareilles', () => {
  const entree = LISTE_COULEURS.findIndex((e) => e.mode === MODE_MELANGEE)
  const aleatoire = suite()
  for (let essai = 0; essai < 50; essai++) {
    const r = couleursDePieces({ entree, avances: 40 }, [1, 2, 16], aleatoire)
    assert.deepEqual(r.map((x) => x.couleurs.length), [1, 2, 16])
    for (const x of r) {
      assert.equal(x.couleur, x.couleurs[0])
      assert.ok(x.couleurs.every((c) => PALETTE.some((p) => p.id === c)))
      x.couleurs.slice(1).forEach((c, i) => assert.notEqual(c, x.couleurs[i]))
    }
    assert.ok(new Set(r[1].couleurs).size === 2 && new Set(r[2].couleurs).size > 1)
  }
})

// --- Dans le moteur ----------------------------------------------------------------------

const pieceCouleurs = (etat) => [...etat.enCours, ...etat.suivantes].filter(Boolean).map((x) => x.couleur)

test('une partie commence par la première entrée : toutes les pièces de sa couleur', () => {
  const e = nouvellePartie({ graine: 7 })
  assert.deepEqual(e.couleurs, { entree: 0, avances: 0 })
  assert.deepEqual(pieceCouleurs(e), Array(6).fill('bleu'))
})

// Une grille à une case près d'être vidée : le bloc posé en (9, 9) efface la ligne 9 et la
// colonne 9, et il ne reste rien d'autre.
// Les pièces données à la main portent la couleur d'essai 'uni' (reglages.couleurPiece) ; seules
// les pièces tirées suivent la liste des couleurs.
const presqueVide = (extra = {}) => depuisTexte({
  rangees: [...Array(9).fill('.........#'), '#########.'],
  enCours: ['bloc.0', 'bloc.0', 'bloc.0'],
  suivantes: ['bloc.0', 'bloc.0', 'bloc.0'],
  graine: 5,
  ...extra,
})

test('une grille vidée passe à l\'entrée suivante, prise aussitôt par les pièces visibles', () => {
  const e = presqueVide({ reserve: { annuler: 1 } })
  assert.deepEqual(e.couleurs, { entree: 0, avances: 0 })
  const sans = poser(depuisTexte({ rangees: ['#.........'], enCours: ['bloc.0', 'bloc.0', 'bloc.0'], graine: 5 }), 0, 5, 5)
  assert.equal(sans.dernierCoup.grilleVidee, false)
  assert.equal(sans.dernierCoup.nouvelleEntree, null)
  assert.deepEqual(sans.couleurs, { entree: 0, avances: 0 })

  const a = poser(e, 0, 9, 9)
  assert.equal(a.dernierCoup.grilleVidee, true)
  assert.equal(a.dernierCoup.nouvelleEntree, 'orange')
  assert.deepEqual(a.couleurs, { entree: 1, avances: 1 })
  assert.deepEqual(e.couleurs, { entree: 0, avances: 0 }, 'l\'ancien état ne bouge pas')
  // Les pièces visibles prennent la nouvelle couleur tout de suite (BS60).
  assert.deepEqual(pieceCouleurs(a), Array(5).fill('orange'))
  // Annuler la pose leur rend l'ancienne.
  const b = annulerCoup(a)
  assert.deepEqual(pieceCouleurs(b), Array(6).fill('uni'))
  assert.deepEqual(b.couleurs, { entree: 0, avances: 0 })
})

test('les pièces tirées après une grille vidée prennent la nouvelle couleur', () => {
  let e = presqueVide({ enCours: ['bloc.0', null, null] })
  e = poser(e, 0, 9, 9)
  assert.equal(e.dernierCoup.nouveauTour, true)
  assert.equal(e.dernierCoup.nouvelleEntree, 'orange')
  // L'aperçu passé en main a pris la nouvelle couleur, le nouvel aperçu aussi.
  assert.deepEqual(e.enCours.map((x) => x.couleur), ['orange', 'orange', 'orange'])
  assert.deepEqual(e.suivantes.map((x) => x.couleur), ['orange', 'orange', 'orange'])
  assert.equal(poser(e, 0, 0, 0).grille[0][0], 'orange')
})

test('la partie suit toute la liste puis tire au hasard, sans entrée répétée', () => {
  let e = presqueVide({ enCours: ['bloc.0', null, null] })
  const vues = []
  for (let i = 0; i < 40; i++) {
    // On refait la même grille presque vide, avec les couleurs de la partie en cours.
    const base = presqueVide({ enCours: ['bloc.0', null, null] })
    base.couleurs = { ...e.couleurs }
    base.hasardCouleurs = e.hasardCouleurs
    e = poser(base, 0, 9, 9)
    vues.push(e.dernierCoup.nouvelleEntree)
  }
  assert.deepEqual(vues.slice(0, 21), ids(LISTE_COULEURS).slice(1))
  for (let i = 21; i < vues.length; i++) assert.notEqual(vues[i], vues[i - 1], `grille vidée n°${i + 1}`)
  assert.ok(new Set(vues.slice(21)).size > 1)
})

test('le hasard des couleurs ne touche pas celui de la partie : mêmes pièces, quelle que soit l\'entrée', () => {
  const graine = 20260
  const depart = (entree, avances) => {
    const e = nouvellePartie({ graine })
    e.couleurs = { entree, avances }
    return e
  }
  // Même graine, entrées différentes (unie, par pièce, mélangée, au hasard) : les mêmes pièces.
  const repere = nouvellePartie({ graine })
  for (const [entree, avances] of [[7, 7], [4, 4], [10, 10], [3, 50]]) {
    let a = repere
    let b = depart(entree, avances)
    // Les pièces du départ ont été tirées avant : on compare celles que l'on retire.
    for (let i = 0; i < 6; i++) {
      a = changerPieces({ ...a, reserve: { ...a.reserve, changer: 1 } })
      b = changerPieces({ ...b, reserve: { ...b.reserve, changer: 1 } })
      assert.deepEqual([...a.enCours, ...a.suivantes].map((x) => x.id), [...b.enCours, ...b.suivantes].map((x) => x.id), `entrée ${entree}`)
      assert.equal(a.hasard, b.hasard)
      assert.equal(a.hasardGains, b.hasardGains)
    }
  }
  // Et le hasard de la partie n'avance jamais pour les couleurs.
  const un = nouvellePartie({ graine })
  assert.notEqual(un.hasardCouleurs, un.hasard)
  assert.notEqual(un.hasardCouleurs, un.hasardGains)
})

test('tout le tirage est reproductible : même graine, mêmes pièces et mêmes couleurs', () => {
  for (const entree of [0, 4, 10]) {
    const fait = () => { const e = nouvellePartie({ graine: 99 }); e.couleurs = { entree, avances: entree }; return changerPieces({ ...e, reserve: { ...e.reserve, changer: 1 } }) }
    assert.deepEqual(fait().enCours, fait().enCours)
    assert.deepEqual(fait().suivantes, fait().suivantes)
  }
})

// La première place où la pièce en main k tient, ou null.
const premierePlace = (e, k) => {
  const pc = piece(e.enCours[k].id)
  for (let l = 0; l + pc.hauteur <= 10; l++) {
    for (let c = 0; c + pc.largeur <= 10; c++) {
      if (pc.cases.every((x) => e.grille[l + x.ligne][c + x.col] === null)) return [l, c]
    }
  }
  return null
}

test('le même enchaînement de poses donne les mêmes pièces, quelle que soit l\'entrée de départ', () => {
  const jouer = (entree) => {
    let e = nouvellePartie({ graine: 31 })
    e.couleurs = { entree, avances: entree }
    const tirees = []
    for (let i = 0; i < 12; i++) {
      const k = [0, 1, 2].find((n) => e.enCours[n] && premierePlace(e, n))
      if (k === undefined) break
      tirees.push(e.enCours[k].id)
      e = poser(e, k, ...premierePlace(e, k))
    }
    return { tirees, apercu: e.suivantes.map((x) => x.id), hasard: e.hasard }
  }
  const a = jouer(0)
  assert.ok(a.tirees.length >= 9)
  for (const entree of [4, 7, 10]) assert.deepEqual(jouer(entree), a, `entrée ${entree}`)
})

// --- Pièces mélangées -------------------------------------------------------------------

const MELANGEE = LISTE_COULEURS.findIndex((e) => e.mode === MODE_MELANGEE)

const melangee = (graine = 3) => {
  const e = nouvellePartie({ graine })
  e.couleurs = { entree: MELANGEE, avances: MELANGEE }
  return changerPieces({ ...e, reserve: { ...e.reserve, changer: 1 } })
}

test('une pièce mélangée pose chaque case de sa couleur', () => {
  let e = depuisTexte({ enCours: ['t.0', 'bloc.0', 'bloc.0'], suivantes: ['bloc.0', 'bloc.0', 'bloc.0'] })
  e.enCours[0] = { id: 't.0', couleur: 'rouge', couleurs: ['rouge', 'vert', 'bleu', 'jaune'] }
  e = poser(e, 0, 2, 3)
  // t.0 : cases (0,0) (0,1) (0,2) (1,1), dans cet ordre.
  assert.deepEqual([e.grille[2][3], e.grille[2][4], e.grille[2][5], e.grille[3][4]], ['rouge', 'vert', 'bleu', 'jaune'])
})

test('tourner une pièce mélangée : chaque case garde sa couleur en tournant', () => {
  let e = depuisTexte({ enCours: ['t.0', 'bloc.0', 'bloc.0'], suivantes: ['bloc.0', 'bloc.0', 'bloc.0'], reserve: { tourner: 4 } })
  e.enCours[0] = { id: 't.0', couleur: 'rouge', couleurs: ['rouge', 'vert', 'bleu', 'jaune'] }
  const avant = e.enCours[0]
  const couleurParPlace = (x) => new Map(piece(x.id).cases.map((c, i) => [`${c.ligne},${c.col}`, x.couleurs[i]]))
  for (let quart = 1; quart <= 4; quart++) {
    const suivant = tournerPiece(e, 0)
    const p = e.enCours[0]
    const q = suivant.enCours[0]
    assert.equal(q.couleur, q.couleurs[0])
    // La case (l, c) de la pièce avant est en (c, hauteur - 1 - l) après un quart de tour.
    const avantParPlace = couleurParPlace(p)
    const apres = couleurParPlace(q)
    const tournee = piece(p.id)
    for (const c of tournee.cases) {
      assert.equal(apres.get(`${c.col},${tournee.hauteur - 1 - c.ligne}`), avantParPlace.get(`${c.ligne},${c.col}`), `quart ${quart}`)
    }
    e = suivant
  }
  assert.deepEqual(e.enCours[0].couleurs, avant.couleurs, 'quatre quarts de tour : retour au départ')
})

test('annuler un coup rend aussi l\'entrée des couleurs et leur hasard', () => {
  let e = presqueVide({ enCours: ['bloc.0', null, null], reserve: { annuler: 1 } })
  const avant = { couleurs: { ...e.couleurs }, hasardCouleurs: e.hasardCouleurs }
  e = poser(e, 0, 9, 9)
  assert.deepEqual(e.couleurs, { entree: 1, avances: 1 })
  e = annulerCoup(e)
  assert.deepEqual(e.couleurs, avant.couleurs)
  assert.equal(e.hasardCouleurs, avant.hasardCouleurs)
  assert.deepEqual(pieceCouleurs(e), ['uni', 'uni', 'uni', 'uni'])
})

test('la partie exportée garde l\'entrée, son hasard et les couleurs par case ; elle se relit', () => {
  const e = melangee()
  assert.ok(e.enCours.every((x) => x.couleurs.length === piece(x.id).cases.length))
  const donnees = JSON.parse(JSON.stringify(exporterPartie(e)))
  assert.deepEqual(donnees.couleurs, { entree: MELANGEE, avances: MELANGEE })
  assert.equal(donnees.hasardCouleurs, e.hasardCouleurs)
  const relu = importerPartie(donnees)
  assert.deepEqual(relu.couleurs, e.couleurs)
  assert.equal(relu.hasardCouleurs, e.hasardCouleurs)
  assert.deepEqual(relu.enCours, e.enCours)
  assert.deepEqual(relu.suivantes, e.suivantes)
  // Une partie relue continue comme l'originale.
  const a = poser(e, 0, 0, 0)
  const b = poser(relu, 0, 0, 0)
  assert.deepEqual(exporterPartie(a), exporterPartie(b))
})

test('import : des couleurs abîmées ou incohérentes sont refusées', () => {
  const base = exporterPartie(melangee())
  const copie = () => JSON.parse(JSON.stringify(base))
  assert.ok(importerPartie(copie()))
  const cas = {
    'entrée manquante': (d) => { delete d.couleurs },
    'entrée hors liste': (d) => { d.couleurs.entree = 22 },
    'premier tour incohérent': (d) => { d.couleurs.avances = 3 },
    'hasard manquant': (d) => { delete d.hasardCouleurs },
    'hasard hors bornes': (d) => { d.hasardCouleurs = -1 },
    'couleurs par case trop courtes': (d) => { d.enCours[0].couleurs.pop() },
    'couleur par case vide': (d) => { d.enCours[0].couleurs[0] = d.enCours[0].couleur = '' },
    'couleurs par case qui contredisent la couleur': (d) => { d.enCours[0].couleurs[0] = 'autre' },
    'couleurs par case en texte': (d) => { d.enCours[0].couleurs = 'bleu' },
    'instantané sans couleurs': (d) => { d.annulation = { ...copie(), couleurs: null } },
  }
  for (const [nom, abime] of Object.entries(cas)) {
    const d = copie()
    abime(d)
    assert.equal(importerPartie(d), null, nom)
  }
})

// --- Les textures du jeu 2 ----------------------------------------------------------------

test('textures : paliers propres au jeu 2 sur son record, table de block-slid inchangée', () => {
  assert.deepEqual([...PALIERS_BLOCK_POSE], [1000, 5000, 10000, 25000, 50000, 100000, 200000, 350000, 500000, 1000000])
  assert.deepEqual([...PALIERS], [10000, 100000, 250000, 500000, 1000000, 2000000, 3500000, 5000000, 7500000, 10000000])
  const pose = stylesDuJeu(JEU_BLOCK_POSE)
  assert.deepEqual(ids(pose), ['uni', 'laine', 'beton', 'bois', 'bonbon', 'papier', 'metal', 'verre', 'marbre', 'neon', 'gemme'])
  assert.deepEqual(ids(pose), ids(STYLES), 'mêmes dessins pour les deux jeux')
  // Chaque style se débloque exactement à son palier, et pas avant.
  pose.slice(1).forEach((s, i) => {
    assert.equal(s.palier, PALIERS_BLOCK_POSE[i])
    assert.ok(!ids(stylesDebloques(s.palier - 1, JEU_BLOCK_POSE)).includes(s.id))
    assert.ok(ids(stylesDebloques(s.palier, JEU_BLOCK_POSE)).includes(s.id))
  })
  assert.deepEqual(ids(stylesDebloques(0, JEU_BLOCK_POSE)), ['uni'])
  assert.equal(stylesDebloques(1000000, JEU_BLOCK_POSE).length, 11)
  // Le record d'un jeu ne débloque rien dans l'autre.
  assert.deepEqual(ids(stylesDebloques(1000000, JEU_BLOCK_SLID)), ['uni', 'laine', 'beton', 'bois', 'bonbon', 'papier'])
  assert.equal(prochainStyle(1000000, JEU_BLOCK_POSE), null)
})

test('textures : le texte des réglages du jeu 2', () => {
  assert.equal(resumeStyles(0, JEU_BLOCK_POSE), 'Styles débloqués : 0 sur 10. Prochain : Laine, à 1000 points de meilleur score.')
  assert.equal(resumeStyles(5000, JEU_BLOCK_POSE), 'Styles débloqués : 2 sur 10. Prochain : Bois, à 10000 points de meilleur score.')
  assert.match(resumeStyles(1000000, JEU_BLOCK_POSE), /^Styles débloqués : 10 sur 10\. .*propriétés/)
  // Le texte de block-slid ne change pas.
  assert.match(resumeStyles(1e8), /^Styles débloqués : 10 sur 10\. Le style change à chaque figure réussie\.$/)
})
