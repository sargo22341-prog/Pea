const CACHE_NAME = "pea-portfolio-v4";
const APP_SHELL = ["/manifest.webmanifest", "/pea-icon.png"];
const ASSET_PATH_PREFIX = "/assets/";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(() => new Response("Application temporairement indisponible.", {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
          status: 503
        }))
    );
    return;
  }

  // Les chunks Vite ne passent pas par le service worker : une reponse 503 text/plain
  // cassait les imports dynamiques. L'app gere elle-meme le rechargement (lazyWithReload).
  if (url.pathname.startsWith(ASSET_PATH_PREFIX)) return;

  if (!APP_SHELL.includes(url.pathname)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => new Response("Ressource indisponible.", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        status: 503
      }));
    })
  );
});
