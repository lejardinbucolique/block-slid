import { test } from 'node:test'
import assert from 'node:assert/strict'
import { partie, resume, SANS_FIGURES } from './partie-type.js'
import {
  REGLAGES,
  FIGURES,
  nouvellePartie,
  jouer,
  deplacerAVenir,
  deplacementsPossibles,
  blocEn,
  depuisTexte,
  figurePresente,
  proposerFigure,
  bonusDepart,
  tailleFigure,
  exporterPartie,
  importerPartie,
  changerReglages,
  SCHEMA_PARTIE,
} from '../src/moteur/index.js'

const LIGNE_TIREE = '333.333.'
function tirageFixe(aleatoire, reglages) {
  return depuisTexte({ rangees: [LIGNE_TIREE], aVenir: [], reglages: { ...reglages, tirage: () => [] } }).blocs
    .map(({ col, largeur, couleur }) => ({ col, largeur, couleur }))
}
const PETITE = { ...REGLAGES, lignes: 6, tirage: tirageFixe }

// Dans la notation texte, les couleurs d'une rangée se suivent : jaune, orange, rouge, vert...
const JAUNE_ORANGE_ROUGE = [
  { ligne: 0, col: 0, couleur: 'jaune' },
  { ligne: 0, col: 2, couleur: 'orange' },
  { ligne: 0, col: 4, couleur: 'rouge' },
]
const figureJOR = (depart = 3000) => ({ cases: JAUNE_ORANGE_ROUGE, depart })
const VIOLETTE = { cases: [{ ligne: 0, col: 0, couleur: 'violet' }, { ligne: 0, col: 1, couleur: 'violet' }, { ligne: 0, col: 2, couleur: 'violet' }], depart: 3000 }

function position(rangees, options = {}) {
  return depuisTexte({ rangees, aVenir: [LIGNE_TIREE, '1.1.1.1.'], reglages: PETITE, ...options })
}

// Un coup qui range le rouge en colonne 4 : la rangée « 1.1.1... » est faite.
const AVANT_FIGURE = ['1.1..1..', '55555...']
const idEn = (e, ligne, col) => blocEn(e, ligne, col).id
const faire = (e) => jouer(e, idEn(e, 4, 5), -1)

// --- Reconnaissance --------------------------------------------------------

test('reconnaissance : la figure est trouvée où elle se trouve dans la grille', () => {
  assert.equal(figurePresente(figureJOR(), position(['1.1.1...', '.....22.']).blocs), true, 'en haut à gauche')
  assert.equal(figurePresente(figureJOR(), position(['.1.1.1..']).blocs), true, "décalée d'une colonne")
  assert.equal(figurePresente(figureJOR(), position(['........', '..1.1.1.', '4444....']).blocs), true, 'décalée en ligne et en colonne')
})

test("reconnaissance : case manquante, mauvaise couleur ou bloc de plus d'une case : refusée", () => {
  assert.equal(figurePresente(figureJOR(), position(['1.1.....']).blocs), false, 'une case manque')
  const violet = { cases: JAUNE_ORANGE_ROUGE.map((c) => ({ ...c, couleur: 'violet' })), depart: 3000 }
  assert.equal(figurePresente(violet, position(['1.1.1...']).blocs), false)
  // Le dernier bloc fait 2 cases : à sa place, mais pas une case seule.
  assert.equal(figurePresente(figureJOR(), position(['1.1.22..']).blocs), false)
})

test("reconnaissance : une figure de deux lignes demande les deux lignes l'une sous l'autre", () => {
  const deux = { cases: [...JAUNE_ORANGE_ROUGE, ...JAUNE_ORANGE_ROUGE.map((c) => ({ ...c, ligne: 1 }))], depart: 5000 }
  assert.equal(figurePresente(deux, position(['1.1.1...', '1.1.1...']).blocs), true)
  assert.equal(figurePresente(deux, position(['.1.1.1..', '.1.1.1..', '........']).blocs), true)
  assert.equal(figurePresente(deux, position(['1.1.1...', '........', '1.1.1...']).blocs), false, 'pas collées')
  assert.equal(figurePresente(deux, position(['1.1.1...', '1.1.22..']).blocs), false, 'un bloc de 2 en dessous')
  assert.deepEqual(tailleFigure(deux), { lignes: 2, colonnes: 5 })
})

test('palier : le bonus de départ suit le nombre de cases', () => {
  const attendu = { 3: 3000, 4: 3000, 5: 5000, 6: 5000, 7: 10000, 8: 10000, 14: 10000 }
  for (const [n, bonus] of Object.entries(attendu)) assert.equal(bonusDepart(Number(n), FIGURES), bonus, `${n} cases`)
})

// --- Le bonus à chaque coup --------------------------------------------------

