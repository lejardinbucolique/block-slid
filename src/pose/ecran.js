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
  apercuJouable,
  pieceA,
  indicesEnJeu,
  bloquee,
  perdue,
  choisirBonus,
  peutUtiliser,
  supprimerPiece,
  tournerPiece,
  changerPieces,
  changerNiveau as niveauDeLaPartie,
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
// Aux niveaux où l'aperçu se joue (BS58), ses pièces se prennent au doigt : elles sont plus grandes.
const ECHELLE_APERCU_JOUABLE = 0.4
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
// La Laine prend son temps : le fil se faufile, puis la bande se défait maille par maille (BS54).
const DUREES_LAINE_MS = { allume: 450, efface: 600 }
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
    titre: 'Changer les pièces',
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
      <div id="pose-lignes" aria-hidden="true"></div>
      <div id="pose-ombre" aria-hidden="true"></div>
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
  const ombreEl = $('pose-ombre')
  const lignesEl = $('pose-lignes')
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
  let apercuMesure = false // la mise en page est celle d'un aperçu qui se joue (plus grand) ou non
  let echelleApercu = ECHELLE_APERCU
  let signatures = { main: [], apercu: [] }
  let premierAffichage = true
  let bandesMontrees = new Set() // les bandes de l'aperçu qui sont visibles : « l3 » (ligne 3), « c5 » (colonne 5)

  racine.dataset.style = style

  // La partie gardée se reprend telle quelle, sauf si elle est perdue ou illisible (autre
  // version du jeu) : alors une nouvelle partie commence, avec la réserve et le niveau du joueur.
  function partieDepart() {
    const reprise = importerPartie(partiePoseGardee())
    // Le niveau réglé vaut pour la partie reprise (BS55) : une partie gardée avant ce réglage reprend le curseur.
    if (reprise && !perdue(reprise)) return niveauDeLaPartie(reprise, niveau) ?? reprise
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

  // Les bandes de l'aperçu (BS59) : une par ligne et par colonne, dans leur couche (#pose-lignes), cachées
  // tant qu'elles ne servent pas. Une ligne ou colonne que la pose compléterait s'y éclaire ; les cases de la
  // grille, elles, ne bougent pas pendant le glisser, ce qui repeignait leurs textures à chaque changement de place.
  const bandes = new Map()
  for (const [sorte, nombre] of [['l', REGLAGES.lignes], ['c', REGLAGES.colonnes]]) {
    for (let i = 0; i < nombre; i++) {
      const el = document.createElement('div')
      el.className = sorte === 'l' ? 'pose-bande pose-bande-ligne' : 'pose-bande pose-bande-colonne'
      el.hidden = true
      lignesEl.append(el)
      bandes.set(`${sorte}${i}`, el)
    }
  }
  function masquerBandes() {
    for (const cle of bandesMontrees) bandes.get(cle).hidden = true
    bandesMontrees = new Set()
  }
  // Ne touche qu'aux bandes qui changent : d'une place à l'autre, la plupart restent comme elles sont.
  function montrerBandes(lignes, colonnes) {
    const voulues = new Set([...lignes.map((l) => `l${l}`), ...colonnes.map((k) => `c${k}`)])
    for (const cle of bandesMontrees) if (!voulues.has(cle)) bandes.get(cle).hidden = true
    for (const cle of voulues) {
      if (bandesMontrees.has(cle)) continue
      const el = bandes.get(cle)
      const rang = Number(cle.slice(1))
      el.style.translate = cle[0] === 'l' ? `0 ${rang * cellule}px` : `${rang * cellule}px 0`
      el.hidden = false
    }
    bandesMontrees = voulues
  }

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
    // Les places de l'aperçu suivent celles de la main (moteur.js : pieceA), pour les niveaux où il se joue.
    petit.dataset.index = String(REGLAGES.piecesParTour + i)
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
    apercuMesure = apercuJouable(etat)
    echelleApercu = apercuMesure ? ECHELLE_APERCU_JOUABLE : ECHELLE_APERCU
    cellule = tailleCellule({
      largeur: largeur - 2 * CADRE_PX,
      hauteur,
      fixe,
      colonnes: REGLAGES.colonnes,
      lignes: REGLAGES.lignes,
      piecesEnCases: RANGEES_MAX * (ECHELLE_MAIN + echelleApercu),
    })
    const fixer = (nom, valeur) => racine.style.setProperty(nom, valeur)
    fixer('--cell', `${cellule}px`)
    fixer('--cm', `${cellule * ECHELLE_MAIN}px`)
    fixer('--ca', `${cellule * echelleApercu}px`)
    fixer('--haut-main', `${cellule * ECHELLE_MAIN * RANGEES_MAX}px`)
    fixer('--haut-apercu', `${cellule * echelleApercu * RANGEES_MAX}px`)
    fixer('--largeur-grille', `${cellule * REGLAGES.colonnes}px`)
    fixer('--lignes', String(REGLAGES.lignes))
    fixer('--cols', String(REGLAGES.colonnes)) // les textures étalent leur animation sur une ligne de cette longueur
  }

  // --- Dessin ---------------------------------------------------------------------------

  // Les cases de la grille d'après `grille` (l'état par défaut) ; `surprise` est la case à
  // numéro à montrer. Efface au passage toute marque d'aperçu ou d'animation.
  function dessinerGrille(grille = etat.grille, surprise = etat.surprise) {
    masquerBandes()
    for (let l = 0; l < REGLAGES.lignes; l++) {
      for (let k = 0; k < REGLAGES.colonnes; k++) {
        const { el, bloc } = laCase(l, k)
        const valeur = grille[l][k]
        const estSurprise = Boolean(surprise) && valeur !== null && surprise.ligne === l && surprise.col === k
        // Seul ce qui change s'écrit : une case redessinée à l'identique recalculait quand même le style de sa
        // texture (la couleur d'un bloc touche tous ses dessins), cent fois d'un coup à chaque pose (BS59).
        const classe = `pose-case${valeur !== null ? ' occupee' : ''}${estSurprise ? ' surprise' : ''}`
        if (el.className !== classe) el.className = classe
        if (bloc.className !== 'pose-bloc') bloc.className = 'pose-bloc'
        if (bloc.style.getPropertyValue('--col') !== '') bloc.style.removeProperty('--col')
        if (bloc.style.getPropertyValue('--duree') !== '') bloc.style.removeProperty('--duree')
        if (valeur !== null) {
          const couleur = couleurDe(valeur)
          if (bloc.style.getPropertyValue('--couleur') !== couleur) bloc.style.setProperty('--couleur', couleur)
        }
        if (estSurprise) el.dataset.reste = String(surprise.reste)
        else if (el.dataset.reste !== undefined) delete el.dataset.reste
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
    if (sorte === 'supprimer' || sorte === 'tourner') return indicesEnJeu(etat).some((i) => peutUtiliser(etat, sorte, i))
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
    // L'aperçu change de taille avec le niveau (BS58) : la mise en page suit tout de suite.
    if (apercuMesure !== apercuJouable(etat)) mesurer()
    const jouables = new Set(piecesJouables(etat))
    const decalage = { main: 0, apercu: REGLAGES.piecesParTour }
    const enJeu = apercuJouable(etat)
    racine.classList.toggle('apercu-jouable', enJeu)
    const nouvelles = { main: etat.enCours.map(signature), apercu: etat.suivantes.map(signature) }
    const rangees = [
      ['main', emplacements, etat.enCours, '--cm'],
      ['apercu', emplacementsApercu, etat.suivantes, '--ca'],
    ]
    // Les pièces nouvelles entrent d'un petit saut : leur classe se pose après une seule mesure pour toutes (BS61),
    // non après une mesure par pièce (la main se renouvelle d'un coup : jusqu'à six recalculs de la page à la suite).
    const entrees = []
    for (const [nom, slots, pieces, taille] of rangees) {
      slots.forEach((slot, i) => {
        const x = pieces[i]
        if (signatures[nom][i] !== nouvelles[nom][i] || (x && !slot.firstChild)) {
          slot.replaceChildren()
          slot.classList.remove('entre', 'tourne', 'refus')
          if (x) {
            slot.append(elementPiece(x, taille))
            if (!premierAffichage && !sansMouvement()) {
              const tourne = etat.dernierBonus?.sorte === 'tourner' && etat.dernierBonus.index === decalage[nom] + i
              entrees.push([slot, tourne ? 'tourne' : 'entre'])
            }
          }
        }
        // Une pièce de l'aperçu qui ne se joue pas (niveau 3 et plus) ne se grise ni ne se vise.
        const place = decalage[nom] + i
        const enMain = Boolean(x) && (nom === 'main' || enJeu)
        slot.classList.toggle('vide', !x)
        slot.classList.toggle('jouable', nom === 'apercu' && enMain)
        slot.classList.toggle('bloquee', enMain && !jouables.has(place))
        slot.classList.toggle('visable', enMain && visee !== null && peutUtiliser(etat, visee, place))
      })
    }
    if (entrees.length > 0) {
      void racine.offsetWidth
      for (const [slot, classe] of entrees) slot.classList.add(classe)
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

  // L'ombre de la pièce tirée vit dans sa propre couche (#pose-ombre), dessinée une fois par
  // glisser puis seulement déplacée : changer de case visée ne repeint plus aucune texture (BS53).
  // Ses cases imitent une case visée de la grille (même place, même halo, bloc à .75). Les lignes
  // et colonnes que la pose complèterait s'éclairent dans une autre couche (#pose-lignes) : aucune
  // case de la grille n'est touchée pendant le glisser.
  function preparerOmbre(enMain) {
    const p = piece(enMain.id)
    ombreEl.classList.remove('montre')
    ombreEl.replaceChildren(...p.cases.map((c, i) => {
      const el = document.createElement('div')
      el.className = 'pose-ombre-case'
      el.style.left = `${c.col * cellule + 1}px`
      el.style.top = `${c.ligne * cellule + 1}px`
      const bloc = creerBloc()
      bloc.style.setProperty('--couleur', couleurDe(enMain.couleurs?.[i] ?? enMain.couleur))
      el.append(bloc)
      return el
    }))
  }

  function preparerOmbreDuGlisse() {
    if (!glisse || glisse.ombrePrete) return
    glisse.ombrePrete = true
    preparerOmbre(glisse.enMain)
  }

  function effacerApercu() {
    masquerBandes()
    ombreEl.classList.remove('montre')
  }

  function montrerApercu(apercu, enMain) {
    if (!apercu?.valide) {
      effacerApercu()
      return
    }
    // Le doigt est entré sur la grille avant que l'ombre soit prête : elle se prépare tout de suite.
    preparerOmbreDuGlisse()
    const p = piece(enMain.id)
    const dl = apercu.cases[0].ligne - p.cases[0].ligne
    const dk = apercu.cases[0].col - p.cases[0].col
    ombreEl.style.translate = `${dk * cellule}px ${dl * cellule}px`
    montrerBandes(apercu.lignes, apercu.colonnes)
    ombreEl.classList.add('montre')
  }

  // --- Geste : tirer une pièce ------------------------------------------------------------

  function viser(e, g = glisse) {
    const r = g.grille
    const p = piece(g.enMain.id)
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
    // La main, et l'aperçu aux niveaux où il se joue (BS58) ; au-delà il ne fait que se montrer.
    const enMain = pieceA(etat, index)
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
    // La pièce part à la taille de sa rangée : celle de la main, ou celle de l'aperçu.
    const echelle = slot.classList.contains('pose-petit') ? echelleApercu : ECHELLE_MAIN
    fantome.classList.add('pose-fantome', 'vole')
    fantome.style.translate = `${depart.left}px ${depart.top}px`
    fantome.style.scale = String(echelle)
    racine.append(fantome)
    const zone = e.currentTarget
    try { zone.setPointerCapture(e.pointerId) } catch { /* souris sortie de la fenêtre : sans importance */ }
    // La grille ne bouge pas pendant le glisser : son rectangle se mesure une fois, non à chaque mouvement du doigt
    // (la mesure forçait un recalcul de style de toute la page, aperçu changé ou non).
    glisse = { pointeur: e.pointerId, index, enMain, slot, fantome, zone, echelle, cle: null, apercu: null, grille: grilleEl.getBoundingClientRect(), ombrePrete: false }
    // L'ombre se prépare à l'image suivante : sa première peinture (des textures par bloc) ne s'ajoute pas à
    // celle de la pièce qui se détache de la main (BS61). Le doigt n'est pas encore sur la grille.
    const g = glisse
    requestAnimationFrame(() => requestAnimationFrame(() => { if (glisse === g) preparerOmbreDuGlisse() }))
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
    try { g.zone.releasePointerCapture(e.pointerId) } catch { /* déjà relâché */ }
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
    g.fantome.style.scale = String(g.echelle)
    setTimeout(termine, DUREE_RETOUR_MS)
  }

  function annulerGlisse(e) {
    if (!glisse || e.pointerId !== glisse.pointeur) return
    const g = glisse
    glisse = null
    retour(g)
  }

  // La main et l'aperçu se prennent de la même façon (l'aperçu ne répond qu'aux niveaux où il se joue).
  for (const zone of [mainEl, apercuEl]) {
    zone.addEventListener('pointerdown', debutGlisse)
    zone.addEventListener('pointermove', mouvementGlisse)
    zone.addEventListener('pointerup', finGlisse)
    zone.addEventListener('pointercancel', annulerGlisse)
    zone.addEventListener('lostpointercapture', annulerGlisse)
  }
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
    // Les lignes et colonnes que le coup efface se détachent, comme dans l'aperçu : leurs bandes, non leurs cases
    // (les élever repeignait toutes leurs textures d'un coup, à l'instant où le doigt se relève).
    montrerBandes(coup.lignes, coup.colonnes)
    lecture = { minuteurs: [], fin: apres }
    const apresLaPose = () => {
      masquerBandes()
      if (style === STYLE_UNI) {
        marquerEffacement(coup, 'efface')
        dessinerScore()
        pointsFlottants(coup)
        lecture.minuteurs.push(setTimeout(conclure, DUREE_EFFACE_MS))
        return
      }
      // Sous une texture : la ligne s'allume, les points montent, puis ses cases disparaissent.
      const allume = style === 'laine' ? DUREES_LAINE_MS.allume : DUREE_ALLUME_MS
      const efface = style === 'laine' ? DUREES_LAINE_MS.efface : DUREE_EFFACE_STYLE_MS
      marquerEffacement(coup, 'allume', allume)
      dessinerScore()
      pointsFlottants(coup)
      lecture.minuteurs.push(setTimeout(() => {
        marquerEffacement(coup, 'efface', efface)
        lecture.minuteurs.push(setTimeout(conclure, efface))
      }, allume))
    }
    lecture.minuteurs.push(setTimeout(apresLaPose, DUREE_POSE_MS))
  }

  // Met chaque case que le coup efface dans l'état `genre` (« allume » ou « efface »). Les styles
  // étalent leur animation de case en case d'après --col, la place de la case le long de sa ligne ou
  // de sa colonne ; `v` demande la version verticale de l'effet, pour une colonne (sensEffacement).
  // `duree` (ms), la durée de l'étape que les textures lisent dans --duree, se pose sur ces seuls
  // blocs : posée sur la racine, elle faisait recalculer le style de tout l'écran (BS53).
  function marquerEffacement(coup, genre, duree) {
    for (const m of sensEffacement(coup)) {
      const { bloc } = laCase(m.ligne, m.col)
      bloc.style.setProperty('--col', String(m.position))
      if (duree) bloc.style.setProperty('--duree', `${duree}ms`)
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
    const porteuse = pieceA(avant, coup.index)?.surprise
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

  // Le niveau de 1 à 10 : il ne bouge pas tant qu'on ne le change pas, et un changement vaut tout
  // de suite, pour la partie en cours aussi (BS55) : les pièces déjà en main et dans l'aperçu restent,
  // les tirages suivants suivent le nouveau niveau.
  const curseurNiveau = $('pose-niveau')

  function afficherNiveau() {
    curseurNiveau.value = String(niveau)
    $('pose-niveau-moins').disabled = niveau <= NIVEAU_MIN
    $('pose-niveau-plus').disabled = niveau >= NIVEAU_MAX
    $('pose-niveau-etat').textContent = `Niveau ${etat.niveau} sur ${NIVEAU_MAX}, en cours.`
  }

  function changerNiveau(n) {
    niveau = Math.min(NIVEAU_MAX, Math.max(NIVEAU_MIN, n))
    retenirNiveauPose(niveau)
    // La partie en cours prend le niveau tout de suite et se garde avec lui.
    const changee = niveauDeLaPartie(etat, niveau)
    if (changee) etat = changee
    garder()
    afficherNiveau()
    // L'aperçu se joue, ou non, tout de suite (BS58) : les pièces, les bonus et l'aide se redessinent.
    visee = null
    dessinerBonus()
    dessinerPieces()
    dessinerAide()
    verifierFin()
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
