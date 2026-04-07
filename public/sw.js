// Carton Cache — Service Worker

const CACHE = 'carton-cache-v1';
const PRECACHE = ['/css/main.css', '/manifest.json', '/offline.html'];

// ── Install: precache static shell ────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// ── Activate: purge old caches ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ──────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (request.method !== 'GET' || url.origin !== location.origin) return;

  // Static assets (CSS, JS, icons, manifest) — cache-first, update in background
  if (
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request).then((res) => {
          cache.put(request, res.clone());
          return res;
        });
        return cached ?? networkFetch;
      })
    );
    return;
  }

  // Navigation requests — network-first, fall back to offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached ?? caches.match('/offline.html'))
      )
    );
    return;
  }
});

// ── Push notifications ─────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title ?? 'Carton Cache';
  const options = {
    body: data.body ?? 'You have a notification.',
    icon: '/icons/icon.svg',
    badge: '/icons/icon.svg',
    tag: data.tag ?? 'carton-cache',
    data: { url: data.url ?? '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        const url = event.notification.data?.url ?? '/';
        for (const client of windowClients) {
          if (client.url === url && 'focus' in client) return client.focus();
        }
        return clients.openWindow(url);
      })
  );
});
