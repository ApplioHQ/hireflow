/* Applio service worker.
   Strategy is tuned for a frequently auto-deployed static site:
   - Navigations (HTML): network-first, so a new deploy is never masked by cache.
   - CSS / JS / JSON: network-first too (code freshness matters most).
   - Images / fonts / icons: cache-first with background refresh (they rarely change).
   - Everything falls back to cache, then to a branded offline page, when offline.
   Bump CACHE_VERSION whenever this file changes to retire old caches. */
const CACHE_VERSION = 'applio-v3';
const OFFLINE_URL = '/offline.html';

/* Minimal set needed to render something useful with no network. */
const PRECACHE = [
  OFFLINE_URL,
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isAsset(url) {
  return /\.(?:png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|otf|eot)$/i.test(url.pathname);
}
function isCode(url) {
  return /\.(?:css|js|json)$/i.test(url.pathname);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    /* `no-cache` forces a conditional request to the server every time
       (fast 304 when unchanged), so a revisit never gets served a stale
       file out of the browser's HTTP cache. Without this, GitHub Pages'
       10-minute max-age would mask fresh deploys until a hard refresh. */
    const fresh = await fetch(request, { cache: 'no-cache' });
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const offline = await cache.match(OFFLINE_URL);
      if (offline) return offline;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) {
    /* Refresh in the background for next time. */
    fetch(request).then((fresh) => { if (fresh && fresh.ok) cache.put(request, fresh.clone()); }).catch(() => {});
    return cached;
  }
  const fresh = await fetch(request);
  if (fresh && fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  /* Only handle same-origin requests; let the API worker and third parties pass through. */
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (isAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (isCode(url)) {
    event.respondWith(networkFirst(request));
  }
});
