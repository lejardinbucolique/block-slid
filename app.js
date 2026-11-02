import { demarrerJeu } from './src/ui/jeu.js'


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
