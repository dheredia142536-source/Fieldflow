/* FieldFlow · service worker. Versión y lista de precarga las estampa dev/stamp-sw.mjs al compilar. */
const VERSION = '91b6bbe689';
const PRECACHE = ["/","/css/app.css","/css/base.css","/css/dash.css","/css/tokens.css","/icons/apple-touch-icon.png","/icons/favicon-32.png","/icons/favicon.svg","/icons/icon-192.png","/icons/icon-512.png","/icons/icon-maskable-512.png","/img/welcome-desktop.webp","/img/welcome-mobile.webp","/js/api.js","/js/app.js","/js/charts.js","/js/components.js","/js/dict.js","/js/i18n.js","/js/icons.js","/js/install.js","/js/state.js","/js/theme-init.js","/js/time.js","/js/ui.js","/js/views/calendario.js","/js/views/chat.js","/js/views/chats.js","/js/views/cita-sheet.js","/js/views/citas.js","/js/views/clientes.js","/js/views/config.js","/js/views/dash-model.js","/js/views/hoy.js","/js/views/login.js","/js/views/mas.js","/js/views/recuperar.js","/js/views/registro.js","/js/views/simulador.js","/js/views/welcome.js","/js/voice.js","/legal.html","/manifest.webmanifest","/offline.html"];
const CACHE = `fieldflow-${VERSION}`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('fieldflow-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // La API y el webhook nunca se guardan: datos siempre frescos y privados.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/webhooks/')) return;

  // Navegación: red primero; sin red, la app guardada o la página offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { if (url.pathname === '/' && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); } return res; })
      .catch(async () => (await caches.match('/')) || (await caches.match('/offline.html'))));
    return;
  }
  // Fuentes, íconos y pantallas de inicio: caché primero (cambian poco).
  if (/^\/(fonts|icons|splash)\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  // CSS/JS: red primero y siempre revalidando con el servidor (cache: 'no-cache'), para que nunca se mezcle
  // un estilo viejo con código nuevo. Sin red, la copia guardada (sin importar el ?v= de la dirección).
  const key = url.origin + url.pathname;
  e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); } return res; })
    .catch(() => caches.match(key, { ignoreSearch: true })));
});
