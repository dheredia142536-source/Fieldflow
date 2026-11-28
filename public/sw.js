/* FieldFlow · service worker. Versión y lista de precarga las estampa dev/stamp-sw.mjs al compilar. */
const VERSION = '44f9de22cb';
const PRECACHE = ["/","/css/app.css","/css/base.css","/css/dash.css","/css/doss.css","/css/tokens.css","/fonts/inter-latin-ext-wght-normal.woff2","/fonts/inter-latin-wght-normal.woff2","/icons/apple-touch-icon.png","/icons/favicon-32.png","/icons/favicon.svg","/icons/icon-192.png","/icons/icon-512.png","/icons/icon-maskable-512.png","/img/welcome-desktop.webp","/img/welcome-mobile.webp","/js/api.js","/js/app.js","/js/components.js","/js/dict-panel.js","/js/dict.js","/js/dui.js","/js/fmt.js","/js/i18n.js","/js/icons.js","/js/install.js","/js/legal-content.js","/js/state.js","/js/theme-init.js","/js/time.js","/js/ui.js","/js/views/calendario.js","/js/views/chat.js","/js/views/chats.js","/js/views/cita-sheet.js","/js/views/citas.js","/js/views/config.js","/js/views/crm.js","/js/views/dia.js","/js/views/hoy.js","/js/views/legal.js","/js/views/login.js","/js/views/mas.js","/js/views/recuperar.js","/js/views/registro.js","/js/views/sitenav.js","/js/views/welcome.js","/js/voice.js","/manifest.webmanifest","/offline.html"];
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

  // Navegación: se abre al instante con la app guardada y se actualiza en segundo plano (sin red: página offline).
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const isApp = url.pathname === '/' || url.pathname === '/terminos' || url.pathname === '/privacidad';
      const hit = isApp ? await caches.match('/') : null;
      const net = fetch(req).then((res) => { if (url.pathname === '/' && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); } return res; });
      if (hit) { net.catch(() => {}); return hit; }
      return net.catch(async () => (await caches.match('/')) || (await caches.match('/offline.html')));
    })());
    return;
  }
  // Código, estilos, imágenes e íconos: primero lo guardado (instantáneo). Cada versión tiene su propia caché
  // completa (se llena al instalar), así que nunca se mezcla código viejo con nuevo. Lo que falte se baja y se guarda.
  const key = url.origin + url.pathname;
  e.respondWith(caches.match(key, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); } return res; })));
});
