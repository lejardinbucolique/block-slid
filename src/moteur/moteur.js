// Moteur de Block slid : la logique du jeu, sans écran ni navigateur.
//
// L'état est un objet simple, jamais modifié en place : chaque geste rend un
// nouvel état, ou null s'il est refusé (l'ancien état reste alors valable).
//
// Lignes numérotées de haut (0) en bas (reglages.lignes - 1), colonnes de
// gauche (0) à droite. Un bloc : { id, ligne, col, largeur, couleur }. Les
// blocs des lignes à venir n'ont pas de ligne ; ils gardent leur id en montant.
//
// Un coup rend aussi, dans dernierCoup.etapes, son déroulé pour l'écran : une
// suite d'instantanés { genre, blocs, aVenir, ... }, chacun étant ce qu'on voit
// à la fin d'une étape. Le dernier est exactement l'état final. Genres :
// 'glisse' (le geste du joueur), 'complete' (lignes pleines, encore en place :
// lignes = [{ ligne, points }]), 'efface' (ces lignes ont disparu), 'chute',
// 'secours' (la copie apparaît, hors grille : copies), 'montee' et 'defaite'.
//
// Figures (BS10) : l'état porte une figure à composer et son bonus, qui baisse
// de reglages.figures.perteParCoup à chaque coup sur la grille. Quand la figure
// est dans la grille, le bonus qui reste s'ajoute au score ; quand il tombe à 0,
// elle expire ; dans les deux cas une nouvelle est proposée. Le résumé est dans
// dernierCoup.figure. Avec reglages.figures = null, rien de tout cela n'existe.
//
// BS12 : une figure est toujours proposée (figures.js), ses couleurs tirées
// librement. BS15 : ce sont les lignes qui s'adaptent à elle ; tant qu'elle est en
// cours, les lignes qui arrivent gardent leur forme, seuls leurs blocs d'une case
// sont recolorés vers ses couleurs (tirage.js). Figures et recoloriage tirent un
// hasard à part, qui n'avance pas celui des lignes : pour une même graine et les
// mêmes gestes, les lignes ont la même forme avec ou sans figures.

import { REGLAGES } from './reglages.js'
import { recolorerLigne } from './tirage.js'
import { figurePresente, proposerFigure, motifFigure, figureValide } from './figures.js'

// --- Partie --------------------------------------------------------------

export function nouvellePartie({ graine = Date.now(), reglages = REGLAGES } = {}) {
  const etat = etatVide(reglages, graine)
  // Une ligne qui monte peut faire tomber les blocs du dessus et compléter une
  // ligne effacée : on tire et monte des lignes jusqu'à en avoir exactement
  // lignesDepart occupées. Chaque montée ajoute au plus une ligne occupée et la
  // résolution n'en ajoute jamais : on s'arrête donc pile au compte.
  while (lignesOccupees(etat) < reglages.lignesDepart) {
    monterLigne(etat, tirerUneLigne(etat))
    resoudre(etat)
  }
  etat.score = 0
  etat.aVenir = [tirerUneLigne(etat), tirerUneLigne(etat)]
  nouvelleFigure(etat)
  return etat
}

function etatVide(reglages, graine) {
  return {
    reglages,
    blocs: [],
    // Les deux prochaines lignes, toutes deux déplaçables (BS17).
    aVenir: [],
    score: 0,
    coups: 0,
    finie: false,
    hasard: graine >>> 0,
    prochainId: 1,
    // La figure à composer : { cases: [{ ligne, col, couleur }], depart }, et le
    // bonus qu'elle rapporterait maintenant. Null seulement si les figures sont coupées.
    figure: null,
    bonus: 0,
    // Ce qu'a produit le dernier coup, pour l'affichage.
    dernierCoup: null,
  }
}

// --- Garder une partie ----------------------------------------------------

// Change quand la forme des données gardées change : une partie gardée avec un
// autre numéro n'est plus relue.
// Le 1 (sans figure) et le 2 (figures de BS10, petites, à paliers) se relisent :
// la partie reprend avec une figure neuve du modèle de BS12.
export const SCHEMA_PARTIE = 3

