import { initLang, getLang, setLang, t } from './i18n.js';
import { get, post } from './api.js';
import { state, pref, applyTheme } from './state.js';
import { h, clear, loading, langSwitch, toast } from './ui.js';
import { icon, logo } from './icons.js';
import { setPalette } from './components.js';

const root = document.getElementById('app');

const CLIENT = { chat: () => import('./views/chat.js'), citas: () => import('./views/citas.js') };
const STAFF = {
  hoy: () => import('./views/hoy.js'),
  calendario: () => import('./views/calendario.js'),
  chats: () => import('./views/chats.js'),
  crm: () => import('./views/crm.js'),
  dia: () => import('./views/dia.js'),
  clientes: () => import('./views/crm.js'),
  mas: () => import('./views/mas.js'),
  config: () => import('./views/config.js'),
  simulador: () => import('./views/simulador.js'),
};
const PUBLIC = { '': () => import('./views/welcome.js'), negocio: () => import('./views/login.js'), registro: () => import('./views/registro.js'), recuperar: () => import('./views/recuperar.js'),
  terminos: () => import('./views/legal.js').then((m) => ({ default: (c) => m.default({ ...c, doc: 'terminos' }) })),
  privacidad: () => import('./views/legal.js').then((m) => ({ default: (c) => m.default({ ...c, doc: 'privacidad' }) })) };

let cleanup = null;
let seq = 0;
let staffStarted = false;

// Tareas de segundo plano de la sesión del negocio: nunca bloquean la pantalla.
function startStaff() {
  if (staffStarted) return;
  staffStarted = true;
  const refresh = async () => {
    try { const r = await get('/api/staff/resumen'); state.attention = r.atencion.length; } catch { /* ignora */ }
  };
  refresh();
  get('/api/staff/catalogo').then((c) => setPalette(c.servicios)).catch(() => { /* sin catálogo aún */ });
  setInterval(() => { if (document.visibilityState === 'visible' && state.staff) refresh(); }, 30000);
}

// Precarga (sin bloquear) las pantallas del negocio mientras la persona está en el inicio o el login.
function warmStaff() {
  const run = () => ['./views/hoy.js', './views/calendario.js', './views/crm.js', './views/dia.js', './views/chats.js'].forEach((m) => import(m).catch(() => {}));
  (window.requestIdleCallback || ((f) => setTimeout(f, 800)))(run);
}

export const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
export const rerender = () => route();

