// Gains de bonus de block-pose (BS43), cadrés en BS38 : les manières de GAGNER un bonus.
//
// Les conditions sont volontairement dures, et plus dures quand le niveau monte (BS57) : pour le
// robot glouton (tools/simulateur-pose.js), un bonus toutes les vingt-cinq pièces posées environ au
// niveau 1, toutes les soixante-cinq au niveau 10. Toutes les constantes à caler en jouant sont dans
// GAINS, ci-dessous, et nulle part ailleurs : on les ajuste sans toucher au code (nouvellePartie({
// reglages: { ...REGLAGES, gains: { ...GAINS, palier: 100000 } } })). Une constante vaut pour tous
// les niveaux (un nombre) ou niveau par niveau (une table de dix valeurs, voir duNiveau).
//
// Six manières, une sorte de bonus gagnée par condition :
//   lignes      3 à 5 lignes (ou colonnes) d'un seul coup       -> annuler
//   croisement  2 à 3 lignes ET 2 à 3 colonnes d'un seul coup   -> tourner
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

// Une constante de GAINS vaut pour tous les niveaux (un nombre) ou niveau par niveau (une table de
// dix valeurs, du niveau 1 au niveau 10) : BS57 règle ainsi la difficulté des bonus d'un niveau au suivant.
export const duNiveau = (valeur, niveau) =>
  (Array.isArray(valeur) ? valeur[Math.min(Math.max(niveau, 1), valeur.length) - 1] : valeur)

export const GAINS = Object.freeze({
  // Lignes (ou, par symétrie, colonnes) à effacer d'un seul coup pour annuler le dernier coup, par
  // niveau (BS57) : 4 aux niveaux 1 à 5, puis 5, le maximum d'une pose. Le robot glouton n'en fait
  // presque jamais (une pose sur 7000 en efface quatre au niveau 1, aucune cinq) : ces seuils sont à
  // retoucher en jouant.
  lignesPourAnnuler: [4, 4, 4, 4, 4, 5, 5, 5, 5, 5],
  // Lignes ET colonnes effacées d'un seul coup (au moins) pour tourner une pièce, par niveau : 2 et 2
  // aux niveaux 1 à 3, puis 3 lignes et 2 colonnes, et 3 et 3 aux niveaux 7 à 10.
  croisementLignes: [2, 2, 2, 3, 3, 3, 3, 3, 3, 3],
  croisementColonnes: [2, 2, 2, 2, 2, 2, 3, 3, 3, 3],

  // Défi « X points en N coups » (supprimer une pièce), un seul à la fois, par niveau :
  // [points, coups]. Le compte part du début du défi, tous les points gagnés comptent ;
  // raté, rien ne se perd et un nouveau défi arrive aussitôt. Le score d'un coup est
  // dans reglages.js : une pose simple rapporte quelques points, un effacement des
  // centaines, si bien qu'un défi demande d'enchaîner des lignes.
  // BS57 : la part de défis réussis baisse d'un niveau au suivant, du niveau 1 (environ 9 % pour le
  // robot glouton, soit un bonus de défi toutes les cent poses) au niveau 10 (environ 1,5 %). Les
  // points sont calés par tools/calage-defis-pose.js d'après ce que le robot marque en huit coups :
  // il en marque plus aux niveaux 1 et 2 (le tirage lui donne souvent des pièces qui effacent) qu'aux
  // niveaux suivants, où sa marque est à peu près la même, si bien que les seuils baissent du niveau 1
  // au niveau 3 avant de remonter. Un joueur qui prépare ses coups fera mieux : à retoucher en jouant.
  defis: Object.freeze([
    [1360, 8],
    [1250, 8],
    [1050, 8],
    [1050, 8],
    [1050, 8],
    [1060, 8],
    [1060, 8],
    [1220, 8],
    [1260, 8],
    [1350, 8],
  ].map(Object.freeze)),

  // Palier de score : un changer tous les `palier` points de la partie en cours (un gros
  // coup qui en franchit deux en donne deux), par niveau (BS57) : plus loin quand le niveau
  // monte, de 30 000 au niveau 1 à 75 000 au niveau 10. Le robot n'en atteint aucun en 400 poses.
  palier: [30000, 35000, 40000, 45000, 50000, 55000, 60000, 65000, 70000, 75000],

  // Case surprise : `frequence` est la chance qu'une pièce tirée en porte une (si aucune
  // n'existe déjà : une seule à la fois) ; `compte` le nombre de poses accordées pour
  // l'effacer, par niveau, à partir de celle qui la pose (pas comprise). BS57 : le compte
  // baisse de 10 poses au niveau 1 à 3 au niveau 10. Pour le robot glouton, la case surprise
  // rapporte un bonus toutes les 36 poses au niveau 1 et toutes les 75 au niveau 10.
  surprise: Object.freeze({
    frequence: 0.04,
    compte: Object.freeze([10, 10, 9, 8, 8, 7, 6, 5, 4, 3]),
  }),
})

// Le défi du niveau, à partir de ce score et de ce nombre de poses.
export function nouveauDefi(niveau, score, gains = GAINS) {
  const [points, coups] = gains.defis[Math.min(Math.max(niveau, 1), gains.defis.length) - 1]
  return { points, coups, scoreDebut: score, coupsFaits: 0 }
}

// Les poses accordées pour effacer une case surprise à ce niveau.
export const compteSurprise = (niveau, gains = GAINS) => duNiveau(gains.surprise.compte, niveau)

// Les gains que le seul coup mérite, hors défi, palier et surprise (qui dépendent de
// l'état) : [{ cause, sorte }], `sorte` valant AU_CHOIX pour la grille vidée.
export function gainsDeCoup({ lignes, colonnes, grilleVidee }, gains = GAINS, niveau = 1) {
  const rendus = []
  const pourAnnuler = duNiveau(gains.lignesPourAnnuler, niveau)
  if (lignes >= pourAnnuler || colonnes >= pourAnnuler) {
    rendus.push({ cause: 'lignes', sorte: 'annuler' })
  }
  if (lignes >= duNiveau(gains.croisementLignes, niveau) && colonnes >= duNiveau(gains.croisementColonnes, niveau)) {
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