// L'état d'une partie en données simples (JSON), sans `reglages` (il contient
// une fonction) ni `dernierCoup` (utile au seul affichage du coup qui vient d'être joué).
export function exporterPartie(etat) {
  const figer = (b) => ({ id: b.id, ligne: b.ligne, col: b.col, largeur: b.largeur, couleur: b.couleur })
  const figerAVenir = (b) => ({ id: b.id, col: b.col, largeur: b.largeur, couleur: b.couleur })
  return {
    schema: SCHEMA_PARTIE,
    blocs: etat.blocs.map(figer),
    aVenir: etat.aVenir.map((l) => l.map(figerAVenir)),
    score: etat.score,
    coups: etat.coups,
    finie: etat.finie,
    hasard: etat.hasard,
    prochainId: etat.prochainId,
    figure: etat.figure && {
      cases: etat.figure.cases.map((c) => ({ ligne: c.ligne, col: c.col, couleur: c.couleur })),
      depart: etat.figure.depart,
    },
    bonus: etat.bonus,
  }
}

// Reconstruit un état jouable depuis des données exportées, ou null si elles
// sont d'une autre version, de forme invalide ou incohérentes (blocs qui
// se chevauchent, qui sortent de la grille, identifiants en double...).
export function importerPartie(donnees, reglages = REGLAGES) {
  try {
    return lirePartie(donnees, reglages)
  } catch {
    return null
  }
}

function lirePartie(d, reglages) {
  if (!d || typeof d !== 'object' || ![1, 2, SCHEMA_PARTIE].includes(d.schema)) return null
  const { lignes, colonnes } = reglages
  const entier = (n, min, max = Number.MAX_SAFE_INTEGER) => Number.isInteger(n) && n >= min && n <= max
  if (!entier(d.score, 0) || !entier(d.coups, 0) || !entier(d.hasard, 0, 0xffffffff) || !entier(d.prochainId, 1)) return null
  // Une partie gardée avant BS17 porte encore `aVenirDeplace` : le champ est ignoré.
  if (typeof d.finie !== 'boolean') return null
  if (!Array.isArray(d.blocs) || !Array.isArray(d.aVenir) || d.aVenir.length !== 2) return null

  const ids = new Set()
  const lireBloc = (b, avecLigne) => {
    if (!b || typeof b !== 'object') return null
    if (!entier(b.id, 1, d.prochainId - 1) || ids.has(b.id)) return null
    if (!entier(b.largeur, 1, colonnes) || !entier(b.col, 0, colonnes - b.largeur)) return null
    if (typeof b.couleur !== 'string' || !reglages.couleurs.includes(b.couleur)) return null
    if (avecLigne && !entier(b.ligne, 0, lignes - 1)) return null
    ids.add(b.id)
    return avecLigne
      ? { id: b.id, ligne: b.ligne, col: b.col, largeur: b.largeur, couleur: b.couleur }
      : { id: b.id, col: b.col, largeur: b.largeur, couleur: b.couleur }
  }
  // Une rangée ne doit pas avoir deux blocs sur la même case.
  const sansChevauchement = (rangee) => {
    const tries = [...rangee].sort((a, b) => a.col - b.col)
    return tries.every((b, i) => i === 0 || tries[i - 1].col + tries[i - 1].largeur <= b.col)
  }

  const blocs = d.blocs.map((b) => lireBloc(b, true))
  const aVenir = d.aVenir.map((l) => (Array.isArray(l) ? l.map((b) => lireBloc(b, false)) : [null]))
  if (blocs.includes(null) || aVenir.some((l) => l.includes(null) || l.length === 0)) return null

  for (let ligne = 0; ligne < lignes; ligne++) {
    if (!sansChevauchement(blocs.filter((b) => b.ligne === ligne))) return null
  }
  if (!aVenir.every(sansChevauchement)) return null

  // La figure gardée n'est relue que si les figures sont actives ; sinon, ou si
  // la partie n'en avait pas (autre version, figures coupées), une neuve est tirée.
  const figure = reglages.figures && d.schema === SCHEMA_PARTIE ? lireFigure(d, reglages, entier) : null
  if (figure === undefined) return null

  const e = etatVide(reglages, d.hasard)
  e.blocs = blocs
  e.aVenir = aVenir
  e.score = d.score
  e.coups = d.coups
  e.finie = d.finie
  e.prochainId = d.prochainId
  if (figure) { e.figure = figure; e.bonus = d.bonus }
  else if (reglages.figures) nouvelleFigure(e)
  return e
}

