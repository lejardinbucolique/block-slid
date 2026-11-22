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
import { poidsDesPieces, aideDuNiveau, NIVEAU_MIN, NIVEAU_MAX } from './niveaux.js'

// Candidats construits par tirage : du plus large au plus serré, on en garde un.
export const CANDIDATS = 6
// Grilles d'arrivée différentes cherchées pour les pièces en main (l'aperçu se
// construit à partir de chacune).
export const TEMOINS = 3
// Poses essayées au plus par recherche de témoin : de quoi épuiser une grille
// presque pleine, sans jamais boucler.
export const BUDGET_PREMIER_TEMOIN = 2_000_000
export const BUDGET_AUTRES_TEMOINS = 20_000

// L'aide des niveaux faciles (BS51, niveaux.js : aideDuNiveau, de 1 au niveau 1 à 0 au niveau
// difficile). Aux niveaux faciles on construit CANDIDATS_AIDE candidats (au lieu de CANDIDATS),
// avec ces réglages, valeurs du niveau 1 : les autres suivent l'aide.
//   AIDE_EFFACE         le poids d'une pièce est multiplié par 1 + aide * AIDE_EFFACE * (lignes et
//                       colonnes qu'elle peut effacer au mieux sur la grille du moment, au plus
//                       AIDE_EFFACE_MAX) ; une pièce qui ne tient nulle part n'est pas tirée
//   AIDE_VALEUR_EFFACE  un candidat vaut sa liberté de pose, plus ceci par ligne ou colonne
//                       que sa suite de poses efface
//   AIDE_FRONTIERES     moins ceci par cent frontières entre cases pleines et libres que la suite
//                       laisse sur la grille (une grille groupée vaut mieux qu'éparpillée)
//   AIDE_TAILLE         plus ceci par dizaine de cases posées, fois la racine de l'aide (plutôt des grosses pièces, qui s'estompent moins vite)
//   AIDE_FRAGILITE      moins ceci fois la fragilité de la main : la part des ESSAIS_FRAGILITE
//                       parties d'essai où un joueur qui ne suit pas la suite se bloque
// Valeurs calées à la mesure (tools/mesure-niveaux-pose.js).
export const AIDE_EFFACE = 8
export const AIDE_EFFACE_MAX = 3
export const AIDE_VALEUR_EFFACE = 1
export const AIDE_FRONTIERES = 5
export const AIDE_TAILLE = 0.3
export const AIDE_FRAGILITE = 10
export const ESSAIS_FRAGILITE = 8
export const CANDIDATS_AIDE = 16

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
    const dans = new Set(p.cases.map((c) => `${c.ligne},${c.col}`))
    const bords = []
    for (const c of p.cases) {
      for (const [dl, dk] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (!dans.has(`${c.ligne + dl},${c.col + dk}`)) bords.push({ ligne: c.ligne + dl, col: c.col + dk })
      }
    }
    const colonnes = Array(p.largeur).fill(0)
    for (const c of p.cases) colonnes[c.col] |= 1 << c.ligne
    i = { id, lignes, colonnes, hauteur: p.hauteur, largeur: p.largeur, bords }
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

// Ce qui manque à chaque rangée et à chaque colonne de la grille (une colonne en bits de rangées) :
// une pièce qui tient efface une rangée si elle y comble tout ce qui manque, de même pour une
// colonne. La grille n'a pas de ligne ni de colonne pleine (le jeu les efface aussitôt).
function manques(rangees, plein) {
  const colonnes = []
  for (let c = 0; (plein >> c) !== 0; c++) {
    let m = 0
    for (let i = 0; i < rangees.length; i++) if (!(rangees[i] & (1 << c))) m |= 1 << i
    colonnes.push(m)
  }
  return { lignes: rangees.map((r) => plein & ~r), colonnes }
}

// Les lignes et colonnes que p, qui tient en (l, k), effacerait.
function effacements(manque, p, l, k) {
  let n = 0
  for (let r = 0; r < p.hauteur; r++) if (p.lignes[r] << k === manque.lignes[l + r]) n++
  for (let c = 0; c < p.largeur; c++) if (p.colonnes[c] << l === manque.colonnes[k + c]) n++
  return n
}

function contact(rangees, p, l, k, largeur) {
  let n = 0
  for (const b of p.bords) {
    const i = l + b.ligne
    const j = k + b.col
    if (i < 0 || j < 0 || i >= rangees.length || j >= largeur || (rangees[i] & (1 << j)) !== 0) n++
  }
  return n
}