test('bonus : baisse de 100 à chaque coup sur la grille', () => {
  let e = position(AVANT_FIGURE, { figure: VIOLETTE })
  assert.equal(e.bonus, 3000)
  e = faire(e)
  assert.equal(e.bonus, 2900)
  assert.equal(e.dernierCoup.figure.issue, null)
  assert.equal(e.score, 0, "rien gagné tant que la figure n'est pas faite")
  const suivant = e.blocs.map((b) => ({ b, p: deplacementsPossibles(e, b.id) })).find(({ p }) => p.gauche || p.droite)
  e = jouer(e, suivant.b.id, suivant.p.droite ? 1 : -1)
  assert.equal(e.bonus, 2800)
})

test("bonus : déplacer la ligne à venir n'est pas un coup et ne le baisse pas", () => {
  const e = position(AVANT_FIGURE, { figure: figureJOR() })
  const b = e.aVenir[0].find((x) => deplacementsPossibles(e, x.id).droite > 0)
  const apres = deplacerAVenir(e, b.id, 1)
  assert.ok(apres)
  assert.equal(apres.bonus, 3000)
  assert.equal(apres.coups, e.coups)
})

test("bonus : figure faite, le bonus qui reste s'ajoute au score et une nouvelle figure arrive", () => {
  const e = faire(position(AVANT_FIGURE, { figure: figureJOR() }))
  assert.equal(e.dernierCoup.figure.issue, 'reussie')
  assert.equal(e.dernierCoup.figure.gain, 2900)
  assert.equal(e.score, 2900)
  assert.equal(e.dernierCoup.points, 0, 'les points de lignes ne changent pas')
  assert.deepEqual(e.dernierCoup.figure.avant, figureJOR())
  assert.notDeepEqual(e.figure, figureJOR())
  assert.equal(e.dernierCoup.figure.nouvelle, e.figure)
  if (e.figure) {
    assert.equal(e.bonus, e.figure.depart)
    assert.equal(figurePresente(e.figure, e.blocs), false)
  }
})

test('bonus : tombé à 0, aucun point et une nouvelle figure', () => {
  const e = faire(position(AVANT_FIGURE, { figure: VIOLETTE, bonus: 100 }))
  assert.equal(e.dernierCoup.figure.issue, 'expiree')
  assert.equal(e.dernierCoup.figure.gain, 0)
  assert.equal(e.score, 0)
  assert.notDeepEqual(e.figure, VIOLETTE)
})

test("bonus : jamais sous 0, même s'il restait moins que la perte", () => {
  const e = faire(position(AVANT_FIGURE, { figure: VIOLETTE, bonus: 40 }))
  assert.equal(e.dernierCoup.figure.issue, 'expiree')
  assert.ok(e.bonus >= 0)
  assert.equal(e.score, 0)
})

test('bonus : une figure faite quand il ne reste rien ne rapporte rien', () => {
  const e = faire(position(AVANT_FIGURE, { figure: figureJOR(), bonus: 100 }))
  assert.equal(e.dernierCoup.figure.issue, 'expiree')
  assert.equal(e.score, 0)
})

test('bonus : les points de lignes se comptent comme avant, le bonus en plus', () => {
  // Le coup complète la ligne du bas (10 points) et compose la figure au-dessus.
  const e = position(['1.1..1..', '1.1.1.11'])
  const avec = { ...e, figure: figureJOR(), bonus: 3000 }
  const apres = jouer(avec, idEn(avec, 4, 5), -1)
  assert.equal(apres.dernierCoup.figure.issue, 'reussie')
  assert.equal(apres.score, apres.dernierCoup.points + 2900)
})

test('figures coupées : aucun résumé, aucune figure, score comme avant', () => {
  const sans = { ...PETITE, figures: null }
  const e0 = depuisTexte({ rangees: AVANT_FIGURE, aVenir: [LIGNE_TIREE, '1.1.1.1.'], reglages: sans })
  const e = jouer(e0, idEn(e0, 4, 5), -1)
  assert.equal(e.dernierCoup.figure, null)
  assert.equal(e.figure, null)
  assert.equal(e.bonus, 0)
})

// --- Tirage -------------------------------------------------------------------

