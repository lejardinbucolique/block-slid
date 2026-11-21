// Ce qui reste sur l'appareil : le meilleur score, le niveau de vibration, le
// choix des figures, la partie en cours et les figures signalées, et le jeu choisi.
// Chaque jeu garde ses données à part : block-slid sous `block-slid.*` (inchangé),
// block-pose sous `block-pose.*` ; la vibration est un réglage commun aux deux.
// Le stockage peut manquer ou refuser (navigation privée) : le jeu marche alors
// sans rien retenir.

import { styleLu } from './styles.js'
import { jeuLu } from '../jeux.js'

const CLE_MEILLEUR = 'block-slid.meilleur'
const CLE_VIBRATION = 'block-slid.vibration'
const CLE_PARTIE = 'block-slid.partie'
const CLE_FIGURES = 'block-slid.figures'
const CLE_SIGNALEMENTS = 'block-slid.signalements'
const CLE_STYLE = 'block-slid.style'
const CLE_JEU = 'appli.jeu'

// Les clés de block-pose (BS39), toutes sous `block-pose.`. Les lectures et écritures
// de ses données viendront avec son moteur ; la vibration reste `block-slid.vibration`.
export const CLES_BLOCK_POSE = Object.freeze({
  meilleur: 'block-pose.meilleur',
  partie: 'block-pose.partie',
  style: 'block-pose.style',
  niveau: 'block-pose.niveau',
  reserve: 'block-pose.reserve',
  couleur: 'block-pose.couleur',
})

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

// Les figures à composer (BS10) : actives tant qu'on ne les a pas coupées.
export const figuresActivees = () => lire(CLE_FIGURES) !== '0'
export const retenirFiguresActivees = (actif) => ecrire(CLE_FIGURES, actif ? '1' : '0')

// Le style de blocs en cours (BS24) : lecture tolérante, tout ce qui n'est pas un
// style connu vaut « uni ». Le format de la partie gardée n'en sait rien.
export const styleGarde = () => styleLu(lire(CLE_STYLE))
export const retenirStyle = (id) => ecrire(CLE_STYLE, id)

// Le jeu choisi dans les réglages (BS39) : lecture tolérante, tout ce qui n'est pas un
// jeu connu et disponible vaut block-slid, y compris au tout premier lancement.
export const jeuChoisi = () => jeuLu(lire(CLE_JEU))
export const retenirJeu = (id) => ecrire(CLE_JEU, id)

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

// Les figures signalées infaisables (BS19), les plus anciennes d'abord. Elles ne
// quittent l'appareil que par le geste « Exporter » du joueur.
export const MAX_SIGNALEMENTS = 100
export function signalements() {
  const texte = lire(CLE_SIGNALEMENTS)
  if (texte === null) return []
  try {
    const liste = JSON.parse(texte)
    return Array.isArray(liste) ? liste.filter((s) => s && typeof s === 'object') : []
  } catch { return [] }
}
// Ajoute un signalement ; au-delà de MAX_SIGNALEMENTS, les plus anciens partent.
export function ajouterSignalement(signalement) {
  ecrire(CLE_SIGNALEMENTS, JSON.stringify([...signalements(), signalement].slice(-MAX_SIGNALEMENTS)))
}
export const viderSignalements = () => effacer(CLE_SIGNALEMENTS)
// Le contenu du fichier à exporter : du JSON lisible.
export const contenuSignalements = () => JSON.stringify({ signalements: signalements() }, null, 2)

// --- block-pose ---------------------------------------------------------------
// Mêmes lectures tolérantes : stockage absent, refusé ou texte abîmé = valeur de départ.

export const NIVEAU_POSE_MIN = 1
export const NIVEAU_POSE_MAX = 10
export const RESERVE_POSE_MAX = 10

export const meilleurScorePose = () => entier(lire(CLES_BLOCK_POSE.meilleur), 0, 0, Number.MAX_SAFE_INTEGER)
export const retenirMeilleurScorePose = (score) => ecrire(CLES_BLOCK_POSE.meilleur, score)

// Les styles de block-pose se débloquent sur son propre record, à part de ceux de block-slid.
export const stylePoseGarde = () => styleLu(lire(CLES_BLOCK_POSE.style))
export const retenirStylePose = (id) => ecrire(CLES_BLOCK_POSE.style, id)

// Le niveau de 1 à 10, réglé par le joueur ; 1 tant qu'il n'y a rien de lisible.
export const niveauPose = () => entier(lire(CLES_BLOCK_POSE.niveau), NIVEAU_POSE_MIN, NIVEAU_POSE_MIN, NIVEAU_POSE_MAX)
export const retenirNiveauPose = (niveau) => ecrire(CLES_BLOCK_POSE.niveau, niveau)

// La couleur (ou l'entrée spéciale) en cours : un texte court, sa validité se juge dans
// le jeu, qui connaît la liste ; ici, rien d'autre qu'une chaîne ou null.
export function couleurPoseGardee() {
  const texte = lire(CLES_BLOCK_POSE.couleur)
  return typeof texte === 'string' && texte.length > 0 && texte.length <= 40 ? texte : null
}
export const retenirCouleurPose = (couleur) => ecrire(CLES_BLOCK_POSE.couleur, couleur)

// La réserve de bonus : { nomDuBonus: nombre }, au plus RESERVE_POSE_MAX de chaque sorte.
// Tout ce qui n'est pas un nombre entier positif disparaît ; le jeu fixe les sortes.
export function reservePose() {
  const texte = lire(CLES_BLOCK_POSE.reserve)
  if (texte === null) return {}
  try {
    const brut = JSON.parse(texte)
    if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return {}
    const reserve = {}
    for (const [nom, n] of Object.entries(brut)) {
      if (Number.isInteger(n) && n > 0) reserve[nom] = Math.min(n, RESERVE_POSE_MAX)
    }
    return reserve
  } catch { return {} }
}
export const garderReservePose = (reserve) => ecrire(CLES_BLOCK_POSE.reserve, JSON.stringify(reserve))
// La réserve a-t-elle déjà été créée ? Le texte gardé peut dire « tout à zéro » (réserve épuisée), que
// reservePose() ne distingue pas de « jamais créée » : seul ceci décide des 3 bonus offerts, une seule fois.
export const reservePoseExiste = () => lire(CLES_BLOCK_POSE.reserve) !== null

// La partie en cours, en données simples ; null s'il n'y en a pas ou si le texte est illisible.
export function partiePoseGardee() {
  const texte = lire(CLES_BLOCK_POSE.partie)
  if (texte === null) return null
  try {
    const donnees = JSON.parse(texte)
    return donnees && typeof donnees === 'object' && !Array.isArray(donnees) ? donnees : null
  } catch { return null }
}
export const garderPartiePose = (donnees) => ecrire(CLES_BLOCK_POSE.partie, JSON.stringify(donnees))
export const oublierPartiePose = () => effacer(CLES_BLOCK_POSE.partie)

// Sans effet quand l'appareil ou le navigateur ne sait pas vibrer.
export function vibrer(niveau) {
  const duree = NIVEAUX_VIBRATION[niveau] ?? 0
  if (duree > 0 && typeof navigator.vibrate === 'function') {
    try { navigator.vibrate(duree) } catch { /* rien à faire */ }
  }
}
