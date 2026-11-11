// Tirage d'une ligne qui arrive. Fonction remplaçable : le moteur appelle
// reglages.tirage(aleatoire, reglages) et attend une liste de blocs
// { col, largeur, couleur } qui tiennent dans reglages.colonnes cases.

const ESSAIS = 1000

function auPoids(aleatoire, table) {
  const entrees = Object.entries(table).filter(([, poids]) => poids > 0)
  const total = entrees.reduce((s, [, poids]) => s + poids, 0)
  let r = aleatoire() * total
  for (const [valeur, poids] of entrees) {
    r -= poids
    if (r < 0) return Number(valeur)
  }
  return Number(entrees[entrees.length - 1][0])
}

// Tire un nombre de blocs, un nombre de trous et leurs largeurs selon les
// proportions, et recommence tant que le total ne fait pas la largeur de la
// grille. Les trous vont ensuite dans des intervalles distincts entre les
// blocs (deux trous voisins n'en feraient qu'un).
export function tirerLigne(aleatoire, reglages) {
  const { colonnes, proportions: p } = reglages
  for (let essai = 0; essai < ESSAIS; essai++) {
    const nbBlocs = auPoids(aleatoire, p.blocsParLigne)
    const nbTrous = auPoids(aleatoire, p.trousParLigne)
    if (nbTrous > nbBlocs + 1) continue
    const blocs = Array.from({ length: nbBlocs }, () => auPoids(aleatoire, p.largeurBloc))
    const trous = Array.from({ length: nbTrous }, () => auPoids(aleatoire, p.largeurTrou))
    const somme = [...blocs, ...trous].reduce((s, l) => s + l, 0)
    if (somme !== colonnes) continue
    return disposer(aleatoire, reglages, blocs, trous)
  }
  // Secours si les proportions rendent la largeur introuvable : un trou d'une case.
  return disposer(aleatoire, reglages, Array(colonnes - 1).fill(1), [1])
}

function disposer(aleatoire, reglages, blocs, trous) {
  // Intervalles 0..nbBlocs : avant le premier bloc, entre deux blocs, après le dernier.
  const intervalles = Array.from({ length: blocs.length + 1 }, (_, i) => i)
  melanger(aleatoire, intervalles)
  const trouAvant = new Map(intervalles.slice(0, trous.length).map((iv, k) => [iv, trous[k]]))

  const ligne = []
  let col = 0
  let couleurPrecedente = null
  blocs.forEach((largeur, i) => {
    col += trouAvant.get(i) ?? 0
    const couleur = tirerCouleur(aleatoire, reglages.couleurs, couleurPrecedente)
    ligne.push({ col, largeur, couleur })
    // Deux blocs collés de même couleur se confondraient à l'écran.
    couleurPrecedente = trouAvant.has(i + 1) ? null : couleur
    col += largeur
  })
  return ligne
}

// Recoloriage vers une figure (BS15, remplace la poussée de BS12 et BS13) : la
// ligne tirée garde sa forme (nombre, largeur et place des blocs) ; seuls ses
// blocs d'une case peuvent changer de couleur, un par couleur de `voulues` (une
// couleur répétée en demande autant). Un bloc d'une case déjà de la bonne couleur
// compte. Une ligne sans bloc d'une case reste telle quelle. Deux blocs collés de
// même couleur se confondraient à l'écran : on les évite quand on peut.
export function recolorerLigne(ligne, voulues, aleatoire) {
  const blocs = ligne.map((b) => ({ ...b }))
  const reserves = new Set()
  const manque = []
  for (const couleur of voulues) {
    const deja = blocs.find((b) => b.largeur === 1 && b.couleur === couleur && !reserves.has(b))
    if (deja) reserves.add(deja)
    else manque.push(couleur)
  }
  for (const couleur of manque) {
    const seuls = blocs.filter((b) => b.largeur === 1 && !reserves.has(b))
    const sansVoisin = seuls.filter((b) => !voisins(blocs, b).some((v) => v.couleur === couleur))
    const choix = sansVoisin.length ? sansVoisin : seuls
    if (!choix.length) break
    const bloc = choix[Math.floor(aleatoire() * choix.length)]
    bloc.couleur = couleur
    reserves.add(bloc)
  }
  return blocs
}

// Les blocs qui touchent celui-ci (collés à gauche ou à droite).
function voisins(blocs, b) {
  return blocs.filter((v) => v !== b && (v.col + v.largeur === b.col || b.col + b.largeur === v.col))
}

function tirerCouleur(aleatoire, couleurs, interdite) {
  const permises = couleurs.length > 1 ? couleurs.filter((c) => c !== interdite) : couleurs
  return permises[Math.floor(aleatoire() * permises.length)]
}

function melanger(aleatoire, liste) {
  for (let i = liste.length - 1; i > 0; i--) {
    const j = Math.floor(aleatoire() * (i + 1))
    ;[liste[i], liste[j]] = [liste[j], liste[i]]
  }
}
