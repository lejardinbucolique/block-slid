import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { partie, resume, empreinte, SANS_FIGURES } from './partie-type.js'
import assert from 'node:assert/strict'
import {
  REGLAGES,
  nouvellePartie as nouvelle,
  jouer,
  deplacerAVenir,
  deplacementsPossibles,
  glissement,
  blocEn,
  versTexte,
  ligneVersTexte,
  depuisTexte,
} from '../src/moteur/index.js'

// Petite grille de 6 lignes, et un tirage fixe pour des positions prévisibles.
const LIGNE_TIREE = '333.333.'
function tirageFixe(aleatoire, reglages) {
  return depuisTexte({ rangees: [LIGNE_TIREE], aVenir: [], reglages: { ...reglages, tirage: () => [] } }).blocs
    .map(({ col, largeur, couleur }) => ({ col, largeur, couleur }))
}
const PETITE = { ...REGLAGES, lignes: 6, tirage: tirageFixe, figures: null }
// Ces tests éprouvent les règles d'avant les figures (BS10) : elles sont coupées.
const nouvellePartie = (options = {}) => nouvelle({ reglages: SANS_FIGURES, ...options })

function position(rangees, aVenir = [LIGNE_TIREE, '1.1.1.1.'], reglages = PETITE) {
  return depuisTexte({ rangees, aVenir, reglages })
}

function idEn(etat, ligne, col) {
  return blocEn(etat, ligne, col).id
}

test('pousser un bloc pousse aussi ceux du chemin quand il reste de la place au bout', () => {
  const e = position(['1122....', '4444.22.'])
  const apres = jouer(e, idEn(e, 4, 0), 1)
  assert.deepEqual(versTexte(apres), [
    '........',
    '........',
    '........',
    '.1122...',
    '4444.22.',
    LIGNE_TIREE,
  ])
  assert.equal(apres.coups, 1)
  assert.equal(ligneVersTexte(apres.aVenir[0], 8), '1.1.1.1.')
})

test('une poussée sans place au bout est refusée', () => {
  const e = position(['1122....', '4444.22.'])
  assert.equal(jouer(e, idEn(e, 4, 2), -1), null)
  const f = position(['.1122...', '4444.22.'])
  assert.deepEqual(deplacementsPossibles(f, idEn(f, 4, 1)), { gauche: 1, droite: 3 })
  assert.equal(jouer(f, idEn(f, 4, 1), 4), null)
  assert.notEqual(jouer(f, idEn(f, 4, 1), 3), null)
})

test('un glisser nul ne compte pas comme un coup', () => {
  const e = position(['1122....', '4444.22.'])
  assert.equal(jouer(e, idEn(e, 4, 0), 0), e)
})

test('un bloc retenu par une seule case reste en place', () => {
  const e = position(['22......', '1.......', '4444.22.'])
  const apres = jouer(e, idEn(e, 4, 0), 1)
  assert.deepEqual(versTexte(apres).slice(2), ['22......', '.1......', '4444.22.', LIGNE_TIREE])
})

test('un bloc qui perd tout appui tombe', () => {
  const e = position(['22......', '1.......', '4444.22.'])
  const apres = jouer(e, idEn(e, 4, 0), 2)
  assert.deepEqual(versTexte(apres).slice(2), ['........', '221.....', '4444.22.', LIGNE_TIREE])
})

test("un bloc tombe à l'arrivée d'une ligne et provoque un effacement", () => {
  const e = position(['4444....', '4444....', '4444.1..'], ['11111.11', LIGNE_TIREE])
  const apres = jouer(e, idEn(e, 3, 0), 1)
  assert.deepEqual(versTexte(apres), [
    '........',
    '........',
    '........',
    '.4444...',
    '4444....',
    '4444....',
  ])
  assert.equal(apres.score, 10)
  assert.equal(apres.dernierCoup.lignesEffacees, 1)
})

test('lignes effacées en chaîne : bonus, puis secours sur grille vide', () => {
  const e = position(['..1.1...', '221.4444', '1111.111'], [LIGNE_TIREE, '1.1.1.1.'])
  const apres = jouer(e, idEn(e, 3, 2), 1)
  assert.equal(apres.dernierCoup.lignesEffacees, 2)
  assert.equal(apres.score, 10 + 20)
  assert.equal(apres.dernierCoup.secours, 'aucune ligne')
  // La ligne à venir est recopiée, et les deux montent.
  assert.deepEqual(versTexte(apres).slice(3), ['........', LIGNE_TIREE, LIGNE_TIREE])
  // Une copie n'est pas un tirage : la file n'avance que d'un cran.
  assert.equal(ligneVersTexte(apres.aVenir[0], 8), '1.1.1.1.')
  const ids = apres.blocs.map((b) => b.id)
  assert.equal(new Set(ids).size, ids.length)
})

