// L'écran de jeu : affiche l'état du moteur et lui relaie les gestes.
//
// Le moteur ne connaît ni l'écran ni le navigateur (BS2) ; ici on ne fait que
// poser des éléments d'après son état, et traduire un glisser au doigt (ou à la
// souris) en un déplacement de dx cases. Chaque bloc garde son id d'un état à
// l'autre : changer sa position suffit à animer son glissement, sa chute, sa
// montée, et un bloc qui disparaît d'un état à l'autre est un bloc effacé.

import {
  nouvellePartie,
  jouer,
  deplacerAVenir,
  deplacementsPossibles,
  glissement,
  blocEn,
} from '../moteur/index.js'
import {
  NIVEAUX_VIBRATION,
  meilleurScore,
  retenirMeilleurScore,
  niveauVibration,
  retenirNiveauVibration,
  vibrer,
} from './stockage.js'

// Mise en page, en multiples de la hauteur d'une ligne (jamais figée : elle se
// calcule d'après le nombre de lignes et la place disponible).
const HAUTEUR_AVENIR = 0.5 // une ligne à venir est montrée en réduit
const ECART_AVENIR = 0.3 // entre la grille et la première ligne à venir
const ECART_ENTRE = 0.12 // entre les deux lignes à venir
const LARGEUR_MAX_SUR_HAUTEUR = 1.3 // une case n'est jamais bien plus large que haute
const DELAI_FIN_MS = 700 // laisser voir la dernière position avant « Perdu »
const DUREE_EFFACEMENT_MS = 320
const ELASTIQUE_MAX_PX = 7

const $ = (id) => document.getElementById(id)

