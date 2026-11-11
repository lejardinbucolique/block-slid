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
  figureValide,
  motifFigure,
  proposerFigure,
  tailleFigure,
  exporterPartie,
  importerPartie,
  changerReglages,
  SCHEMA_PARTIE,
} from '../src/moteur/index.js'
import { recolorerLigne } from '../src/moteur/tirage.js'

const LIGNE_TIREE = '333.333.'
function tirageFixe(aleatoire, reglages) {
  return depuisTexte({ rangees: [LIGNE_TIREE], aVenir: [], reglages: { ...reglages, tirage: () => [] } }).blocs
    .map(({ col, largeur, couleur }) => ({ col, largeur, couleur }))
}
const PETITE = { ...REGLAGES, lignes: 6, tirage: tirageFixe }

// Dans la notation texte, les couleurs d'une rangée se suivent : jaune, orange, rouge, vert,
// bleu, bleu clair, violet.
const COULEURS = ['jaune', 'orange', 'rouge', 'vert', 'bleu', 'bleu clair', 'violet']

// Une figure : le motif écrit en lettres (J jaune, O orange, B bleu, R rouge), sur les deux lignes.
const LETTRES = { J: 'jaune', O: 'orange', B: 'bleu', R: 'rouge' }
function figure(motif, depart = 10000) {
  const cases = []
  for (let ligne = 0; ligne < 2; ligne++) {
    ;[...motif].forEach((l, col) => { if (l !== '.') cases.push({ ligne, col, couleur: LETTRES[l] }) })
  }
  return { cases, depart }
}
// Six blocs d'une case qui se suivent dans une rangée du texte : jaune, orange, rouge, vert, bleu,
// bleu clair (six couleurs : plus que les figures n'en ont, mais la reconnaissance ne s'en soucie pas).
const SIX = { cases: [0, 1, 2, 3, 4, 5].flatMap((col) => [0, 1].map((ligne) => ({ ligne, col, couleur: COULEURS[col] }))), depart: 10000 }

// La ligne qui monte au premier coup soutient les colonnes 0 à 5 (la figure y est) et laisse deux trous.
const LIGNE_QUI_MONTE = '222222..'
function position(rangees, options = {}) {
  return depuisTexte({ rangees, aVenir: [LIGNE_QUI_MONTE, '1.1.1.1.'], reglages: PETITE, ...options })
}
const present = (f, rangees) => figurePresente(f, position(rangees).blocs, PETITE.lignes, PETITE.colonnes)

function alea(graine = 1) {
  let s = graine
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
}

// --- Reconnaissance --------------------------------------------------------

test("reconnaissance : deux lignes voisines portant le motif, exactement l'une sous l'autre, où que ce soit", () => {
  assert.equal(present(SIX, ['111111..', '111111..']), true, 'collée à gauche')
  assert.equal(present(SIX, ['.111111.', '.111111.']), true, 'au milieu')
  assert.equal(present(SIX, ['..111111', '..111111']), true, 'collée à droite')
  assert.equal(present(SIX, ['........', '..111111', '..111111', '4444....']), true, 'plus bas, avec autre chose autour')
})

test("reconnaissance : les deux lignes décalées l'une par rapport à l'autre ne font pas la figure", () => {
  assert.equal(present(SIX, ['111111..', '.111111.']), false, "d'une colonne")
  assert.equal(present(SIX, ['111111..', '..111111']), false, 'de deux colonnes')
  assert.equal(present(SIX, ['..111111', '111111..']), false, "de deux colonnes, dans l'autre sens")
})

test('reconnaissance : case manquante, mauvaise couleur, bloc plus large ou lignes non voisines : refusée', () => {
  assert.equal(present(SIX, ['111111..', '11111...']), false, 'une case manque')
  assert.equal(present(SIX, ['111111..']), false, 'une seule ligne')
  assert.equal(present(SIX, ['111111..', '........', '111111..']), false, 'pas voisines')
  assert.equal(present(SIX, ['111111..', '11111.1.']), false, "la sixième case n'est pas à sa place")
  // Le dernier bloc fait 2 cases : à sa place, mais pas une case seule.
  assert.equal(present(SIX, ['111111..', '1111122.']), false, 'un bloc de 2 cases')
  const violet = { cases: SIX.cases.map((c) => ({ ...c, couleur: 'violet' })), depart: 10000 }
  assert.equal(present(violet, ['111111..', '111111..']), false, 'mauvaises couleurs')
})

