/* FieldFlow · service worker. Versión y lista de precarga las estampa dev/stamp-sw.mjs al compilar. */
const VERSION = '430eb52818';
const PRECACHE = ["/","/css/app.css","/css/base.css","/css/motion.css","/css/tokens.css","/fonts/DMSans-var.woff","/icons/apple-touch-icon.png","/icons/favicon-32.png","/icons/favicon.svg","/icons/icon-192.png","/icons/icon-512.png","/icons/icon-maskable-512.png","/img/hero/LEEME.md","/img/hero/hero-mid.webp","/img/hero/hero-tall.webp","/img/hero/hero-wide.webp","/js/api.js","/js/app.js","/js/components.js","/js/dict.js","/js/fx.js","/js/i18n.js","/js/icons.js","/js/install.js","/js/state.js","/js/theme-init.js","/js/time.js","/js/ui.js","/js/views/calendario.js","/js/views/chat.js","/js/views/chats.js","/js/views/cita-sheet.js","/js/views/citas.js","/js/views/clientes.js","/js/views/config.js","/js/views/hoy.js","/js/views/landing.js","/js/views/login.js","/js/views/mas.js","/js/views/phone.js","/js/views/registro.js","/js/views/shelf.js","/js/views/simulador.js","/js/voice.js","/legal.html","/manifest.webmanifest","/offline.html"];
const CACHE = `fieldflow-${VERSION}`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
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
  // CSS/JS: red primero con respaldo en caché (así una actualización llega de inmediato).
  e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; }).catch(() => caches.match(req)));
});
