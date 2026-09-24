// Service worker de retrait : l'application n'en utilise plus.
// Firefox faisait echouer au demarrage les requetes interceptees (chunks Vite, SSE),
// ce qui affichait l'ecran d'erreur jusqu'a un Ctrl+F5. Ce fichier reste publie pour que
// les navigateurs ayant installe l'ancien service worker recuperent cette version,
// purgent ses caches et se desinscrivent. Aucun gestionnaire "fetch" : plus aucune
// requete n'est interceptee, meme avant la desinscription effective.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.registration.unregister())
  );
});