test('reconnaissance : sept colonnes, trois couleurs', () => {
  // Jaune, vert, vert, violet, violet, vert, violet : les couleurs de la notation texte ne se
  // répètent pas, la figure est donc posée avec des blocs fabriqués à la main.
  const motif = ['jaune', 'vert', 'vert', 'violet', 'violet', 'vert', 'violet']
  const f = { cases: [0, 1].flatMap((ligne) => motif.map((couleur, col) => ({ ligne, col, couleur }))), depart: 10000 }
  assert.equal(figureValide(f, FIGURES), true)
  const blocs = (decalage) => [0, 1].flatMap((l) => motif.map((couleur, c) => ({ id: l * 10 + c, ligne: 4 + l, col: c + decalage, largeur: 1, couleur })))
  assert.equal(figurePresente(f, blocs(0), 6, 8), true, 'collée à gauche')
  assert.equal(figurePresente(f, blocs(1), 6, 8), true, 'collée à droite')
  const faux = blocs(0)
  faux[3].couleur = 'vert'
  assert.equal(figurePresente(f, faux, 6, 8), false, 'une case de la mauvaise couleur')
})

test('figure : taille, motif et format', () => {
  assert.deepEqual(tailleFigure(SIX), { lignes: 2, colonnes: 6 })
  const jo = ['jaune', 'orange', 'jaune', 'orange', 'jaune', 'orange']
  assert.deepEqual(motifFigure(figure('JOJOJO')), { largeur: 6, bas: jo, haut: jo, couleurs: [...jo, ...jo] })
  assert.equal(figureValide(SIX, FIGURES), false, 'six couleurs : trop')
  assert.equal(figureValide(figure('JOJOJO'), FIGURES), true)
  assert.equal(figureValide(figure('JJJJJJ'), FIGURES), true, 'une seule couleur')
  assert.equal(figureValide(figure('JOJOJOJ'), FIGURES), true, '7 colonnes')
  assert.equal(figureValide(figure('JOJOJ'), FIGURES), false, '5 colonnes')
  assert.equal(figureValide(figure('JOJOJOJO'), FIGURES), false, '8 colonnes : la grille entière')
  assert.equal(figureValide(figure('JOJ.JO'), FIGURES), false, 'un trou')
  assert.equal(figureValide(figure('.JOJOJ'), FIGURES), false, 'colonne de gauche vide')
  assert.equal(figureValide({ cases: figure('JOJOJO').cases.slice(1), depart: 1 }, FIGURES), true, 'haut de cinq cases sur six')
  assert.equal(figureValide({ cases: figure('JOJOJO').cases.filter((c) => c.ligne === 0), depart: 1 }, FIGURES), false, 'une seule ligne')
  assert.equal(figureValide(null, FIGURES), false)
})

// --- Ligne du haut incomplète (BS14) ---------------------------------------------

// Une figure à deux lignes différentes, écrites en lettres : le haut puis le bas ('.' = case vide).
const LET = { J: 'jaune', O: 'orange', V: 'vert', P: 'violet' }
function figure2(haut, bas, depart = 10000) {
  const cases = []
  ;[haut, bas].forEach((texte, ligne) => [...texte].forEach((l, col) => { if (l !== '.') cases.push({ ligne, col, couleur: LET[l] }) }))
  return { cases, depart }
}
// Les trois captures de l'utilisateur (2, 3 et 6 de la série de 07:34 à 07:43).
const CAPTURE_2 = figure2('..VPVP', 'VPVPVP')
const CAPTURE_3 = figure2('P.P.PVP', 'PVPPPVP')
const CAPTURE_6 = figure2('..JJPV.', 'JJPVVPV')
// Des blocs d'une case : chaque rangée est une chaîne de lettres ('.' = vide), `ligne` la première rangée.
function posee(rangees, ligne = 0) {
  const blocs = []
  rangees.forEach((texte, i) => [...texte].forEach((l, c) => {
    if (l !== '.') blocs.push({ id: blocs.length + 1, ligne: ligne + i, col: c, largeur: 1, couleur: LET[l] })
  }))
  return blocs
}
const dans = (f, rangees, ligne = 2) => figurePresente(f, posee(rangees, ligne), 6, 8)

