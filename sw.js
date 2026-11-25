// Service worker : précache du socle, puis la page s'ouvre sans réseau.
// Changer VERSION à chaque modification des fichiers listés ci-dessous.
const VERSION = "block-slid-v53";
const FICHIERS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "src/jeux.js",
  "src/ui/jeu.js",
  "src/ui/jeu-pose.js",
  "src/ui/stockage.js",
  "src/ui/styles.js",
  "src/ui/signalement.js",
  "src/ui/mise-a-jour.js",
  "src/pose/index.js",
  "src/pose/reglages.js",
  "src/pose/pieces.js",
  "src/pose/niveaux.js",
  "src/pose/tirage.js",
  "src/pose/tirage-garanti.js",
  "src/pose/couleurs.js",
  "src/pose/bonus.js",
  "src/pose/gains.js",
  "src/pose/moteur.js",
  "src/pose/geste.js",
  "src/pose/ecran.js",
  "src/pose/pose.css",
  "src/moteur/index.js",
  "src/moteur/figures.js",
  "src/moteur/moteur.js",
  "src/moteur/reglages.js",
  "src/moteur/tirage.js",
  "textures/marbre-veines.svg",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cache) => {
      if (cache) return cache;
      return fetch(e.request).catch(() => {
        if (e.request.mode === "navigate") return caches.match("index.html");
        return Response.error();
      });
    })
  );
});
