/* Service worker de RutaEC: caché de la aplicación (shell) y respuesta básica sin conexión. Las llamadas /api nunca se cachean. */
const V = 'rutaec-v1';
const SHELL = ['/', '/index.html', '/css/app.css', '/js/core.js', '/js/shop.js', '/js/account.js', '/js/office.js', '/js/driver.js', '/js/coop.js', '/js/admin.js', '/js/main.js', '/vendor/jsQR.js', '/manifest.webmanifest', '/icons/icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/v/') || u.pathname.startsWith('/uploads/')) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(V).then((c) => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match('/index.html'))));
});