test('ligne du haut incomplète : les trois captures sont des figures valides', () => {
  for (const f of [CAPTURE_2, CAPTURE_3, CAPTURE_6]) assert.equal(figureValide(f, FIGURES), true)
  assert.deepEqual(tailleFigure(CAPTURE_3), { lignes: 2, colonnes: 7 })
  assert.equal(motifFigure(CAPTURE_6).haut.filter((c) => c !== null).length, 4)
})

test('ligne du haut incomplète : reconnue dans la grille, où que ce soit, autres blocs autour sans effet', () => {
  assert.equal(dans(CAPTURE_2, ['..VPVP..', 'VPVPVP..']), true, 'collée à gauche')
  assert.equal(dans(CAPTURE_2, ['....VPVP', '..VPVPVP']), true, 'collée à droite')
  assert.equal(dans(CAPTURE_2, ['JJVPVPJJ', 'VPVPVPOO']), true, 'des blocs dans les cases vides du haut et autour')
  assert.equal(dans(CAPTURE_3, ['P.P.PVP.', 'PVPPPVP.']), true, 'capture 3')
  assert.equal(dans(CAPTURE_3, ['.PJPVPVP', '.PVPPPVP']), true, 'capture 3, un bloc dans un trou, décalée')
  assert.equal(dans(CAPTURE_6, ['..JJPV..', 'JJPVVPV.']), true, 'capture 6, couleurs du haut différentes du bas')
  assert.equal(dans(CAPTURE_6, ['..JJPV..', 'JJPVVPV.'], 0), true, 'tout en haut de la grille')
})

test('ligne du haut incomplète : mauvaise couleur, mauvaise place, bloc large ou ordre inversé : refusée', () => {
  assert.equal(dans(CAPTURE_2, ['..VPVV..', 'VPVPVP..']), false, 'une case du haut de la mauvaise couleur')
  assert.equal(dans(CAPTURE_2, ['..VPVP..', 'VPVPVV..']), false, 'une case du bas de la mauvaise couleur')
  assert.equal(dans(CAPTURE_2, ['.VPVPV..', 'VPVPVP..']), false, "le haut décalé d'une colonne")
  assert.equal(dans(CAPTURE_2, ['..VPV...', 'VPVPVP..']), false, 'une case du haut manque')
  assert.equal(dans(CAPTURE_2, ['VPVPVP..', '..VPVP..']), false, "les lignes dans l'autre sens")
  assert.equal(dans(CAPTURE_2, ['..VPVP..', '........', 'VPVPVP..']), false, 'lignes non voisines')
  const bloc2 = posee(['..VP', 'VPVPVP..'], 2)
  bloc2.push({ id: 98, ligne: 2, col: 4, largeur: 2, couleur: 'vert' })
  assert.equal(figurePresente(CAPTURE_2, bloc2, 6, 8), false, 'un bloc de deux cases ne compte pas')
})

test('ligne du haut incomplète : une case du haut sans appui, trop courte ou trop trouée : format refusé', () => {
  assert.equal(figureValide(figure2('..VPVPV', 'VPVPVP'), FIGURES), false, 'une case du haut au-dessus de rien')
  assert.equal(figureValide(figure2('VPV', 'VPVPVP'), FIGURES), false, 'trois cases seulement')
  assert.equal(figureValide(figure2('VPVP', 'VPVPVP'), FIGURES), true, 'quatre cases')
  assert.equal(figureValide(figure2('V.VP.P', 'VPVPVP'), FIGURES), true, 'quatre cases et deux trous')
  assert.equal(figureValide(figure2('V..VP.P', 'VPVPVPV'), FIGURES), false, 'trois trous')
  assert.equal(figureValide(figure2('V.V.VPV', 'VPVPVPV'), FIGURES), true, 'deux trous')
  assert.equal(figureValide(figure2('..VPVP', 'VPVPV.'), FIGURES), false, 'ligne du bas trouée')
  assert.equal(figureValide(figure2('JOVP', 'JOVPJO'), FIGURES), false, 'quatre couleurs')
  assert.equal(figureValide(figure2('', 'VPVPVP'), FIGURES), false, 'pas de ligne du haut')
})

