// Barra superior del sitio público (inicio y páginas legales): marca, menús «Soluciones / Recursos / Comunidad»,
// idioma, ingreso y menú de celular a pantalla completa. Se comparte para que todo el sitio se vea igual.
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { t, getLang, setLang } from '../i18n.js';
import { state } from '../state.js';

// «Soluciones»: una opción por actor de la cadena agro (informativas por ahora).
const SOL = [['leaf', 1], ['users', 2], ['truck', 3], ['tractor', 4], ['search', 5]];
export const solItems = (cls) => h('ul', { class: cls }, SOL.map(([ic, n]) =>
  h('li', { class: 'sol' }, h('span', { class: 'sol__ic' }, icon(ic, 24)), h('span', { class: 'sol__tx' }, h('strong', null, t(`sol.${n}t`)), h('span', null, t(`sol.${n}d`))))));

// «Recursos»: términos y privacidad llevan a su página; el centro de ayuda llegará después (sin destino aún).
const RES = [['doc', 'terms', '#/terminos'], ['shield', 'privacy', '#/privacidad'], ['help', 'help', null]];
export const resItems = (cls) => h('ul', { class: cls }, RES.map(([ic, k, href]) => {
  const body = [h('span', { class: 'sol__ic' }, icon(ic, 24)), h('span', { class: 'sol__tx' }, h('strong', null, t(`res.${k}`)), h('span', null, t(`res.${k}d`)))];
  return h('li', null, href ? h('a', { class: 'sol sol--link', href }, body) : h('div', { class: 'sol' }, body));
}));

let keepOpen = false; // el menú sigue abierto al cambiar de idioma

// opts: { rerender, light (fondo claro), brandLink }. Devuelve { header, drawer, cleanup }.
export function siteNav({ rerender, light = false, brandLink = false }) {
  const other = getLang() === 'es' ? 'en' : 'es';
  const signedIn = !!(state.staff || state.client);
  const appHref = state.staff ? '#/hoy' : '#/chat';
  let open = false;
  const langBtn = (cls) => h('button', { class: cls, type: 'button', lang: other, 'aria-label': other === 'en' ? 'English' : 'Español', onclick: () => { keepOpen = open; setLang(other); rerender(); } }, other.toUpperCase());

  // ── Celular: pantalla completa blanca con acordeones ──
  const closeBtn = h('button', { class: 'wl__dclose', type: 'button', 'aria-label': t('common.close'), onclick: () => toggle(false) }, icon('x', 30));
  const acc = (key, id, content) => {
    const panel = h('div', { class: 'wl__dpanel', id, hidden: true }, content);
    const rowBtn = h('button', { class: 'wl__drow', type: 'button', 'aria-expanded': 'false', 'aria-controls': id, onclick: () => { const v = panel.hidden; panel.hidden = !v; rowBtn.setAttribute('aria-expanded', String(v)); rowBtn.classList.toggle('is-open', v); } }, h('span', null, t(key)), icon('down', 22));
    return [rowBtn, panel];
  };
  const drawer = h('div', { class: 'wl__drawer', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': t('nav.main') },
    h('div', { class: 'wl__dhead' }, h('span', { class: 'wl__dbrand' }, 'FieldFlow'), h('div', { class: 'wl__dtools' }, langBtn('wl__dlang'), closeBtn)),
    h('nav', { class: 'wl__dlist', 'aria-label': t('nav.main') },
      acc('welcome.solutions', 'sol-m', solItems('sol-list')), acc('welcome.resources', 'res-m', resItems('sol-list')),
      h('button', { class: 'wl__drow', type: 'button' }, h('span', null, t('welcome.community')), icon('down', 22))),
    h('div', { class: 'wl__dcta' }, signedIn
      ? h('a', { class: 'btn btn--primary btn--block', href: appHref }, t('welcome.openApp'))
      : [h('a', { class: 'btn btn--primary btn--block', href: '#/registro' }, t('login.create')), h('a', { class: 'btn btn--block wl__dsec', href: '#/negocio' }, t('welcome.login'))]));
  // Tocar cualquier enlace del menú lo cierra (también cuando el enlace es la página actual y no hay cambio de ruta).
  drawer.addEventListener('click', (e) => { if (e.target.closest('a')) toggle(false); });
  const burger = h('button', { class: 'wl__burger', type: 'button', 'aria-label': t('nav.main'), 'aria-expanded': 'false', 'aria-haspopup': 'dialog', onclick: () => toggle(true) }, icon('menu', 30));
  function toggle(v) {
    open = v; drawer.hidden = !v; burger.setAttribute('aria-expanded', String(v));
    document.body.style.overflow = v ? 'hidden' : '';
    if (v) closeBtn.focus(); else burger.focus();
  }

  // ── Escritorio: menús desplegables (uno abierto a la vez) ──
  const pops = [];
  const dropdown = (key, id, content) => {
    const pop = h('div', { class: 'wl__pop', id, hidden: true }, content);
    const btn = h('button', { class: 'wl__navbtn', type: 'button', 'aria-expanded': 'false', 'aria-controls': id, onclick: (e) => { e.stopPropagation(); show(pop, pop.hidden); } }, t(key), icon('down', 16));
    pops.push({ pop, btn });
    return h('div', { class: 'wl__navitem' }, btn, pop);
  };
  function show(target, v) {
    for (const p of pops) { const on = p.pop === target && v; p.pop.hidden = !on; p.btn.setAttribute('aria-expanded', String(on)); p.btn.classList.toggle('is-open', on); }
  }
  const away = (e) => { if (pops.some((p) => !p.pop.hidden && !p.pop.contains(e.target))) show(null, false); };
  const esc = (e) => {
    if (e.key !== 'Escape') return;
    if (open) toggle(false);
    const p = pops.find((x) => !x.pop.hidden);
    if (p) { show(null, false); p.btn.focus(); }
  };
  document.addEventListener('click', away); document.addEventListener('keydown', esc);
  const popLinks = (e) => { if (e.target.closest('.wl__pop a')) show(null, false); };
  document.addEventListener('click', popLinks);

  const header = h('header', { class: `wl__top${light ? ' sn--light' : ''}` },
    brandLink ? h('a', { class: 'wl__brand', href: signedIn ? appHref : '#/' }, 'FieldFlow') : h('span', { class: 'wl__brand' }, 'FieldFlow'),
    h('nav', { class: 'wl__nav', 'aria-label': t('nav.main') },
      dropdown('welcome.solutions', 'sol-d', solItems('sol-list')), dropdown('welcome.resources', 'res-d', resItems('sol-list')),
      h('button', { class: 'wl__navbtn', type: 'button' }, t('welcome.community'), icon('down', 16))),
    h('div', { class: 'wl__tools' }, langBtn('wl__lang'),
      signedIn ? h('a', { class: 'wl__create', href: appHref }, t('welcome.openApp'))
        : [h('a', { class: 'wl__login', href: '#/negocio' }, t('welcome.login')), h('a', { class: 'wl__create', href: '#/registro' }, t('login.create'))],
      burger));

  const restore = keepOpen; keepOpen = false;
  return {
    header, drawer, reopen: () => { if (restore) toggle(true); },
    cleanup: () => { document.removeEventListener('click', popLinks); document.removeEventListener('click', away); document.removeEventListener('keydown', esc); document.body.style.overflow = ''; },
  };
}
