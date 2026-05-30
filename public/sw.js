// MyLife Service Worker - offline support (v2, redirect-safe)

const CACHE_NAME = 'mylife-v2';
const RUNTIME_CACHE = 'mylife-runtime-v2';

// Only precache truly static, public, non-redirecting assets.
// NOTE: never precache auth-gated HTML routes like /dashboard — they answer
// with a redirect in a logged-out / SW context, and a cached redirected
// response cannot be returned for a navigation (causes ERR_FAILED).
const PRECACHE_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Only cache responses safe to replay: same-origin, 200, not a followed
// redirect, and a normal ("basic") response.
function isCacheable(response) {
  return (
    response &&
    response.status === 200 &&
    !response.redirected &&
    response.type === 'basic'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (!request.url.startsWith(self.location.origin)) return;

  // Page navigations (HTML): NETWORK-FIRST so auth + fresh content always win.
  // Never serve a cached redirect here.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheable(response)) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached && !cached.redirected) return cached;
          return Response.error();
        })
    );
    return;
  }

  // API / Supabase: network-first
  if (request.url.includes('/api/') || request.url.includes('supabase')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheable(response)) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (isCacheable(response)) {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, clone));
        }
        return response;
      });
    })
  );
});
