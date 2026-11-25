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
//   - Seules les pièces qui tiennent sur la copie sont tirées (poids de la table, restreints à
//     celles-là) : aux niveaux faciles, le poids grandit avec ce que la pièce efface (BS51), aux
//     niveaux difficiles avec ce qu'elle gêne (BS55).
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
// Garantie d'effacement (BS55). Aux niveaux faciles, quand la main du tour doit être tirée sur la
// grille réelle (`exigerEfface`, sans pièces en main), l'une de ses pièces au moins efface une
// ligne ou une colonne dès la pose, si une pièce de la table le peut. Le moteur la demande quand la
// main prévue par l'aperçu n'offre rien à effacer, avec une chance qui s'estompe jusqu'au niveau 6.
//
// Le besoin (BS62). Aux niveaux faciles, le tirage regarde aussi la grille pour ce qui lui manque : les
// lignes et les colonnes à qui il manque au plus BESOIN_MANQUE_MAX cases (`besoinsSur`), avec, pour chacune, les
// pièces du catalogue (petites pièces comprises, quel que soit leur poids dans la table) qui la terminent d'une
// pose. Chaque pièce du tour est alors, avec une chance égale à l'aide du niveau (1 au niveau 1 : tant qu'un besoin
// n'est pas couvert, la pièce en couvre un), une pièce qui termine un besoin pas encore couvert, la bonne forme
// dans la bonne orientation, posable sur la copie comme les autres. `exigerEfface` rend cette chance pleine. Les
// pièces d'un tour se couvrent les besoins de la grille de départ (la grille réelle, ou la grille d'arrivée du
// témoin pour l'aperçu), pas ceux que la pose d'une autre ferait naître.
//
// Interface (voir tirage.js) : tirageGaranti({ aleatoire, niveau, nombre, grille,
// enCours, reglages, exigerEfface }) rend `nombre` identifiants de pièces. tirerGaranti rend la même
// chose avec le détail du tirage (pour mesurer).

import { piece, CATALOGUE } from './pieces.js'
import { poidsDesPieces, aideDuNiveau, hostiliteDuNiveau, rangDuNiveau } from './niveaux.js'

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
//   AIDE_TAILLE         plus ceci par dizaine de cases posées, fois la racine de l'aide (plutôt des grosses pièces) ;
//                       0 depuis BS55 : la table de poids décide de la taille des pièces
//   AIDE_FRAGILITE      moins ceci fois la fragilité de la main : la part des ESSAIS_FRAGILITE
//                       parties d'essai où un joueur qui ne suit pas la suite se bloque
// Valeurs calées à la mesure (tools/mesure-niveaux-pose.js).
export const AIDE_EFFACE = 8
export const AIDE_EFFACE_MAX = 3
export const AIDE_VALEUR_EFFACE = 1
export const AIDE_FRONTIERES = 5
export const AIDE_TAILLE = 0
export const AIDE_FRAGILITE = 10
export const ESSAIS_FRAGILITE = 8
export const CANDIDATS_AIDE = 24

// Le besoin (BS62) : une ligne ou une colonne à qui il manque au plus BESOIN_MANQUE_MAX cases. Une pièce qui
// peut terminer un besoin sort au moins avec le poids BESOIN_PLANCHER (la table donne parfois 0 aux petites
// pièces tordues du niveau 1), fois le carré du nombre de besoins qu'elle termine. Un candidat vaut en plus
// AIDE_BESOIN fois l'aide fois la part des besoins que sa main termine.
export const BESOIN_MANQUE_MAX = 3
export const BESOIN_PLANCHER = 1
export const AIDE_BESOIN = 3

