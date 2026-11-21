import { JEUX, JEU_PAR_DEFAUT, jeuxDisponibles, choixDeJeuVisible } from './src/jeux.js'
import { jeuChoisi, retenirJeu } from './src/ui/stockage.js'

// Un point d'entrée par jeu, chargé seulement quand le jeu est choisi (BS39).
const POINTS_ENTREE = {
  'block-slid': () => import('./src/ui/jeu.js'),
  'block-pose': () => import('./src/ui/jeu-pose.js'),
}

// Le choix du jeu, dans les réglages : caché tant qu'un seul jeu est disponible.
// Changer de jeu retient le choix puis recharge la page : la partie de chaque jeu est
// déjà gardée à part, et rien du jeu en cours n'est à démonter.
const jeu = jeuChoisi()
document.documentElement.dataset.jeu = jeu // pour que la page de l'autre jeu ne se montre pas (style.css)
if (choixDeJeuVisible()) {
  const choix = document.getElementById("jeu");
  for (const j of jeuxDisponibles()) {
    const option = document.createElement("option");
    option.value = j.id;
    option.textContent = j.nom;
    choix.append(option);
  }
  choix.value = jeu;
  choix.addEventListener("change", () => {
    if (!JEUX.some((j) => j.id === choix.value)) return;
    retenirJeu(choix.value);
    location.reload();
  });
  document.getElementById("reglage-jeu").hidden = false;
}


// Installation : proposée dans la fenêtre des réglages, tant que l'application
// n'est pas installée.
const bloc = document.getElementById("installation");
const bouton = document.getElementById("installer");
const aide = document.getElementById("aide-installation");

const modeInstalle = window.matchMedia("(display-mode: fullscreen), (display-mode: standalone)");
const dejaInstallee = () => modeInstalle.matches || navigator.standalone === true;

let invite = null;

function afficher() {
  if (dejaInstallee()) { bloc.hidden = true; return; }
  bloc.hidden = false;
  bouton.hidden = !invite;
  aide.hidden = !!invite;
  if (!invite) {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    aide.textContent = ios
      ? "Pour l'installer : touchez Partager, puis « Sur l'écran d'accueil »."
      : "Pour l'installer : ouvrez le menu du navigateur, puis « Installer l'application » ou « Ajouter à l'écran d'accueil ».";
  }
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  invite = e;
  afficher();
});

bouton.addEventListener("click", async () => {
  if (!invite) return;
  invite.prompt();
  await invite.userChoice;
  invite = null;
  afficher();
});

window.addEventListener("appinstalled", () => { invite = null; afficher(); });
modeInstalle.addEventListener?.("change", afficher);

afficher();
POINTS_ENTREE[jeu]()
  .then((module) => module.demarrerJeu())
  .catch((err) => {
    console.error("Démarrage du jeu :", err);
    // Un jeu qui ne démarre pas ne laisse pas l'appli vide : on retombe sur block-slid.
    if (jeu !== JEU_PAR_DEFAUT) {
      retenirJeu(JEU_PAR_DEFAUT);
      location.reload();
    }
  });

// Mise à jour : sw.js prend la main dès qu'une nouvelle version est installée
// (skipWaiting, clients.claim) ; la page se recharge alors une seule fois pour
// l'afficher, à tout moment : la partie en cours est gardée et se retrouve (BS9).
if ("serviceWorker" in navigator) {
  const sw = navigator.serviceWorker;
  const avaitControleur = !!sw.controller; // première installation : pas de rechargement
  let recharge = false;
  const recharger = () => {
    if (recharge) return;
    recharge = true;
    location.reload();
  };
  sw.addEventListener("controllerchange", () => {
    if (!avaitControleur || recharge) return;
    recharger();
  });

  const versionEl = document.getElementById("version");
  const afficherVersion = async () => {
    const cles = await caches.keys().catch(() => []);
    const v = cles.find((c) => c.startsWith("block-slid-"));
    if (v) versionEl.textContent = `Version ${v.slice("block-slid-".length)}`;
  };
  sw.addEventListener("controllerchange", afficherVersion);

  window.addEventListener("load", () => {
    sw.register("sw.js", { updateViaCache: "none" })
      .then((reg) => {
        reg.update().catch(() => {});
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        });
        return sw.ready;
      })
      .then(afficherVersion)
      .catch((err) => console.warn("Service worker :", err));
  });
}
