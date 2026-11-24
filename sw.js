// Service worker: aplikacja działa bez internetu i sama się aktualizuje.
//
// Wszystkie pliki jednej wersji trzymamy razem w jednej pamięci podręcznej,
// więc nigdy nie wczyta się mieszanka starych i nowych plików.
// Przeglądarka przy każdym uruchomieniu sprawdza, czy ten plik się zmienił.
// Jeśli tak, pobiera komplet nowych plików i podmienia wersję w całości.
//
// WAŻNE: po każdej zmianie w aplikacji (np. nowe stawki na kolejny rok)
// zmień VERSION poniżej — inaczej telefon zostanie przy starej wersji.

const PREFIX = 'na-reke-';
const VERSION = `${PREFIX}2026-11-24-10`;
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/engine.js',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      // cache: 'reload' — pomijamy pamięć HTTP, żeby dostać naprawdę świeże pliki
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // Usuwamy tylko własne stare wersje. Na GitHub Pages wszystkie Twoje strony
      // mają wspólną domenę, więc nie ruszamy pamięci innych aplikacji.
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// Najpierw internet (zawsze najnowsza wersja), a bez internetu — kopia z pamięci.
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const key = request.mode === 'navigate' ? './index.html' : request;
      try {
        const response = await Promise.race([
          fetch(request, { cache: 'no-cache' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
        ]);
        if (response && response.ok) {
          cache.put(key, response.clone());
          return response;
        }
        throw new Error('bad response');
      } catch {
        const cached = await cache.match(key, { ignoreSearch: true });
        return (
          cached ||
          new Response('Brak połączenia z internetem.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        );
      }
    })(),
  );
});
