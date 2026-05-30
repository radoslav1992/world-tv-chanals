const CACHE_VERSION = 'world-tv-v2';
const APP_SHELL = [
  '/',
  '/logo.png',
  '/favicon.png',
  '/favicon.svg',
  '/logo.svg',
  '/manifest.json',
];

// Install: pre-cache a minimal app shell (used as an offline fallback).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

// Activate: clean up old caches.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const accept = request.headers.get('accept') || '';

  // Bypass the SW entirely for non-GET, cross-origin, API and media. Letting the
  // browser handle media natively preserves HLS range requests and live streams.
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api') ||
    accept.includes('video') ||
    url.pathname.endsWith('.m3u8') ||
    url.pathname.endsWith('.ts') ||
    url.pathname.endsWith('.mp4')
  ) {
    return;
  }

  // Navigations (HTML pages, incl. dynamic SSR routes): network-first so content
  // is always fresh; fall back to cache, then the offline home page.
  if (request.mode === 'navigate' || accept.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Static assets (hashed JS/CSS, images, fonts): cache-first, then network.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, clone)).catch(() => {});
        }
        return response;
      });
    })
  );
});
