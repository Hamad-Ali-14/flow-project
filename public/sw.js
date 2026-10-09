/* FLOW PWA service worker.
 * Cache only the app shell and same-origin static assets. Never cache API/auth/data responses.
 */
const CACHE_NAME = 'flow-pwa-static-v1';
const APP_SHELL = ['/', '/manifest.webmanifest', '/pwa-192.png', '/pwa-512.png', '/pwa-maskable-512.png', '/apple-touch-icon.png'];
const STATIC_ASSET_PATTERN = /\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff2?|ttf|otf)$/i;
const NEVER_CACHE_PATTERN = /\/(?:auth|rest|storage|functions|realtime|graphql)(?:\/|$)/i;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('flow-pwa-') && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE_PATTERN.test(url.pathname)) return;

  // Navigation uses network-first so users receive the newest application HTML.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/', response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  // Only cache known static assets. JSON, database results, and other dynamic responses are excluded.
  if (STATIC_ASSET_PATTERN.test(url.pathname) || url.pathname === '/manifest.webmanifest') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
        return response;
      } catch {
        return Response.error();
      }
    })());
  }
});