// Le tirage hostile des niveaux difficiles (BS55, niveaux.js : hostiliteDuNiveau, 0 aux niveaux
// faciles, 1 au niveau 10) : le poids d'une pièce est multiplié par
// 1 + hostilite * HOSTILE * (1 si elle n'efface rien sur la grille du moment, plus HOSTILE_ETROIT
// fois la part des places où elle ne tient pas).
// Aux niveaux difficiles on construit aussi CANDIDATS_AIDE candidats, et chacun vaut sa liberté de pose
// moins HOSTILE_FRAGILE fois la hostilité fois sa fragilité (voir fragilite) : plus la main piège un
// joueur qui ne suit pas la suite, plus elle est rangée au bout, là où le niveau 10 la garde.
export const HOSTILE = 12
export const HOSTILE_ETROIT = 2
export const HOSTILE_FRAGILE = 10

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

// Tables de pose (BS61), qui évitent d'essayer les places une à une. Pour un masque de rangée de pièce m
// et une rangée de grille `occupee` : `place[occupee]` a pour bit k « m décalé de k tient dans cette rangée »,
// `complete[occupee]` « m décalé de k comble tout ce qui lui manque ». Une table de colonne dit de même, pour
// la colonne q d'une pièce et ce qui manque à une colonne de la grille (en bits de rangées), les décalages l
// qui la comblent. Elles ne dépendent que de la taille de la grille.
const TABLES_RANGEE = new Map()
function tableRangee(m, largeur) {
  const cle = `${largeur}:${m}`
  let t = TABLES_RANGEE.get(cle)
  if (!t) {
    const taille = 1 << largeur
    const place = new Int32Array(taille)
    const complete = new Int32Array(taille)
    for (let occupee = 0; occupee < taille; occupee++) {
      for (let k = 0; k < largeur && (m << k) < taille; k++) {
        const s = m << k
        if (!(occupee & s)) place[occupee] |= 1 << k
        if (s === ((taille - 1) & ~occupee)) complete[occupee] |= 1 << k
      }
    }
    t = { place, complete }
    TABLES_RANGEE.set(cle, t)
  }
  return t
}

const TABLES_COLONNE = new Map()
function tableColonne(q, hauteur) {
  const cle = `${hauteur}:${q}`
  let t = TABLES_COLONNE.get(cle)
  if (!t) {
    const taille = 1 << hauteur
    t = new Int32Array(taille)
    for (let manque = 0; manque < taille; manque++) {
      for (let l = 0; l < hauteur && (q << l) < taille; l++) if ((q << l) === manque) t[manque] |= 1 << l
    }
    TABLES_COLONNE.set(cle, t)
  }
  return t
}

function tablesDe(i, hauteur, largeur) {
  const t = i.tables
  if (t && t.hauteur === hauteur && t.largeur === largeur) return t
  return (i.tables = {
    hauteur,
    largeur,
    rangees: i.lignes.map((m) => tableRangee(m, largeur)),
    colonnes: i.colonnes.map((q) => tableColonne(q, hauteur)),
  })
}

// Les places k de la pièce dans les rangées l à l + hauteur - 1, en bits ; `libres` : les k que la grille permet (bits 0 à largeur - largeur de la pièce).
function placesEnL(rangees, t, hauteurPiece, l, libres) {
  let place = libres
  for (let r = 0; r < hauteurPiece && place !== 0; r++) place &= t.rangees[r].place[rangees[l + r]]
  return place
}

