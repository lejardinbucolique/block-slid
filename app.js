import { demarrerJeu } from './src/ui/jeu.js'

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Service worker :", err));
  });
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
demarrerJeu();