// La figure gardée : null s'il n'y en avait pas, undefined si elle est invalide.
function lireFigure(d, reglages, entier) {
  if (d.figure === null || d.figure === undefined) return null
  const f = d.figure
  if (typeof f !== 'object' || !Array.isArray(f.cases) || f.cases.length === 0) return undefined
  if (!entier(f.depart, 1) || !entier(d.bonus, 0, f.depart)) return undefined
  const { colonnes } = reglages
  const vues = new Set()
  for (const c of f.cases) {
    if (!c || typeof c !== 'object') return undefined
    if (!entier(c.ligne, 0, 1) || !entier(c.col, 0, colonnes - 1)) return undefined
    if (typeof c.couleur !== 'string' || !reglages.couleurs.includes(c.couleur)) return undefined
    const cle = `${c.ligne},${c.col}`
    if (vues.has(cle)) return undefined
    vues.add(cle)
  }
  // Ligne du bas pleine, ligne du haut posée dessus, de la bonne forme.
  const figure = { cases: f.cases.map((c) => ({ ligne: c.ligne, col: c.col, couleur: c.couleur })), depart: f.depart }
  return figureValide(figure, reglages.figures) ? figure : undefined
}

// Propose une figure (neuve) et son bonus de départ ; aucune seulement si les
// figures sont coupées.
function nouvelleFigure(etat) {
  etat.figure = etat.reglages.figures ? proposerFigure(etat.blocs, etat.reglages, hasardAPart(etat, 1)) : null
  etat.bonus = etat.figure ? etat.figure.depart : 0
}

// Applique d'autres réglages à une partie en cours, sans la perdre : couper les
// figures retire la figure et le bonus, les activer en propose une neuve.
export function changerReglages(etat, reglages) {
  if (reglages === etat.reglages) return etat
  const e = cloner(etat)
  e.reglages = reglages
  if (!reglages.figures) {
    e.figure = null
    e.bonus = 0
  } else if (!etat.reglages.figures) {
    nouvelleFigure(e)
  }
  return e
}

// --- Gestes --------------------------------------------------------------

// Le coup : glisser un bloc de la grille de dx cases (négatif vers la gauche).
// Les blocs dans le chemin sont poussés tant qu'il reste de la place au bout
// de la rangée ; sinon le geste est refusé (null).
// Défauts à confirmer en jouant : un glisser de plusieurs cases compte pour un
// seul coup, et un glisser qui ramène le bloc à sa place (dx = 0) n'en est pas un.
export function jouer(etat, id, dx) {
  if (etat.finie) return null
  const bloc = etat.blocs.find((b) => b.id === id)
  if (!bloc) return null
  if (dx === 0) return etat

  const e = cloner(etat)
  const rangee = e.blocs.filter((b) => b.ligne === bloc.ligne)
  if (!glisser(rangee, id, dx, e.reglages.colonnes)) return null

  e.coups++
  const etapes = [instantane(e, 'glisse')]
  const coup = { lignesEffacees: 0, points: 0, secours: null, defaite: false, etapes, figure: null }
  ajouter(coup, resoudre(e, etapes))

  // Secours quand la grille est presque vide (bloc 19 de l'analyse).
  // Défauts à confirmer : une ligne « restante » est une ligne qui contient au
  // moins un bloc ; une copie n'est pas un tirage, la file à venir n'avance
  // donc que d'un cran ; les copies se résolvent comme toute arrivée de ligne.
  // Chaque montée garde avec elle la file à venir qu'on voit une fois montée :
  // celle d'avant tant que c'est une copie qui monte, la suivante pour la vraie.
  const montees = []
  const vue = e.aVenir
  const restantes = new Set(e.blocs.map((b) => b.ligne))
  if (restantes.size === 1) {
    const [ligne] = restantes
    coup.secours = 'une ligne'
    montees.push(copierEtape(e, e.blocs.filter((b) => b.ligne === ligne), vue, etapes))
  } else if (restantes.size === 0) {
    coup.secours = 'aucune ligne'
    montees.push(copierEtape(e, e.aVenir[0], vue, etapes))
  }
  e.aVenir = [e.aVenir[1], tirerUneLigne(e)]
  montees.push({ ligne: vue[0], aVenir: e.aVenir })

  if (monterLignes(e, montees, coup)) ajouter(coup, resoudre(e, etapes))
  // La résolution qui suit la montée peut encore vider la grille : même
  // secours en fin de coup, répété tant qu'il reste moins de 2 lignes occupées.
  while (!e.finie && lignesOccupees(e) < 2) {
    const restes = new Set(e.blocs.map((b) => b.ligne))
    const fin = []
    if (restes.size === 1) {
      const [ligne] = restes
      coup.secours = 'une ligne'
      fin.push(copierEtape(e, e.blocs.filter((b) => b.ligne === ligne), e.aVenir, etapes))
    } else {
      coup.secours = 'aucune ligne'
      const avant = e.aVenir
      fin.push(copierEtape(e, e.aVenir[0], avant, etapes))
      e.aVenir = [e.aVenir[1], tirerUneLigne(e)]
      fin.push({ ligne: avant[0], aVenir: e.aVenir })
    }
    if (monterLignes(e, fin, coup)) ajouter(coup, resoudre(e, etapes))
  }

  coup.figure = jouerFigure(e)
  e.score += coup.points + (coup.figure?.gain ?? 0)
  e.dernierCoup = coup
  return e
}

