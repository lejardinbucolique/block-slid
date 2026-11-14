// Un signalement de figure infaisable (BS19) : la figure et de quoi rejouer la
// situation, en données simples (JSON). Sans écran ni navigateur, donc testable.

import { exporterPartie, figureEnTexte } from '../moteur/index.js'

// `version` : celle du jeu ('v17'), `date` : un objet Date (passés en paramètres, pour les tests).
export function construireSignalement(etat, { version = 'inconnue', date = new Date() } = {}) {
  const f = etat.figure
  return {
    date: date.toISOString(),
    version,
    figure: {
      cases: f.cases.map((c) => ({ ligne: c.ligne, col: c.col, couleur: c.couleur })),
      depart: f.depart,
      texte: figureEnTexte(f),
    },
    bonus: etat.bonus,
    coups: etat.coups,
    score: etat.score,
    partie: exporterPartie(etat),
  }
}