test("proposition : les deux sortes de figures sortent, rien en l'air, toujours au bon format", () => {
  const sortes = { identiques: 0, incompletes: 0 }
  const tailles = new Set()
  const hasard = alea(11)
  for (let i = 0; i < 400; i++) {
    const f = proposerFigure([], PETITE, hasard)
    assert.ok(figureValide(f, FIGURES), `tirage ${i} : format`)
    const m = motifFigure(f)
    m.haut.forEach((c, col) => { if (c !== null) assert.ok(m.bas[col], `tirage ${i} : bloc en l'air`) })
    tailles.add(m.haut.filter((c) => c !== null).length)
    if (m.haut.every((c, col) => c === m.bas[col])) sortes.identiques++
    else sortes.incompletes++
    assert.ok(new Set(m.couleurs).size <= 3)
  }
  assert.ok(sortes.identiques > 100 && sortes.incompletes > 100, JSON.stringify(sortes))
  assert.ok([4, 5, 6].every((n) => tailles.has(n)), [...tailles].join())
})

test('proposition : la part de figures à ligne du haut incomplète se règle', () => {
  const regle = (chanceIncomplete) => ({ ...PETITE, figures: { ...FIGURES, haut: { ...FIGURES.haut, chanceIncomplete } } })
  for (let i = 0; i < 100; i++) {
    const tous = motifFigure(proposerFigure([], regle(0), alea(i + 1)))
    assert.deepEqual(tous.haut, tous.bas, 'part 0 : deux lignes identiques')
    const autres = motifFigure(proposerFigure([], regle(1), alea(i + 1)))
    assert.ok(autres.haut.includes(null), 'part 1 : toujours incomplète')
  }
})

test('partie gardée : une figure à ligne du haut incomplète fait l’aller-retour', () => {
  const e = nouvellePartie({ graine: 3 })
  e.figure = CAPTURE_3
  e.bonus = 9000
  const relue = importerPartie(JSON.parse(JSON.stringify(exporterPartie(e))))
  assert.deepEqual(relue.figure, CAPTURE_3)
  assert.equal(relue.bonus, 9000)
})

// --- Le bonus à chaque coup --------------------------------------------------

// Une position où un coup compose la figure : la ligne du dessus a sa sixième case une colonne trop
// à droite ; la glisser d'une case à gauche fait « 111111.. » des deux lignes.
const AVANT_FIGURE = ['11111.1.', '111111..']
const idEn = (e, ligne, col) => blocEn(e, ligne, col).id
const faire = (e) => jouer(e, idEn(e, 4, 6), -1)
const AUTRE = figure('JOJOJO') // jamais faite par AVANT_FIGURE

test('bonus : baisse de 100 à chaque coup sur la grille', () => {
  let e = position(AVANT_FIGURE, { figure: AUTRE })
  assert.equal(e.bonus, 10000)
  e = faire(e)
  assert.equal(e.bonus, 9900)
  assert.equal(e.dernierCoup.figure.issue, null)
  assert.equal(e.score, 0, "rien gagné tant que la figure n'est pas faite")
  const suivant = e.blocs.map((b) => ({ b, p: deplacementsPossibles(e, b.id) })).find(({ p }) => p.gauche || p.droite)
  e = jouer(e, suivant.b.id, suivant.p.droite ? 1 : -1)
  assert.equal(e.bonus, 9800)
})

test("bonus : déplacer la ligne à venir n'est pas un coup et ne le baisse pas", () => {
  const e = position(AVANT_FIGURE, { figure: AUTRE })
  const b = e.aVenir[0].find((x) => deplacementsPossibles(e, x.id).droite > 0)
  const apres = deplacerAVenir(e, b.id, 1)
  assert.ok(apres)
  assert.equal(apres.bonus, 10000)
  assert.equal(apres.coups, e.coups)
})

test("bonus : figure faite, le bonus qui reste s'ajoute au score et une nouvelle figure arrive", () => {
  const e = faire(position(AVANT_FIGURE, { figure: SIX }))
  assert.equal(e.dernierCoup.figure.issue, 'reussie')
  assert.equal(e.dernierCoup.figure.gain, 9900)
  assert.equal(e.score, 9900)
  assert.equal(e.dernierCoup.points, 0, 'les points de lignes ne changent pas')
  assert.deepEqual(e.dernierCoup.figure.avant, SIX)
  assert.ok(e.figure, 'une nouvelle figure, toujours')
  assert.notDeepEqual(e.figure, SIX)
  assert.equal(e.dernierCoup.figure.nouvelle, e.figure)
  assert.equal(e.bonus, e.figure.depart)
  assert.equal(figurePresente(e.figure, e.blocs, e.reglages.lignes, e.reglages.colonnes), false)
})

