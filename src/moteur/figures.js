// Les figures à composer (BS10) : un modèle fait de blocs d'une seule case, sur
// 1 ou 2 lignes, qui rapporte un bonus quand il apparaît quelque part dans la
// grille. Fonctions pures : le hasard est passé en paramètre.
//
// Une figure : { cases: [{ ligne, col, couleur }], depart }. Lignes et colonnes
// sont relatives (la plus haute et la plus à gauche valent 0) ; `depart` est le
// bonus de départ, fixé par le nombre de cases.

// Hauteur et largeur (en cases) du rectangle qui contient la figure.
export function tailleFigure(figure) {
  return {
    lignes: Math.max(...figure.cases.map((c) => c.ligne)) + 1,
    colonnes: Math.max(...figure.cases.map((c) => c.col)) + 1,
  }
}

// Bonus de départ pour un nombre de cases : celui du plus haut palier atteint.
export function bonusDepart(nbCases, cfg) {
  let bonus = cfg.paliers[0].bonus
  for (const p of cfg.paliers) if (nbCases >= p.casesMin) bonus = p.bonus
  return bonus
}

// La figure est-elle dans la grille, n'importe où ? Seuls comptent les blocs
// d'une case de la bonne couleur ; les blocs autour ne changent rien.
export function figurePresente(figure, blocs) {
  const petits = new Map()
  for (const b of blocs) if (b.largeur === 1) petits.set(`${b.ligne},${b.col}`, b.couleur)
  if (petits.size < figure.cases.length) return false
  const { lignes, colonnes } = tailleFigure(figure)
  const lignesGrille = Math.max(...blocs.map((b) => b.ligne), -1) + 1
  const colonnesGrille = Math.max(...blocs.map((b) => b.col + b.largeur), 0)
  for (let dl = 0; dl + lignes <= lignesGrille; dl++) {
    for (let dc = 0; dc + colonnes <= colonnesGrille; dc++) {
      if (figure.cases.every((c) => petits.get(`${c.ligne + dl},${c.col + dc}`) === c.couleur)) return true
    }
  }
  return false
}

// Tire une figure réalisable avec les petits blocs visibles (grille et lignes à
// venir) : assez de blocs d'une case de chaque couleur demandée. Rend null si
// aucune ne convient, ce qui laisse la partie sans figure jusqu'au prochain coup.
// Une figure déjà dans la grille est refusée.
export function proposerFigure(blocs, aVenir, reglages, aleatoire) {
  const cfg = reglages.figures
  const dispo = new Map()
  for (const b of [...blocs, ...aVenir.flat()]) {
    if (b.largeur === 1) dispo.set(b.couleur, (dispo.get(b.couleur) ?? 0) + 1)
  }
  const total = [...dispo.values()].reduce((s, n) => s + n, 0)
  if (total < cfg.paliers[0].casesMin) return null

  const palierTire = Math.floor(aleatoire() * cfg.paliers.length)
  for (let p = palierTire; p >= 0; p--) {
    const palier = cfg.paliers[p]
    for (let essai = 0; essai < cfg.essais; essai++) {
      const n = palier.casesMin + Math.floor(aleatoire() * (palier.casesMax - palier.casesMin + 1))
      if (n > total) continue
      const cases = composer(n, dispo, reglages, aleatoire)
      if (!cases) continue
      const figure = { cases, depart: bonusDepart(n, cfg) }
      if (!figurePresente(figure, blocs)) return figure
    }
  }
  return null
}

// Une disposition de n cases et ses couleurs, ou null si elle manque de blocs.
function composer(n, dispo, reglages, aleatoire) {
  const { colonnes, figures: cfg } = reglages
  const max = Math.min(cfg.casesMaxParLigne, colonnes - 1)
  const entre = (a, b) => a + Math.floor(aleatoire() * (b - a + 1))

  // Combien de cases par ligne : une ligne, deux lignes pareilles ou deux différentes.
  let tailles
  let pareilles = false
  const deuxLignes = cfg.lignesMax >= 2 && n >= 2 && (n > max || aleatoire() < 0.55)
  if (!deuxLignes) tailles = [n]
  else if (n % 2 === 0 && n / 2 <= max && aleatoire() < 0.5) { tailles = [n / 2, n / 2]; pareilles = true }
  else {
    const haut = entre(Math.max(1, n - max), Math.min(max, n - 1))
    tailles = [haut, n - haut]
  }
  if (tailles.some((k) => k < 1 || k > max)) return null

  // Où sont les cases de chaque ligne : colonnes relatives, extrémités comprises,
  // avec au plus trousMax trous au milieu.
  const lire = (k) => {
    const largeur = k === 1 ? 1 : k + entre(0, Math.min(cfg.trousMax, colonnes - k))
    const cols = new Set([0, largeur - 1])
    const milieu = melanger(aleatoire, Array.from({ length: Math.max(0, largeur - 2) }, (_, i) => i + 1))
    while (cols.size < k) cols.add(milieu.pop())
    return { largeur, cols: [...cols].sort((a, b) => a - b) }
  }
  const rangees = pareilles ? [lire(tailles[0])] : tailles.map(lire)
  if (pareilles) rangees.push(rangees[0])
  // Les deux lignes ne commencent pas forcément dans la même colonne.
  const largeurTotale = Math.max(...rangees.map((r) => r.largeur))
  const decalage = rangees.map((r) => entre(0, largeurTotale - r.largeur))
  if (pareilles) decalage[1] = decalage[0]
  const debut = Math.min(...decalage)

  // Les couleurs : une palette de quelques couleurs qu'on a en blocs d'une case.
  // Une fois sur deux, les couleurs les plus nombreuses d'abord : les grandes figures
  // ne tiennent que si les blocs d'une case ne manquent pas.
  const disponibles = melanger(aleatoire, [...dispo.keys()])
  if (aleatoire() < 0.5) disponibles.sort((x, y) => dispo.get(y) - dispo.get(x))
  const palette = disponibles.slice(0, entre(1, Math.min(cfg.couleursMax, disponibles.length)))
  const alterne = aleatoire() < 0.5
  const couleurs = rangees.map((r) => r.cols.map((_, j) => (alterne ? palette[j % palette.length] : palette[Math.floor(aleatoire() * palette.length)])))
  if (pareilles) couleurs[1] = couleurs[0]

  const cases = []
  rangees.forEach((r, i) => r.cols.forEach((c, j) => {
    cases.push({ ligne: i, col: c + decalage[i] - debut, couleur: couleurs[i][j] })
  }))

  const besoin = new Map()
  for (const c of cases) besoin.set(c.couleur, (besoin.get(c.couleur) ?? 0) + 1)
  for (const [couleur, nb] of besoin) if (nb > (dispo.get(couleur) ?? 0)) return null
  return cases
}

function melanger(aleatoire, liste) {
  for (let i = liste.length - 1; i > 0; i--) {
    const j = Math.floor(aleatoire() * (i + 1))
    ;[liste[i], liste[j]] = [liste[j], liste[i]]
  }
  return liste
}
