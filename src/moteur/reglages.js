// Tous les réglages du jeu, en un seul endroit (cadrage BS2).
// Pour essayer d'autres valeurs : nouvellePartie({ reglages: { ...REGLAGES, lignes: 14 } }).

import { tirerLigne } from './tirage.js'

// Figures à composer (BS10, refaites en BS12, élargies en BS14) : une ligne du bas de
// 6 ou 7 blocs d'une seule case d'affilée, et une ligne du haut posée dessus, soit
// complète (deux lignes identiques), soit incomplète ; 1 à 3 couleurs en tout.
// Une figure est toujours proposée, construite pour être faisable (rien en l'air,
// et les lignes qui arrivent recolorent discrètement leurs blocs d'une case vers
// ses couleurs, tirées librement). `figures: null` dans
// les réglages coupe tout : ni figure, ni bonus, ni recoloriage.
export const FIGURES = Object.freeze({
  // Bonus de départ d'une figure ordinaire, et d'une figure complexe (BS21 : 3 couleurs,
  // 7 cases de large, ligne du haut incomplète ; voir `figureComplexe`).
  bonusDepart: 10000,
  bonusDepartComplexe: 15000,
  // Ce que perd le bonus à chaque coup sur la grille.
  perteParCoup: 100,
  // Largeur du motif, en colonnes (jamais la grille entière : la ligne disparaîtrait).
  largeurs: Object.freeze([6, 7]),
  // Ligne du haut incomplète (BS14) : au moins `min` cases, au plus `trousMax` trous
  // entre sa première et sa dernière case, faite de cases du bas dans leur ordre (BS18) ; la
  // `chanceIncomplete` : la part des figures qui en ont une (sinon, deux lignes
  // identiques). Défaut à confirmer en jouant.
  haut: Object.freeze({ min: 4, trousMax: 2, chanceIncomplete: 0.5 }),
  // Couleurs différentes au plus dans une même figure.
  couleursMax: 3,
  // Nombre de couleurs d'une figure neuve (BS16) : un poids par nombre. 2 couleurs
  // le plus souvent ; moins mélangées, les figures sont plus faciles à composer.
  poidsCouleurs: Object.freeze({ 1: 2, 2: 6, 3: 2 }),
  // Recoloriage (BS15) : les lignes qui arrivent gardent la forme tirée ; parmi
  // leurs seuls blocs d'une case, jusqu'à `blocs` prennent les couleurs qui
  // manquent le plus à la figure, un de plus avec la chance `chancePlus`. La
  // poussée de BS12 et BS13, qui coupait des blocs larges, changeait la difficulté.
  recolores: Object.freeze({ blocs: 1, chancePlus: 0.5 }),
})

export const REGLAGES = Object.freeze({
  // Grille : ligne du haut comprise, et utilisable (seule une ligne qui
  // monte en poussant un bloc hors de la grille fait perdre).
  colonnes: 8,
  // 14 ou 15, à choisir avec BS3 selon le confort au doigt ; pas moins de 14.
  lignes: 15,
  // Lignes en place au départ, tirées comme les autres.
  lignesDepart: 3,

  // Décor seulement : la couleur ne joue pas dans les règles.
  couleurs: Object.freeze(['jaune', 'orange', 'rouge', 'vert', 'bleu', 'bleu clair', 'violet']),

  // Tirage des lignes qui arrivent : proportions mesurées sur le jeu d'origine
  // (36 lignes, bloc 9 de l'analyse). Chaque table donne un poids par valeur.
  tirage: tirerLigne,
  proportions: Object.freeze({
    blocsParLigne: Object.freeze({ 2: 8, 3: 18, 4: 10 }),
    trousParLigne: Object.freeze({ 1: 14, 2: 18, 3: 4 }),
    // Moins de petits blocs pour un jeu moins facile (BS6 ; jeu d'origine :
    // { 1: 51, 2: 36, 3: 17, 4: 6 }). Si c'est encore trop facile, palier
    // plus dur : { 1: 10, 2: 35, 3: 30, 4: 25 }.
    largeurBloc: Object.freeze({ 1: 25, 2: 35, 3: 25, 4: 15 }),
    largeurTrou: Object.freeze({ 1: 42, 2: 14, 3: 4, 4: 2 }),
  }),
  // Défaut à confirmer en jouant : une ligne n'arrive jamais pleine (au moins
  // un trou). Ajouter un poids pour 0 dans trousParLigne changerait cela.

  // Score : 10 points par ligne effacée. Bonus, défaut à confirmer en jouant :
  // dans une même résolution, la 2e ligne effacée rapporte 20, la 3e 30, etc.,
  // qu'elles disparaissent ensemble ou en chaîne.
  pointsParLigne: 10,
  pointsLigne: (rang, reglages) => reglages.pointsParLigne * rang,

  figures: FIGURES,
})