test('bonus : tombé à 0, aucun point et une nouvelle figure', () => {
  const e = faire(position(AVANT_FIGURE, { figure: AUTRE, bonus: 100 }))
  assert.equal(e.dernierCoup.figure.issue, 'expiree')
  assert.equal(e.dernierCoup.figure.gain, 0)
  assert.equal(e.score, 0)
  assert.ok(e.figure)
  assert.equal(e.bonus, e.figure.depart)
})

test("bonus : jamais sous 0, même s'il restait moins que la perte", () => {
  const e = faire(position(AVANT_FIGURE, { figure: AUTRE, bonus: 40 }))
  assert.equal(e.dernierCoup.figure.issue, 'expiree')
  assert.ok(e.bonus >= 0)
  assert.equal(e.score, 0)
})

test('bonus : une figure faite quand il ne reste rien ne rapporte rien', () => {
  const e = faire(position(AVANT_FIGURE, { figure: SIX, bonus: 100 }))
  assert.equal(e.dernierCoup.figure.issue, 'expiree')
  assert.equal(e.score, 0)
})

test('bonus : les points de lignes se comptent comme avant, le bonus en plus', () => {
  // Le coup glisse un bloc d'une case sur le trou de la ligne du bas : elle est pleine (10 points)
  // et disparaît, et les deux lignes du dessus, qui portent la figure, descendent.
  const e = position(['111111..', '1111111.', '1111111.'])
  const avec = { ...e, figure: SIX, bonus: 10000 }
  const apres = jouer(avec, idEn(avec, 4, 6), 1)
  assert.equal(apres.dernierCoup.lignesEffacees, 1)
  assert.equal(apres.dernierCoup.points, 10)
  assert.equal(apres.dernierCoup.figure.issue, 'reussie')
  assert.equal(apres.score, 10 + 9900)
})

test('figures coupées : aucun résumé, aucune figure, score comme avant', () => {
  const sans = { ...PETITE, figures: null }
  const e0 = depuisTexte({ rangees: AVANT_FIGURE, aVenir: [LIGNE_QUI_MONTE, '1.1.1.1.'], reglages: sans })
  const e = jouer(e0, idEn(e0, 4, 6), -1)
  assert.equal(e.dernierCoup.figure, null)
  assert.equal(e.figure, null)
  assert.equal(e.bonus, 0)
})

// --- Tirage des lignes poussé vers la figure --------------------------------------

function lignesSaines(ligne, colonnes) {
  let fin = 0
  for (const b of [...ligne].sort((x, y) => x.col - y.col)) {
    if (b.col < fin || b.largeur < 1 || b.col + b.largeur > colonnes) return false
    fin = b.col + b.largeur
  }
  return true
}

const forme = (l) => [...l].sort((x, y) => x.col - y.col).map((b) => `${b.col}:${b.largeur}`).join()

test("recoloriage : la forme de la ligne ne change jamais, seuls des blocs d'une case changent de couleur", () => {
  const hasard = alea(12345)
  const demandes = [['bleu'], ['bleu', 'jaune'], ['bleu', 'bleu', 'jaune']]
  for (let i = 0; i < 400; i++) {
    const etat = nouvellePartie({ graine: i + 1, reglages: SANS_FIGURES })
    const base = etat.aVenir[0].map(({ col, largeur, couleur }) => ({ col, largeur, couleur }))
    const voulues = demandes[i % demandes.length]
    const ligne = recolorerLigne(base, voulues, hasard)
    assert.equal(forme(ligne), forme(base), `ligne ${i} : forme`)
    base.forEach((b, k) => { if (b.largeur > 1) assert.equal(ligne[k].couleur, b.couleur, `ligne ${i} : bloc large intact`) })
    const seuls = base.filter((b) => b.largeur === 1).length
    if (!seuls) assert.deepEqual(ligne, base, `ligne ${i} : sans bloc d'une case, intacte`)
    // Les couleurs voulues sont là, autant que les blocs d'une case le permettent.
    const servies = voulues.filter((c, k) => ligne.filter((b) => b.largeur === 1 && b.couleur === c).length >= voulues.slice(0, k + 1).filter((x) => x === c).length).length
    assert.ok(servies >= Math.min(voulues.length, seuls), `ligne ${i} : ${servies} couleurs servies`)
  }
})

