// Réserve de bonus de block-pose (BS42), cadrée en BS38.
//
// La réserve n'appartient pas à la partie mais au joueur : elle se garde d'une partie à
// l'autre. Le moteur la reçoit au début de la partie (nouvellePartie({ reserve })) et la
// rend dans l'état (etat.reserve), comme données simples que l'interface sauvegarde.
// Savoir si la réserve a déjà été créée est l'affaire du stockage (BS45) : le moteur
// n'en invente jamais une seul ; sans réserve donnée, la partie commence à vide.
//
// Une réserve est un objet { supprimer, tourner, changer, annuler } de nombres entiers,
// jamais modifié en place : chaque fonction en rend une nouvelle.

// Les quatre sortes de bonus, et ce que chacune fait (moteur.js) :
//   supprimer  retire une des pièces restantes du tour
//   tourner    passe une pièce à son orientation suivante
//   changer    remplace les pièces restantes du tour et l'aperçu par un tirage neuf
//   annuler    rend l'état d'avant la dernière pose
export const SORTES = Object.freeze(['supprimer', 'tourner', 'changer', 'annuler'])

// Plafond de chaque sorte : un gain au-delà est perdu, sans erreur.
export const RESERVE_MAX = 10

// Offerts une seule fois, au tout début de l'utilisation (pas à chaque partie).
export const BONUS_OFFERTS = 3

export const sorteValide = (s) => SORTES.includes(s)

export const reserveVide = () => ({ supprimer: 0, tourner: 0, changer: 0, annuler: 0 })

// La réserve de la toute première utilisation : 3 de chaque sorte.
export const reserveInitiale = () => Object.fromEntries(SORTES.map((s) => [s, BONUS_OFFERTS]))

// La réserve avec `n` bonus de plus de cette sorte (plafonnée), ou la même si la sorte
// est inconnue ou n n'est pas un entier positif.
export function ajouterBonus(reserve, sorte, n = 1) {
  if (!sorteValide(sorte) || !Number.isInteger(n) || n < 0) return reserve
  return { ...reserve, [sorte]: Math.min(RESERVE_MAX, reserve[sorte] + n) }
}

// La réserve avec un bonus de moins de cette sorte, ou null s'il n'y en a plus.
export function retirerBonus(reserve, sorte) {
  if (!sorteValide(sorte) || !(reserve[sorte] > 0)) return null
  return { ...reserve, [sorte]: reserve[sorte] - 1 }
}

// Une réserve relue depuis des données gardées (JSON) : une copie, ou null si ce n'est
// pas une réserve (sorte manquante, nombre non entier, négatif ou au-delà du plafond).
export function lireReserve(donnees) {
  if (!donnees || typeof donnees !== 'object') return null
  const r = {}
  for (const s of SORTES) {
    const n = donnees[s]
    if (!Number.isInteger(n) || n < 0 || n > RESERVE_MAX) return null
    r[s] = n
  }
  return r
}
