// L'écran de block-pose (BS45) : affiche l'état du moteur (src/pose/) et lui relaie les gestes.
//
// Le moteur ne connaît ni l'écran ni le navigateur ; les calculs du geste (de la position du
// doigt à la case visée, aperçu du coup) sont dans geste.js, sans DOM, et testés seuls. Ici on ne
// fait que poser des éléments d'après l'état et traduire les gestes en appels au moteur.
//
// Tout le HTML est créé ici, sous une racine #pose : block-slid garde sa page telle quelle, ses
// éléments sont seulement masqués (pose.css) tant que ce jeu est choisi. Les identifiants et les
// classes de ce jeu commencent par « pose- » pour ne jamais croiser ceux de block-slid.
// Le décor vient de variables CSS sur #pose (pose.css) ; `data-style` y porte la texture des
// blocs en cours, de quoi la rhabiller ensuite (BS46, BS47).

import {
  REGLAGES,
  PALETTE,
  SORTES,
  RESERVE_MAX,
  NIVEAU_MIN,
  NIVEAU_MAX,
  LIGNES_MAX_PAR_COUP,
  AU_CHOIX,
  piece,
  reserveInitiale,
  lireReserve,
  nouvellePartie,
  poser,
  positionsPossibles,
  piecesJouables,
  bloquee,
  perdue,
  choisirBonus,
  peutUtiliser,
  supprimerPiece,
  tournerPiece,
  changerPieces,
  annulerCoup,
  exporterPartie,
  importerPartie,
  apercuCoup,
  casesElevees,
  caseVisee,
  centreEffacement,
  sensEffacement,
  tailleCellule,
} from './index.js'
import { JEU_BLOCK_POSE, JEUX } from '../jeux.js'
import {
  NIVEAUX_VIBRATION,
  meilleurScorePose,
  retenirMeilleurScorePose,
  niveauVibration,
  retenirNiveauVibration,
  niveauPose,
  retenirNiveauPose,
  stylePoseGarde,
  retenirStylePose,
  reservePose,
  reservePoseExiste,
  garderReservePose,
  partiePoseGardee,
  garderPartiePose,
  oublierPartiePose,
  vibrer,
} from '../ui/stockage.js'
import { STYLE_UNI, stylesDebloques, nouveauxStyles, styleAutorise, resumeStyles } from '../ui/styles.js'

// --- Réglages de l'écran (la seule place où les caler) ---------------------------------------

// Taille d'une pièce dans sa rangée, en fraction de la case de la grille : celles à poser, puis
// l'aperçu, plus petit. Les rangées sont assez hautes pour la pièce la plus haute du catalogue.
const ECHELLE_MAIN = 0.5
const ECHELLE_APERCU = 0.3
const RANGEES_MAX = LIGNES_MAX_PAR_COUP
const MARGE_LATERALE_PX = 8
const CADRE_PX = 5
// La pièce tirée s'affiche au-dessus du doigt : de combien de cases, entre son bord bas et lui.
const DECALAGE_DOIGT_CASES = 1.15
// Durées des étapes d'un coup, en ms : juste de quoi les voir, pour que la chaîne reste vive.
const DUREE_POSE_MS = 140
const DUREE_EFFACE_MS = 300
// Sous une texture, l'effacement se joue comme celui de block-slid : la ligne ou la colonne pleine
// s'allume (le fil de la Laine, l'éclat du Verre...), puis ses cases disparaissent.
const DUREE_ALLUME_MS = 320
const DUREE_EFFACE_STYLE_MS = 260
const DUREE_POINTS_MS = 1000
const DUREE_ENVOL_MS = 150
const DUREE_RETOUR_MS = 190
const DUREE_PULSE_MS = 800
const DUREE_INFO_MS = 2600
const DELAI_CHOIX_MS = 500
const DELAI_FIN_MS = 700
const DUREE_MESSAGE_MS = 4000

const BONUS = Object.freeze({
  supprimer: {
    nom: 'Supprimer',
    titre: 'Supprimer une pièce',
    consigne: 'Touchez la pièce à supprimer',
    icone: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10.5 11v5M13.5 11v5"/>',
  },
  tourner: {
    nom: 'Tourner',
    titre: 'Tourner une pièce',
    consigne: 'Touchez la pièce à tourner',
    icone: '<path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M19 4v4h-4"/>',
  },
  changer: {
    nom: 'Changer',
    titre: 'Changer les trois pièces',
    icone: '<path d="M4 8h13M14 5l3 3-3 3"/><path d="M20 16H7M10 13l-3 3 3 3"/>',
  },
  annuler: {
    nom: 'Annuler',
    titre: 'Annuler le dernier coup',
    icone: '<path d="M9 5L4 10l5 5"/><path d="M4 10h9a5 5 0 0 1 0 10h-4"/>',
  },
})

const TEXTE_CAUSE = Object.freeze({
  lignes: 'Grand coup',
  croisement: 'Lignes et colonnes d\'un coup',
  grilleVidee: 'Grille vidée',
  defi: 'Défi réussi',
  palier: 'Palier de score',
  surprise: 'Case surprise gagnée',
})

const TROPHEE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V17h3v2h1v2H7v-2h1v-2h3v-2.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3V3Zm-1 4v1a2 2 0 0 0 1.2 1.8A6 6 0 0 1 7 8V7H6Zm12 0h-1v1a6 6 0 0 1-.2 1.8A2 2 0 0 0 18 8V7Z"/></svg>'
const ENGRENAGE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6a.5.5 0 0 0 .1-.6l-2-3.5a.5.5 0 0 0-.6-.2l-2.5 1a7.3 7.3 0 0 0-1.7-1l-.4-2.6a.5.5 0 0 0-.5-.4h-4a.5.5 0 0 0-.5.4l-.4 2.6a7.3 7.3 0 0 0-1.7 1l-2.5-1a.5.5 0 0 0-.6.2l-2 3.5a.5.5 0 0 0 .1.6L4.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6a.5.5 0 0 0-.1.6l2 3.5c.1.2.4.3.6.2l2.5-1c.5.4 1.1.7 1.7 1l.4 2.6c0 .2.3.4.5.4h4c.2 0 .5-.2.5-.4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1c.2.1.5 0 .6-.2l2-3.5a.5.5 0 0 0-.1-.6L19.4 13ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"/></svg>'
const CROIX = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg>'
const icone = (sorte) => `<svg viewBox="0 0 24 24" aria-hidden="true">${BONUS[sorte].icone}</svg>`