test('recoloriage : avec ou sans figures, mêmes gestes, les lignes qui arrivent ont la même forme', () => {
  for (let g = 1; g <= 20; g++) {
    const sans = [...partie(g, 40, SANS_FIGURES)].map(({ apres }) => apres.aVenir.map(forme).join('|'))
    const avec = [...partie(g, 40, REGLAGES)].map(({ apres }) => apres.aVenir.map(forme).join('|'))
    assert.deepEqual(avec, sans, `graine ${g}`)
  }
})

test("recoloriage : une ligne qui a des blocs d'une case en a au moins un aux couleurs de la figure", () => {
  let lignes = 0
  let ok = 0
  for (let g = 1; g <= 20; g++) {
    for (const { apres: e, avant } of partie(g, 40, REGLAGES)) {
      const couleurs = new Set(motifFigure(avant.figure).couleurs)
      if (!e.aVenir[1].some((b) => b.largeur === 1)) continue
      lignes++
      if (e.aVenir[1].some((b) => b.largeur === 1 && couleurs.has(b.couleur))) ok++
    }
  }
  assert.ok(lignes > 100, `${lignes} lignes vues`)
  assert.equal(ok, lignes)
})

test('proposition : la palette sort de toutes les couleurs, même absentes du jeu', () => {
  // Grille de blocs larges seulement : aucun bloc d'une case, d'aucune couleur.
  const e = depuisTexte({ rangees: ['22.333..', '4444.22.'], reglages: PETITE })
  const vues = new Set()
  const hasard = alea(5)
  for (let i = 0; i < 300; i++) motifFigure(proposerFigure(e.blocs, PETITE, hasard)).couleurs.forEach((c) => vues.add(c))
  assert.equal(vues.size, REGLAGES.couleurs.length)
})

// --- Proposition : toujours une figure, construite pour être faisable ----------------

test('proposition : une figure est toujours proposée, au bon format, avec 10000 de bonus', () => {
  const largeurs = new Set()
  const couleurs = new Set()
  for (let g = 1; g <= 150; g++) {
    const e = nouvellePartie({ graine: g })
    const f = e.figure
    assert.ok(f, `graine ${g} : pas de figure`)
    assert.ok(figureValide(f, REGLAGES.figures), `graine ${g} : format`)
    assert.equal(f.depart, 10000)
    assert.equal(e.bonus, 10000)
    assert.equal(figurePresente(f, e.blocs, e.reglages.lignes, e.reglages.colonnes), false, `graine ${g} : déjà faite`)
    // Ligne du bas de 6 ou 7 cases d'affilée, aucun trou (la ligne du haut : voir BS14 plus bas).
    const bas = f.cases.filter((c) => c.ligne === 1).sort((a, b) => a.col - b.col)
    assert.deepEqual(bas.map((c) => c.col), Array.from({ length: bas.length }, (_, i) => i))
    largeurs.add(bas.length)
    couleurs.add(new Set(f.cases.map((c) => c.couleur)).size)
  }
  assert.deepEqual([...largeurs].sort(), [6, 7])
  assert.deepEqual([...couleurs].sort(), [1, 2, 3])
})

test('proposition : jamais « rien » en cours de partie, à chaque coup', () => {
  let etats = 0
  for (let g = 1; g <= 40; g++) {
    assert.ok(nouvellePartie({ graine: g }).figure)
    for (const { apres: e } of partie(g, 80, REGLAGES)) {
      assert.ok(e.figure, `graine ${g}, coup ${e.coups}`)
      assert.ok(figureValide(e.figure, REGLAGES.figures))
      assert.ok(e.bonus >= 0 && e.bonus <= 10000)
      if (e.dernierCoup.figure.issue) assert.equal(e.bonus, e.figure.depart, 'nouvelle figure, bonus neuf')
      etats++
    }
  }
  assert.ok(etats > 500)
})