test("secours : une seule ligne restante est recopiée avant l'arrivée", () => {
  const e = position(['1.......', '4444.22.'])
  const apres = jouer(e, idEn(e, 4, 0), 4)
  assert.equal(apres.dernierCoup.secours, 'une ligne')
  assert.deepEqual(versTexte(apres).slice(3), ['4444122.', '4444122.', LIGNE_TIREE])
  assert.equal(ligneVersTexte(apres.aVenir[0], 8), '1.1.1.1.')
})

test('défaite quand une ligne monte sous un bloc de la ligne du haut', () => {
  const e = position(Array(6).fill('22......'))
  const apres = jouer(e, idEn(e, 0, 0), 1)
  assert.equal(apres.finie, true)
  assert.equal(apres.dernierCoup.defaite, true)
  assert.equal(jouer(apres, apres.blocs[0].id, 1), null)
})

test("un bloc peut occuper la ligne du haut sans faire perdre tant qu'aucune ligne ne monte dessous", () => {
  const e = position(['1.......', ...Array(5).fill('22......')])
  assert.equal(e.finie, false)
  assert.notEqual(deplacementsPossibles(e, idEn(e, 0, 0)).droite, 0)
})

const aVenirTexte = (e) => e.aVenir.map((l) => ligneVersTexte(l, 8))

test('lignes à venir : déplacements libres et sans limite, sur les deux lignes, sans compter comme un coup', () => {
  const e = position(['1122....', '4444.22.'], ['333.333.', '1.1.1.1.'])

  // Première ligne, plusieurs fois de suite.
  let a = deplacerAVenir(e, e.aVenir[0][0].id, 1)
  assert.deepEqual(aVenirTexte(a), ['.333333.', '1.1.1.1.'])
  a = deplacerAVenir(a, a.aVenir[0][1].id, -1)
  assert.deepEqual(aVenirTexte(a), ['333333..', '1.1.1.1.'])
  a = deplacerAVenir(a, a.aVenir[0][0].id, 1)
  assert.deepEqual(aVenirTexte(a), ['.333333.', '1.1.1.1.'])

  // Deuxième ligne : un bloc pousse ses voisins, sur plusieurs cases d'un geste.
  a = deplacerAVenir(a, a.aVenir[1][0].id, 2)
  assert.deepEqual(aVenirTexte(a), ['.333333.', '..111.1.'])
  a = deplacerAVenir(a, a.aVenir[1][3].id, -1)
  assert.deepEqual(aVenirTexte(a), ['.333333.', '..1111..'])

  // Rien n'est compté, ni la grille ni le score ni le bonus ne bougent.
  assert.equal(a.coups, 0)
  assert.equal(a.score, e.score)
  assert.equal(a.bonus, e.bonus)
  assert.deepEqual(versTexte(a), versTexte(e))
  assert.equal(a.hasard, e.hasard)
  assert.equal(a.prochainId, e.prochainId)
  assert.equal('aVenirDeplace' in a, false)
})

test('lignes à venir : refus sans place, bloc inconnu, partie finie ; dx = 0 ne change rien', () => {
  const e = position(['1122....', '4444.22.'], ['333333..', '11111111'])
  assert.equal(deplacerAVenir(e, e.aVenir[1][0].id, 1), null, 'ligne pleine')
  assert.equal(deplacerAVenir(e, e.aVenir[0][0].id, -1), null, 'contre le bord')
  assert.equal(deplacerAVenir(e, e.aVenir[0][0].id, 3), null, 'trop loin')
  assert.notEqual(deplacerAVenir(e, e.aVenir[0][0].id, 1), null)
  assert.equal(deplacerAVenir(e, 9999, 1), null)
  assert.equal(deplacerAVenir(e, idEn(e, 4, 0), 1), null, 'un bloc de la grille se joue avec jouer')
  assert.equal(deplacerAVenir(e, e.aVenir[1][2].id, 0), e)
  assert.equal(deplacerAVenir({ ...e, finie: true }, e.aVenir[0][0].id, 1), null)
})

