const CACHE_NAME = 'futbol-tactico-v41';
const ASSETS = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './sound.js', './stadium3d.js', './match3d.js', './vendor/three.module.min.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first: siempre intenta traer la versión más reciente; si no hay conexión, usa la copia en caché.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Solo peticiones GET del propio juego
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    // no-cache: pregunta siempre al servidor si hay versión nueva (evita mezclar ficheros viejos y nuevos)
    fetch(req, {cache: 'no-cache'})
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(()=>{});
        }
        return response;
      })
      .catch(() =>
        caches.match(req, {ignoreSearch: true}).then((hit) =>
          hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())
        )
      )
  );
});
