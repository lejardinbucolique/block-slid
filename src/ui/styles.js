// Les styles de blocs (BS24) : un décor, jamais une règle du jeu.
//
// Un style se débloque quand le meilleur score d'une seule partie atteint son
// palier. À chaque figure réussie, toute la grille prend un autre style, tiré au
// hasard parmi ceux qui sont débloqués. Rien ici ne touche au moteur : pas de
// hasard de la partie, pas de score, pas de tirage. Le module ne connaît ni
// l'écran ni le navigateur, pour se tester sans eux.

// Les paliers de meilleur score, dix en tout (les quatre premiers viennent du joueur,
// les suivants sont à ajuster). Un style n'en occupe un que lorsqu'il existe.
export const PALIERS = Object.freeze([
  10000, 100000, 250000, 500000, 1000000, 2000000, 3500000, 5000000, 7500000, 10000000,
])

export const STYLE_UNI = 'uni'

// Les styles dans l'ordre où ils se débloquent : `palier` est le meilleur score
// qu'il faut avoir atteint (0 : disponible dès le départ).
export const STYLES = Object.freeze([
  Object.freeze({ id: STYLE_UNI, nom: 'Uni', palier: 0 }),
  Object.freeze({ id: 'laine', nom: 'Laine', palier: PALIERS[0] }),
  Object.freeze({ id: 'beton', nom: 'Béton', palier: PALIERS[1] }),
  Object.freeze({ id: 'bois', nom: 'Bois', palier: PALIERS[2] }),
  Object.freeze({ id: 'bonbon', nom: 'Bonbon', palier: PALIERS[3] }),
])

const connu = (id) => STYLES.some((s) => s.id === id)

// Les styles disponibles pour ce meilleur score, uni compris, dans l'ordre.
export function stylesDebloques(meilleur) {
  return STYLES.filter((s) => meilleur >= s.palier)
}

// Le prochain style à débloquer, ou null quand il n'y en a plus (ou aucun de prévu) :
// le palier se lit dans son `palier`.
export function prochainStyle(meilleur) {
  return STYLES.find((s) => meilleur < s.palier) ?? null
}

// Les styles qui viennent d'être débloqués en passant d'un meilleur score à un autre.
export function nouveauxStyles(avant, apres) {
  return STYLES.filter((s) => s.palier > 0 && avant < s.palier && apres >= s.palier)
}

// Le style de la prochaine figure réussie : au hasard parmi les débloqués, jamais le
// même que le courant s'il y a le choix. `aleatoire` rend un nombre de [0, 1[ (Math.random
// côté écran). Avec un seul style, ou aucun, rien ne change.
export function choisirStyle(debloques, courant, aleatoire = Math.random) {
  const ids = debloques.map((s) => (typeof s === 'string' ? s : s.id))
  if (ids.length === 0) return courant
  if (ids.length === 1) return ids[0]
  const autres = ids.filter((id) => id !== courant)
  const r = aleatoire()
  const i = Math.min(autres.length - 1, Math.max(0, Math.floor(Number.isFinite(r) ? r * autres.length : 0)))
  return autres[i]
}

// Un style lu du stockage : absent, abîmé ou inconnu = uni.
export const styleLu = (valeur) => (typeof valeur === 'string' && connu(valeur) ? valeur : STYLE_UNI)

// Un style qui n'est plus débloqué (record effacé, par exemple) retombe sur uni.
export const styleAutorise = (id, meilleur) =>
  stylesDebloques(meilleur).some((s) => s.id === id) ? id : STYLE_UNI

// Le texte des réglages : combien de styles sont débloqués (hors uni, qui est là d'office),
// et le palier du prochain seulement s'il existe un style suivant.
export function resumeStyles(meilleur) {
  const nouveaux = STYLES.filter((s) => s.palier > 0)
  const debloques = nouveaux.filter((s) => meilleur >= s.palier)
  const prochain = prochainStyle(meilleur)
  const base = nouveaux.length === 0
    ? 'Aucun style à débloquer pour l\'instant.'
    : `Styles débloqués : ${debloques.length} sur ${nouveaux.length}.`
  if (!prochain) return `${base} Le style change à chaque figure réussie.`
  return `${base} Prochain : ${prochain.nom}, à ${prochain.palier} points de meilleur score.`
}
