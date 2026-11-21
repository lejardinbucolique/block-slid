// Les styles de blocs (BS24) : un décor, jamais une règle du jeu.
//
// Un style se débloque quand le meilleur score d'une seule partie atteint son
// palier. À chaque figure réussie, toute la grille prend un autre style, tiré au
// hasard parmi ceux qui sont débloqués. Rien ici ne touche au moteur : pas de
// hasard de la partie, pas de score, pas de tirage. Le module ne connaît ni
// l'écran ni le navigateur, pour se tester sans eux.

import { JEU_BLOCK_SLID, JEU_BLOCK_POSE, JEU_PAR_DEFAUT } from '../jeux.js'

// Les dessins des styles servent à tous les jeux ; les déblocages sont propres à chacun :
// chaque jeu a sa table de paliers, sur son propre meilleur score (BS39).
// Les paliers de block-slid : dix en tout (les quatre premiers viennent du joueur,
// les suivants sont à ajuster). Un style n'en occupe un que lorsqu'il existe.
export const PALIERS = Object.freeze([
  10000, 100000, 250000, 500000, 1000000, 2000000, 3500000, 5000000, 7500000, 10000000,
])

// Les paliers de block-pose, d'une autre échelle (à ajuster en jouant).
export const PALIERS_BLOCK_POSE = Object.freeze([
  1000, 5000, 10000, 25000, 50000, 100000, 200000, 350000, 500000, 1000000,
])

export const PALIERS_PAR_JEU = Object.freeze({
  [JEU_BLOCK_SLID]: PALIERS,
  [JEU_BLOCK_POSE]: PALIERS_BLOCK_POSE,
})

export const STYLE_UNI = 'uni'

// Les styles hors uni dans l'ordre où ils se débloquent : le i-ième prend le i-ième
// palier de la table du jeu. Pour en ajouter un, l'ajouter ici et dans chaque table.
const NOUVEAUX = Object.freeze([
  Object.freeze({ id: 'laine', nom: 'Laine' }),
  Object.freeze({ id: 'beton', nom: 'Béton' }),
  Object.freeze({ id: 'bois', nom: 'Bois' }),
  Object.freeze({ id: 'bonbon', nom: 'Bonbon' }),
  Object.freeze({ id: 'papier', nom: 'Papier' }),
  Object.freeze({ id: 'metal', nom: 'Métal' }),
  Object.freeze({ id: 'verre', nom: 'Verre' }),
  Object.freeze({ id: 'marbre', nom: 'Marbre' }),
  Object.freeze({ id: 'neon', nom: 'Néon' }),
  Object.freeze({ id: 'gemme', nom: 'Gemme' }),
])

const tableDe = (jeu) => PALIERS_PAR_JEU[jeu] ?? PALIERS_PAR_JEU[JEU_PAR_DEFAUT]

// Les styles d'un jeu dans l'ordre où ils se débloquent : `palier` est le meilleur score
// qu'il faut avoir atteint dans ce jeu (0 : disponible dès le départ). Un style sans
// palier dans la table n'est pas proposé.
export const stylesDuJeu = (jeu = JEU_PAR_DEFAUT) => {
  const paliers = tableDe(jeu)
  return Object.freeze([
    Object.freeze({ id: STYLE_UNI, nom: 'Uni', palier: 0 }),
    ...NOUVEAUX.slice(0, paliers.length).map((s, i) => Object.freeze({ ...s, palier: paliers[i] })),
  ])
}

// Les styles de block-slid.
export const STYLES = stylesDuJeu(JEU_BLOCK_SLID)

const connu = (id) => id === STYLE_UNI || NOUVEAUX.some((s) => s.id === id)

// Les styles disponibles pour ce meilleur score, uni compris, dans l'ordre.
export function stylesDebloques(meilleur, jeu = JEU_PAR_DEFAUT) {
  return stylesDuJeu(jeu).filter((s) => meilleur >= s.palier)
}

// Le prochain style à débloquer, ou null quand il n'y en a plus (ou aucun de prévu) :
// le palier se lit dans son `palier`.
export function prochainStyle(meilleur, jeu = JEU_PAR_DEFAUT) {
  return stylesDuJeu(jeu).find((s) => meilleur < s.palier) ?? null
}

// Les styles qui viennent d'être débloqués en passant d'un meilleur score à un autre.
export function nouveauxStyles(avant, apres, jeu = JEU_PAR_DEFAUT) {
  return stylesDuJeu(jeu).filter((s) => s.palier > 0 && avant < s.palier && apres >= s.palier)
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
export const styleAutorise = (id, meilleur, jeu = JEU_PAR_DEFAUT) =>
  stylesDebloques(meilleur, jeu).some((s) => s.id === id) ? id : STYLE_UNI

// Le texte des réglages : combien de styles sont débloqués (hors uni, qui est là d'office),
// et le palier du prochain seulement s'il existe un style suivant.
export function resumeStyles(meilleur, jeu = JEU_PAR_DEFAUT) {
  const nouveaux = stylesDuJeu(jeu).filter((s) => s.palier > 0)
  const debloques = nouveaux.filter((s) => meilleur >= s.palier)
  const prochain = prochainStyle(meilleur, jeu)
  const base = nouveaux.length === 0
    ? 'Aucun style à débloquer pour l\'instant.'
    : `Styles débloqués : ${debloques.length} sur ${nouveaux.length}.`
  // Une fois tout débloqué : block-slid change de style à chaque figure réussie ; block-pose n'a
  // pas de figures, le joueur choisit son style dans les propriétés (proposition de BS44).
  if (!prochain) return `${base} ${jeu === JEU_BLOCK_POSE ? 'Le style se choisit dans les propriétés.' : 'Le style change à chaque figure réussie.'}`
  return `${base} Prochain : ${prochain.nom}, à ${prochain.palier} points de meilleur score.`
}
