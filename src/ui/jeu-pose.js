// Point d'entrée de block-pose (BS39) : écran provisoire, remplacé par le vrai jeu dans
// les tâches suivantes. Tant que le jeu n'est pas disponible (src/jeux.js), personne ne
// peut le choisir : ce module ne s'affiche donc jamais à un joueur.

export function demarrerJeu() {
  const message = document.getElementById('message')
  message.textContent = 'Block pose : bientôt.'
  message.hidden = false
}