test('lignes à venir : lecture des déplacements possibles et du glissement pour les deux lignes', () => {
  const e = position(['1122....', '4444.22.'], ['333.333.', '1.1.1.1.'])
  const premiere = e.aVenir[0]
  const seconde = e.aVenir[1]
  assert.deepEqual(deplacementsPossibles(e, premiere[0].id), { gauche: 0, droite: 2 })
  assert.deepEqual(deplacementsPossibles(e, premiere[1].id), { gauche: 1, droite: 1 })
  assert.deepEqual(deplacementsPossibles(e, seconde[0].id), { gauche: 0, droite: 4 })
  assert.deepEqual(deplacementsPossibles(e, seconde[3].id), { gauche: 3, droite: 1 })

  const g = glissement(e, seconde[0].id, 2)
  assert.deepEqual(g, { [seconde[0].id]: 2, [seconde[1].id]: 3, [seconde[2].id]: 4, [seconde[3].id]: 6 })
  assert.equal(glissement(e, seconde[0].id, -1), null)
  assert.equal(glissement(e, premiere[0].id, 3), null)
  // Lecture seule : l'état n'a pas bougé.
  assert.deepEqual(aVenirTexte(e), ['333.333.', '1.1.1.1.'])
})

test("lignes à venir : la deuxième ligne arrangée garde sa disposition en montant en première place", () => {
  const e = position(['1122....', '4444.22.'], ['333.333.', '1.1.1.1.'])
  let a = deplacerAVenir(e, e.aVenir[1][0].id, 2)
  a = deplacerAVenir(a, a.aVenir[1][3].id, -1)
  assert.deepEqual(aVenirTexte(a), ['333.333.', '..1111..'])
  const ids = a.aVenir[1].map((b) => b.id)

  const apres = jouer(a, idEn(a, 4, 0), 1)
  assert.equal(apres.coups, 1)
  assert.equal(ligneVersTexte(apres.aVenir[0], 8), '..1111..', 'passe en première place telle qu\'arrangée')
  assert.deepEqual(apres.aVenir[0].map((b) => b.id), ids, 'les mêmes blocs')
  assert.equal(versTexte(apres)[5], '333.333.', 'la première ligne arrangée est montée dans la grille')
  // Et elle se déplace encore, comme toute première ligne.
  assert.notEqual(deplacerAVenir(apres, apres.aVenir[0][0].id, 1), null)
})

test('lignes à venir : la copie de secours reprend la ligne telle qu\'elle est arrangée', () => {
  const e = position(['1.......', '4444.22.'], ['333.333.', '1.1.1.1.'])
  const arrange = deplacerAVenir(e, e.aVenir[0][0].id, 1)
  assert.equal(ligneVersTexte(arrange.aVenir[0], 8), '.333333.')
  const apres = jouer(arrange, idEn(arrange, 4, 0), 4)
  assert.equal(apres.dernierCoup.secours, 'une ligne')
  assert.equal(ligneVersTexte(apres.aVenir[0], 8), '1.1.1.1.')

  // Grille vidée : la copie est celle de la première ligne à venir, arrangée.
  const vide = position(['..1.1...', '221.4444', '1111.111'], ['333.333.', '1.1.1.1.'])
  const arrange2 = deplacerAVenir(vide, vide.aVenir[0][0].id, 1)
  assert.equal(ligneVersTexte(arrange2.aVenir[0], 8), '.333333.')
  const fini = jouer(arrange2, idEn(arrange2, 3, 2), 1)
  assert.equal(fini.dernierCoup.secours, 'aucune ligne')
  assert.deepEqual(versTexte(fini).slice(3), ['........', '.333333.', '.333333.'])
})