const rang = (bit) => 31 - Math.clz32(bit)
const nombreDeBits = (x) => {
  let n = 0
  for (; x !== 0; x &= x - 1) n++
  return n
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

// --- Besoins : les lignes et colonnes presque pleines ------------------------------

// Les pièces du catalogue, en masques.
let TOUTES = null
const toutes = () => (TOUTES ??= CATALOGUE.map((p) => infos(p.id)))

// Les besoins de cette grille : [{ sens: 'l' | 'c', i, manque, finisseurs: Set }], les lignes et colonnes à qui il
// manque de 1 à BESOIN_MANQUE_MAX cases et qu'une pièce du catalogue termine d'une pose (finisseurs : ses
// identifiants, une pièce y est si l'une de ses places comble tout ce qui manque à la rangée).
function besoinsSur(rangees, dim) {
  const { hauteur, largeur, plein } = dim
  const manque = manques(rangees, plein)
  const besoins = []
  for (let i = 0; i < hauteur; i++) {
    const m = manque.lignes[i]
    const n = nombreDeBits(m)
    if (n < 1 || n > BESOIN_MANQUE_MAX) continue
    const bas = rang(m & -m)
    const finisseurs = new Set()
    for (const p of toutes()) {
      for (let r = 0; r < p.hauteur; r++) {
        const a = p.lignes[r]
        const k = bas - rang(a & -a)
        const l = i - r
        if (k < 0 || a << k !== m || l < 0 || l + p.hauteur > hauteur || k + p.largeur > largeur) continue
        if (tientEn(rangees, p, l, k)) { finisseurs.add(p.id); break }
      }
    }
    if (finisseurs.size > 0) besoins.push({ sens: 'l', i, manque: n, finisseurs })
  }
  for (let c = 0; c < manque.colonnes.length; c++) {
    const m = manque.colonnes[c]
    const n = nombreDeBits(m)
    if (n < 1 || n > BESOIN_MANQUE_MAX) continue
    const bas = rang(m & -m)
    const finisseurs = new Set()
    for (const p of toutes()) {
      for (let q = 0; q < p.largeur; q++) {
        const a = p.colonnes[q]
        const l = bas - rang(a & -a)
        const k = c - q
        if (l < 0 || a << l !== m || k < 0 || k + p.largeur > largeur || l + p.hauteur > hauteur) continue
        if (tientEn(rangees, p, l, k)) { finisseurs.add(p.id); break }
      }
    }
    if (finisseurs.size > 0) besoins.push({ sens: 'c', i: c, manque: n, finisseurs })
  }
  return besoins
}

// Combien de ces besoins la main termine-t-elle ?
const couverts = (besoins, ids) => besoins.filter((b) => ids.some((id) => b.finisseurs.has(id))).length

// La pièce qui termine le plus de besoins parmi ceux qui restent, tirée au hasard selon son poids dans la table
// (au moins BESOIN_PLANCHER) fois le carré du nombre de besoins restants qu'elle termine ; seules celles qui
// tiennent sur la copie `grille` sont tirées. null si aucune.
function pieceDeBesoin(restants, poids, grille, dim, aleatoire) {
  const { hauteur, largeur } = dim
  const parId = new Map()
  for (const b of restants) for (const id of b.finisseurs) parId.set(id, (parId.get(id) ?? 0) + 1)
  const table = new Map(poids.map((q) => [q.id, q.poids]))
  const liste = []
  let total = 0
  for (const [id, n] of parId) {
    if (!tientQuelquePart(grille, infos(id), hauteur, largeur)) continue
    const w = n * n * Math.max(table.get(id) ?? 0, BESOIN_PLANCHER)
    liste.push({ id, poids: w })
    total += w
  }
  return liste.length === 0 ? null : tirerSelonPoids(liste, total, aleatoire())
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

// Un candidat est une suite de pièces tirées et posées à la suite sur la copie
// de la grille. Aux niveaux faciles, construireAide ; aux niveaux difficiles, construireGene.

// Variante des niveaux faciles (BS51) : même construction, mais le tirage regarde la grille du
// moment. Seules les pièces qui tiennent sont tirées, et le poids de chacune grandit avec ce
// qu'elle peut effacer (voir AIDE_EFFACE) : on reçoit les pièces qui finissent des lignes ou
// des colonnes. Chaque pièce est posée sur la copie là où elle efface le plus, à égalité là où
// elle se loge le plus serré, de sorte que les pièces suivantes se tirent sur la grille que
// le joueur aurait en jouant bien. Avec `exiger`, la première pièce est une de celles qui effacent
// sur la grille de départ (s'il y en a). Les besoins de la grille de départ (BS62, voir besoinsSur) :
// avec la chance `forcer`, la pièce tirée est une qui termine un besoin pas encore couvert (si une tient
// encore sur la copie), même si la table ne la donne pas à ce niveau. Rend les pièces, le nombre de
// lignes et colonnes que la suite de poses efface et le nombre de pièces tirées pour un besoin.
function construireAide(depart, nombre, poids, aide, dim, aleatoire, memo, exiger, besoins, forcer) {
  const { hauteur, largeur, plein } = dim
  let grille = depart
  const ids = []
  let efface = 0
  let forcees = 0
  let restants = besoins
  for (let i = 0; i < nombre; i++) {
    const entree = optionsSur(grille, poids, dim, memo)
    let options = entree.options
    let choix = null
    let meilleur = 0
    if (restants.length > 0 && aleatoire() < forcer) {
      choix = pieceDeBesoin(restants, poids, grille, dim, aleatoire)
      if (choix !== null) {
        forcees++
        restants = restants.filter((b) => !b.finisseurs.has(choix))
        meilleur = Math.max(...lieuxDe(entree, choix, dim).map((x) => x.e))
      }
    }
    if (choix === null) {
      // La garantie d'effacement (BS55) : la première pièce est posée sur la grille de départ, elle
      // efface donc quelque chose pour de bon quand la grille du moment le permet.
      if (exiger && i === 0 && forcees === 0) {
        const efface = options.filter((o) => o.meilleur > 0)
        if (efface.length > 0) options = efface
      }
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
      choix = tirerSelonPoids(ponderees, total, aleatoire())
      meilleur = options.find((o) => o.id === choix).meilleur
    }
    const lieux = lieuxDe(entree, choix, dim)
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
  return { ids, efface, forcees, frontieres: frontieres(grille, plein) }
}

// Variante des niveaux difficiles (BS55) : même construction que celle des niveaux faciles, mais le
// tirage cherche à gêner. Seules les pièces qui tiennent sont tirées ; le poids de chacune grandit
// avec ce qu'elle gêne (voir HOSTILE) : les pièces qui n'effacent rien sur la grille du moment
// reviennent plus souvent. Chaque pièce se pose au hasard sur la copie. Rend les pièces.
function construireGene(depart, nombre, poids, hostilite, dim, aleatoire, memo) {
  const { largeur, plein } = dim
  let grille = depart
  const ids = []
  for (let i = 0; i < nombre; i++) {
    const entree = optionsSur(grille, poids, dim, memo)
    const options = entree.options
    if (options.length === 0) {
      ids.push('bloc.0')
      continue
    }
    let total = 0
    const ponderees = options.map((o) => {
      const w = o.poids * (1 + hostilite * HOSTILE * ((o.meilleur === 0 ? 1 : 0) + HOSTILE_ETROIT * (1 - o.ouverture)))
      total += w
      return { id: o.id, poids: w }
    })
    const choix = tirerSelonPoids(ponderees, total, aleatoire())
    const { meilleur } = options.find((o) => o.id === choix)
    const lieux = lieuxDe(entree, choix, dim)
    // Sur la copie, la pièce se pose là où elle range le moins : la suite des pièces tirées part d'une
    // grille moins bien rangée que celle d'un joueur qui joue bien. Hors des places qui effacent, s'il y en a d'autres.
    const p = infos(choix)
    let bords = lieux.filter((x) => x.e < meilleur || meilleur === 0)
    if (bords.length === 0) bords = lieux
    const c = bords.map((x) => contact(grille, p, x.l, x.k, largeur))
    const min = Math.min(...c)
    const pires = bords.filter((_, j) => c[j] === min)
    const lieu = pires[Math.floor(aleatoire() * pires.length)]
    grille = poserEn(grille, p, lieu.l, lieu.k, plein)
    ids.push(choix)
  }
  return ids
}

// Les pièces de poids non nul qui tiennent sur cette grille : { id, poids, meilleur, ouverture } avec
// meilleur le plus grand nombre de lignes et colonnes qu'une pose effacerait, ouverture la part des
// places où la pièce tient. Mémorisé par grille le temps d'un tirage : les candidats partent des mêmes
// grilles. La liste de ses places { l, k, e } (e : ce que la pose en (l, k) efface) ne se construit que pour la
// pièce tirée (lieuxDe) : les autres n'en ont pas besoin.
function optionsSur(grille, poids, dim, memo) {
  const cle = grille.join(',')
  let entree = memo.get(cle)
  if (entree) return entree
  const { hauteur, largeur, plein } = dim
  const manque = manques(grille, plein)
  const options = []
  const parL = new Int32Array(hauteur)
  for (const q of poids) {
    if (q.poids <= 0) continue
    const p = infos(q.id)
    const t = tablesDe(p, hauteur, largeur)
    const nl = hauteur - p.hauteur + 1
    const nk = largeur - p.largeur + 1
    const libres = (1 << nk) - 1
    // Pour chaque l, les k où une colonne de la pièce comble une colonne de la grille.
    parL.fill(0)
    for (let k = 0; k < nk; k++) {
      let b = 0
      for (let c = 0; c < p.largeur; c++) b |= t.colonnes[c][manque.colonnes[k + c]]
      for (; b !== 0; b &= b - 1) {
        const l = rang(b & -b)
        if (l < nl) parL[l] |= 1 << k
      }
    }
    let tient = 0
    let meilleur = 0
    for (let l = 0; l < nl; l++) {
      const place = placesEnL(grille, t, p.hauteur, l, libres)
      if (place === 0) continue
      tient += nombreDeBits(place)
      // Seules les places qui comblent une rangée ou une colonne effacent quelque chose.
      let candidates = parL[l]
      for (let r = 0; r < p.hauteur; r++) candidates |= t.rangees[r].complete[grille[l + r]]
      for (candidates &= place; candidates !== 0; candidates &= candidates - 1) {
        const e = effacements(manque, p, l, rang(candidates & -candidates))
        if (e > meilleur) meilleur = e
      }
    }
    if (tient > 0) options.push({ id: q.id, poids: q.poids, meilleur, ouverture: tient / (nl * nk) })
  }
  entree = { options, grille, manque }
  memo.set(cle, entree)
  return entree
}

// Les places { l, k, e } de la pièce `id` sur la grille d'une entrée d'optionsSur, dans l'ordre des
// lignes puis des colonnes.
function lieuxDe(entree, id, dim) {
  const { grille, manque } = entree
  const { hauteur, largeur } = dim
  const p = infos(id)
  const t = tablesDe(p, hauteur, largeur)
  const libres = (1 << (largeur - p.largeur + 1)) - 1
  const lieux = []
  for (let l = 0; l + p.hauteur <= hauteur; l++) {
    for (let place = placesEnL(grille, t, p.hauteur, l, libres); place !== 0; place &= place - 1) {
      const k = rang(place & -place)
      lieux.push({ l, k, e: effacements(manque, p, l, k) })
    }
  }
  return lieux
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
      // Les pièces qui tiennent quelque part : seule celle qui est tirée a besoin de la liste de ses places.
      const choix = []
      for (let i = 0; i < restantes.length; i++) if (tientQuelquePart(grille, restantes[i], hauteur, largeur)) choix.push(i)
      if (choix.length === 0) { ratees++; break }
      const i = choix[Math.floor(aleatoire() * choix.length)]
      const p = restantes[i]
      const lieux = []
      const t = tablesDe(p, hauteur, largeur)
      const libres = (1 << (largeur - p.largeur + 1)) - 1
      for (let l = 0; l + p.hauteur <= hauteur; l++) {
        for (let place = placesEnL(grille, t, p.hauteur, l, libres); place !== 0; place &= place - 1) lieux.push(l * 32 + rang(place & -place))
      }
      let lieu
      if (avide) {
        let meilleur = -1
        const manque = manques(grille, plein)
        for (const x of lieux) {
          const v = effacements(manque, p, x >> 5, x & 31) * 100 + contact(grille, p, x >> 5, x & 31, largeur)
          if (v > meilleur) { meilleur = v; lieu = x }
        }
      } else {
        lieu = lieux[Math.floor(aleatoire() * lieux.length)]
      }
      grille = poserEn(grille, p, lieu >> 5, lieu & 31, plein)
      restantes = restantes.filter((_, j) => j !== i)
    }
  }
  return ratees / ESSAIS_FRAGILITE
}

// La pièce tient-elle quelque part sur cette grille ?
function tientQuelquePart(rangees, p, hauteur, largeur) {
  const t = tablesDe(p, hauteur, largeur)
  const libres = (1 << (largeur - p.largeur + 1)) - 1
  for (let l = 0; l + p.hauteur <= hauteur; l++) if (placesEnL(rangees, t, p.hauteur, l, libres) !== 0) return true
  return false
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
//   remplacees    toujours 0 (les pièces qui ne tiennent pas ne sont jamais tirées)
//   candidats     candidats construits
//   liberte       liberté de pose du candidat gardé
//   fragilite     fragilité du candidat gardé (voir fragilite) : la part des parties d'essai où un
//                 joueur qui ne suit pas la suite de poses se bloque ; BS57 : elle monte avec le niveau
//   efface        lignes et colonnes que la suite de poses du candidat gardé efface
//                 (niveaux faciles seulement, 0 sinon)
export function tirerGaranti({ aleatoire, niveau, nombre, grille, enCours = [], reglages, exigerEfface = false }) {
  const hauteur = grille.length
  const largeur = grille[0].length
  const dim = { hauteur, largeur, plein: (1 << largeur) - 1 }
  const poids = poidsDesPieces(niveau)
  const aide = aideDuNiveau(niveau)
  const hostilite = hostiliteDuNiveau(niveau)
  const nombreCandidats = CANDIDATS_AIDE
  const detail = { temoin: true, budgetEpuise: false, remplacees: 0, candidats: nombreCandidats, liberte: 0, efface: 0, besoins: 0, couverts: 0 }

  const rangees = versMasques(grille)
  let departs = [rangees]
  if (enCours.length > 0) {
    const arrivees = temoins(rangees, enCours, dim, aleatoire, detail)
    if (arrivees.length > 0) departs = arrivees
    else detail.temoin = false
  }

  // Les besoins de chaque grille de départ (aux niveaux faciles) ; la chance qu'une pièce en couvre un.
  const besoins = aide > 0 ? departs.map((d) => besoinsSur(d, dim)) : []
  const forcer = exigerEfface ? 1 : aide
  const parts = departs.map((d) => partsOuvertes(d, dim))
  const candidats = []
  const memo = new Map()
  for (let j = 0; j < nombreCandidats; j++) {
    const d = j % departs.length
    if (aide > 0) {
      const { ids, efface, forcees, frontieres } = construireAide(departs[d], nombre, poids, aide, dim, aleatoire, memo, exigerEfface && enCours.length === 0, besoins[d], forcer)
      const libre = liberte(ids, parts[d])
      const fragile = fragilite(departs[d], ids, dim, aleatoire)
      const finis = couverts(besoins[d], ids)
      const partFinie = besoins[d].length > 0 ? finis / Math.min(besoins[d].length, nombre) : 0
      candidats.push({ ids, liberte: libre, efface, forcees, besoins: besoins[d].length, couverts: finis, fragilite: fragile, valeur: libre + aide * (AIDE_VALEUR_EFFACE * efface + AIDE_BESOIN * partFinie - AIDE_FRONTIERES * frontieres / 100 - AIDE_FRAGILITE * fragile + Math.sqrt(aide) * AIDE_TAILLE * ids.reduce((n, id) => n + piece(id).cases.length, 0) / 10) })
    } else {
      const ids = construireGene(departs[d], nombre, poids, hostilite, dim, aleatoire, memo)
      const libre = liberte(ids, parts[d])
      const fragile = fragilite(departs[d], ids, dim, aleatoire)
      candidats.push({ ids, liberte: libre, fragilite: fragile, valeur: libre - hostilite * HOSTILE_FRAGILE * fragile })
    }
  }
  // Du plus large au plus serré (à égalité, dans l'ordre de construction) ; le niveau
  // choisit où s'arrêter : le plus large au niveau 1, le plus serré au niveau 10. Aux niveaux
  // faciles, ce qui efface des lignes élargit le candidat et ce qui range la grille aussi (AIDE_*).
  const valeur = (c) => c.valeur ?? c.liberte
  candidats.sort((a, b) => valeur(b) - valeur(a))
  const gardee = candidats[Math.round(rangDuNiveau(niveau) * (nombreCandidats - 1))]
  detail.liberte = gardee.liberte
  detail.fragilite = gardee.fragilite
  detail.efface = gardee.efface ?? 0
  detail.besoins = gardee.besoins ?? 0
  detail.couverts = gardee.couverts ?? 0
  const ids = gardee.ids
  // Garantie d'effacement, besoins : les pièces qui efface ou finissent un besoin sont construites en premier, on les place au hasard.
  if (aide > 0 && ((exigerEfface && enCours.length === 0) || gardee.forcees > 0)) {
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(aleatoire() * (i + 1))
      ;[ids[i], ids[j]] = [ids[j], ids[i]]
    }
  }
  return { ids, detail }
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

// Sur cette grille, une des pièces `main` efface-t-elle quelque chose (une pose qui comble tout ce
// qui manque à une ligne ou à une colonne) ? Et l'une des pièces `possibles` le ferait-elle ?
// Rend { efface, possible }. Sert à la garantie d'effacement (moteur.js) ; ne touche pas au hasard.
export function mainEfface(grille, main, possibles) {
  const hauteur = grille.length
  const largeur = grille[0].length
  const plein = (1 << largeur) - 1
  const rangees = versMasques(grille)
  const manque = manques(rangees, plein)
  const efface = (id) => {
    const p = infos(id)
    for (let l = 0; l + p.hauteur <= hauteur; l++) {
      for (let k = 0; k + p.largeur <= largeur; k++) {
        if (tientEn(rangees, p, l, k) && effacements(manque, p, l, k) > 0) return true
      }
    }
    return false
  }
  return { efface: main.some(efface), possible: possibles.some(efface) }
}

// Sur cette grille, les besoins (BS62, voir besoinsSur) : { besoins, couverts, atteignables } : combien de
// lignes et colonnes presque pleines une pièce du catalogue termine, combien en terminent les pièces `main`,
// et combien en terminerait au mieux une main de même taille prise au catalogue (glouton). Sert au moteur
// (moteur.js) pour remplacer une main qui manque une occasion ; ne touche pas au hasard.
export function mainBesoins(grille, main) {
  const dim = { hauteur: grille.length, largeur: grille[0].length, plein: (1 << grille[0].length) - 1 }
  let restants = besoinsSur(versMasques(grille), dim)
  const total = restants.length
  const finis = couverts(restants, main)
  let atteignables = 0
  for (let i = 0; i < main.length && restants.length > 0; i++) {
    const n = new Map()
    for (const b of restants) for (const id of b.finisseurs) n.set(id, (n.get(id) ?? 0) + 1)
    let meilleur = null
    for (const [id, k] of n) if (meilleur === null || k > meilleur.k) meilleur = { id, k }
    atteignables += meilleur.k
    restants = restants.filter((b) => !b.finisseurs.has(meilleur.id))
  }
  return { besoins: total, couverts: finis, atteignables }
}
