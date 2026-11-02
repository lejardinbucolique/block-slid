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