// BS17 : déplacer des blocs n'utilise aucun hasard, donc les lignes qui arrivent
// ne dépendent pas de la façon dont les lignes à venir ont été arrangées.
test('lignes à venir : arrangées ou non, les lignes qui arrivent sont les mêmes (même graine, mêmes coups)', () => {
  let comparees = 0
  for (const reglages of [SANS_FIGURES, REGLAGES]) {
    for (let graine = 1; graine <= 60; graine++) {
      let libre = nouvelle({ graine, reglages })
      let n = 0
      for (let tour = 0; tour < 25 && !libre.finie; tour++) {
        // Chaque tour repart du même état : on arrange au hasard, de façon
        // reproductible, plusieurs fois les deux lignes de la copie.
        let arrange = libre
        for (let k = 0; k < 6; k++) {
          const rang = (graine + tour + k) % 2
          const ligne = arrange.aVenir[rang]
          const b = ligne[(graine * 3 + tour + k) % ligne.length]
          const p = deplacementsPossibles(arrange, b.id)
          const dx = (tour + k) % 2 ? p.droite : -p.gauche
          const suivant = dx ? deplacerAVenir(arrange, b.id, dx) : null
          if (suivant) { arrange = suivant; n++ }
        }
        // Arranger n'utilise aucun hasard et ne touche à rien d'autre que les deux lignes.
        assert.equal(arrange.hasard, libre.hasard, `graine ${graine}, tour ${tour}`)
        assert.equal(arrange.prochainId, libre.prochainId)
        assert.equal(arrange.coups, libre.coups)
        assert.equal(arrange.score, libre.score)
        assert.equal(arrange.bonus, libre.bonus)
        assert.deepEqual(versTexte(arrange), versTexte(libre))
        // Le coup sur la grille est le même (la grille n'a pas été touchée).
        const coup = libre.blocs
          .map((b) => ({ b, p: deplacementsPossibles(libre, b.id) }))
          .find(({ p }) => p.gauche || p.droite)
        if (!coup) break
        const dx = coup.p.droite ? 1 : -1
        const suite = jouer(libre, coup.b.id, dx)
        arrange = jouer(arrange, coup.b.id, dx)
        libre = suite
        assert.ok(libre && arrange)
        // Les formes de la ligne montée sont celles d'avant : seule sa disposition change.
        const formes = (l) => l.map((b) => b.largeur).sort().join()
        assert.equal(formes(arrange.aVenir[0]), formes(libre.aVenir[0]))
        // Grille et lignes montées diffèrent (une ligne arrangée peut en effacer une autre,
        // ou non), mais tant qu'aucun secours ne tire de ligne en plus, le coup tire une
        // seule ligne, strictement la même.
        if (arrange.dernierCoup.secours === null && libre.dernierCoup.secours === null) {
          assert.deepEqual(arrange.aVenir[1], libre.aVenir[1], `graine ${graine}, tour ${tour}`)
          assert.equal(arrange.hasard, libre.hasard)
          assert.equal(arrange.prochainId, libre.prochainId)
          comparees++
        }
      }
      assert.ok(n > 0 || libre.finie, `graine ${graine} : aucun arrangement éprouvé`)
    }
  }
  assert.ok(comparees > 1000, `seulement ${comparees} tirages comparés`)
})

test("position de la capture d'origine : stable, et le coup se joue sans rien faire tomber", () => {
  const reglages = { ...PETITE, lignes: 10 }
  const capture = [
    '........',
    '.14444..',
    '222222..',
    '.4444122',
    '.1.22333',
    '.444422.',
    '.444422.',
    '...22333',
    '...33322',
    '.22..22.',
  ]
  const e = position(capture, ['2222333.', LIGNE_TIREE], reglages)
  const apres = jouer(e, idEn(e, 1, 1), -1)
  assert.deepEqual(versTexte(apres), [
    '1.4444..',
    ...capture.slice(2),
    '2222333.',
  ])
  assert.equal(apres.score, 0)
})

test('une partie neuve : lignes de départ, deux lignes à venir, reproductible', () => {
  const a = nouvellePartie({ graine: 42 })
  const b = nouvellePartie({ graine: 42 })
  assert.deepEqual(a, b)
  assert.equal(a.score, 0)
  assert.equal(a.aVenir.length, 2)
  const lignesOccupees = new Set(a.blocs.map((b) => b.ligne))
  assert.ok(lignesOccupees.size >= 1 && lignesOccupees.size <= REGLAGES.lignesDepart)
  assert.ok([...lignesOccupees].every((l) => l >= REGLAGES.lignes - REGLAGES.lignesDepart))
})

test('le tirage suit les bornes du jeu d’origine', () => {
  let etat = nouvellePartie({ graine: 7 })
  for (let i = 0; i < 300; i++) {
    const ligne = etat.aVenir[0]
    const occupees = ligne.reduce((s, b) => s + b.largeur, 0)
    assert.ok(ligne.length >= 2 && ligne.length <= 4)
    assert.ok(ligne.every((b) => b.largeur >= 1 && b.largeur <= 4))
    assert.ok(occupees >= 8 - 6 && occupees < 8, 'jamais de ligne pleine')
    const trous = ligneVersTexte(ligne, 8).match(/\.+/g)
    assert.ok(trous.length >= 1 && trous.length <= 3)
    etat = { ...etat, aVenir: [etat.aVenir[1], ...nouvellePartie({ graine: i + 100 }).aVenir] }
  }
})