function verifierFigure(e, contexte) {
  const f = e.figure
  if (!f) return false
  const cfg = e.reglages.figures
  const n = f.cases.length
  assert.ok(n >= cfg.paliers[0].casesMin, `${contexte} : ${n} cases`)
  assert.ok(f.cases.every((c) => c.ligne >= 0 && c.ligne < cfg.lignesMax && c.col >= 0 && c.col < e.reglages.colonnes), contexte)
  assert.ok(f.cases.some((c) => c.ligne === 0) && f.cases.some((c) => c.col === 0), `${contexte} : décalée`)
  assert.equal(new Set(f.cases.map((c) => `${c.ligne},${c.col}`)).size, n, `${contexte} : cases en double`)
  for (let l = 0; l < cfg.lignesMax; l++) {
    assert.ok(f.cases.filter((c) => c.ligne === l).length <= cfg.casesMaxParLigne, `${contexte} : ligne trop pleine`)
  }
  assert.equal(f.depart, bonusDepart(n, cfg), `${contexte} : bonus de départ`)
  // Réalisable côté couleurs : assez de blocs d'une case de chaque couleur, grille et lignes à venir.
  const dispo = {}
  for (const b of [...e.blocs, ...e.aVenir.flat()]) if (b.largeur === 1) dispo[b.couleur] = (dispo[b.couleur] ?? 0) + 1
  const besoin = {}
  for (const c of f.cases) besoin[c.couleur] = (besoin[c.couleur] ?? 0) + 1
  for (const [couleur, nb] of Object.entries(besoin)) assert.ok(nb <= (dispo[couleur] ?? 0), `${contexte} : ${couleur} ${nb}/${dispo[couleur] ?? 0}`)
  assert.equal(figurePresente(f, e.blocs), false, `${contexte} : déjà dans la grille`)
  assert.equal(e.bonus, f.depart)
  return true
}

test('tirage : toute figure proposée est réalisable côté couleurs et pas déjà dans la grille', () => {
  let proposees = 0
  const vues = { lignes: new Set(), couleurs: new Set(), paliers: new Set() }
  for (let g = 1; g <= 150; g++) {
    if (verifierFigure(nouvellePartie({ graine: g }), `graine ${g} départ`)) proposees++
    for (const { apres: e } of partie(g, 120, REGLAGES)) {
      const c = e.dernierCoup.figure
      if (!c.issue && c.avant) continue
      if (verifierFigure(e, `graine ${g} coup ${e.coups}`)) {
        proposees++
        vues.lignes.add(new Set(e.figure.cases.map((x) => x.ligne)).size)
        vues.couleurs.add(new Set(e.figure.cases.map((x) => x.couleur)).size)
        vues.paliers.add(e.figure.depart)
      }
    }
  }
  assert.ok(proposees > 150, `seulement ${proposees} figures`)
  assert.deepEqual([...vues.lignes].sort(), [1, 2], 'une et deux lignes')
  assert.ok(vues.couleurs.size >= 2, 'des couleurs variées')
  assert.ok(vues.paliers.has(3000) && vues.paliers.has(5000), `paliers vus : ${[...vues.paliers]}`)
})

test('tirage : même graine et mêmes gestes, mêmes figures', () => {
  const jouerTout = (g) => [...partie(g, 80, REGLAGES)].map(({ apres }) => `${resume(apres)};${JSON.stringify(apres.figure)};${apres.bonus}`)
  for (let g = 1; g <= 30; g++) assert.deepEqual(jouerTout(g), jouerTout(g), `graine ${g}`)
  assert.deepEqual(nouvellePartie({ graine: 9 }), nouvellePartie({ graine: 9 }))
  assert.notDeepEqual(nouvellePartie({ graine: 9 }).figure, nouvellePartie({ graine: 10 }).figure)
})

test("tirage : sans assez de petits blocs, pas de figure plutôt qu'une figure impossible", () => {
  const e = depuisTexte({ rangees: ['22.22.22', '22.22.22'], aVenir: ['4444....', '333.....'], reglages: PETITE, graine: 5 })
  let n = 0
  assert.equal(proposerFigure(e.blocs, e.aVenir, PETITE, () => (n = (n + 0.37) % 1)), null)
})

test("tirage : une figure déjà dans la grille n'est jamais proposée", () => {
  // Une grille qui contient déjà « jaune orange rouge » : les figures tirées l'évitent.
  const e = depuisTexte({ rangees: ['1.1.1...', '1.1.1...'], aVenir: ['1.1.1.1.', '1.1.1.1.'], reglages: PETITE, graine: 3 })
  let s = 1
  const alea = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  let proposees = 0
  for (let i = 0; i < 300; i++) {
    const f = proposerFigure(e.blocs, e.aVenir, PETITE, alea)
    if (f) { proposees++; assert.equal(figurePresente(f, e.blocs), false) }
  }
  assert.ok(proposees > 0)
})

// --- Partie gardée ---------------------------------------------------------------

const viaTexte = (etat, reglages = etat.reglages) => importerPartie(JSON.parse(JSON.stringify(exporterPartie(etat))), reglages)

