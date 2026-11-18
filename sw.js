/**
 * ============================================================================
 * SERVICE WORKER — CBT SMP NEGERI 71 BANDUNG (NETWORK-FIRST PWA)
 * Mendukung GitHub Pages (subpath /cbt-smpn-71-bandung/), Vercel, Cloudflare,
 * dan Custom Domain (smpn71bandung.my.id) pada Android 8.0+, iOS, & Desktop.
 * ============================================================================
 */

const CACHE_VERSION = 'cbt-sigma71-pwa-v18';
const STATIC_CACHE = 'cbt-sigma71-static-v18';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './exam.html',
  './manifest.json',
  './supabaseClient.js',
  './pwa-installer.js',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          fetch(new Request(url, { cache: 'reload' }))
            .then((res) => {
              if (res && res.ok) {
                return cache.put(url, res);
              }
            })
            .catch(() => {})
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!req || req.method !== 'GET') return;

  const url = new URL(req.url);

  // Jangan pernah meng-cache request API Supabase / Realtime / Auth / Storage
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/auth/v1/') ||
    url.pathname.includes('/realtime/v1/') ||
    url.pathname.includes('/storage/v1/')
  ) {
    return;
  }

  const isNavigationOrAppCode =
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    req.destination === 'script' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('manifest.json') ||
    url.pathname.endsWith('/');

  if (isNavigationOrAppCode) {
    // Strategi Network-First: selalu ambil versi terbaru dari server, fallback ke cache saat offline
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((networkRes) => {
          if (networkRes && networkRes.ok) {
            const copy = networkRes.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return networkRes;
        })
        .catch(() =>
          caches.match(req).then((cached) => {
            if (cached) return cached;
            if (req.mode === 'navigate') {
              if (url.pathname.toLowerCase().endsWith('exam.html')) {
                return caches.match('./exam.html') || caches.match('./index.html');
              }
              return caches.match('./index.html') || caches.match('./');
            }
            return Response.error();
          })
        )
    );
    return;
  }

  // Aset gambar/ikon/font: Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.ok) {
            const copy = networkRes.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return networkRes;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
