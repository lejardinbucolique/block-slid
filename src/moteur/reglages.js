// Tous les réglages du jeu, en un seul endroit (cadrage BS2).
// Pour essayer d'autres valeurs : nouvellePartie({ reglages: { ...REGLAGES, lignes: 14 } }).

import { tirerLigne } from './tirage.js'

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
})