// Fin d'un coup : le bonus perd sa part, puis on regarde si la figure est dans
// la grille. Rend le résumé { issue, gain, avant, nouvelle } : issue vaut
// 'reussie' (gain = le bonus qui restait), 'expiree' (bonus à 0, ou figure
// faite trop tard pour rapporter) ou null ; null sans figures.
function jouerFigure(e) {
  const cfg = e.reglages.figures
  if (!cfg) return null
  const avant = e.figure
  const bonusAvant = e.bonus
  let issue = null
  let gain = 0
  if (e.figure) {
    e.bonus = Math.max(0, e.bonus - cfg.perteParCoup)
    if (figurePresente(e.figure, e.blocs, e.reglages.lignes, e.reglages.colonnes)) {
      gain = e.bonus
      issue = gain > 0 ? 'reussie' : 'expiree'
    } else if (e.bonus === 0) {
      issue = 'expiree'
    }
  }
  // Une nouvelle figure quand l'ancienne est finie.
  if (issue) nouvelleFigure(e)
  return { issue, gain, avant, bonusAvant, nouvelle: e.figure }
}

// Glisser un bloc de l'une des deux lignes à venir, avant le coup sur la grille.
// Gratuit et sans limite (BS17) : ce n'est pas un coup, et il n'utilise aucun
// hasard, donc ne change rien aux lignes qui arriveront ensuite. La ligne garde
// sa disposition en montant d'une place, et la copie de secours la reprend telle quelle.
export function deplacerAVenir(etat, id, dx) {
  if (etat.finie) return null
  const rang = etat.aVenir.findIndex((l) => l.some((b) => b.id === id))
  if (rang < 0) return null
  if (dx === 0) return etat

  const e = cloner(etat)
  if (!glisser(e.aVenir[rang], id, dx, e.reglages.colonnes)) return null
  return e
}

// La rangée du bloc, de la grille ou de l'une des lignes à venir ; null si inconnu.
function rangeeDe(etat, id) {
  const bloc = etat.blocs.find((b) => b.id === id)
  if (bloc) return etat.blocs.filter((b) => b.ligne === bloc.ligne)
  return etat.aVenir.find((l) => l.some((b) => b.id === id)) ?? null
}

// --- Lecture, pour l'interface -------------------------------------------

// Jusqu'où un bloc (de la grille ou d'une ligne à venir) peut glisser,
// en poussant ses voisins : { gauche, droite } en nombre de cases.
export function deplacementsPossibles(etat, id) {
  const { colonnes } = etat.reglages
  const rangee = rangeeDe(etat, id)
  if (!rangee) return { gauche: 0, droite: 0 }
  const pas = (sens) => {
    const copie = rangee.map((b) => ({ ...b }))
    let n = 0
    while (pousserDUneCase(copie, id, sens, colonnes)) n++
    return n
  }
  return { gauche: pas(-1), droite: pas(1) }
}

