// Un signalement de figure (BS19, BS22) : la figure, la raison donnée par le joueur
// et de quoi rejouer la situation, en données simples (JSON). Sans écran ni
// navigateur, donc testable.

import { exporterPartie, figureEnTexte, figureComplexe } from '../moteur/index.js'

// Les raisons proposées au joueur, dans l'ordre d'affichage.
export const RAISONS = Object.freeze([
  Object.freeze({ id: 'infaisable', libelle: 'Infaisable' }),
  Object.freeze({ id: 'trop-simple', libelle: 'Trop simple pour 15000' }),
  Object.freeze({ id: 'devrait-15000', libelle: 'Devrait valoir 15000' }),
  Object.freeze({ id: 'trop-difficile', libelle: 'Trop difficile' }),
  Object.freeze({ id: 'autre', libelle: 'Autre' }),
])

// Le geste : la figure est écartée (refusee) ou reste en jeu (gardee).
export const GESTES = Object.freeze(['refusee', 'gardee'])

export const MAX_TEXTE = 500

// Le texte libre du joueur : espaces de bord retirés, coupé à MAX_TEXTE caractères
// (sans couper un caractère en deux).
export function nettoyerTexte(texte) {
  if (typeof texte !== 'string') return ''
  return Array.from(texte.trim()).slice(0, MAX_TEXTE).join('')
}

// `version` : celle du jeu ('v17'), `date` : un objet Date (passés en paramètres, pour les tests).
// `raison` : un id de RAISONS (sinon null), `texte` : texte libre facultatif, `geste` : un de GESTES.
export function construireSignalement(
  etat,
  { version = 'inconnue', date = new Date(), raison = null, texte = '', geste = 'refusee' } = {},
) {
  const f = etat.figure
  return {
    date: date.toISOString(),
    version,
    raison: RAISONS.some((r) => r.id === raison) ? raison : null,
    texte: nettoyerTexte(texte),
    geste: GESTES.includes(geste) ? geste : 'refusee',
    figure: {
      cases: f.cases.map((c) => ({ ligne: c.ligne, col: c.col, couleur: c.couleur })),
      depart: f.depart,
      texte: figureEnTexte(f),
      complexe: figureComplexe(f),
    },
    bonus: etat.bonus,
    coups: etat.coups,
    score: etat.score,
    partie: exporterPartie(etat),
  }
}

// Le libellé des réglages : les deux sortes de signalements comptées. Un ancien
// signalement (sans geste) était toujours un refus.
export function resumeSignalements(liste) {
  const n = liste.length
  if (n === 0) return 'Aucune figure signalée.'
  const gardees = liste.filter((s) => s?.geste === 'gardee').length
  const total = n === 1 ? '1 figure signalée' : `${n} figures signalées`
  if (gardees === 0) return `${total}.`
  const refusees = n - gardees
  const partie = (k, un, plusieurs) => `${k} ${k === 1 ? un : plusieurs}`
  return `${total} (${[
    refusees > 0 && partie(refusees, 'refusée', 'refusées'),
    partie(gardees, 'gardée', 'gardées'),
  ].filter(Boolean).join(', ')}).`
}