const VALEUR_COULEUR = Object.freeze(Object.fromEntries(PALETTE.map((c) => [c.id, c.valeur])))
const couleurDe = (id) => VALEUR_COULEUR[id] ?? '#8a8a8a'

const $ = (id) => document.getElementById(id)
const fmt = (n) => Number(n).toLocaleString('fr-FR')
const pluriel = (n, un, plusieurs) => `${fmt(n)} ${n > 1 ? plusieurs : un}`

// La feuille de style du jeu, chargée seulement quand il est choisi : block-slid ne la voit jamais.
function chargerFeuille() {
  return new Promise((resolve) => {
    const lien = document.createElement('link')
    lien.rel = 'stylesheet'
    lien.href = new URL('./pose.css', import.meta.url).href
    lien.onload = lien.onerror = () => resolve()
    document.head.append(lien)
    setTimeout(resolve, 3000) // jamais bloqué par une feuille qui ne vient pas
  })
}

// La réserve de bonus du joueur : créée une seule fois, à la première utilisation, avec 3 de
// chaque sorte (BS38) ; ensuite gardée d'une partie à l'autre. Une réserve déjà gardée n'est
// jamais refaite, même vide ou en partie illisible.
function reserveDuJoueur() {
  if (!reservePoseExiste()) {
    const initiale = reserveInitiale()
    garderReservePose(initiale)
    return initiale
  }
  const lue = reservePose()
  return lireReserve(Object.fromEntries(SORTES.map((s) => [s, lue[s] ?? 0])))
}

// Le nom du jeu, en haut de l'écran (BS49) : pris du registre des jeux.
const NOM_JEU = JEUX.find((j) => j.id === JEU_BLOCK_POSE).nom

const HTML_RACINE = `
  <header id="pose-haut">
    <div id="pose-nom">${NOM_JEU}</div>
    <div id="pose-meilleur" aria-label="Meilleur score">${TROPHEE}<span id="pose-meilleur-score">0</span></div>
    <div id="pose-score-bloc">
      <div id="pose-score" aria-label="Score">0</div>
      <div id="pose-serie" hidden></div>
    </div>
    <button id="pose-reglages-ouvrir" type="button" aria-label="Réglages">${ENGRENAGE}</button>
    <div id="pose-defi" aria-label="Défi en cours">
      <div id="pose-defi-texte"></div>
      <div id="pose-defi-barre"><i id="pose-defi-jauge"></i><span id="pose-defi-reste"></span></div>
    </div>
  </header>
  <div id="pose-zone">
    <div id="pose-plateau">
      <div id="pose-grille" role="application" aria-label="Grille de jeu"></div>
      <div id="pose-effets" aria-hidden="true"></div>
    </div>
  </div>
  <div id="pose-main" role="group" aria-label="Pièces à poser"></div>
  <div id="pose-apercu" role="group" aria-label="Pièces suivantes"></div>
  <div id="pose-aide" role="status" aria-live="polite"></div>
  <div id="pose-bonus" role="group" aria-label="Bonus"></div>
  <div id="pose-infos" aria-live="polite"></div>

  <div id="pose-fin" class="voile" hidden>
    <div class="fenetre" role="dialog" aria-modal="true" aria-labelledby="pose-fin-titre">
      <h2 id="pose-fin-titre">Perdu</h2>
      <p id="pose-fin-score"></p>
      <p id="pose-fin-record" hidden>Nouveau meilleur score !</p>
      <button id="pose-fin-rejouer" class="gros" type="button">Rejouer</button>
    </div>
  </div>

  <div id="pose-choix" class="voile" hidden>
    <div class="fenetre" role="dialog" aria-modal="true" aria-labelledby="pose-choix-titre">
      <h2 id="pose-choix-titre">Grille vidée !</h2>
      <p>Choisissez votre bonus.</p>
      <div id="pose-choix-liste"></div>
    </div>
  </div>

  <div id="pose-reglages" class="voile" hidden>
    <div class="fenetre" role="dialog" aria-modal="true" aria-labelledby="pose-reglages-titre">
      <button id="pose-reglages-fermer" class="croix" type="button" aria-label="Fermer">${CROIX}</button>
      <h2 id="pose-reglages-titre">Réglages</h2>

      <div class="reglage" id="pose-reglage-vibration">
        <label for="pose-vibration">Vibration</label>
        <div class="curseur">
          <button id="pose-vibration-moins" type="button" aria-label="Moins de vibration">−</button>
          <input id="pose-vibration" type="range" min="0" max="5" step="1" value="2">
          <button id="pose-vibration-plus" type="button" aria-label="Plus de vibration">+</button>
        </div>
        <p id="pose-vibration-etat" aria-live="polite"></p>
      </div>

      <div class="reglage" id="pose-reglage-niveau">
        <label for="pose-niveau">Niveau</label>
        <div class="curseur">
          <button id="pose-niveau-moins" type="button" aria-label="Niveau plus bas">−</button>
          <input id="pose-niveau" type="range" min="${NIVEAU_MIN}" max="${NIVEAU_MAX}" step="1" value="${NIVEAU_MIN}">
          <button id="pose-niveau-plus" type="button" aria-label="Niveau plus haut">+</button>
        </div>
        <p id="pose-niveau-etat" aria-live="polite"></p>
      </div>

      <div class="reglage" id="pose-reglage-style">
        <label for="pose-style">Style des blocs</label>
        <select id="pose-style"></select>
        <p id="pose-styles-etat" aria-live="polite"></p>
      </div>

      <button id="pose-rejouer" class="gros" type="button">Rejouer</button>
    </div>
  </div>
`