// Où seraient les blocs de la rangée si on glissait le bloc de dx cases, sans
// rien jouer : { id: col } pour tous les blocs de la rangée, ou null si le
// glisser est refusé faute de place. Sert à montrer les blocs poussés pendant
// le geste. Marche pour un bloc de la grille comme de l'une des deux lignes à venir.
export function glissement(etat, id, dx) {
  const rangee = rangeeDe(etat, id)
  if (!rangee) return null
  const copie = rangee.map((b) => ({ ...b }))
  if (!glisser(copie, id, dx, etat.reglages.colonnes)) return null
  return Object.fromEntries(copie.map((b) => [b.id, b.col]))
}

export function blocEn(etat, ligne, col) {
  return etat.blocs.find((b) => b.ligne === ligne && b.col <= col && col < b.col + b.largeur) ?? null
}

// La grille case par case : l'id du bloc qui l'occupe, ou null.
export function grille(etat) {
  const { lignes, colonnes } = etat.reglages
  const g = Array.from({ length: lignes }, () => Array(colonnes).fill(null))
  for (const b of etat.blocs) {
    for (let c = b.col; c < b.col + b.largeur; c++) g[b.ligne][c] = b.id
  }
  return g
}

// --- Notation texte, pour les tests et le débogage -----------------------
// Une rangée de 8 caractères : « . » pour une case vide, et chaque bloc écrit
// par sa largeur répétée. « 22.3331. » : un bloc de 2, un trou, un de 3, un de
// 1, un trou. « 2222 » se lit donc deux blocs de 2, « 4444 » un bloc de 4.

export function versTexte(etat) {
  const { lignes, colonnes } = etat.reglages
  const rangees = Array.from({ length: lignes }, () => Array(colonnes).fill('.'))
  for (const b of etat.blocs) {
    for (let c = b.col; c < b.col + b.largeur; c++) rangees[b.ligne][c] = String(b.largeur)
  }
  return rangees.map((r) => r.join(''))
}

export function ligneVersTexte(ligne, colonnes) {
  const r = Array(colonnes).fill('.')
  for (const b of ligne) for (let c = b.col; c < b.col + b.largeur; c++) r[c] = String(b.largeur)
  return r.join('')
}

// Construit un état depuis la notation texte. Les rangées vont de haut en bas ;
// s'il en manque, la grille est complétée par des lignes vides en haut.
// `figure` (et son `bonus`, par défaut le bonus de départ) pose une figure ; sans
// elle, la position n'en a pas, même si les réglages ont les figures.
export function depuisTexte({ rangees = [], aVenir, reglages = REGLAGES, graine = 1, figure = null, bonus }) {
  const e = etatVide(reglages, graine)
  if (figure) {
    e.figure = figure
    e.bonus = bonus ?? figure.depart
  }
  const decalage = reglages.lignes - rangees.length
  if (decalage < 0) throw new Error('Trop de rangées pour la grille')
  rangees.forEach((texte, i) => {
    for (const b of lireRangee(texte, reglages)) e.blocs.push({ ...b, id: e.prochainId++, ligne: i + decalage })
  })
  e.aVenir = aVenir
    ? aVenir.map((texte) => lireRangee(texte, reglages).map((b) => ({ ...b, id: e.prochainId++ })))
    : [tirerUneLigne(e), tirerUneLigne(e)]
  return e
}

function lireRangee(texte, reglages) {
  if (texte.length !== reglages.colonnes) throw new Error(`Rangée de ${texte.length} cases : « ${texte} »`)
  const blocs = []
  let c = 0
  while (c < texte.length) {
    if (texte[c] === '.') { c++; continue }
    const largeur = Number(texte[c])
    if (!(largeur >= 1) || texte.slice(c, c + largeur) !== texte[c].repeat(largeur)) {
      throw new Error(`Bloc mal écrit en colonne ${c} : « ${texte} »`)
    }
    blocs.push({ col: c, largeur, couleur: reglages.couleurs[blocs.length % reglages.couleurs.length] })
    c += largeur
  }
  return blocs
}

// --- Règles --------------------------------------------------------------

function glisser(rangee, id, dx, colonnes) {
  const sens = Math.sign(dx)
  for (let i = 0; i < Math.abs(dx); i++) {
    if (!pousserDUneCase(rangee, id, sens, colonnes)) return false
  }
  return true
}

