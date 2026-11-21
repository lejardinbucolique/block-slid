// Gains de bonus de block-pose (BS43), cadrés en BS38 : les manières de GAGNER un bonus.
//
// Les conditions sont volontairement dures : cible d'environ un bonus toutes les quarante
// pièces posées en jeu normal (mesuré par tools/simulateur-pose.js). Toutes les constantes
// à caler en jouant sont dans GAINS, ci-dessous, et nulle part ailleurs : on les ajuste sans
// toucher au code (nouvellePartie({ reglages: { ...REGLAGES, gains: { ...GAINS, palier: 100000 } } })).
//
// Six manières, une sorte de bonus gagnée par condition :
//   lignes      5 lignes (ou 5 colonnes) d'un seul coup         -> annuler
//   croisement  3 lignes ET 2 colonnes d'un seul coup (au moins) -> tourner
//   grilleVidee la grille entièrement vidée                      -> un bonus AU CHOIX
//   defi        « X points en N coups »                          -> supprimer
//   palier      tous les `palier` points de la partie            -> changer
//   surprise    effacer la case surprise avant que son compte à rebours tombe à zéro
//               -> un bonus au hasard (hasard de la partie, reproductible)
//
// Ce module ne connaît ni l'état ni la grille : il décide, d'après un coup, quels gains
// sont mérités. Le moteur (moteur.js) les ajoute à la réserve et les range dans le
// résultat du coup (dernierCoup.gains).

import { LIGNES_MAX_PAR_COUP, COLONNES_MAX_PAR_COUP } from './pieces.js'

// Le « bonus » d'un gain au choix : pas encore une sorte, c'est le joueur qui la choisit
// (choisirBonus dans moteur.js).
export const AU_CHOIX = 'choix'

// Les causes d'un gain, dans l'ordre où le moteur les rend.
export const CAUSES = Object.freeze(['lignes', 'croisement', 'grilleVidee', 'defi', 'palier', 'surprise'])

export const GAINS = Object.freeze({
  // 5 lignes (ou, par symétrie, 5 colonnes) d'un seul coup : annuler le dernier coup.
  // Lecture à reconfirmer en jouant.
  lignesPourAnnuler: 5,
  // 3 lignes ET 2 colonnes d'un seul coup (au moins) : tourner une pièce.
  croisementLignes: 3,
  croisementColonnes: 2,

  // Défi « X points en N coups » (supprimer une pièce), un seul à la fois, par niveau :
  // [points, coups]. Le compte part du début du défi, tous les points gagnés comptent ;
  // raté, rien ne se perd et un nouveau défi arrive aussitôt. Le score d'un coup est
  // dans reglages.js : une pose simple rapporte quelques points, un effacement des
  // centaines, si bien qu'un défi demande d'enchaîner des lignes. Valeurs calées d'après
  // le simulateur (robot glouton : environ 7 % des défis réussis à tous les niveaux, soit un
  // bonus de défi toutes les 100 à 130 pièces) ; un joueur qui prépare ses coups fera
  // mieux : à retoucher en jouant. Le glouton marque 45 à 65 points par pose en moyenne, ce
  // qui monte avec le niveau : les seuils montent de même pour garder la difficulté.
  defis: Object.freeze([
    [740, 8],
    [740, 8],
    [800, 8],
    [840, 8],
    [880, 8],
    [920, 8],
    [960, 8],
    [980, 8],
    [1000, 8],
    [1020, 8],
  ].map(Object.freeze)),

  // Palier de score : un changer tous les `palier` points de la partie en cours (un gros
  // coup qui en franchit deux en donne deux). À monter vers 100 000 en jouant.
  palier: 50000,

  // Case surprise : `frequence` est la chance qu'une pièce tirée en porte une (si aucune
  // n'existe déjà : une seule à la fois) ; `compte` le nombre de poses accordées pour
  // l'effacer, par niveau, à partir de celle qui la pose (pas comprise).
  surprise: Object.freeze({
    frequence: 0.04,
    compte: Object.freeze([9, 9, 8, 8, 8, 7, 7, 6, 6, 6]),
  }),
})

// Le défi du niveau, à partir de ce score et de ce nombre de poses.
export function nouveauDefi(niveau, score, gains = GAINS) {
  const [points, coups] = gains.defis[Math.min(Math.max(niveau, 1), gains.defis.length) - 1]
  return { points, coups, scoreDebut: score, coupsFaits: 0 }
}

// Les poses accordées pour effacer une case surprise à ce niveau.
export const compteSurprise = (niveau, gains = GAINS) =>
  gains.surprise.compte[Math.min(Math.max(niveau, 1), gains.surprise.compte.length) - 1]

// Les gains que le seul coup mérite, hors défi, palier et surprise (qui dépendent de
// l'état) : [{ cause, sorte }], `sorte` valant AU_CHOIX pour la grille vidée.
export function gainsDeCoup({ lignes, colonnes, grilleVidee }, gains = GAINS) {
  const rendus = []
  if (lignes >= gains.lignesPourAnnuler || colonnes >= gains.lignesPourAnnuler) {
    rendus.push({ cause: 'lignes', sorte: 'annuler' })
  }
  if (lignes >= gains.croisementLignes && colonnes >= gains.croisementColonnes) {
    rendus.push({ cause: 'croisement', sorte: 'tourner' })
  }
  if (grilleVidee) rendus.push({ cause: 'grilleVidee', sorte: AU_CHOIX })
  return rendus
}

// Le défi se règle d'après la formule du score ; ce qui suit en donne la borne théorique,
// pour qu'un test prouve qu'un défi reste atteignable. Une pose traverse au plus
// LIGNES_MAX_PAR_COUP lignes et COLONNES_MAX_PAR_COUP colonnes : au mieux elles
// s'effacent toutes, avec leurs croisements comptés une fois.
export function pointsMaxParPose(reglages) {
  const { pointsParCase, pointsParCaseEffacee } = reglages
  let meilleur = 0
  for (let l = 0; l <= LIGNES_MAX_PAR_COUP; l++) {
    for (let c = 0; c <= COLONNES_MAX_PAR_COUP; c++) {
      if (l + c === 0) continue
      const cases = l * reglages.colonnes + c * reglages.lignes - l * c
      meilleur = Math.max(meilleur, cases * pointsParCaseEffacee * (l + c))
    }
  }
  // Les cases posées s'ajoutent : au plus celles de la plus grosse pièce, ici 16 (4x4 ;
  // le grand L et le 5x1 en ont moins). Majorant large : 25 cases.
  return meilleur + 25 * pointsParCase
}

// Le plus de points que N coups puissent rapporter, série comprise (le k-ième coup de
// suite compte min(k, plafond) fois) : borne haute, jamais atteinte en jeu.
export function pointsMaxEnCoups(coups, reglages) {
  const parPose = pointsMaxParPose(reglages)
  let total = 0
  for (let k = 1; k <= coups; k++) total += Math.min(k, reglages.plafondSerie) * parPose
  return total
}
