// Tirage garanti de block-pose (BS41) : jamais de pièces qu'on ne peut pas poser
// quoi qu'on fasse. On ne perd que par une mauvaise pose, jamais par un mauvais tirage.
//
// Garantie. À chaque tirage, il existe au moins une suite de poses qui place toutes
// les pièces du tour (dans n'importe quel ordre, les lignes et colonnes pleines
// effacées entre deux poses libérant de la place). L'aperçu est couvert aussi : le
// tour qui commence a ses trois pièces en main, on tire les trois suivantes, et il
// existe une suite de poses qui place les trois en main PUIS les trois suivantes.
// Si le joueur joue autrement que cette suite, il peut se mettre dans l'impasse :
// c'est sa pose, pas le tirage.
//
// Méthode : construire plutôt que chercher. Les pièces sont tirées au hasard selon la
// table de poids du niveau (niveaux.js), et chacune est posée tout de suite, sur une
// copie de la grille, à une place où elle tient, lignes pleines effacées. Cette suite
// de poses est le témoin : les pièces tirées sont posables par construction.
//   - Une pièce tirée qui ne tient nulle part sur la copie est remplacée par une pièce
//     qui tient (tirée selon les mêmes poids, restreints à celles qui tiennent).
//   - Le bloc de 1 case tient toujours : la copie n'est jamais pleine (une grille
//     pleine se vide d'un coup), si bien que la construction n'échoue jamais, sans
//     budget d'essais ni boucle sans fin. C'est le repli sûr.
//   - Avec l'aperçu : les pièces en main existent déjà. On cherche, par recherche
//     exhaustive bornée, quelques témoins de leur pose sur la grille réelle (quelques
//     grilles d'arrivée différentes), et l'on construit les pièces suivantes à partir
//     de ces grilles. Si les pièces en main ne sont plus posables (mauvaise pose du
//     joueur), il n'y a plus rien à garantir : défaite normale, on construit sur la
//     grille réelle.
//
// Niveau. Il fixe la table de poids (les grosses pièces et les tordues viennent avec
// lui) et la serrure du témoin : on construit plusieurs candidats, classés de la plus
// grande liberté de pose (des pièces qui s'accordent bien à la grille, beaucoup de places
// où les poser) à la plus petite (des pièces qui ne s'y logent que d'une ou deux façons),
// et l'on garde le plus large au niveau 1, le plus serré au niveau 10, un intermédiaire
// entre les deux. La liberté se mesure entre pièces de même taille (voir liberte) : la
// serrure ne dégrade pas le tirage en blocs de 1 case, la table de poids reste maîtresse
// de la taille des pièces.
//
// Reproductible : tout le hasard vient de aleatoire(), le hasard de la partie.
//
// Interface (voir tirage.js) : tirageGaranti({ aleatoire, niveau, nombre, grille,
// enCours, reglages }) rend `nombre` identifiants de pièces. tirerGaranti rend la même
// chose avec le détail du tirage (pour mesurer).

import { piece, CATALOGUE } from './pieces.js'
import { poidsDesPieces, NIVEAU_MIN, NIVEAU_MAX } from './niveaux.js'

// Candidats construits par tirage : du plus large au plus serré, on en garde un.
export const CANDIDATS = 6
// Grilles d'arrivée différentes cherchées pour les pièces en main (l'aperçu se
// construit à partir de chacune).
export const TEMOINS = 3
// Poses essayées au plus par recherche de témoin : de quoi épuiser une grille
// presque pleine, sans jamais boucler.
export const BUDGET_PREMIER_TEMOIN = 2_000_000
export const BUDGET_AUTRES_TEMOINS = 20_000

// --- Pièces et grille en masques de bits --------------------------------------
// Une rangée de la grille est un entier dont le bit c vaut 1 si la colonne c est
// occupée ; une pièce est, par rangée, le masque de ses cases (bit c : colonne c).

const INFOS = new Map()
function infos(id) {
  let i = INFOS.get(id)
  if (!i) {
    const p = piece(id)
    const lignes = Array(p.hauteur).fill(0)
    for (const c of p.cases) lignes[c.ligne] |= 1 << c.col
    i = { id, lignes, hauteur: p.hauteur, largeur: p.largeur }
    INFOS.set(id, i)
  }
  return i
}

const versMasques = (grille) => grille.map((r) => r.reduce((m, v, c) => (v !== null ? m | (1 << c) : m), 0))

const tientEn = (rangees, p, l, k) => {
  for (let r = 0; r < p.hauteur; r++) if (rangees[l + r] & (p.lignes[r] << k)) return false
  return true
}