// Pousse le bloc d'une case et, avec lui, la suite des blocs collés devant
// lui, si la case au bout de cette suite est libre. Modifie la rangée.
function pousserDUneCase(rangee, id, sens, colonnes) {
  const tries = [...rangee].sort((a, b) => a.col - b.col)
  let i = tries.findIndex((b) => b.id === id)
  const chaine = [tries[i]]
  for (;;) {
    const bout = chaine[chaine.length - 1]
    const suivant = tries[i + sens]
    const colle = suivant && (sens > 0 ? suivant.col === bout.col + bout.largeur : suivant.col + suivant.largeur === bout.col)
    if (!colle) break
    chaine.push(suivant)
    i += sens
  }
  const bout = chaine[chaine.length - 1]
  const caseLibre = sens > 0 ? bout.col + bout.largeur : bout.col - 1
  if (caseLibre < 0 || caseLibre >= colonnes) return false
  for (const b of chaine) b.col += sens
  return true
}

// Gravité puis effacement des lignes pleines, répétés tant que quelque chose
// bouge ou disparaît. Les points montent avec le rang de chaque ligne effacée
// dans cette résolution.
// Si `etapes` est donné, y note chaque temps : chute, lignes complétées, lignes
// effacées. Les lignes d'une même vague comptent de bas en haut.
function resoudre(etat, etapes = null) {
  const bilan = { lignesEffacees: 0, points: 0 }
  for (;;) {
    const tombe = appliquerGravite(etat)
    if (tombe) etapes?.push(instantane(etat, 'chute'))
    const pleines = lignesPleines(etat)
    if (pleines.length) {
      const lignes = pleines.map((ligne) => {
        bilan.lignesEffacees++
        const points = etat.reglages.pointsLigne(bilan.lignesEffacees, etat.reglages)
        bilan.points += points
        return { ligne, points }
      })
      etapes?.push(instantane(etat, 'complete', { lignes }))
      etat.blocs = etat.blocs.filter((b) => !pleines.includes(b.ligne))
      etapes?.push(instantane(etat, 'efface', { lignes }))
    }
    if (!tombe && pleines.length === 0) return bilan
  }
}

// Un bloc tombe seulement si toute la place sous lui est vide, sur toute sa
// largeur : une seule case appuyée suffit à le retenir. Les blocs sont posés de
// bas en haut, chacun aussi bas qu'il peut descendre : le résultat est celui d'une
// chute pas à pas.
function appliquerGravite(etat) {
  const { lignes, colonnes } = etat.reglages
  const occupe = new Uint8Array(lignes * colonnes)
  let bouge = false
  for (const b of [...etat.blocs].sort((x, y) => y.ligne - x.ligne)) {
    let ligne = b.ligne
    while (ligne < lignes - 1) {
      let libre = true
      for (let c = b.col; c < b.col + b.largeur; c++) if (occupe[(ligne + 1) * colonnes + c]) { libre = false; break }
      if (!libre) break
      ligne++
    }
    if (ligne !== b.ligne) { b.ligne = ligne; bouge = true }
    for (let c = b.col; c < b.col + b.largeur; c++) occupe[ligne * colonnes + c] = 1
  }
  return bouge
}

// Les lignes pleines, de bas en haut.
function lignesPleines(etat) {
  const remplies = new Map()
  for (const b of etat.blocs) remplies.set(b.ligne, (remplies.get(b.ligne) ?? 0) + b.largeur)
  return [...remplies]
    .filter(([, n]) => n === etat.reglages.colonnes)
    .map(([l]) => l)
    .sort((a, b) => b - a)
}

// Fait monter les lignes une à une, chacune notée comme une étape. Chaque
// élément : { ligne, aVenir } avec la file à venir visible une fois montée.
// Faux si l'une ne passe pas : la partie est perdue.
function monterLignes(etat, montees, coup) {
  for (const { ligne, aVenir } of montees) {
    if (!monterLigne(etat, ligne)) {
      etat.finie = true
      coup.defaite = true
      coup.etapes.push(instantane(etat, 'defaite'))
      return false
    }
    coup.etapes.push(instantane(etat, 'montee', { aVenir }))
  }
  return true
}

// Fait apparaître la copie de secours hors de la grille, et rend la montée qui
// l'attend. `vue` est la file à venir qu'on voit à ce moment-là.
function copierEtape(etat, blocs, vue, etapes) {
  const copies = copier(etat, blocs)
  etapes.push(instantane(etat, 'secours', { aVenir: vue, copies }))
  return { ligne: copies, aVenir: vue }
}

