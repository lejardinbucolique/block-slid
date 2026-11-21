// Tirage des pièces de block-pose (BS40) : simple et pondéré par niveau, sans
// garantie que les pièces tiennent. BS41 le remplacera par le tirage garanti,
// derrière la même interface (reglages.tirage).
//
// Interface : tirage({ aleatoire, niveau, nombre, grille, enCours, reglages })
// rend `nombre` identifiants de pièces du catalogue. `aleatoire()` rend un nombre
// dans [0, 1[ et avance le hasard de la partie ; `grille` est la grille du moment
// et `enCours` les pièces encore en main quand on tire l'aperçu (de quoi vérifier,
// en BS41, que les pièces en main puis celles tirées peuvent toutes se poser). Ce
// tirage-ci n'utilise que le hasard et le niveau.

import { poidsDesPieces } from './niveaux.js'

export function tirerPieces({ aleatoire, niveau, nombre }) {
  const poids = poidsDesPieces(niveau)
  const total = poids.reduce((s, p) => s + p.poids, 0)
  const ids = []
  for (let i = 0; i < nombre; i++) {
    let r = aleatoire() * total
    // La dernière pièce de poids non nul, si l'arrondi laisse un reste.
    let tiree = poids.findLast((p) => p.poids > 0).id
    for (const p of poids) {
      if (p.poids > 0 && (r -= p.poids) < 0) { tiree = p.id; break }
    }
    ids.push(tiree)
  }
  return ids
}