export function demarrerJeu() {
  const app = $('app')
  const zone = $('zone')
  const plateau = $('plateau')
  const fond = $('fond')
  const conteneur = $('blocs')
  const zoneAvenir = $('zone-avenir')
  const scoreEl = $('score')
  const meilleurEl = $('meilleur-score')

  let etat = nouvellePartie()
  let meilleur = meilleurScore()
  let niveau = niveauVibration()
  let geste = null
  let minuteurFin = null
  let g = { cw: 0, ch: 0, ph: 0 }
  const elements = new Map() // id du bloc -> { el }

  // --- Mise en page -------------------------------------------------------

  function mesurer() {
    const { lignes, colonnes } = etat.reglages
    const largeur = zone.clientWidth - 16
    const hauteur = zone.clientHeight - 8
    const unites = lignes + ECART_AVENIR + 2 * HAUTEUR_AVENIR + ECART_ENTRE
    let ch = hauteur / unites
    let cw = largeur / colonnes
    if (cw > ch * LARGEUR_MAX_SUR_HAUTEUR) cw = ch * LARGEUR_MAX_SUR_HAUTEUR
    if (ch > cw) ch = cw
    g = { cw, ch, ph: ch * HAUTEUR_AVENIR }

    plateau.style.width = `${cw * colonnes}px`
    plateau.style.height = `${yAvenir(1) + g.ph}px`
    plateau.style.setProperty('--cw', `${cw}px`)
    plateau.style.setProperty('--ch', `${ch}px`)
    fond.style.width = `${cw * colonnes}px`
    fond.style.height = `${ch * lignes}px`
  }

  const yAvenir = (rang) =>
    g.ch * etat.reglages.lignes + g.ch * ECART_AVENIR + rang * (g.ph + g.ch * ECART_ENTRE)

  // --- Affichage ----------------------------------------------------------

  function creerBloc(b) {
    const el = document.createElement('div')
    el.className = 'bloc'
    el.dataset.id = b.id
    el.dataset.largeur = b.largeur
    el.dataset.couleur = b.couleur.replace(/\s+/g, '-')
    el.appendChild(document.createElement('i'))
    return { el }
  }

  function placer(rec, b, zonePlace) {
    const { el } = rec
    const y = zonePlace === 'grille' ? b.ligne * g.ch : yAvenir(zonePlace === 'a1' ? 0 : 1)
    el.style.width = `${b.largeur * g.cw}px`
    el.style.height = `${zonePlace === 'grille' ? g.ch : g.ph}px`
    el.style.transform = `translate(${b.col * g.cw}px, ${y}px)`
    el.classList.remove('glisse', 'tire', 'refus')
    el.classList.toggle('a1', zonePlace === 'a1')
    el.classList.toggle('a2', zonePlace === 'a2')
    el.classList.toggle('fait', zonePlace === 'a1' && etat.aVenirDeplace)
    el.classList.toggle('mobile', zonePlace === 'a1' && !etat.aVenirDeplace && !etat.finie)
  }

  function afficher({ animer = true } = {}) {
    const presents = new Map()
    for (const b of etat.blocs) presents.set(b.id, [b, 'grille'])
    etat.aVenir.forEach((ligne, i) => ligne.forEach((b) => presents.set(b.id, [b, i === 0 ? 'a1' : 'a2'])))

    for (const [id, [b, place]] of presents) {
      let rec = elements.get(id)
      if (!rec) {
        rec = creerBloc(b)
        elements.set(id, rec)
        placer(rec, b, place)
        if (animer) rec.el.classList.add('entre')
        conteneur.appendChild(rec.el)
      } else {
        placer(rec, b, place)
      }
    }
    for (const [id, rec] of elements) {
      if (presents.has(id)) continue
      elements.delete(id)
      if (animer) {
        rec.el.classList.add('efface')
        setTimeout(() => rec.el.remove(), DUREE_EFFACEMENT_MS)
      } else {
        rec.el.remove()
      }
    }
    afficherScore()
  }

  function afficherScore() {
    const texte = String(etat.score)
    if (scoreEl.textContent !== texte) {
      scoreEl.textContent = texte
      scoreEl.classList.remove('saut')
      void scoreEl.offsetWidth
      scoreEl.classList.add('saut')
    }
    if (etat.score > meilleur) {
      meilleur = etat.score
      retenirMeilleurScore(meilleur)
    }
    meilleurEl.textContent = String(meilleur)
  }

  function sansAnimation(fn) {
    plateau.classList.add('instant')
    fn()
    void plateau.offsetWidth
    plateau.classList.remove('instant')
  }

  // --- Geste --------------------------------------------------------------

  // Quel bloc est sous le doigt ? La ligne à venir est fine : toute sa bande,
  // et un peu au-delà, sert de zone de toucher.
  function viser(e) {
    const r = plateau.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    const { lignes, colonnes } = etat.reglages
    const col = Math.floor(x / g.cw)
    if (col < 0 || col >= colonnes || y < 0) return null
    if (y < g.ch * lignes) {
      const b = blocEn(etat, Math.floor(y / g.ch), col)
      return b ? { b, place: 'grille' } : null
    }
    if (y < yAvenir(1) + g.ph * 0.4) {
      const b = etat.aVenir[0].find((x2) => x2.col <= col && col < x2.col + x2.largeur)
      return b ? { b, place: 'a1' } : null
    }
    return null
  }

  function debutGeste(e) {
    if (geste || etat.finie || dialogueOuvert()) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const cible = viser(e)
    if (!cible) return
    e.preventDefault()
    if (cible.place === 'a1' && etat.aVenirDeplace) {
      secouer(etat.aVenir[0].map((b) => b.id))
      return
    }
    const rangee = cible.place === 'a1' ? etat.aVenir[0] : etat.blocs.filter((b) => b.ligne === cible.b.ligne)
    try { plateau.setPointerCapture(e.pointerId) } catch { /* souris sortie de la fenêtre : sans importance */ }
    geste = {
      pointeur: e.pointerId,
      id: cible.b.id,
      place: cible.place,
      x0: e.clientX,
      rangee: rangee.map((b) => ({
        id: b.id,
        col: b.col,
        y: cible.place === 'a1' ? yAvenir(0) : b.ligne * g.ch,
      })),
      limites: deplacementsPossibles(etat, cible.b.id),
      dx: 0,
    }
    for (const b of geste.rangee) elements.get(b.id).el.classList.add('glisse')
    elements.get(geste.id).el.classList.add('tire')
  }

  function mouvementGeste(e) {
    if (!geste || e.pointerId !== geste.pointeur) return
    const brut = e.clientX - geste.x0
    const voulu = Math.round(brut / g.cw)
    const { gauche, droite } = geste.limites
    const dx = Math.min(droite, Math.max(-gauche, voulu))
    geste.dx = dx

    const positions = dx === 0 ? null : glissement(etat, geste.id, dx)
    const trop = voulu !== dx // le doigt demande plus que la place disponible
    const reste = brut - dx * g.cw
    const elastique = trop ? Math.sign(reste) * Math.min(ELASTIQUE_MAX_PX, Math.abs(reste) / 4) : 0

    for (const b of geste.rangee) {
      const col = positions ? positions[b.id] : b.col
      const bouge = b.id === geste.id || col !== b.col
      const el = elements.get(b.id).el
      el.style.transform = `translate(${col * g.cw + (bouge ? elastique : 0)}px, ${b.y}px)`
      el.classList.toggle('refus', trop && bouge)
    }
  }

  function finGeste(e) {
    if (!geste || e.pointerId !== geste.pointeur) return
    const { id, place, dx } = geste
    geste = null
    try { plateau.releasePointerCapture(e.pointerId) } catch { /* déjà relâché */ }

    const suivant = dx === 0 ? null : place === 'a1' ? deplacerAVenir(etat, id, dx) : jouer(etat, id, dx)
    if (!suivant) {
      afficher() // le bloc revient à sa place
      return
    }
    etat = suivant
    afficher()
    vibrer(niveau)
    if (etat.finie) minuteurFin = setTimeout(afficherFin, DELAI_FIN_MS)
  }

  function annulerGeste(e) {
    if (!geste || e.pointerId !== geste.pointeur) return
    geste = null
    afficher()
  }

  // Un bloc qui ne peut pas bouger (ligne à venir déjà déplacée) : petit tremblement.
  function secouer(ids) {
    for (const id of ids) {
      const el = elements.get(id)?.el
      if (!el) continue
      el.classList.remove('secoue')
      void el.offsetWidth
      el.classList.add('secoue')
    }
  }

  plateau.addEventListener('pointerdown', debutGeste)
  plateau.addEventListener('pointermove', mouvementGeste)
  plateau.addEventListener('pointerup', finGeste)
  plateau.addEventListener('pointercancel', annulerGeste)
  plateau.addEventListener('lostpointercapture', annulerGeste)

  // --- Fin de partie, rejouer ---------------------------------------------

  const fin = $('fin')
  const reglages = $('reglages')
  const dialogueOuvert = () => !fin.hidden || !reglages.hidden

  function afficherFin() {
    minuteurFin = null
    $('fin-score').textContent = `Score : ${etat.score}`
    $('fin-record').hidden = !(etat.score > 0 && etat.score >= meilleur)
    fin.hidden = false
    $('fin-rejouer').focus()
  }

  function rejouer() {
    clearTimeout(minuteurFin)
    minuteurFin = null
    geste = null
    fin.hidden = true
    reglages.hidden = true
    etat = nouvellePartie()
    sansAnimation(() => {
      for (const rec of elements.values()) rec.el.remove()
      elements.clear()
      mesurer()
      afficher({ animer: false })
    })
  }

  $('fin-rejouer').addEventListener('click', rejouer)
  $('rejouer').addEventListener('click', rejouer)

  // --- Réglages -----------------------------------------------------------

  const curseur = $('vibration')
  const texteVibration = $('vibration-etat')
  const sait = typeof navigator.vibrate === 'function'

  function afficherVibration() {
    curseur.value = String(niveau)
    $('vibration-moins').disabled = niveau <= 0
    $('vibration-plus').disabled = niveau >= NIVEAUX_VIBRATION.length - 1
    texteVibration.textContent = !sait
      ? "Cet appareil ne vibre pas : ce réglage n'a pas d'effet."
      : niveau === 0 ? 'Coupée' : `Niveau ${niveau} sur ${NIVEAUX_VIBRATION.length - 1}`
  }

  function changerVibration(n, essayer) {
    niveau = Math.min(NIVEAUX_VIBRATION.length - 1, Math.max(0, n))
    retenirNiveauVibration(niveau)
    afficherVibration()
    if (essayer) vibrer(niveau)
  }

  curseur.max = String(NIVEAUX_VIBRATION.length - 1)
  curseur.addEventListener('input', () => changerVibration(Number(curseur.value), false))
  curseur.addEventListener('change', () => vibrer(niveau))
  $('vibration-moins').addEventListener('click', () => changerVibration(niveau - 1, true))
  $('vibration-plus').addEventListener('click', () => changerVibration(niveau + 1, true))

  function ouvrirReglages() {
    if (!fin.hidden) return
    reglages.hidden = false
    $('reglages-fermer').focus()
  }
  function fermerReglages() {
    reglages.hidden = true
    $('reglages-ouvrir').focus()
  }

  $('reglages-ouvrir').addEventListener('click', ouvrirReglages)
  $('reglages-fermer').addEventListener('click', fermerReglages)
  reglages.addEventListener('click', (e) => { if (e.target === reglages) fermerReglages() })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !reglages.hidden) fermerReglages()
  })

  // --- Démarrage ----------------------------------------------------------

  let attente = 0
  const remesurer = () => {
    cancelAnimationFrame(attente)
    attente = requestAnimationFrame(() => sansAnimation(() => { mesurer(); afficher({ animer: false }) }))
  }
  window.addEventListener('resize', remesurer)
  window.addEventListener('orientationchange', remesurer)
  if (window.ResizeObserver) new ResizeObserver(remesurer).observe(zone)

  afficherVibration()
  mesurer()
  sansAnimation(() => afficher({ animer: false }))
  app.classList.add('pret')
}