// Ce qu'on voit à la fin d'une étape : copie des blocs, que la suite ne touche pas.
function instantane(etat, genre, { aVenir = etat.aVenir, ...reste } = {}) {
  const figer = (b) => ({ ...b })
  return {
    genre,
    blocs: etat.blocs.map(figer),
    aVenir: aVenir.map((l) => l.map(figer)),
    ...(reste.copies && { copies: reste.copies.map(figer) }),
    ...(reste.lignes && { lignes: reste.lignes }),
  }
}

// Fait monter une ligne par le bas. Refuse (false) si un bloc occupe la ligne
// du haut : il serait poussé hors de la grille, la partie est perdue.
function monterLigne(etat, ligne) {
  if (etat.blocs.some((b) => b.ligne === 0)) return false
  for (const b of etat.blocs) b.ligne--
  for (const b of ligne) etat.blocs.push({ ...b, ligne: etat.reglages.lignes - 1 })
  return true
}

function lignesOccupees(etat) {
  return new Set(etat.blocs.map((b) => b.ligne)).size
}

function copier(etat, blocs) {
  return blocs.map(({ col, largeur, couleur }) => ({ id: etat.prochainId++, col, largeur, couleur }))
}

function tirerUneLigne(etat) {
  const { reglages } = etat
  let ligne = reglages.tirage(() => aleatoire(etat), reglages)
  const voulues = couleursVoulues(etat)
  if (voulues) ligne = recolorerLigne(ligne, voulues.liste, voulues.hasard)
  let fin = 0
  for (const b of [...ligne].sort((x, y) => x.col - y.col)) {
    if (b.col < fin || b.largeur < 1 || b.col + b.largeur > reglages.colonnes) {
      throw new Error('Le tirage a rendu une ligne invalide')
    }
    fin = b.col + b.largeur
  }
  return ligne.map(({ col, largeur, couleur }) => ({ id: etat.prochainId++, col, largeur, couleur }))
}

// Les couleurs vers lesquelles recolorer les blocs d'une case de la prochaine
// ligne (BS15) : 1 bloc ou plus (reglages.figures.recolores), de celles dont il
// manque le plus (blocs d'une case de la couleur, grille et lignes à venir,
// contre ce que demandent les cases des deux lignes de la figure). Null sans
// figure. Rend aussi le hasard à part qui sert au recoloriage.
function couleursVoulues(etat) {
  const cfg = etat.reglages.figures
  const motif = cfg && etat.figure && motifFigure(etat.figure)
  if (!motif) return null
  const manque = new Map()
  for (const couleur of motif.couleurs) manque.set(couleur, (manque.get(couleur) ?? 0) + 1)
  const compter = (b) => { if (b.largeur === 1 && manque.has(b.couleur)) manque.set(b.couleur, manque.get(b.couleur) - 1) }
  etat.blocs.forEach(compter)
  etat.aVenir.forEach((l) => l.forEach(compter))
  const hasard = hasardAPart(etat, 2)
  const n = cfg.recolores.blocs + (hasard() < cfg.recolores.chancePlus ? 1 : 0)
  const liste = []
  for (let i = 0; i < n; i++) {
    let meilleure = null
    for (const [couleur, reste] of manque) if (meilleure === null || reste > manque.get(meilleure)) meilleure = couleur
    liste.push(meilleure)
    manque.set(meilleure, manque.get(meilleure) - 1)
  }
  return { liste, hasard }
}

// Un hasard à part (BS15), tiré de l'état sans l'avancer : reproductible, il
// laisse au hasard de la partie exactement les tirages d'avant les figures.
function hasardAPart(etat, sel) {
  let s = (Math.imul(etat.hasard ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(etat.prochainId + sel * 0x10001, 0xc2b2ae35)) >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), s | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Générateur reproductible (mulberry32) : sa graine vit dans l'état, qui reste
// ainsi un objet simple qu'on peut enregistrer et rejouer.
function aleatoire(etat) {
  let t = (etat.hasard = (etat.hasard + 0x6d2b79f5) >>> 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function cloner(etat) {
  return {
    ...etat,
    blocs: etat.blocs.map((b) => ({ ...b })),
    aVenir: etat.aVenir.map((l) => l.map((b) => ({ ...b }))),
  }
}

function ajouter(coup, bilan) {
  coup.lignesEffacees += bilan.lignesEffacees
  coup.points += bilan.points
}