// La grille après la pose de p en (l, k) et l'effacement des lignes et colonnes
// pleines, toutes en même temps.
function poserEn(rangees, p, l, k, plein) {
  const n = rangees.slice()
  for (let r = 0; r < p.hauteur; r++) n[l + r] |= p.lignes[r] << k
  let colonnes = plein
  let lignePleine = false
  for (const r of n) {
    colonnes &= r
    if (r === plein) lignePleine = true
  }
  if (colonnes !== 0 || lignePleine) {
    for (let i = 0; i < n.length; i++) n[i] = n[i] === plein ? 0 : n[i] & ~colonnes
  }
  return n
}

// Toutes les places (l * largeur de grille + k) où p tient.
function places(rangees, p, hauteur, largeur) {
  const liste = []
  for (let l = 0; l + p.hauteur <= hauteur; l++) {
    for (let k = 0; k + p.largeur <= largeur; k++) if (tientEn(rangees, p, l, k)) liste.push(l * largeur + k)
  }
  return liste
}

// --- Témoins de la pose des pièces en main ------------------------------------

// Une grille d'arrivée où toutes les pièces `ids` sont posées (dans un ordre et à des
// places quelconques, lignes pleines effacées entre deux poses), ou null s'il n'y en
// a pas, ou si le budget est épuisé avant d'en trouver une (alors `etat.epuise`).
// Recherche exhaustive hors budget ; le départ (ordre, place) est tiré au hasard
// pour que deux recherches donnent des témoins différents.
function chercherTemoin(rangees, ids, dim, aleatoire, budget, etat) {
  const { hauteur, largeur, plein } = dim
  const pieces = ids.map(infos)
  let reste = budget
  const perdus = new Set()

  function descendre(grille, restantes) {
    if (restantes.length === 0) return grille
    const cle = restantes.length < pieces.length ? `${restantes.join('')}|${grille.join(',')}` : null
    if (cle !== null && perdus.has(cle)) return null
    const decalage = Math.floor(aleatoire() * restantes.length)
    const essayees = new Set()
    for (let t = 0; t < restantes.length; t++) {
      const idx = restantes[(t + decalage) % restantes.length]
      const p = pieces[idx]
      if (essayees.has(p.id)) continue
      essayees.add(p.id)
      const rest = restantes.filter((x) => x !== idx)
      const colonnes = largeur - p.largeur + 1
      const total = (hauteur - p.hauteur + 1) * colonnes
      const debut = Math.floor(aleatoire() * total)
      for (let u = 0; u < total; u++) {
        const n = (debut + u) % total
        const l = Math.floor(n / colonnes)
        const k = n % colonnes
        if (!tientEn(grille, p, l, k)) continue
        if (--reste < 0) { etat.epuise = true; return null }
        const fin = descendre(poserEn(grille, p, l, k, plein), rest)
        if (fin) return fin
        if (etat.epuise) return null
      }
    }
    if (cle !== null) perdus.add(cle)
    return null
  }

  return descendre(rangees, pieces.map((_, i) => i))
}

// Jusqu'à `TEMOINS` grilles d'arrivée différentes pour les pièces en main.
function temoins(rangees, ids, dim, aleatoire, detail) {
  const arrivees = []
  const vues = new Set()
  for (let i = 0; i < TEMOINS; i++) {
    const etat = { epuise: false }
    const fin = chercherTemoin(rangees, ids, dim, aleatoire, i === 0 ? BUDGET_PREMIER_TEMOIN : BUDGET_AUTRES_TEMOINS, etat)
    if (i === 0) {
      detail.budgetEpuise = etat.epuise
      if (!fin) break
    }
    if (fin && !vues.has(fin.join(','))) {
      vues.add(fin.join(','))
      arrivees.push(fin)
    }
  }
  return arrivees
}

// --- Construction -------------------------------------------------------------

// `nombre` pièces tirées selon les poids du niveau et posées à la suite sur la
// copie de la grille. Rend les pièces tirées dans l'ordre où elles ont été posées.
function construire(depart, nombre, poids, total, dim, aleatoire, detail) {
  const { hauteur, largeur, plein } = dim
  let grille = depart
  const ids = []
  for (let i = 0; i < nombre; i++) {
    let choix = tirerSelonPoids(poids, total, aleatoire())
    let lieux = places(grille, infos(choix), hauteur, largeur)
    if (lieux.length === 0) {
      // Repli : une pièce qui tient, tirée selon les mêmes poids restreints à celles-là.
      detail.remplacees++
      const tiennent = []
      for (const p of poids) {
        const l = places(grille, infos(p.id), hauteur, largeur)
        if (l.length > 0) tiennent.push({ id: p.id, poids: p.poids, lieux: l })
      }
      if (tiennent.length === 0) {
        // Grille impossible (pleine) : rien ne tient, on rend le bloc sans le poser.
        ids.push('bloc.0')
        continue
      }
      const reste = tiennent.reduce((s, p) => s + p.poids, 0)
      choix = tirerSelonPoids(tiennent, reste, aleatoire())
      lieux = tiennent.find((p) => p.id === choix).lieux
    }
    const n = lieux[Math.floor(aleatoire() * lieux.length)]
    const p = infos(choix)
    grille = poserEn(grille, p, Math.floor(n / largeur), n % largeur, plein)
    ids.push(choix)
  }
  return ids
}