export async function demarrerJeu() {
  await chargerFeuille()

  const app = $('app')
  app.classList.add('jeu-pose')
  const racine = document.createElement('div')
  racine.id = 'pose'
  racine.innerHTML = HTML_RACINE
  app.append(racine)

  const haut = $('pose-haut')
  const grilleEl = $('pose-grille')
  const effets = $('pose-effets')
  const bonusEl = $('pose-bonus')
  const aideEl = $('pose-aide')
  const mainEl = $('pose-main')
  const apercuEl = $('pose-apercu')
  const infos = $('pose-infos')
  const scoreEl = $('pose-score')
  const serieEl = $('pose-serie')
  const defiEl = $('pose-defi')
  const fin = $('pose-fin')
  const choix = $('pose-choix')
  const reglages = $('pose-reglages')
  const moinsDeMouvement = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  const sansMouvement = () => Boolean(moinsDeMouvement?.matches)

  // Ce qui est monté depuis la fenêtre de block-slid : le choix du jeu, l'installation de
  // l'appli et la version, dont app.js tient déjà les éléments et les gestes.
  const fenetreReglages = reglages.querySelector('.fenetre')
  const ligneJeu = $('reglage-jeu')
  if (ligneJeu) fenetreReglages.insertBefore(ligneJeu, $('pose-reglage-vibration'))
  for (const id of ['installation', 'version']) {
    const el = $(id)
    if (el) fenetreReglages.append(el)
  }

  // --- État -----------------------------------------------------------------------------

  let meilleur = meilleurScorePose()
  let style = styleAutorise(stylePoseGarde(), meilleur, JEU_BLOCK_POSE)
  let vibration = niveauVibration()
  let niveau = niveauPose()
  let etat = partieDepart()
  let visee = null // le bonus « supprimer » ou « tourner » qui attend qu'on touche une pièce
  let glisse = null // la pièce en train d'être tirée
  let lecture = null // le coup en cours d'affichage : { minuteurs, fin }
  let minuteurFin = null
  let minuteurChoix = null
  let minuteurMessage = null
  let minuteurDecor = null
  let cellule = 0
  let signatures = { main: [], apercu: [] }
  let premierAffichage = true
  let touchees = [] // les cases de la grille marquées par l'aperçu du coup

  racine.dataset.style = style

  // La partie gardée se reprend telle quelle, sauf si elle est perdue ou illisible (autre
  // version du jeu) : alors une nouvelle partie commence, avec la réserve et le niveau du joueur.
  function partieDepart() {
    const reprise = importerPartie(partiePoseGardee())
    if (reprise && !perdue(reprise)) return reprise
    return nouvellePartie({ niveau, reserve: reserveDuJoueur() })
  }

  // Garde la partie et la réserve sur l'appareil, après chaque changement d'état, sans attendre
  // la fin de l'animation : un rechargement n'en perd rien. Une partie perdue ne se garde pas.
  function garder() {
    garderReservePose(etat.reserve)
    if (perdue(etat)) oublierPartiePose()
    else garderPartiePose(exporterPartie(etat))
  }

  // --- Construction des éléments fixes ----------------------------------------------------

  // Un bloc, une case de pièce : le même dessin sur la grille, dans les rangées de pièces et sous le
  // doigt. Comme un bloc de block-slid, il tient en deux éléments : l'enveloppe (.pose-bloc, qui
  // porte la couleur et l'état d'une animation) et le dessin (<i>), que les styles de style.css
  // habillent à l'identique dans les deux jeux (pose.css leur donne les variables qu'ils lisent).
  // `petit` : une pièce de la main ou de l'aperçu, qui prend la variante réduite des styles.
  function creerBloc(petit = false) {
    const bloc = document.createElement('div')
    bloc.className = petit ? 'pose-bloc a1' : 'pose-bloc'
    bloc.dataset.largeur = '1'
    bloc.append(document.createElement('i'))
    return bloc
  }

  const cases = []
  for (let l = 0; l < REGLAGES.lignes; l++) {
    for (let k = 0; k < REGLAGES.colonnes; k++) {
      const el = document.createElement('div')
      el.className = 'pose-case'
      const bloc = creerBloc()
      el.append(bloc)
      grilleEl.append(el)
      cases.push({ el, bloc })
    }
  }
  const laCase = (l, k) => cases[l * REGLAGES.colonnes + k]

  const boutonsBonus = {}
  for (const sorte of SORTES) {
    const bouton = document.createElement('button')
    bouton.type = 'button'
    bouton.className = 'pose-bonus-bouton'
    bouton.dataset.sorte = sorte
    bouton.title = BONUS[sorte].titre
    bouton.innerHTML = `${icone(sorte)}<span class="pose-bonus-nombre"></span>`
    bouton.addEventListener('click', () => utiliserBonus(sorte))
    bonusEl.append(bouton)
    boutonsBonus[sorte] = bouton
  }

  const emplacements = []
  const emplacementsApercu = []
  for (let i = 0; i < REGLAGES.piecesParTour; i++) {
    const slot = document.createElement('div')
    slot.className = 'pose-emplacement'
    slot.dataset.index = String(i)
    mainEl.append(slot)
    emplacements.push(slot)
    const petit = document.createElement('div')
    petit.className = 'pose-emplacement pose-petit'
    apercuEl.append(petit)
    emplacementsApercu.push(petit)
  }

  // --- Mise en page ---------------------------------------------------------------------

  function mesurer() {
    const cs = getComputedStyle(racine)
    const px = (v) => Number.parseFloat(v) || 0
    const largeur = racine.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight) - 2 * MARGE_LATERALE_PX
    const hauteur = racine.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom)
    const ecart = px(cs.rowGap)
    // Six blocs l'un sous l'autre : en-tête, grille, pièces, aperçu, aide, bonus.
    const fixe = haut.offsetHeight + bonusEl.offsetHeight + aideEl.offsetHeight + 5 * ecart + 2 * CADRE_PX
    cellule = tailleCellule({
      largeur: largeur - 2 * CADRE_PX,
      hauteur,
      fixe,
      colonnes: REGLAGES.colonnes,
      lignes: REGLAGES.lignes,
      piecesEnCases: RANGEES_MAX * (ECHELLE_MAIN + ECHELLE_APERCU),
    })
    const fixer = (nom, valeur) => racine.style.setProperty(nom, valeur)
    fixer('--cell', `${cellule}px`)
    fixer('--cm', `${cellule * ECHELLE_MAIN}px`)
    fixer('--ca', `${cellule * ECHELLE_APERCU}px`)
    fixer('--haut-main', `${cellule * ECHELLE_MAIN * RANGEES_MAX}px`)
    fixer('--haut-apercu', `${cellule * ECHELLE_APERCU * RANGEES_MAX}px`)
    fixer('--largeur-grille', `${cellule * REGLAGES.colonnes}px`)
    fixer('--cols', String(REGLAGES.colonnes)) // les textures étalent leur animation sur une ligne de cette longueur
  }

  // --- Dessin ---------------------------------------------------------------------------

  // Les cases de la grille d'après `grille` (l'état par défaut) ; `surprise` est la case à
  // numéro à montrer. Efface au passage toute marque d'aperçu ou d'animation.
  function dessinerGrille(grille = etat.grille, surprise = etat.surprise) {
    touchees = []
    for (let l = 0; l < REGLAGES.lignes; l++) {
      for (let k = 0; k < REGLAGES.colonnes; k++) {
        const { el, bloc } = laCase(l, k)
        const valeur = grille[l][k]
        const estSurprise = Boolean(surprise) && valeur !== null && surprise.ligne === l && surprise.col === k
        el.className = `pose-case${valeur !== null ? ' occupee' : ''}${estSurprise ? ' surprise' : ''}`
        bloc.className = 'pose-bloc'
        bloc.style.removeProperty('--col')
        if (valeur !== null) bloc.style.setProperty('--couleur', couleurDe(valeur))
        if (estSurprise) el.dataset.reste = String(surprise.reste)
        else delete el.dataset.reste
      }
    }
  }

  function dessinerScore(score = etat.score) {
    const texte = fmt(score)
    if (scoreEl.textContent !== texte) {
      scoreEl.textContent = texte
      scoreEl.classList.remove('saut')
      void scoreEl.offsetWidth
      scoreEl.classList.add('saut')
    }
    if (score > meilleur) {
      const avant = meilleur
      meilleur = score
      retenirMeilleurScorePose(meilleur)
      const nouveaux = nouveauxStyles(avant, meilleur, JEU_BLOCK_POSE)
      if (nouveaux.length) annoncerStyle(nouveaux)
    }
    $('pose-meilleur-score').textContent = fmt(meilleur)
  }

  // Un style de plus à portée : un petit message discret, qui s'en va seul (celui de block-slid).
  function annoncerStyle(nouveaux) {
    const message = $('message')
    message.textContent = `Nouveau style : ${nouveaux.map((s) => s.nom).join(', ')}`
    message.hidden = false
    clearTimeout(minuteurMessage)
    minuteurMessage = setTimeout(() => { message.hidden = true }, DUREE_MESSAGE_MS)
    afficherStyles()
  }

  function dessinerDefi() {
    const d = etat.defi
    $('pose-defi-texte').textContent = `Défi : ${pluriel(d.points, 'point', 'points')} en ${pluriel(d.coups, 'coup', 'coups')}`
    const reste = d.coups - d.coupsFaits
    $('pose-defi-reste').textContent = `reste ${reste}`
    const part = Math.min(1, Math.max(0, (etat.score - d.scoreDebut) / d.points))
    $('pose-defi-jauge').style.width = `${Math.round(part * 100)}%`
  }

  // La série : quand elle compte, le multiplicateur que rapporterait le prochain coup qui efface.
  function dessinerSerie() {
    const montre = etat.serie >= 1
    const prochain = Math.min(etat.serie + 1, etat.reglages.plafondSerie)
    serieEl.hidden = !montre
    if (!montre) return
    const texte = `×${prochain}`
    if (serieEl.textContent !== texte) {
      serieEl.textContent = texte
      serieEl.classList.remove('saut')
      void serieEl.offsetWidth
      serieEl.classList.add('saut')
    }
    serieEl.title = `Série : un coup qui efface rapporte maintenant ×${prochain}`
  }

  // Un bonus est utilisable s'il en reste en réserve et si son effet est possible.
  function utilisable(sorte) {
    if (sorte === 'supprimer' || sorte === 'tourner') return etat.enCours.some((x, i) => x && peutUtiliser(etat, sorte, i))
    return peutUtiliser(etat, sorte)
  }

  function dessinerBonus() {
    if (visee && !utilisable(visee)) visee = null
    for (const sorte of SORTES) {
      const bouton = boutonsBonus[sorte]
      const n = etat.reserve[sorte]
      bouton.querySelector('.pose-bonus-nombre').textContent = String(n)
      const possible = utilisable(sorte)
      bouton.disabled = !possible && visee !== sorte
      bouton.classList.toggle('grise', !possible)
      bouton.classList.toggle('actif', visee === sorte)
      bouton.setAttribute('aria-pressed', String(visee === sorte))
      bouton.setAttribute('aria-label', `${BONUS[sorte].titre}, ${n} en réserve${n === RESERVE_MAX ? ' (plein)' : ''}`)
    }
  }

  function dessinerAide() {
    let texte = ''
    if (visee) texte = BONUS[visee].consigne
    else if (bloquee(etat) && !perdue(etat)) texte = 'Aucune pièce ne se pose : utilisez un bonus.'
    aideEl.textContent = texte
    aideEl.classList.toggle('alerte', !visee && texte !== '')
  }

  // Une pièce de la main ou de l'aperçu, à la taille `taille` (une variable CSS).
  function elementPiece(enMain, taille) {
    const petit = taille !== '--cell'
    const p = piece(enMain.id)
    const el = document.createElement('div')
    el.className = 'pose-piece'
    el.style.gridTemplate = `repeat(${p.hauteur}, var(${taille})) / repeat(${p.largeur}, var(${taille}))`
    p.cases.forEach((c, i) => {
      const bloc = creerBloc(petit)
      bloc.style.gridArea = `${c.ligne + 1} / ${c.col + 1}`
      bloc.style.setProperty('--couleur', couleurDe(enMain.couleurs?.[i] ?? enMain.couleur))
      if (enMain.surprise && enMain.surprise.ligne === c.ligne && enMain.surprise.col === c.col) {
        bloc.classList.add('surprise')
        const marque = document.createElement('b')
        marque.textContent = '?'
        bloc.append(marque)
      }
      el.append(bloc)
    })
    return el
  }

  const signature = (x) => (x ? `${x.id}|${x.couleur}|${x.couleurs?.join(',') ?? ''}|${x.surprise ? 's' : ''}` : '')

  // Les pièces de la main et de l'aperçu. Une place dont la pièce n'a pas changé garde son
  // élément (et son animation en cours) ; une pièce nouvelle entre d'un petit saut.
  function dessinerPieces() {
    const jouables = new Set(piecesJouables(etat))
    const nouvelles = { main: etat.enCours.map(signature), apercu: etat.suivantes.map(signature) }
    const rangees = [
      ['main', emplacements, etat.enCours, '--cm'],
      ['apercu', emplacementsApercu, etat.suivantes, '--ca'],
    ]
    for (const [nom, slots, pieces, taille] of rangees) {
      slots.forEach((slot, i) => {
        const x = pieces[i]
        if (signatures[nom][i] !== nouvelles[nom][i] || (x && !slot.firstChild)) {
          slot.replaceChildren()
          slot.classList.remove('entre', 'tourne', 'refus')
          if (x) {
            slot.append(elementPiece(x, taille))
            if (!premierAffichage && !sansMouvement()) {
              void slot.offsetWidth
              const tourne = nom === 'main' && etat.dernierBonus?.sorte === 'tourner' && etat.dernierBonus.index === i
              slot.classList.add(tourne ? 'tourne' : 'entre')
            }
          }
        }
        slot.classList.toggle('vide', !x)
        slot.classList.toggle('bloquee', nom === 'main' && Boolean(x) && !jouables.has(i))
        slot.classList.toggle('visable', nom === 'main' && Boolean(x) && visee !== null && peutUtiliser(etat, visee, i))
      })
    }
    signatures = nouvelles
    premierAffichage = false
  }

  function dessinerTout() {
    dessinerGrille()
    dessinerScore()
    dessinerDefi()
    dessinerSerie()
    dessinerBonus()
    dessinerPieces()
    dessinerAide()
  }

  // --- Aperçu du coup pendant le glisser --------------------------------------------------

  function effacerApercu() {
    for (const { el } of touchees) el.classList.remove('ombre', 'vise', 'eleve')
    touchees = []
  }

  function montrerApercu(apercu, enMain) {
    effacerApercu()
    if (!apercu?.valide) return
    apercu.cases.forEach((c, i) => {
      const cible = laCase(c.ligne, c.col)
      cible.bloc.style.setProperty('--couleur', couleurDe(enMain.couleurs?.[i] ?? enMain.couleur))
      cible.el.classList.add('ombre', 'vise')
      touchees.push(cible)
    })
    for (const c of casesElevees(apercu, REGLAGES.lignes, REGLAGES.colonnes)) {
      const cible = laCase(c.ligne, c.col)
      cible.el.classList.add('eleve')
      if (!touchees.includes(cible)) touchees.push(cible)
    }
  }

  // --- Geste : tirer une pièce ------------------------------------------------------------

  function viser(e) {
    const r = grilleEl.getBoundingClientRect()
    const p = piece(glisse.enMain.id)
    return caseVisee({
      x: e.clientX,
      y: e.clientY,
      hauteur: p.hauteur,
      largeur: p.largeur,
      cellule,
      origine: { x: r.left, y: r.top },
      decalage: DECALAGE_DOIGT_CASES * cellule,
      lignes: REGLAGES.lignes,
      colonnes: REGLAGES.colonnes,
    })
  }

  function placerFantome(e) {
    const p = piece(glisse.enMain.id)
    const gx = e.clientX - (p.largeur * cellule) / 2
    const gy = e.clientY - DECALAGE_DOIGT_CASES * cellule - p.hauteur * cellule
    glisse.fantome.style.translate = `${gx}px ${gy}px`
    glisse.fantome.style.scale = '1'
  }

  function debutGlisse(e) {
    if (glisse) return
    const slot = e.target.closest?.('.pose-emplacement')
    if (!slot || e.pointerType === 'mouse' && e.button !== 0) return
    if (dialogueOuvert()) return
    if (lecture) conclure()
    const index = Number(slot.dataset.index)
    const enMain = etat.enCours[index]
    if (!enMain) return
    e.preventDefault()
    if (visee) {
      appliquerSurPiece(visee, index)
      return
    }
    // Une pièce qui ne tient nulle part ne se tire pas : elle se secoue (et l'aide dit quoi faire).
    if (positionsPossibles(etat, index).length === 0) {
      slot.classList.remove('refus')
      void slot.offsetWidth
      slot.classList.add('refus')
      return
    }
    const source = slot.querySelector('.pose-piece')
    const depart = source.getBoundingClientRect()
    const fantome = elementPiece(enMain, '--cell')
    fantome.classList.add('pose-fantome', 'vole')
    fantome.style.translate = `${depart.left}px ${depart.top}px`
    fantome.style.scale = String(ECHELLE_MAIN)
    racine.append(fantome)
    try { mainEl.setPointerCapture(e.pointerId) } catch { /* souris sortie de la fenêtre : sans importance */ }
    glisse = { pointeur: e.pointerId, index, enMain, slot, fantome, cle: null, apercu: null }
    void fantome.offsetWidth // le départ est posé : la suite s'anime depuis lui
    slot.classList.add('leve')
    placerFantome(e)
    glisse.minuteurVol = setTimeout(() => fantome.classList.remove('vole'), sansMouvement() ? 0 : DUREE_ENVOL_MS)
    mouvementGlisse(e)
  }

  function mouvementGlisse(e) {
    if (!glisse || e.pointerId !== glisse.pointeur) return
    placerFantome(e)
    const cible = viser(e)
    const cle = cible ? `${cible.ligne},${cible.col}` : null
    if (cle === glisse.cle) return
    glisse.cle = cle
    const p = piece(glisse.enMain.id)
    glisse.apercu = cible ? apercuCoup(etat.grille, p.cases, cible.ligne, cible.col) : null
    glisse.fantome.classList.toggle('invalide', Boolean(glisse.apercu) && !glisse.apercu.valide)
    montrerApercu(glisse.apercu, glisse.enMain)
  }

  function finGlisse(e) {
    if (!glisse || e.pointerId !== glisse.pointeur) return
    const g = glisse
    const cible = viser(e)
    try { mainEl.releasePointerCapture(e.pointerId) } catch { /* déjà relâché */ }
    glisse = null
    clearTimeout(g.minuteurVol)
    const p = piece(g.enMain.id)
    const apercu = cible ? apercuCoup(etat.grille, p.cases, cible.ligne, cible.col) : null
    if (!apercu?.valide) {
      retour(g)
      return
    }
    // Les cases du coup sont montrées par l'aperçu jusqu'à ce que le coup les remplace.
    g.fantome.remove()
    g.slot.classList.remove('leve')
    const avant = etat
    const suivant = poser(etat, g.index, cible.ligne, cible.col)
    if (!suivant) {
      retour(g)
      return
    }
    jouerCoup(avant, suivant)
  }

  // La pièce revient à sa place : endroit impossible, hors de la grille ou geste interrompu.
  function retour(g) {
    effacerApercu()
    clearTimeout(g.minuteurVol)
    const termine = () => {
      g.fantome.remove()
      g.slot.classList.remove('leve')
    }
    const source = g.slot.querySelector('.pose-piece')
    if (sansMouvement() || !source) {
      termine()
      return
    }
    const cible = source.getBoundingClientRect()
    g.fantome.classList.remove('vole', 'invalide')
    g.fantome.classList.add('retour')
    g.fantome.style.translate = `${cible.left}px ${cible.top}px`
    g.fantome.style.scale = String(ECHELLE_MAIN)
    setTimeout(termine, DUREE_RETOUR_MS)
  }

  function annulerGlisse(e) {
    if (!glisse || e.pointerId !== glisse.pointeur) return
    const g = glisse
    glisse = null
    retour(g)
  }

  mainEl.addEventListener('pointerdown', debutGlisse)
  mainEl.addEventListener('pointermove', mouvementGlisse)
  mainEl.addEventListener('pointerup', finGlisse)
  mainEl.addEventListener('pointercancel', annulerGlisse)
  mainEl.addEventListener('lostpointercapture', annulerGlisse)
  racine.addEventListener('contextmenu', (e) => e.preventDefault())

  // --- Un coup, pas à pas -----------------------------------------------------------------

  // Pose le coup `suivant` joué depuis `avant` : l'état du moteur est déjà le final ; seul
  // l'affichage prend son temps, et peut être coupé à tout moment (toucher l'écran).
  function jouerCoup(avant, suivant) {
    const coup = suivant.dernierCoup
    etat = suivant
    visee = null
    garder()
    vibrer(vibration)
    effacerApercu()
    const apres = () => {
      dessinerTout()
      apresCoup(avant, coup)
    }
    if (sansMouvement() || coup.casesDisparues.length === 0) {
      apres()
      if (!sansMouvement()) pop(coup.casesPosees)
      return
    }
    // Ce qu'on voit juste après la pose : la grille avec les cases du coup encore en place.
    const pleine = etat.grille.map((r) => [...r])
    for (const c of coup.casesDisparues) pleine[c.ligne][c.col] = c.couleur
    dessinerGrille(pleine, etat.surprise ?? avant.surprise)
    dessinerPieces()
    pop(coup.casesPosees)
    for (const c of casesElevees(coup, REGLAGES.lignes, REGLAGES.colonnes)) laCase(c.ligne, c.col).el.classList.add('eleve')
    lecture = { minuteurs: [], fin: apres }
    const apresLaPose = () => {
      if (style === STYLE_UNI) {
        marquerEffacement(coup, 'efface')
        dessinerScore()
        pointsFlottants(coup)
        lecture.minuteurs.push(setTimeout(conclure, DUREE_EFFACE_MS))
        return
      }
      // Sous une texture : la ligne s'allume, les points montent, puis ses cases disparaissent.
      racine.style.setProperty('--duree', `${DUREE_ALLUME_MS}ms`)
      marquerEffacement(coup, 'allume')
      dessinerScore()
      pointsFlottants(coup)
      lecture.minuteurs.push(setTimeout(() => {
        racine.style.setProperty('--duree', `${DUREE_EFFACE_STYLE_MS}ms`)
        marquerEffacement(coup, 'efface')
        lecture.minuteurs.push(setTimeout(conclure, DUREE_EFFACE_STYLE_MS))
      }, DUREE_ALLUME_MS))
    }
    lecture.minuteurs.push(setTimeout(apresLaPose, DUREE_POSE_MS))
  }

  // Met chaque case que le coup efface dans l'état `genre` (« allume » ou « efface »). Les styles
  // étalent leur animation de case en case d'après --col, la place de la case le long de sa ligne ou
  // de sa colonne ; `v` demande la version verticale de l'effet, pour une colonne (sensEffacement).
  function marquerEffacement(coup, genre) {
    for (const m of sensEffacement(coup)) {
      const { bloc } = laCase(m.ligne, m.col)
      bloc.style.setProperty('--col', String(m.position))
      bloc.classList.remove('allume', 'efface')
      bloc.classList.toggle('v', m.vertical)
      bloc.classList.add(genre)
    }
  }

  // Fin du coup, jouée jusqu'au bout ou coupée par un toucher : l'état du moteur est posé.
  function conclure() {
    if (!lecture) return
    const { minuteurs, fin: suite } = lecture
    lecture = null
    for (const m of minuteurs) clearTimeout(m)
    racine.style.removeProperty('--duree')
    suite()
  }

  function pop(posees) {
    for (const c of posees) {
      const { el } = laCase(c.ligne, c.col)
      el.classList.add('nouveau')
      setTimeout(() => el.classList.remove('nouveau'), 300)
    }
  }

  const centreDeCase = (ligne, col) => ({ x: (col + 0.5) * cellule, y: (ligne + 0.5) * cellule })

  // Les points qui montent depuis ce que le coup efface : plus gros avec le nombre de lignes et
  // de colonnes et avec la série.
  function pointsFlottants(coup) {
    const centre = centreEffacement(coup, REGLAGES.lignes, REGLAGES.colonnes)
    if (!centre) return
    const effaces = coup.lignes.length + coup.colonnes.length
    const el = document.createElement('div')
    el.className = 'pose-points'
    const taille = 0.75 + 0.2 * Math.min(effaces, 5) + 0.12 * (coup.multiplicateur - 1)
    el.style.fontSize = `${cellule * taille}px`
    el.style.left = `${centre.col * cellule}px`
    el.style.top = `${centre.ligne * cellule}px`
    el.textContent = `+${fmt(coup.points)}`
    if (coup.multiplicateur > 1) {
      const serie = document.createElement('small')
      serie.textContent = `série ×${coup.multiplicateur}`
      el.append(serie)
    }
    effets.append(el)
    setTimeout(() => el.remove(), DUREE_POINTS_MS)
  }

  // Un effet ponctuel sur une case de la grille (étoile, soupir), centré sur elle.
  function effetSurCase(classe, ligne, col, texte = '') {
    const c = centreDeCase(ligne, col)
    const el = document.createElement('div')
    el.className = `pose-effet ${classe}`
    el.style.left = `${c.x}px`
    el.style.top = `${c.y}px`
    el.textContent = texte
    effets.append(el)
    setTimeout(() => el.remove(), 1100)
  }

  // Où s'est jouée la case surprise de ce coup (null si elle n'y a pas pris part).
  function placeSurprise(avant, coup) {
    if (!coup.surprise) return null
    if (coup.surprise === 'posee') return etat.surprise
    if (coup.surprise === 'perdue') return avant.surprise
    const s = avant.surprise
    if (s && coup.casesDisparues.some((c) => c.ligne === s.ligne && c.col === s.col)) return s
    const porteuse = avant.enCours[coup.index]?.surprise
    return porteuse ? { ligne: coup.ligne + porteuse.ligne, col: coup.col + porteuse.col } : null
  }

  // Ce que le coup rapporte, après ses animations : bonus gagnés, défi, case surprise.
  function apresCoup(avant, coup) {
    const messages = []
    for (const gain of coup.gains) {
      if (gain.sorte === AU_CHOIX) {
        messages.push(`${TEXTE_CAUSE[gain.cause]} : un bonus au choix`)
        continue
      }
      pulse(gain.sorte, gain.ajoute)
      messages.push(`${TEXTE_CAUSE[gain.cause]} : +1 ${BONUS[gain.sorte].nom}${gain.ajoute ? '' : ' (réserve pleine)'}`)
    }
    if (coup.defiFini) {
      defiEl.classList.remove('reussi', 'rate')
      void defiEl.offsetWidth
      defiEl.classList.add(coup.defiFini === 'reussi' ? 'reussi' : 'rate')
      if (coup.defiFini === 'rate') messages.push('Défi raté : un nouveau défi arrive')
    }
    const place = placeSurprise(avant, coup)
    if (place) {
      if (coup.surprise === 'gagnee') effetSurCase('pose-etoile', place.ligne, place.col, '★')
      else if (coup.surprise === 'perdue') {
        effetSurCase('pose-soupir', place.ligne, place.col, '0')
        messages.push('Case surprise perdue')
      } else effetSurCase('pose-apparait', place.ligne, place.col, '?')
    }
    annoncer(messages)
    if (etat.choix > 0) ouvrirChoixPlusTard()
    verifierFin()
  }

  // L'icône d'un bonus gagné « pulse » et montre « +1 », sans bloquer le jeu.
  function pulse(sorte, ajoute) {
    const bouton = boutonsBonus[sorte]
    const plus = document.createElement('span')
    plus.className = 'pose-plus'
    plus.textContent = ajoute ? '+1' : 'plein'
    bouton.append(plus)
    bouton.classList.remove('gagne')
    void bouton.offsetWidth
    bouton.classList.add('gagne')
    setTimeout(() => { plus.remove(); bouton.classList.remove('gagne') }, DUREE_PULSE_MS)
  }

  function annoncer(messages) {
    for (const texte of messages) {
      const el = document.createElement('div')
      el.className = 'pose-info'
      el.textContent = texte
      infos.append(el)
      setTimeout(() => el.remove(), DUREE_INFO_MS)
    }
    while (infos.children.length > 3) infos.firstChild.remove()
  }

  // --- Bonus ------------------------------------------------------------------------------

  function utiliserBonus(sorte) {
    if (dialogueOuvert() || glisse) return
    if (lecture) conclure()
    if (visee === sorte) {
      visee = null
      dessinerBonus()
      dessinerPieces()
      dessinerAide()
      return
    }
    if (!utilisable(sorte)) return
    if (sorte === 'supprimer' || sorte === 'tourner') {
      visee = sorte
      dessinerBonus()
      dessinerPieces()
      dessinerAide()
      return
    }
    const suivant = sorte === 'changer' ? changerPieces(etat) : annulerCoup(etat)
    if (suivant) appliquerEtat(suivant)
  }

  function appliquerSurPiece(sorte, index) {
    const suivant = sorte === 'supprimer' ? supprimerPiece(etat, index) : tournerPiece(etat, index)
    if (!suivant) return
    appliquerEtat(suivant)
  }

  // Un bonus employé : le nouvel état est affiché d'un coup, avec un petit signe de ce qui a changé.
  function appliquerEtat(suivant) {
    etat = suivant
    visee = null
    garder()
    dessinerTout()
    if (etat.dernierBonus?.sorte === 'annuler' && !sansMouvement()) {
      grilleEl.classList.remove('retour')
      void grilleEl.offsetWidth
      grilleEl.classList.add('retour')
    }
    verifierFin()
  }

  // Un gain « au choix » (grille vidée) : un petit choix des quatre sortes.
  function ouvrirChoixPlusTard() {
    clearTimeout(minuteurChoix)
    minuteurChoix = setTimeout(ouvrirChoix, DELAI_CHOIX_MS)
  }

  function ouvrirChoix() {
    minuteurChoix = null
    if (etat.choix <= 0 || !choix.hidden || !fin.hidden) return
    reglages.hidden = true
    const liste = $('pose-choix-liste')
    liste.replaceChildren()
    for (const sorte of SORTES) {
      const bouton = document.createElement('button')
      bouton.type = 'button'
      bouton.className = 'pose-choix-bouton'
      const n = etat.reserve[sorte]
      bouton.innerHTML = `${icone(sorte)}<b>${BONUS[sorte].nom}</b><small>${n} en réserve${n >= RESERVE_MAX ? ' (plein)' : ''}</small>`
      bouton.addEventListener('click', () => choisir(sorte))
      liste.append(bouton)
    }
    choix.hidden = false
    liste.querySelector('button').focus()
  }

  function choisir(sorte) {
    const suivant = choisirBonus(etat, sorte)
    if (!suivant) return
    etat = suivant
    garder()
    choix.hidden = true
    dessinerTout()
    pulse(sorte, suivant.dernierBonus?.ajoute !== false)
    if (etat.choix > 0) ouvrirChoixPlusTard()
    verifierFin()
  }

  // --- Fin de partie, rejouer -------------------------------------------------------------

  const dialogueOuvert = () => !fin.hidden || !reglages.hidden || !choix.hidden

  function verifierFin() {
    if (perdue(etat) && minuteurFin === null) minuteurFin = setTimeout(afficherFin, DELAI_FIN_MS)
  }

  function afficherFin() {
    minuteurFin = null
    if (!perdue(etat)) return
    $('pose-fin-score').textContent = `Score : ${fmt(etat.score)}`
    $('pose-fin-record').hidden = !(etat.score > 0 && etat.score >= meilleur)
    reglages.hidden = true
    choix.hidden = true
    fin.hidden = false
    $('pose-fin-rejouer').focus()
  }

  function rejouer() {
    clearTimeout(minuteurFin)
    clearTimeout(minuteurChoix)
    minuteurFin = null
    minuteurChoix = null
    if (lecture) {
      for (const m of lecture.minuteurs) clearTimeout(m)
      lecture = null
    }
    if (glisse) {
      glisse.fantome.remove()
      glisse.slot.classList.remove('leve')
      glisse = null
    }
    visee = null
    fin.hidden = true
    choix.hidden = true
    reglages.hidden = true
    infos.replaceChildren()
    effets.replaceChildren()
    effacerApercu()
    // La partie neuve prend le niveau réglé et la réserve du joueur, telle qu'elle est maintenant.
    etat = nouvellePartie({ niveau, reserve: etat.reserve })
    premierAffichage = true
    signatures = { main: [], apercu: [] }
    garder()
    dessinerTout()
    afficherNiveau()
  }

  $('pose-fin-rejouer').addEventListener('click', rejouer)
  $('pose-rejouer').addEventListener('click', rejouer)

  // --- Réglages ---------------------------------------------------------------------------

  const curseurVibration = $('pose-vibration')
  const sait = typeof navigator.vibrate === 'function'

  function afficherVibration() {
    curseurVibration.value = String(vibration)
    $('pose-vibration-moins').disabled = vibration <= 0
    $('pose-vibration-plus').disabled = vibration >= NIVEAUX_VIBRATION.length - 1
    $('pose-vibration-etat').textContent = !sait
      ? "Cet appareil ne vibre pas : ce réglage n'a pas d'effet."
      : vibration === 0 ? 'Coupée' : `Niveau ${vibration} sur ${NIVEAUX_VIBRATION.length - 1}`
  }

  function changerVibration(n, essayer) {
    vibration = Math.min(NIVEAUX_VIBRATION.length - 1, Math.max(0, n))
    retenirNiveauVibration(vibration)
    afficherVibration()
    if (essayer) vibrer(vibration)
  }

  curseurVibration.max = String(NIVEAUX_VIBRATION.length - 1)
  curseurVibration.addEventListener('input', () => changerVibration(Number(curseurVibration.value), false))
  curseurVibration.addEventListener('change', () => vibrer(vibration))
  $('pose-vibration-moins').addEventListener('click', () => changerVibration(vibration - 1, true))
  $('pose-vibration-plus').addEventListener('click', () => changerVibration(vibration + 1, true))

  // Le niveau de 1 à 10 : il ne bouge pas tant qu'on ne le change pas, et un changement vaut
  // pour la prochaine partie, jamais pour celle en cours (BS38).
  const curseurNiveau = $('pose-niveau')

  function afficherNiveau() {
    curseurNiveau.value = String(niveau)
    $('pose-niveau-moins').disabled = niveau <= NIVEAU_MIN
    $('pose-niveau-plus').disabled = niveau >= NIVEAU_MAX
    const suite = niveau === etat.niveau
      ? 'Un changement vaut pour la prochaine partie.'
      : `Il vaudra pour la prochaine partie : la partie en cours reste au niveau ${etat.niveau}.`
    $('pose-niveau-etat').textContent = `Niveau ${niveau} sur ${NIVEAU_MAX}. ${suite}`
  }

  function changerNiveau(n) {
    niveau = Math.min(NIVEAU_MAX, Math.max(NIVEAU_MIN, n))
    retenirNiveauPose(niveau)
    afficherNiveau()
  }

  curseurNiveau.addEventListener('input', () => changerNiveau(Number(curseurNiveau.value)))
  $('pose-niveau-moins').addEventListener('click', () => changerNiveau(niveau - 1))
  $('pose-niveau-plus').addEventListener('click', () => changerNiveau(niveau + 1))

  // Le style des blocs : un choix parmi ceux que le record a débloqués (proposition de BS44),
  // avec le texte des paliers.
  const choixStyle = $('pose-style')

  function afficherStyles() {
    const debloques = stylesDebloques(meilleur, JEU_BLOCK_POSE)
    choixStyle.replaceChildren(...debloques.map((s) => {
      const option = document.createElement('option')
      option.value = s.id
      option.textContent = s.nom
      return option
    }))
    choixStyle.value = style
    $('pose-styles-etat').textContent = resumeStyles(meilleur, JEU_BLOCK_POSE)
  }

  choixStyle.addEventListener('change', () => {
    const avant = style
    style = styleAutorise(choixStyle.value, meilleur, JEU_BLOCK_POSE)
    retenirStylePose(style)
    changerDecor(avant, style)
    majCouleurNavigateur()
  })

  // Le décor suit la texture (BS47) : changer de style change les variables du décor (pose.css), qui
  // se fondent en un demi-seconde. `decor-change` donne aux éléments leur transition et lance les
  // fondus du motif de la page, `data-avant` garde le motif du style quitté pour qu'il s'efface.
  // L'ordre compte : la classe doit être en place, et son style calculé, avant que les variables changent.
  function changerDecor(avant, apres) {
    if (avant === apres) return
    clearTimeout(minuteurDecor)
    racine.classList.remove('decor-change')
    void racine.offsetWidth
    racine.classList.add('decor-change')
    void racine.offsetWidth
    racine.dataset.avant = avant
    racine.dataset.style = apres
    minuteurDecor = setTimeout(() => {
      racine.classList.remove('decor-change')
      delete racine.dataset.avant
    }, 500)
  }

  function ouvrirReglages() {
    if (!fin.hidden || !choix.hidden) return
    if (lecture) conclure()
    visee = null
    dessinerBonus()
    dessinerPieces()
    dessinerAide()
    afficherVibration()
    afficherNiveau()
    afficherStyles()
    reglages.hidden = false
    $('pose-reglages-fermer').focus()
  }

  function fermerReglages() {
    reglages.hidden = true
    $('pose-reglages-ouvrir').focus()
  }

  $('pose-reglages-ouvrir').addEventListener('click', ouvrirReglages)
  $('pose-reglages-fermer').addEventListener('click', fermerReglages)
  reglages.addEventListener('click', (e) => { if (e.target === reglages) fermerReglages() })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !reglages.hidden) fermerReglages()
  })

  // La barre du navigateur prend la couleur du fond du décor.
  function majCouleurNavigateur() {
    const meta = document.querySelector('meta[name="theme-color"]')
    const fond = getComputedStyle(racine).getPropertyValue('--pose-fond').trim()
    if (meta && fond) meta.setAttribute('content', fond)
  }

  // --- Démarrage --------------------------------------------------------------------------

  let attente = 0
  const remesurer = () => {
    cancelAnimationFrame(attente)
    attente = requestAnimationFrame(() => {
      if (glisse) return
      mesurer()
    })
  }
  window.addEventListener('resize', remesurer)
  window.addEventListener('orientationchange', remesurer)
  if (window.ResizeObserver) new ResizeObserver(remesurer).observe(racine)

  afficherVibration()
  afficherNiveau()
  afficherStyles()
  majCouleurNavigateur()
  mesurer()
  dessinerTout()
  garder() // une partie neuve est gardée dès son premier état affiché
  if (etat.choix > 0) ouvrirChoixPlusTard()
  verifierFin()
}