function themeDark() {
  const th = document.documentElement.dataset.theme;
  return th ? th === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
function toggleTheme() {
  pref('theme', themeDark() ? 'light' : 'dark');
  applyTheme();
  syncThemeColor();
  route();
}
function syncThemeColor() {
  const dark = themeDark();
  const onWelcome = !state.staff && !state.client && !location.hash.replace(/^#\/?/, '');
  const color = onWelcome ? '#2052eb' : dark ? '#121110' : '#ffffff';
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  metas.forEach((m, i) => { if (i) m.remove(); });
  if (metas[0]) metas[0].setAttribute('content', color); else document.head.append(h('meta', { name: 'theme-color', content: color }));
}
const themeBtn = () => h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': themeDark() ? t('common.lightMode') : t('common.darkMode'), onclick: toggleTheme }, icon(themeDark() ? 'sun' : 'moon', 18));
const langSeg = () => langSwitch(getLang(), (c) => { setLang(c); if (state.client) post('/api/client/idioma', { idioma: c }).catch(() => {}); route(); });

async function logout() {
  await post('/api/auth/logout', { rol: state.staff ? 'staff' : 'client' }).catch(() => {});
  state.staff = null; state.client = null;
  try { localStorage.removeItem('ff_hint'); } catch { /* ignora */ }
  go('#/');
}

// ── Shell ────────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'hoy', icon: 'home', key: 'nav.today', tab: true },
  { id: 'calendario', icon: 'calendar', key: 'nav.calendar', tab: true },
  { id: 'chats', icon: 'chat', key: 'nav.chats', tab: false },
  { id: 'crm', icon: 'users', key: 'nav.crm', tab: true },
  { id: 'dia', icon: 'doc', key: 'nav.day', tab: true },
  { id: 'simulador', icon: 'phone', key: 'nav.simulator', tab: false },
  { id: 'config', icon: 'settings', key: 'nav.settings', tab: false },
  { id: 'mas', icon: 'more', key: 'nav.more', tab: false, railHidden: true },
];

function navLink(item, name, cls) {
  const badge = item.id === 'chats' && state.attention > 0 ? h('span', { class: 'count', 'aria-label': t('nav.pending', { n: state.attention }) }, String(state.attention)) : null;
  const current = name === item.id || (item.id === 'crm' && name === 'clientes') || (item.id === 'mas' && ['config', 'simulador'].includes(name));
  return h('a', { href: `#/${item.id}`, 'aria-current': current ? 'page' : null, class: cls, title: t(item.key) }, icon(item.icon, 22), h('span', { class: 'navlabel' }, t(item.key)), badge);
}
async function newCita() {
  const m = await import('./views/cita-sheet.js');
  m.openNewCitaSheet({ onDone: () => route() });
}
const fab = () => h('button', { class: 'fab', type: 'button', 'aria-label': t('nav.newCita'), onclick: newCita }, icon('plus', 26));

function buildShell(role, name) {
  const biz = state.pub.nombre || 'FieldFlow';
  if (role === 'client') {
    const tabs = [{ id: 'chat', icon: 'chat', key: 'nav.assistant' }, { id: 'citas', icon: 'calendar', key: 'nav.appointments' }];
    const top = h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: '#/chat', 'aria-label': biz }, logo(32), h('span', { class: 'hide-sm' }, biz)),
      h('div', { class: 'topbar__title' }, t(name === 'chat' ? 'nav.assistant' : 'nav.appointments')),
      h('nav', { class: 'clienttabs', 'aria-label': t('nav.main') }, tabs.map((x) => h('a', { href: `#/${x.id}`, 'aria-current': name === x.id ? 'page' : null }, icon(x.icon, 18), t(x.key)))),
      h('span', { class: 'spacer' }), langSeg(), themeBtn());
    const bar = h('nav', { class: 'tabbar', 'aria-label': t('nav.main') }, tabs.map((x) => h('a', { href: `#/${x.id}`, 'aria-current': name === x.id ? 'page' : null }, icon(x.icon, 22), h('span', null, t(x.key)))));
    const main = h('main', { class: 'main', id: 'main', tabindex: '-1' });
    return { el: h('div', { class: 'shell shell--client', 'data-route': name }, h('a', { class: 'skip-link', href: '#main', onclick: (e) => { e.preventDefault(); main.focus(); } }, t('common.skip')), h('div', { class: 'shell__body' }, top, main), bar), main };
  }
  const mini = pref('rail') === 'mini';
  const toggleRail = () => { pref('rail', mini ? null : 'mini'); route(); };
  const rail = h('aside', { class: 'rail' },
    h('div', { class: 'rail__head' },
      h('a', { class: 'brand', href: '#/hoy', title: biz }, logo(32), h('span', { class: 'navlabel' }, biz)),
      h('button', { class: 'btn btn--ghost btn--icon btn--sm rail__toggle', type: 'button', 'aria-label': t(mini ? 'nav.expandMenu' : 'nav.collapse'), 'aria-pressed': String(mini), onclick: toggleRail }, icon(mini ? 'expand' : 'collapse', 18))),
    h('nav', { 'aria-label': t('nav.main') }, NAV.filter((n) => !n.railHidden).map((n) => navLink(n, name))),
    h('div', { class: 'rail__foot' },
      mini ? h('button', { class: 'btn btn--primary btn--icon', type: 'button', 'aria-label': t('nav.newCita'), title: t('nav.newCita'), onclick: newCita }, icon('plus', 20))
        : h('div', { class: 'railcard' }, h('strong', null, t('nav.quickTitle')), h('span', null, t('nav.quickSub')),
          h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: newCita }, icon('plus', 16), t('nav.newCita'))),
      h('div', { class: 'row rail__prefs' }, mini ? null : langSeg(), themeBtn()),
      h('button', { class: 'navlink', type: 'button', onclick: logout, title: t('nav.logout') }, icon('logout', 22), h('span', { class: 'navlabel' }, t('nav.logout')))));
  const top = h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#/hoy', 'aria-label': biz }, logo(32)),
    h('div', { class: 'topbar__title' }, t(name === 'clientes' ? 'nav.crm' : NAV.find((n) => n.id === name)?.key || 'nav.today')),
    h('span', { class: 'only-sm topbar__act' },
      h('a', { class: 'btn btn--ghost btn--icon btn--sm tb', href: '#/chats', 'aria-label': t('nav.chats'), 'aria-current': name === 'chats' ? 'page' : null }, icon('chat', 20), state.attention > 0 ? h('span', { class: 'count', 'aria-label': t('nav.pending', { n: state.attention }) }, String(state.attention)) : null),
      h('a', { class: 'btn btn--ghost btn--icon btn--sm tb', href: '#/mas', 'aria-label': t('nav.more'), 'aria-current': ['mas', 'config', 'simulador'].includes(name) ? 'page' : null }, icon('menu', 20))));
  const tabs = NAV.filter((n) => n.tab).map((n) => navLink(n, name));
  const bar = h('nav', { class: 'tabbar tabbar--fab', 'aria-label': t('nav.main') }, tabs.slice(0, 2), fab(), tabs.slice(2));
  const main = h('main', { class: 'main', id: 'main', tabindex: '-1' });
  return { el: h('div', { class: `shell shell--rail${mini ? ' shell--mini' : ''}`, 'data-route': name }, h('a', { class: 'skip-link', href: '#main', onclick: (e) => { e.preventDefault(); main.focus(); } }, t('common.skip')), rail, h('div', { class: 'shell__body' }, top, main), bar), main };
}