test("partie gardée : la figure et le bonus font l'aller-retour, la suite est identique", () => {
  let coups = 0
  for (let g = 1; g <= 60; g++) {
    for (const { avant, apres, id, dx } of partie(g, 100, REGLAGES)) {
      const repris = viaTexte(avant)
      assert.ok(repris, `graine ${g}`)
      assert.deepEqual(repris.figure, avant.figure)
      assert.equal(repris.bonus, avant.bonus)
      const suite = jouer(repris, id, dx)
      assert.equal(resume(suite), resume(apres), `graine ${g}, coup ${apres.coups}`)
      assert.deepEqual(suite.figure, apres.figure)
      assert.equal(suite.bonus, apres.bonus)
      coups++
    }
  }
  assert.ok(coups > 1000)
})

test("partie gardée : une partie d'avant les figures (schéma 1) reprend avec une figure neuve", () => {
  const e = nouvellePartie({ graine: 12, reglages: SANS_FIGURES })
  const ancien = JSON.parse(JSON.stringify(exporterPartie(e)))
  ancien.schema = 1
  delete ancien.figure
  delete ancien.bonus
  const repris = importerPartie(ancien, REGLAGES)
  assert.ok(repris, 'relue')
  assert.deepEqual(repris.blocs, e.blocs)
  assert.equal(repris.score, e.score)
  assert.ok(repris.figure, 'une figure neuve')
  assert.equal(repris.bonus, repris.figure.depart)
  assert.equal(importerPartie(ancien, SANS_FIGURES).figure, null)
})

test('partie gardée : figures coupées, la figure gardée est laissée de côté ; réactivées, une neuve', () => {
  const avec = nouvellePartie({ graine: 21 })
  assert.ok(avec.figure)
  const sans = importerPartie(JSON.parse(JSON.stringify(exporterPartie(avec))), SANS_FIGURES)
  assert.equal(sans.figure, null)
  assert.equal(sans.bonus, 0)
  const sauvee = exporterPartie(sans)
  assert.equal(sauvee.figure, null)
  const reprise = importerPartie(JSON.parse(JSON.stringify(sauvee)), REGLAGES)
  assert.ok(reprise.figure)
  assert.equal(reprise.bonus, reprise.figure.depart)
})

test('partie gardée : une figure invalide fait refuser la partie', () => {
  const bon = exporterPartie(nouvellePartie({ graine: 5 }))
  assert.equal(bon.schema, SCHEMA_PARTIE)
  const copie = () => JSON.parse(JSON.stringify(bon))
  assert.ok(importerPartie(copie()))
  const alterer = (fn) => { const d = copie(); fn(d); return d }
  const cas = {
    'bonus au-delà du départ': alterer((d) => { d.bonus = d.figure.depart + 1 }),
    'bonus négatif': alterer((d) => { d.bonus = -1 }),
    'bonus texte': alterer((d) => { d.bonus = '100' }),
    'figure sans case': alterer((d) => { d.figure.cases = [] }),
    'figure pas un objet': alterer((d) => { d.figure = 3 }),
    'case en double': alterer((d) => { d.figure.cases.push({ ...d.figure.cases[0] }) }),
    'ligne hors figure': alterer((d) => { d.figure.cases[0].ligne = 2 }),
    'colonne hors grille': alterer((d) => { d.figure.cases[0].col = 8 }),
    'couleur inconnue': alterer((d) => { d.figure.cases[0].couleur = 'noir' }),
    'départ nul': alterer((d) => { d.figure.depart = 0 }),
    'figure décalée': alterer((d) => { for (const c of d.figure.cases) c.col = Math.min(7, c.col + 1) }),
  }
  for (const [nom, donnees] of Object.entries(cas)) assert.equal(importerPartie(donnees), null, nom)
})

// --- Réglage en pleine partie ----------------------------------------------------

test('changer de réglages en pleine partie : couper retire la figure, activer en propose une neuve', () => {
  const sans = { ...REGLAGES, figures: null }
  const e = nouvellePartie({ graine: 33 })
  assert.ok(e.figure)
  const coupe = changerReglages(e, sans)
  assert.equal(coupe.figure, null)
  assert.equal(coupe.bonus, 0)
  assert.deepEqual(coupe.blocs, e.blocs)
  assert.equal(coupe.score, e.score)
  assert.ok(e.figure, "l'ancien état n'est pas touché")
  const mobile = coupe.blocs.map((b) => ({ b, p: deplacementsPossibles(coupe, b.id) })).find(({ p }) => p.droite)
  const jeu = jouer(coupe, mobile.b.id, 1)
  assert.equal(jeu.dernierCoup.figure, null)
  const remis = changerReglages(coupe, REGLAGES)
  assert.ok(remis.figure)
  assert.equal(remis.bonus, remis.figure.depart)
  assert.equal(figurePresente(remis.figure, remis.blocs), false)
  assert.equal(changerReglages(e, e.reglages), e)
})