test("une partie jouée au hasard ne casse pas l'état", () => {
  let etat = nouvellePartie({ graine: 3 })
  for (let n = 0; n < 2000 && !etat.finie; n++) {
    const bloc = etat.blocs[n % etat.blocs.length]
    const { gauche, droite } = deplacementsPossibles(etat, bloc.id)
    const dx = droite > 0 ? droite : -gauche
    if (dx === 0) continue
    etat = jouer(etat, bloc.id, dx)
    for (const b of etat.blocs) {
      assert.ok(b.ligne >= 0 && b.ligne < REGLAGES.lignes && b.col >= 0 && b.col + b.largeur <= 8)
    }
  }
})

test('glissement montre les blocs poussés sans rien jouer, ou refuse faute de place', () => {
  const e = position(['1122....', '4444.22.'])
  const avant = versTexte(e)
  const a = idEn(e, 4, 0)
  const b = idEn(e, 4, 1)
  const c = idEn(e, 4, 3)
  assert.deepEqual(glissement(e, a, 1), { [a]: 1, [b]: 2, [c]: 3 })
  assert.deepEqual(glissement(e, a, 4), { [a]: 4, [b]: 5, [c]: 6 })
  assert.equal(glissement(e, a, 5), null, 'pas assez de place au bout')
  assert.equal(glissement(e, a, -1), null, 'contre le bord')
  assert.ok(glissement(e, e.aVenir[0][0].id, 1), 'un bloc de la ligne à venir glisse aussi')
  assert.equal(glissement(e, 9999, 1), null)
  assert.deepEqual(versTexte(e), avant, "l'état n'est pas modifié")
})

// --- BS4 : départ à 3 lignes, et jamais de grille vide sans issue ----------

const occupees = (etat) => new Set(etat.blocs.map((b) => b.ligne)).size

function coupsPossibles(etat) {
  const coups = []
  for (const b of etat.blocs) {
    const { gauche, droite } = deplacementsPossibles(etat, b.id)
    for (let d = 1; d <= gauche; d++) coups.push([b.id, -d])
    for (let d = 1; d <= droite; d++) coups.push([b.id, d])
  }
  return coups
}

