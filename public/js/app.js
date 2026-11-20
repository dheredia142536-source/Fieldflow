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
  clientes: () => import('./views/clientes.js'),
  mas: () => import('./views/mas.js'),
  config: () => import('./views/config.js'),
  simulador: () => import('./views/simulador.js'),
};
const PUBLIC = { '': () => import('./views/landing.js'), negocio: () => import('./views/login.js') };

let cleanup = null;
let seq = 0;

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
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  document.head.append(h('meta', { name: 'theme-color', content: dark ? '#11130f' : '#fdfdf7' }));
}
const themeBtn = () => h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': themeDark() ? t('common.lightMode') : t('common.darkMode'), onclick: toggleTheme }, icon(themeDark() ? 'sun' : 'moon', 18));
const langSeg = () => langSwitch(getLang(), (c) => { setLang(c); if (state.client) post('/api/client/idioma', { idioma: c }).catch(() => {}); route(); });

async function logout() {
  await post('/api/auth/logout', { rol: state.staff ? 'staff' : 'client' }).catch(() => {});
  state.staff = null; state.client = null;
  go('#/');
}

// ── Shell ────────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'hoy', icon: 'home', key: 'nav.today', tab: true },
  { id: 'calendario', icon: 'calendar', key: 'nav.calendar', tab: true },
  { id: 'chats', icon: 'chat', key: 'nav.chats', tab: true },
  { id: 'clientes', icon: 'users', key: 'nav.clients', tab: true },
  { id: 'simulador', icon: 'phone', key: 'nav.simulator', tab: false },
  { id: 'config', icon: 'settings', key: 'nav.settings', tab: false },
  { id: 'mas', icon: 'more', key: 'nav.more', tab: true, railHidden: true },
];

function navLink(item, name, cls) {
  const badge = item.id === 'chats' && state.attention > 0 ? h('span', { class: 'count', 'aria-label': t('nav.pending', { n: state.attention }) }, String(state.attention)) : null;
  return h('a', { href: `#/${item.id}`, 'aria-current': name === item.id || (item.id === 'mas' && ['config', 'simulador'].includes(name)) ? 'page' : null, class: cls }, icon(item.icon, 22), h('span', null, t(item.key)), badge);
}

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
  const rail = h('aside', { class: 'rail' },
    h('a', { class: 'brand', href: '#/hoy' }, logo(32), biz),
    h('nav', { 'aria-label': t('nav.main') }, NAV.filter((n) => !n.railHidden).map((n) => navLink(n, name))),
    h('div', { class: 'rail__foot' }, h('div', { class: 'row' }, langSeg(), themeBtn()),
      h('button', { class: 'navlink', type: 'button', onclick: logout }, icon('logout', 22), t('nav.logout'))));
  const top = h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#/hoy', 'aria-label': biz }, logo(32)),
    h('div', { class: 'topbar__title' }, t(NAV.find((n) => n.id === name)?.key || 'nav.today')),
    h('span', { class: 'only-sm' }, langSeg()));
  const bar = h('nav', { class: 'tabbar', 'aria-label': t('nav.main') }, NAV.filter((n) => n.tab).map((n) => navLink(n, name)));
  const main = h('main', { class: 'main', id: 'main', tabindex: '-1' });
  return { el: h('div', { class: 'shell shell--rail', 'data-route': name }, h('a', { class: 'skip-link', href: '#main', onclick: (e) => { e.preventDefault(); main.focus(); } }, t('common.skip')), rail, h('div', { class: 'shell__body' }, top, main), bar), main };
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
  else if (state.staff && (name === '' || name === 'negocio' || name in CLIENT)) { go('#/hoy'); return; }
  else if (state.client && (name === '' || name === 'negocio' || name in STAFF)) { go('#/chat'); return; }
  else if (name in PUBLIC) { loader = PUBLIC[name]; }
  else { go('#/'); return; }

  const mod = await loader();
  if (my !== seq) return;
  document.title = `${state.pub.nombre || 'FieldFlow'}`;
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
    if (e.status === 401 && role) { state.staff = null; state.client = null; toast(t('err.session'), true); go('#/'); return; }
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
  syncThemeColor();
  viewportWatch();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  let linkError = null;
  const url = new URL(location.href);
  const tok = url.searchParams.get('t');
  if (tok) {
    try { await post('/api/auth/enter', { token: tok }); } catch (e) { linkError = e.message; }
    history.replaceState(null, '', `${url.pathname}${linkError ? '#/' : '#/chat'}`);
  }
  try {
    const [pub, me] = await Promise.all([get('/api/public'), get('/api/auth/me')]);
    state.pub = pub; state.staff = me.staff; state.client = me.client;
  } catch { /* sin conexión: se muestra la portada */ }
  if (linkError) state.linkError = linkError;
  if (state.staff) {
    const refresh = async () => {
      try { const r = await get('/api/staff/resumen'); state.attention = r.atencion.length; } catch { /* ignora */ }
    };
    refresh();
    try { setPalette((await get('/api/staff/catalogo')).servicios); } catch { /* sin catálogo aún */ }
    setInterval(() => { if (document.visibilityState === 'visible' && state.staff) refresh(); }, 30000);
  }
  window.addEventListener('hashchange', route);
  route();
}

boot();
