// Mise à jour pendant qu'on joue (BS56) : tant que l'app est visible, elle cherche
// une nouvelle version toutes les 5 minutes ; quand elle arrive, la page se recharge
// seule, mais jamais au milieu d'un geste (pièce tenue, effacement en cours).
export const INTERVALLE_VERIFICATION = 5 * 60 * 1000

// Suit les doigts posés sur la page, pour les deux jeux, sans toucher à leur code.
export function suivreGestes(doc) {
  const tenus = new Set()
  const relacher = (e) => tenus.delete(e.pointerId)
  doc.addEventListener('pointerdown', (e) => tenus.add(e.pointerId), true)
  doc.addEventListener('pointerup', relacher, true)
  doc.addEventListener('pointercancel', relacher, true)
  return () => tenus.size > 0
}

// Une animation finie en cours (effacement, chute) ; les décors en boucle ne comptent pas.
export function animationEnCours(doc) {
  if (typeof doc.getAnimations !== 'function') return false
  return doc.getAnimations().some((a) => {
    if (a.playState !== 'running') return false
    const iterations = a.effect?.getTiming?.().iterations
    return iterations !== Infinity
  })
}

// Recharge dès que rien n'est en cours, en revérifiant à intervalle court.
export function rechargerApresGeste({ occupe, recharger, attendre = (f) => setTimeout(f, 200) }) {
  const essayer = () => (occupe() ? attendre(essayer) : recharger())
  essayer()
}

// Vérifie toutes les 5 minutes, seulement quand la page est visible.
export function verifierRegulierement({ doc, verifier, intervalle = INTERVALLE_VERIFICATION, minuteur = setInterval, arreter = clearInterval }) {
  let id = null
  const regler = () => {
    if (doc.visibilityState === 'visible') {
      if (id === null) id = minuteur(verifier, intervalle)
    } else if (id !== null) {
      arreter(id)
      id = null
    }
  }
  doc.addEventListener('visibilitychange', regler)
  regler()
}