// --- Serrure : la liberté de pose ---------------------------------------------

// Part des places de la grille vide où chaque pièce du catalogue tient sur cette grille.
function partsOuvertes(rangees, dim) {
  const { hauteur, largeur } = dim
  const parts = new Map()
  for (const p of CATALOGUE) {
    const i = infos(p.id)
    parts.set(p.id, places(rangees, i, hauteur, largeur).length / ((hauteur - i.hauteur + 1) * (largeur - i.largeur + 1)))
  }
  return parts
}

// Les pièces s'accordent-elles bien à la grille de départ ? Pour chaque pièce, sa part
// de places libres rapportée à la moyenne des pièces de même taille (même nombre de
// cases) : au-dessus de 1, elle s'y pose plus facilement que ses pareilles, au-dessous
// elle s'y pose plus difficilement. On compare ainsi les pièces entre elles sans que la
// taille décide : une grosse pièce n'est pas « serrée » parce qu'elle est grosse, la
// table de poids du niveau y pourvoit. Rend la moyenne sur les pièces posées (1 sans
// information).
function liberte(ids, parts) {
  let somme = 0
  for (const id of ids) {
    const meme = TAILLES.get(piece(id).cases.length)
    const moyenne = meme.reduce((s, q) => s + parts.get(q), 0) / meme.length
    somme += moyenne > 0 ? parts.get(id) / moyenne : 1
  }
  return somme / ids.length
}

const TAILLES = new Map()
for (const p of CATALOGUE) TAILLES.set(p.cases.length, [...(TAILLES.get(p.cases.length) ?? []), p.id])

// L'id tiré par `r` dans [0, 1[ : poids non nul seulement, le dernier si l'arrondi laisse un reste.
function tirerSelonPoids(poids, total, r) {
  let x = r * total
  let dernier = null
  for (const p of poids) {
    if (p.poids <= 0) continue
    dernier = p.id
    if ((x -= p.poids) < 0) return p.id
  }
  return dernier
}

// --- Le tirage ----------------------------------------------------------------

// Les pièces du tour : { ids, detail }. Le détail dit comment le tirage s'est passé :
//   temoin        vrai si la garantie s'applique en entier (pas de pièces en main, ou
//                 des pièces en main dont un témoin a été trouvé)
//   budgetEpuise  vrai si la recherche d'un témoin des pièces en main a dépassé son budget
//   remplacees    pièces tirées qui ne tenaient pas, remplacées par une qui tient
//   candidats     candidats construits
//   liberte       liberté de pose du candidat gardé
export function tirerGaranti({ aleatoire, niveau, nombre, grille, enCours = [], reglages }) {
  const hauteur = grille.length
  const largeur = grille[0].length
  const dim = { hauteur, largeur, plein: (1 << largeur) - 1 }
  const poids = poidsDesPieces(niveau)
  const total = poids.reduce((s, p) => s + p.poids, 0)
  const detail = { temoin: true, budgetEpuise: false, remplacees: 0, candidats: CANDIDATS, liberte: 0 }

  const rangees = versMasques(grille)
  let departs = [rangees]
  if (enCours.length > 0) {
    const arrivees = temoins(rangees, enCours, dim, aleatoire, detail)
    if (arrivees.length > 0) departs = arrivees
    else detail.temoin = false
  }

  const parts = departs.map((d) => partsOuvertes(d, dim))
  const candidats = []
  for (let j = 0; j < CANDIDATS; j++) {
    const ids = construire(departs[j % departs.length], nombre, poids, total, dim, aleatoire, detail)
    candidats.push({ ids, liberte: liberte(ids, parts[j % departs.length]) })
  }
  // Du plus large au plus serré (à égalité, dans l'ordre de construction) ; le niveau
  // choisit où s'arrêter : le plus large au niveau 1, le plus serré au niveau 10.
  candidats.sort((a, b) => b.liberte - a.liberte)
  const rang = (niveau - NIVEAU_MIN) / (NIVEAU_MAX - NIVEAU_MIN)
  const gardee = candidats[Math.round(rang * (CANDIDATS - 1))]
  detail.liberte = gardee.liberte
  return { ids: gardee.ids, detail }
}

export const tirageGaranti = (contexte) => tirerGaranti(contexte).ids
