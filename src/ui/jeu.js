// L'écran de jeu : affiche l'état du moteur et lui relaie les gestes.
//
// Le moteur ne connaît ni l'écran ni le navigateur (BS2) ; ici on ne fait que
// poser des éléments d'après son état, et traduire un glisser au doigt (ou à la
// souris) en un déplacement de dx cases. Chaque bloc garde son id d'un état à
// l'autre : changer sa position suffit à animer son glissement, sa chute, sa
// montée, et un bloc qui disparaît d'un état à l'autre est un bloc effacé.
//
// Un coup est montré pas à pas : le moteur rend la suite des instantanés
// (dernierCoup.etapes) et l'écran les pose un par un, chacun pendant sa durée.

import {
  nouvellePartie,
  exporterPartie,
  importerPartie,
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
  partieGardee,
  garderPartie,
  oublierPartie,
  vibrer,
} from './stockage.js'

// Mise en page, en multiples de la hauteur d'une ligne (jamais figée : elle se
// calcule d'après le nombre de lignes et la place disponible).
const HAUTEUR_AVENIR = 0.5 // une ligne à venir est montrée en réduit
const ECART_AVENIR = 0.3 // entre la grille et la première ligne à venir
const ECART_ENTRE = 0.12 // entre les deux lignes à venir
const LARGEUR_MAX_SUR_HAUTEUR = 1.3 // une case n'est jamais bien plus large que haute
const DELAI_FIN_MS = 700 // laisser voir la dernière position avant « Perdu »
// Durée de chaque étape d'un coup, en ms : la seule place où les régler. Chaque
// étape ne dure que le temps de se voir, pour que le coup reste vif en chaîne.
const DUREES_MS = {
  glisse: 120, // le geste est déjà fait : juste de quoi le voir se poser
  complete: 320, // la ligne pleine s'allume
  efface: 260, // ses blocs disparaissent
  chute: 300, // ce qui n'a plus rien dessous tombe
  secours: 320, // la copie apparaît
  montee: 300, // la ligne à venir monte
  defaite: 350,
}
const DUREE_POINTS_MS = 900 // le « +10 » qui monte depuis la ligne effacée
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

  // La partie gardée se reprend telle quelle, sauf si elle est perdue ou
  // illisible (autre version du jeu) : alors une nouvelle partie commence.
  const gardee = importerPartie(partieGardee())
  let etat = gardee && !gardee.finie ? gardee : nouvellePartie()
  let meilleur = meilleurScore()
  let niveau = niveauVibration()
  let geste = null
  let minuteurFin = null
  let lecture = null // le coup en cours d'affichage : { minuteur }
  const partants = new Set() // blocs en train de disparaître
  const moinsDeMouvement = window.matchMedia?.('(prefers-reduced-motion: reduce)')
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

  function placer(rec, b, zonePlace, vue) {
    const { el } = rec
    const y = zonePlace === 'grille' ? b.ligne * g.ch : yAvenir(zonePlace === 'a1' ? 0 : 1)
    el.style.width = `${b.largeur * g.cw}px`
    el.style.height = `${zonePlace === 'grille' ? g.ch : g.ph}px`
    el.style.transform = `translate(${b.col * g.cw}px, ${y}px)`
    el.classList.remove('glisse', 'tire', 'refus', 'allume')
    el.classList.toggle('a1', zonePlace === 'a1')
    el.classList.toggle('a2', zonePlace === 'a2')
    // Pendant un coup, la ligne à venir n'est ni déplaçable ni grisée.
    const libre = !vue.anime
    el.classList.toggle('fait', libre && zonePlace === 'a1' && etat.aVenirDeplace)
    el.classList.toggle('mobile', libre && zonePlace === 'a1' && !etat.aVenirDeplace && !etat.finie)
    // La copie de secours prend la place de la ligne à venir le temps d'apparaître.
    el.classList.toggle('cache', vue.copies.length > 0 && zonePlace === 'a1' && !vue.copies.includes(b))
  }

  // Ce qu'on voit une fois le coup fini : l'état du moteur.
  const vueFinale = () => ({ blocs: etat.blocs, aVenir: etat.aVenir, copies: [], lignes: [], score: etat.score, anime: false })

  // Pose une vue (par défaut l'état du moteur) ; `duree` règle le temps des mouvements.
  function afficher({ animer = true, vue = vueFinale(), duree = 300 } = {}) {
    plateau.style.setProperty('--duree', `${duree}ms`)
    const presents = new Map()
    for (const b of vue.blocs) presents.set(b.id, [b, 'grille'])
    vue.aVenir.forEach((ligne, i) => ligne.forEach((b) => presents.set(b.id, [b, i === 0 ? 'a1' : 'a2'])))
    for (const b of vue.copies) presents.set(b.id, [b, 'a1'])

    for (const [id, [b, place]] of presents) {
      let rec = elements.get(id)
      if (!rec) {
        rec = creerBloc(b)
        elements.set(id, rec)
        placer(rec, b, place, vue)
        if (animer) rec.el.classList.add('entre')
        conteneur.appendChild(rec.el)
      } else {
        placer(rec, b, place, vue)
      }
    }
    for (const [id, rec] of elements) {
      if (presents.has(id)) continue
      elements.delete(id)
      if (animer) {
        rec.el.classList.add('efface')
        partants.add(rec.el)
        setTimeout(() => { rec.el.remove(); partants.delete(rec.el) }, duree)
      } else {
        rec.el.remove()
      }
    }
    // Les lignes pleines s'allument ; les points montent depuis chacune.
    if (animer && vue.etape === 'complete') {
      const lignes = new Set(vue.lignes.map((l) => l.ligne))
      for (const b of vue.blocs) if (lignes.has(b.ligne)) elements.get(b.id).el.classList.add('allume')
      for (const l of vue.lignes) pointsFlottants(l)
    }
    afficherScore(vue.score)
  }

  function pointsFlottants({ ligne, points }) {
    const el = document.createElement('div')
    el.className = 'points'
    el.textContent = `+${points}`
    el.style.top = `${(ligne + 0.5) * g.ch}px`
    el.style.width = `${plateau.clientWidth}px`
    conteneur.appendChild(el)
    setTimeout(() => el.remove(), DUREE_POINTS_MS)
  }

  function afficherScore(score) {
    const texte = String(score)
    if (scoreEl.textContent !== texte) {
      scoreEl.textContent = texte
      scoreEl.classList.remove('saut')
      void scoreEl.offsetWidth
      scoreEl.classList.add('saut')
    }
    if (score > meilleur) {
      meilleur = score
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

  // Garde la partie sur l'appareil : appelée après chaque changement d'état, sans
  // attendre la fin de l'animation, pour qu'un rechargement n'en perde rien.
  // Une partie perdue ne se garde pas.
  function garder() {
    if (etat.finie) oublierPartie()
    else garderPartie(exporterPartie(etat))
  }

  // --- Un coup, pas à pas ---------------------------------------------------

  // Pose les étapes l'une après l'autre. L'état du moteur est déjà le final :
  // seul l'affichage prend son temps, et peut être coupé à tout moment.
  function lireCoup(etapes) {
    let score = etat.score - etat.dernierCoup.points
    let i = 0
    lecture = { minuteur: null }
    const suite = () => {
      if (i >= etapes.length) return conclure()
      const etape = etapes[i++]
      const duree = DUREES_MS[etape.genre]
      if (etape.genre === 'complete') for (const l of etape.lignes) score += l.points
      afficher({
        duree,
        vue: {
          blocs: etape.blocs,
          aVenir: etape.aVenir,
          copies: etape.copies ?? [],
          lignes: etape.lignes ?? [],
          etape: etape.genre,
          score,
          anime: true,
        },
      })
      lecture.minuteur = setTimeout(suite, duree)
    }
    suite()
  }

  // Fin du coup, jouée jusqu'au bout ou coupée par un toucher : l'état du moteur
  // est posé et, si c'est perdu, « Perdu » ne vient qu'après.
  function conclure({ coupe = false } = {}) {
    clearTimeout(lecture?.minuteur)
    lecture = null
    if (coupe) {
      for (const el of partants) el.remove()
      partants.clear()
      sansAnimation(() => afficher({ animer: false }))
    } else {
      afficher({ animer: false })
    }
    plateau.style.removeProperty('--duree')
    if (etat.finie && minuteurFin === null) minuteurFin = setTimeout(afficherFin, DELAI_FIN_MS)
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
    if (geste) return
    if (lecture) conclure({ coupe: true }) // toucher l'écran termine le coup en cours
    if (etat.finie || dialogueOuvert()) return
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
    garder()
    vibrer(niveau)
    if (place === 'grille' && !moinsDeMouvement?.matches) {
      lireCoup(etat.dernierCoup.etapes)
    } else {
      afficher()
      if (etat.finie) minuteurFin = setTimeout(afficherFin, DELAI_FIN_MS)
    }
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
    clearTimeout(lecture?.minuteur)
    lecture = null
    geste = null
    fin.hidden = true
    reglages.hidden = true
    etat = nouvellePartie()
    garder()
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
    attente = requestAnimationFrame(() => {
      if (lecture) conclure({ coupe: true })
      sansAnimation(() => { mesurer(); afficher({ animer: false }) })
    })
  }
  window.addEventListener('resize', remesurer)
  window.addEventListener('orientationchange', remesurer)
  if (window.ResizeObserver) new ResizeObserver(remesurer).observe(zone)

  afficherVibration()
  mesurer()
  sansAnimation(() => afficher({ animer: false }))
  garder() // une partie neuve est gardée dès son premier état affiché
  app.classList.add('pret')
}