// ── Enrutador ────────────────────────────────────────────────────────────────
async function route() {
  const my = ++seq;
  if (cleanup) { try { cleanup(); } catch { /* ya liberado */ } cleanup = null; }
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const name = parts[0] || '';
  const params = parts.slice(1);

  let role = null; let loader = null; let page = name;
  if (name in CLIENT && state.client) { role = 'client'; loader = CLIENT[name]; }
  else if (name in STAFF && state.staff) { role = 'staff'; loader = STAFF[name]; }
  else if (state.staff && (name === '' || name === 'negocio' || name === 'registro' || name === 'recuperar' || name in CLIENT)) { go('#/hoy'); return; }
  else if (state.client && (name === '' || name === 'negocio' || name === 'registro' || name === 'recuperar' || name in STAFF)) { go('#/chat'); return; }
  else if (name in PUBLIC) { loader = PUBLIC[name]; }
  else { go('#/'); return; }

  if (role === 'staff') startStaff();
  const mod = await loader();
  if (my !== seq) return;
  document.title = `${state.pub.nombre || 'FieldFlow'}`;
  syncThemeColor();
  let main = root;
  let ld = null;
  clear(root);
  if (role) {
    const sh = buildShell(role, page);
    root.append(sh.el);
    main = sh.main;
    ld = loading();
    main.append(ld);
  }
  try {
    const result = await mod.default({ main, params, role, go, rerender, isCurrent: () => my === seq, toggleTheme });
    ld?.remove();
    if (my !== seq) { if (typeof result === 'function') result(); return; }
    cleanup = typeof result === 'function' ? result : null;
  } catch (e) {
    if (my !== seq) return;
    if (e.status === 401 && role) { state.staff = null; state.client = null; try { localStorage.removeItem('ff_hint'); } catch { /* ignora */ } toast(t('err.session'), true); go('#/'); return; }
    clear(main);
    main.append(h('div', { class: 'empty' }, h('h3', null, t('err.generic')), h('p', null, e.message), h('button', { class: 'btn btn--primary', type: 'button', onclick: route }, t('common.retry'))));
  }
  if (my === seq) { window.scrollTo(0, 0); if (role && !main.querySelector('[autofocus]')) main.focus({ preventScroll: true }); }
}

// ── Arranque ─────────────────────────────────────────────────────────────────
function viewportWatch() {
  const vv = window.visualViewport;
  const apply = () => {
    const hgt = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty('--vvh', `${Math.round(hgt)}px`);
    document.body.classList.toggle('kb-open', !!vv && window.innerHeight - vv.height > 140);
  };
  apply();
  vv?.addEventListener('resize', apply);
  vv?.addEventListener('scroll', () => { if (document.querySelector('.shell[data-route="chat"]')) window.scrollTo(0, 0); });
  window.addEventListener('orientationchange', () => setTimeout(apply, 250));
}

async function boot() {
  initLang();
  applyTheme();
  viewportWatch();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Direcciones limpias para las páginas legales (/terminos, /privacidad): se muestran como rutas de la app.
  const legalPath = { '/terminos': '#/terminos', '/privacidad': '#/privacidad' }[location.pathname.replace(/\/+$/, '')];
  if (legalPath) history.replaceState(null, '', `/${legalPath}`);

  let linkError = null;
  const url = new URL(location.href);
  const tok = url.searchParams.get('t');
  if (tok) {
    try { await post('/api/auth/enter', { token: tok }); } catch (e) { linkError = e.message; }
    history.replaceState(null, '', `${url.pathname}${linkError ? '#/' : '#/chat'}`);
  }
  // Arranque instantáneo: si hubo una sesión del negocio, se pinta la estructura al momento con lo último
  // que se conoce y se confirma con el servidor en segundo plano (sin pantalla de carga ni parpadeos).
  let hint = null;
  try { hint = JSON.parse(localStorage.getItem('ff_hint') || 'null'); } catch { /* sin caché */ }
  const verify = async () => {
    try {
      const [pub, me] = await Promise.all([get('/api/public'), get('/api/auth/me')]);
      state.pub = pub; state.staff = me.staff; state.client = me.client;
      try { localStorage.setItem('ff_hint', JSON.stringify(me.staff ? { staff: me.staff, pub } : null)); } catch { /* ignora */ }
    } catch { /* sin conexión: se mantiene lo último conocido */ }
  };
  if (linkError) state.linkError = linkError;
  window.addEventListener('hashchange', route);
  if (hint?.staff && !tok) {
    state.staff = hint.staff; state.pub = hint.pub || state.pub;
    route();
    const before = !!state.staff;
    await verify();
    if (!state.staff && before) { toast(t('err.session'), true); go('#/'); }
    else if (!state.client && !state.staff) warmStaff();
    return;
  }
  await verify();
  if (!state.staff && !state.client) warmStaff();
  route();
}

boot();