test('proposition : même grille vide ou pleine, une figure vient', () => {
  const vide = proposerFigure([], REGLAGES, alea(3))
  assert.ok(figureValide(vide, REGLAGES.figures))
  const pleine = depuisTexte({ rangees: ['22222222', '44444444', '333.2222', '1111111.'], reglages: PETITE })
  assert.ok(figureValide(proposerFigure(pleine.blocs, PETITE, alea(4)), PETITE.figures))
})

test("proposition : une figure déjà dans la grille n'est jamais proposée", () => {
  // Une grille portant déjà « jaune orange rouge vert bleu bleu clair » deux fois, et des figures
  // d'une couleur : celles qui sortent évitent ce qui est déjà dans la grille.
  const e = position(['111111..', '111111..'])
  const hasard = alea(7)
  for (let i = 0; i < 300; i++) {
    const f = proposerFigure(e.blocs, PETITE, hasard)
    assert.ok(f)
    assert.equal(figurePresente(f, e.blocs, PETITE.lignes, PETITE.colonnes), false)
  }
})

// --- Tirage reproductible --------------------------------------------------------

test('tirage : même graine et mêmes gestes, mêmes figures', () => {
  const jouerTout = (g) => [...partie(g, 60, REGLAGES)].map(({ apres }) => `${resume(apres)};${JSON.stringify(apres.figure)};${apres.bonus}`)
  for (let g = 1; g <= 10; g++) assert.deepEqual(jouerTout(g), jouerTout(g), `graine ${g}`)
  assert.deepEqual(nouvellePartie({ graine: 9 }), nouvellePartie({ graine: 9 }))
  assert.notDeepEqual(nouvellePartie({ graine: 9 }).figure, nouvellePartie({ graine: 10 }).figure)
})

// --- Partie gardée ---------------------------------------------------------------

const viaTexte = (etat, reglages = etat.reglages) => importerPartie(JSON.parse(JSON.stringify(exporterPartie(etat))), reglages)

test("partie gardée : la figure et le bonus font l'aller-retour, la suite est identique", () => {
  let coups = 0
  for (let g = 1; g <= 80; g++) {
    for (const { avant, apres, id, dx } of partie(g, 60, REGLAGES)) {
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

test('partie gardée : une partie des figures de BS10 (schéma 2, petite figure à paliers) reprend avec une figure neuve', () => {
  const e = nouvellePartie({ graine: 31, reglages: SANS_FIGURES })
  const ancien = JSON.parse(JSON.stringify(exporterPartie(e)))
  ancien.schema = 2
  ancien.figures = true
  ancien.figure = { cases: [{ ligne: 0, col: 0, couleur: 'bleu' }, { ligne: 1, col: 0, couleur: 'violet' }, { ligne: 1, col: 1, couleur: 'violet' }], depart: 3000 }
  ancien.bonus = 2900
  const repris = importerPartie(ancien, REGLAGES)
  assert.ok(repris, 'relue, sans perdre la partie')
  assert.deepEqual(repris.blocs, e.blocs)
  assert.equal(repris.score, e.score)
  assert.ok(repris.figure)
  assert.ok(figureValide(repris.figure, REGLAGES.figures), "l'ancienne figure n'est pas reprise")
  assert.equal(repris.figure.depart, 10000)
  assert.equal(repris.bonus, 10000)
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
    'une seule ligne': alterer((d) => { d.figure.cases = d.figure.cases.filter((c) => c.ligne === 0) }),
    'lignes différentes': alterer((d) => { d.figure.cases = d.figure.cases.slice(0, -1) }),
    'trop étroite': alterer((d) => { d.figure.cases = d.figure.cases.filter((c) => c.col < 3) }),
    'un trou': alterer((d) => { d.figure.cases = d.figure.cases.filter((c) => c.col !== 2) }),
    'lignes décalées entre elles': alterer((d) => { for (const c of d.figure.cases) if (c.ligne === 1) c.col++ }),
    'quatre couleurs': alterer((d) => {
      const n = d.figure.cases.length / 2
      d.figure.cases.forEach((c, i) => { c.couleur = COULEURS[(i % n) % 4] })
    }),
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
  assert.equal(figurePresente(remis.figure, remis.blocs, remis.reglages.lignes, remis.reglages.colonnes), false)
  assert.equal(changerReglages(e, e.reglages), e)
})