function hasard(graine) {
  let s = graine >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

const hauteur = (etat) => Math.min(...etat.blocs.map((b) => b.ligne), etat.reglages.lignes)

test('le départ a toujours exactement 3 lignes occupées', () => {
  for (let g = 1; g <= 2000; g++) assert.equal(occupees(nouvellePartie({ graine: g })), 3, `graine ${g}`)
})

test('même graine, même départ', () => {
  for (const g of [1, 42, 7919]) {
    const a = nouvellePartie({ graine: g })
    const b = nouvellePartie({ graine: g })
    assert.deepEqual(versTexte(a), versTexte(b))
    assert.deepEqual(a.aVenir, b.aVenir)
  }
})

test('secours en fin de coup quand la montée vide la grille', () => {
  const e = position(['11......', '1.......'], ['.1111111', '1.1.1.1.'])
  const f = jouer(e, idEn(e, 4, 1), 1)
  assert.equal(f.finie, false)
  assert.equal(occupees(f), 2)
  assert.ok(coupsPossibles(f).length > 0)
})

test('invariant : après tout coup, au moins 2 lignes et un coup possible', () => {
  const choix = {
    hasard: (etat, coups, r) => coups[Math.floor(r() * coups.length)],
    plusBasse: (etat, coups) => {
      let meilleur = null, h = -Infinity
      for (const c of coups) {
        const s = jouer(etat, ...c)
        const hs = s.finie ? -2 : hauteur(s)
        if (hs > h) { h = hs; meilleur = c }
      }
      return meilleur
    },
  }
  for (const [nom, choisir] of Object.entries(choix)) {
    const parties = nom === 'hasard' ? 300 : 40
    for (let g = 1; g <= parties; g++) {
      const r = hasard(g)
      let e = nouvellePartie({ graine: g * 31 })
      for (let n = 0; n < 400 && !e.finie; n++) {
        const coups = coupsPossibles(e)
        assert.ok(coups.length > 0, `${nom} graine ${g} coup ${n} : aucun coup`)
        e = jouer(e, ...choisir(e, coups, r))
        if (!e.finie) assert.ok(occupees(e) >= 2, `${nom} graine ${g} coup ${n} : ${occupees(e)} ligne(s)`)
      }
    }
  }
})

// --- Étapes d'un coup (BS5) ------------------------------------------------

const kinds = (e) => e.dernierCoup.etapes.map((s) => s.genre)

test('étapes : glisse, ligne complétée, effacée, chute, montée dans cet ordre', () => {
  const e = position(['..1.1...', '221.4444', '1111.111'], [LIGNE_TIREE, '1.1.1.1.'])
  const apres = jouer(e, idEn(e, 3, 2), 1)
  assert.deepEqual(kinds(apres), [
    'glisse', 'chute', 'complete', 'efface', 'chute', 'complete', 'efface', 'secours', 'montee', 'montee',
  ])
  const [, , complete1, efface1, , complete2] = apres.dernierCoup.etapes
  assert.deepEqual(complete1.lignes, [{ ligne: 4, points: 10 }])
  assert.deepEqual(complete2.lignes, [{ ligne: 5, points: 20 }])
  // Ligne complétée : encore en place ; effacée : ses blocs ont disparu.
  assert.equal(complete1.blocs.filter((b) => b.ligne === 4).length > 0, true)
  assert.equal(efface1.blocs.filter((b) => b.ligne === 4).length, 0)
  // La copie de secours apparaît hors de la grille, avant de monter.
  const secours = apres.dernierCoup.etapes.find((s) => s.genre === 'secours')
  assert.equal(secours.copies.length, 2)
  assert.equal(secours.blocs.length, 0)
})

test("étapes : la défaite est la dernière étape", () => {
  const e = position(Array(6).fill('22......'))
  const apres = jouer(e, idEn(e, 0, 0), 1)
  assert.equal(kinds(apres).at(-1), 'defaite')
})

test("étapes : le dernier instantané est l'état final", () => {
  for (let g = 1; g <= 150; g++) {
    for (const { apres } of partie(g)) {
      const dernier = apres.dernierCoup.etapes.at(-1)
      assert.deepEqual(dernier.blocs, apres.blocs, `graine ${g} coup ${apres.coups}`)
      assert.deepEqual(dernier.aVenir, apres.aVenir, `graine ${g} coup ${apres.coups}`)
      assert.equal(apres.dernierCoup.etapes[0].genre, 'glisse')
      const points = apres.dernierCoup.etapes
        .filter((s) => s.genre === 'complete')
        .reduce((n, s) => n + s.lignes.reduce((m, l) => m + l.points, 0), 0)
      assert.equal(points, apres.dernierCoup.points)
    }
  }
})

test("étapes : rien ne change aux parties (même état, même score qu'avant)", () => {
  const reference = JSON.parse(readFileSync(new URL('./reference-parties.json', import.meta.url), 'utf8'))
  for (let g = 1; g <= 300; g++) {
    let t = ''
    for (const { apres } of partie(g)) t += resume(apres) + '\n'
    assert.equal(empreinte(t), reference[g], `graine ${g}`)
  }
})

test('tirage : des milliers de lignes saines avec les proportions du jeu', () => {
  const vues = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for (let g = 1; g <= 10; g++) {
    const alea = hasard(g * 977)
    for (let n = 0; n < 1000; n++) {
      const ligne = REGLAGES.tirage(alea, REGLAGES)
      const cases = ligne.reduce((s, b) => s + b.largeur, 0)
      const fin = Math.max(...ligne.map((b) => b.col + b.largeur))
      assert.ok(fin <= REGLAGES.colonnes, `graine ${g} ligne ${n} : déborde`)
      assert.ok(cases < REGLAGES.colonnes, `graine ${g} ligne ${n} : pleine`)
      for (let i = 1; i < ligne.length; i++) {
        assert.ok(ligne[i].col >= ligne[i - 1].col + ligne[i - 1].largeur, 'chevauchement')
        if (ligne[i].col === ligne[i - 1].col + ligne[i - 1].largeur)
          assert.notEqual(ligne[i].couleur, ligne[i - 1].couleur, 'même couleur collée')
      }
      for (const b of ligne) vues[b.largeur]++
    }
  }
  // Les tailles suivent à peu près les poids (marge large : la contrainte des
  // 8 colonnes déforme la distribution).
  const total = Object.values(vues).reduce((s, v) => s + v, 0)
  const poids = REGLAGES.proportions.largeurBloc
  const somme = Object.values(poids).reduce((s, v) => s + v, 0)
  for (const l of [1, 2, 3, 4]) {
    const attendu = poids[l] / somme
    assert.ok(Math.abs(vues[l] / total - attendu) < 0.15, `largeur ${l} : ${(vues[l] / total).toFixed(2)} pour ${attendu.toFixed(2)}`)
  }
})