// Les frontières entre cases pleines et cases libres de la grille (les bords ne comptent pas) :
// peu quand les cases occupées sont groupées, beaucoup quand elles sont éparpillées.
function frontieres(rangees, plein) {
  let n = 0
  for (let i = 0; i < rangees.length; i++) {
    const r = rangees[i]
    for (let x = (r ^ (r >> 1)) & (plein >> 1); x; x &= x - 1) n++
    if (i + 1 < rangees.length) for (let x = r ^ rangees[i + 1]; x; x &= x - 1) n++
  }
  return n
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

// Variante des niveaux faciles (BS51) : même construction, mais le tirage regarde la grille du
// moment. Seules les pièces qui tiennent sont tirées, et le poids de chacune grandit avec ce
// qu'elle peut effacer (voir AIDE_EFFACE) : on reçoit les pièces qui finissent des lignes ou
// des colonnes. Chaque pièce est posée sur la copie là où elle efface le plus, à égalité là où
// elle se loge le plus serré, de sorte que les pièces suivantes se tirent sur la grille que
// le joueur aurait en jouant bien. Rend les pièces et le nombre de lignes et colonnes que
// la suite de poses efface.
function construireAide(depart, nombre, poids, aide, dim, aleatoire, memo) {
  const { hauteur, largeur, plein } = dim
  let grille = depart
  const ids = []
  let efface = 0
  for (let i = 0; i < nombre; i++) {
    const options = optionsSur(grille, poids, dim, memo)
    let total = 0
    const ponderees = options.map((o) => {
      const w = o.poids * (1 + aide * AIDE_EFFACE * Math.min(o.meilleur, AIDE_EFFACE_MAX))
      total += w
      return { id: o.id, poids: w }
    })
    if (options.length === 0) {
      // Grille pleine (impossible en jeu) : rien ne tient, on rend le bloc sans le poser.
      ids.push('bloc.0')
      continue
    }
    const choix = tirerSelonPoids(ponderees, total, aleatoire())
    const { lieux, meilleur } = options.find((o) => o.id === choix)
    const p = infos(choix)
    const meilleurs = lieux.filter((x) => x.e === meilleur)
    let serres = meilleurs
    if (meilleurs.length > 1) {
      const c = meilleurs.map((x) => contact(grille, p, x.l, x.k, largeur))
      const max = Math.max(...c)
      serres = meilleurs.filter((_, j) => c[j] === max)
    }
    const lieu = serres[Math.floor(aleatoire() * serres.length)]
    grille = poserEn(grille, p, lieu.l, lieu.k, plein)
    efface += meilleur
    ids.push(choix)
  }
  return { ids, efface, frontieres: frontieres(grille, plein) }
}

// Les pièces de poids non nul qui tiennent sur cette grille : { id, poids, lieux: [{ l, k, e }],
// meilleur } avec e les lignes et colonnes effacées par la pose en (l, k), meilleur le plus grand
// e. Mémorisé par grille le temps d'un tirage : les candidats partent des mêmes grilles.
function optionsSur(grille, poids, dim, memo) {
  const cle = grille.join(',')
  let options = memo.get(cle)
  if (options) return options
  const { hauteur, largeur, plein } = dim
  const manque = manques(grille, plein)
  options = []
  for (const q of poids) {
    if (q.poids <= 0) continue
    const p = infos(q.id)
    const lieux = []
    let meilleur = 0
    for (let l = 0; l + p.hauteur <= hauteur; l++) {
      for (let k = 0; k + p.largeur <= largeur; k++) {
        if (!tientEn(grille, p, l, k)) continue
        const e = effacements(manque, p, l, k)
        if (e > meilleur) meilleur = e
        lieux.push({ l, k, e })
      }
    }
    if (lieux.length > 0) options.push({ id: q.id, poids: q.poids, lieux, meilleur })
  }
  memo.set(cle, options)
  return options
}

// Une main est fragile si un joueur qui ne suit pas la suite de poses peut s'y bloquer :
// part des parties d'essai (ESSAIS_FRAGILITE, moitié en posant là où ça efface le plus, moitié
// en posant au hasard, l'ordre des pièces tiré au hasard) où une pièce au moins ne tient plus
// quand son tour vient, à partir de la grille de départ du candidat.
function fragilite(depart, ids, dim, aleatoire) {
  const { hauteur, largeur, plein } = dim
  let ratees = 0
  for (let essai = 0; essai < ESSAIS_FRAGILITE; essai++) {
    const avide = essai % 2 === 0
    let grille = depart
    let restantes = ids.map(infos)
    while (restantes.length > 0) {
      const choix = []
      for (let i = 0; i < restantes.length; i++) {
        const p = restantes[i]
        const lieux = []
        for (let l = 0; l + p.hauteur <= hauteur; l++) for (let k = 0; k + p.largeur <= largeur; k++) if (tientEn(grille, p, l, k)) lieux.push({ l, k })
        if (lieux.length > 0) choix.push({ i, lieux })
      }
      if (choix.length === 0) { ratees++; break }
      const { i, lieux } = choix[Math.floor(aleatoire() * choix.length)]
      const p = restantes[i]
      let lieu
      if (avide) {
        let meilleur = -1
        const manque = manques(grille, plein)
        for (const x of lieux) {
          const v = effacements(manque, p, x.l, x.k) * 100 + contact(grille, p, x.l, x.k, largeur)
          if (v > meilleur) { meilleur = v; lieu = x }
        }
      } else {
        lieu = lieux[Math.floor(aleatoire() * lieux.length)]
      }
      grille = poserEn(grille, p, lieu.l, lieu.k, plein)
      restantes = restantes.filter((_, j) => j !== i)
    }
  }
  return ratees / ESSAIS_FRAGILITE
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
//   efface        lignes et colonnes que la suite de poses du candidat gardé efface
//                 (niveaux faciles seulement, 0 sinon)
export function tirerGaranti({ aleatoire, niveau, nombre, grille, enCours = [], reglages }) {
  const hauteur = grille.length
  const largeur = grille[0].length
  const dim = { hauteur, largeur, plein: (1 << largeur) - 1 }
  const poids = poidsDesPieces(niveau)
  const total = poids.reduce((s, p) => s + p.poids, 0)
  const aide = aideDuNiveau(niveau)
  const nombreCandidats = aide > 0 ? CANDIDATS_AIDE : CANDIDATS
  const detail = { temoin: true, budgetEpuise: false, remplacees: 0, candidats: nombreCandidats, liberte: 0, efface: 0 }

  const rangees = versMasques(grille)
  let departs = [rangees]
  if (enCours.length > 0) {
    const arrivees = temoins(rangees, enCours, dim, aleatoire, detail)
    if (arrivees.length > 0) departs = arrivees
    else detail.temoin = false
  }

  const parts = departs.map((d) => partsOuvertes(d, dim))
  const candidats = []
  const memo = new Map()
  for (let j = 0; j < nombreCandidats; j++) {
    const d = j % departs.length
    if (aide > 0) {
      const { ids, efface, frontieres } = construireAide(departs[d], nombre, poids, aide, dim, aleatoire, memo)
      const libre = liberte(ids, parts[d])
      candidats.push({ ids, liberte: libre, efface, valeur: libre + aide * (AIDE_VALEUR_EFFACE * efface - AIDE_FRONTIERES * frontieres / 100 - AIDE_FRAGILITE * fragilite(departs[d], ids, dim, aleatoire) + Math.sqrt(aide) * AIDE_TAILLE * ids.reduce((n, id) => n + piece(id).cases.length, 0) / 10) })
    } else {
      const ids = construire(departs[d], nombre, poids, total, dim, aleatoire, detail)
      candidats.push({ ids, liberte: liberte(ids, parts[d]) })
    }
  }
  // Du plus large au plus serré (à égalité, dans l'ordre de construction) ; le niveau
  // choisit où s'arrêter : le plus large au niveau 1, le plus serré au niveau 10. Aux niveaux
  // faciles, ce qui efface des lignes élargit le candidat et ce qui range la grille aussi (AIDE_*).
  const valeur = (c) => c.valeur ?? c.liberte
  candidats.sort((a, b) => valeur(b) - valeur(a))
  const rang = (niveau - NIVEAU_MIN) / (NIVEAU_MAX - NIVEAU_MIN)
  const gardee = candidats[Math.round(rang * (nombreCandidats - 1))]
  detail.liberte = gardee.liberte
  detail.efface = gardee.efface ?? 0
  return { ids: gardee.ids, detail }
}

export const tirageGaranti = (contexte) => tirerGaranti(contexte).ids

// Les pièces `ids` peuvent-elles toutes se poser sur cette grille (dans un ordre libre, les
// lignes et colonnes pleines effacées entre deux poses) ? { posable, epuise } : `epuise` si la
// recherche a dépassé son budget avant de conclure (alors `posable` est faux sans preuve).
// Sert au filet des niveaux faciles (moteur.js) ; ne touche pas au hasard de la partie.
export function mainPosable(grille, ids) {
  const dim = { hauteur: grille.length, largeur: grille[0].length, plein: (1 << grille[0].length) - 1 }
  const etat = { epuise: false }
  const fin = chercherTemoin(versMasques(grille), ids, dim, () => 0, BUDGET_PREMIER_TEMOIN, etat)
  return { posable: fin !== null, epuise: etat.epuise }
}
