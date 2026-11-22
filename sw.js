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
const VERSION = `${PREFIX}2026-11-22-6`;
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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const key = request.mode === 'navigate' ? './index.html' : request;
      const cached = await cache.match(key, { ignoreSearch: true });
      if (cached) return cached;
      try {
        return await fetch(request);
      } catch {
        return new Response('Brak połączenia z internetem.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })(),
  );
});
