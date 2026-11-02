// Ce qui reste sur l'appareil : le meilleur score, le niveau de vibration et la
// partie en cours.
// Le stockage peut manquer ou refuser (navigation privée) : le jeu marche alors
// sans rien retenir.

const CLE_MEILLEUR = 'block-slid.meilleur'
const CLE_VIBRATION = 'block-slid.vibration'
const CLE_PARTIE = 'block-slid.partie'

function lire(cle) {
  try { return localStorage.getItem(cle) } catch { return null }
}

function ecrire(cle, valeur) {
  try { localStorage.setItem(cle, String(valeur)) } catch { /* rien à faire */ }
}

function effacer(cle) {
  try { localStorage.removeItem(cle) } catch { /* rien à faire */ }
}

function entier(texte, defaut, min, max) {
  const n = Number.parseInt(texte, 10)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defaut
}

export const meilleurScore = () => entier(lire(CLE_MEILLEUR), 0, 0, Number.MAX_SAFE_INTEGER)
export const retenirMeilleurScore = (score) => ecrire(CLE_MEILLEUR, score)

// Niveau de 0 (coupée) à NIVEAUX_VIBRATION.length - 1 ; la durée en millisecondes
// est le seul réglage possible : un navigateur ne règle pas la force.
export const NIVEAUX_VIBRATION = Object.freeze([0, 10, 20, 35, 60, 100])
export const niveauVibration = () => entier(lire(CLE_VIBRATION), 2, 0, NIVEAUX_VIBRATION.length - 1)
export const retenirNiveauVibration = (niveau) => ecrire(CLE_VIBRATION, niveau)

// La partie en cours, en données simples (exporterPartie), sans date limite :
// elle reste jusqu'à ce qu'elle se termine ou qu'on en commence une autre.
// Rend null s'il n'y en a pas ou si le texte gardé est illisible.
export function partieGardee() {
  const texte = lire(CLE_PARTIE)
  if (texte === null) return null
  try { return JSON.parse(texte) } catch { return null }
}
export const garderPartie = (donnees) => ecrire(CLE_PARTIE, JSON.stringify(donnees))
export const oublierPartie = () => effacer(CLE_PARTIE)

// Sans effet quand l'appareil ou le navigateur ne sait pas vibrer.
export function vibrer(niveau) {
  const duree = NIVEAUX_VIBRATION[niveau] ?? 0
  if (duree > 0 && typeof navigator.vibrate === 'function') {
    try { navigator.vibrate(duree) } catch { /* rien à faire */ }
  }
}
