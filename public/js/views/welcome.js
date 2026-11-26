// Pantalla de inicio: titular, ingreso con Google, con correo, o iniciar sesión.
import { h } from '../ui.js';
import { googleG, icon } from '../icons.js';
import { t, getLang, setLang } from '../i18n.js';

// Mensaje de error que deja el servidor en /?e=<código> (ingreso con Google cancelado o no configurado).
export function takeAuthError() {
  const e = new URLSearchParams(location.search).get('e');
  if (!e) return null;
  history.replaceState(null, '', location.pathname + location.hash);
  const key = `err.${e}`;
  const msg = t(key);
  return msg === key ? t('err.generic') : msg;
}

export const googleHref = () => `/api/auth/google/start?lang=${getLang()}`;

// Botón de Google: al tocarlo se bloquea y avisa «Conectando…» para evitar toques dobles mientras se abre Google.
export function googleBtn(label = t('welcome.google')) {
  const text = h('span', null, label);
  const a = h('a', { class: 'wbtn', href: googleHref() }, googleG(24), text);
  a.addEventListener('click', () => {
    if (a.getAttribute('aria-busy') === 'true') return;
    a.setAttribute('aria-busy', 'true'); a.setAttribute('role', 'status');
    text.textContent = t('welcome.connecting');
    setTimeout(() => { a.removeAttribute('aria-busy'); a.removeAttribute('role'); text.textContent = label; }, 8000); // por si el usuario vuelve atrás
  });
  return a;
}

// Opciones de «Soluciones»: una por actor de la cadena agro.
const SOL = [['leaf', 1], ['users', 2], ['truck', 3], ['tractor', 4], ['search', 5]];
const solItems = (cls) => h('ul', { class: cls }, SOL.map(([ic, n]) =>
  h('li', { class: 'sol' }, h('span', { class: 'sol__ic' }, icon(ic, 24)), h('span', { class: 'sol__tx' }, h('strong', null, t(`sol.${n}t`)), h('span', null, t(`sol.${n}d`))))));

let keepOpen = false; // el menú sigue abierto al cambiar de idioma

export default function welcome({ main, rerender }) {
  const other = getLang() === 'es' ? 'en' : 'es';
  const problem = takeAuthError();
  let open = false;
  const langBtn = (cls) => h('button', { class: cls, type: 'button', lang: other, 'aria-label': other === 'en' ? 'English' : 'Español', onclick: () => { keepOpen = open; setLang(other); rerender(); } }, other.toUpperCase());

  // Menú de celular: pantalla completa, blanca (los paneles de Soluciones/Recursos/Comunidad se agregan después).
  const closeBtn = h('button', { class: 'wl__dclose', type: 'button', 'aria-label': t('common.close'), onclick: () => toggle(false) }, icon('x', 30));
  const row = (key) => h('button', { class: 'wl__drow', type: 'button' }, h('span', null, t(key)), icon('down', 22));
  const solRow = h('button', { class: 'wl__drow', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'sol-m', onclick: () => { const v = solPanel.hidden; solPanel.hidden = !v; solRow.setAttribute('aria-expanded', String(v)); solRow.classList.toggle('is-open', v); } }, h('span', null, t('welcome.solutions')), icon('down', 22));
  const solPanel = h('div', { class: 'wl__dpanel', id: 'sol-m', hidden: true }, solItems('sol-list'));
  const drawer = h('div', { class: 'wl__drawer', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': t('nav.main') },
    h('div', { class: 'wl__dhead' }, h('span', { class: 'wl__dbrand' }, 'FieldFlow'), h('div', { class: 'wl__dtools' }, langBtn('wl__dlang'), closeBtn)),
    h('nav', { class: 'wl__dlist', 'aria-label': t('nav.main') }, solRow, solPanel, row('welcome.resources'), row('welcome.community')),
    h('div', { class: 'wl__dcta' },
      h('a', { class: 'btn btn--primary btn--block', href: '#/registro' }, t('login.create')),
      h('a', { class: 'btn btn--block wl__dsec', href: '#/negocio' }, t('welcome.login'))));
  const burger = h('button', { class: 'wl__burger', type: 'button', 'aria-label': t('nav.main'), 'aria-expanded': 'false', 'aria-haspopup': 'dialog', onclick: () => toggle(true) }, icon('menu', 30));
  function toggle(v) {
    open = v; drawer.hidden = !v; burger.setAttribute('aria-expanded', String(v));
    document.body.style.overflow = v ? 'hidden' : '';
    if (v) closeBtn.focus(); else burger.focus();
  }
  const esc = (e) => { if (e.key === 'Escape' && open) toggle(false); };
  document.addEventListener('keydown', esc);

  // Escritorio: menús «Soluciones / Recursos / Comunidad» (sus paneles se agregan después).
  const navBtn = (key) => h('button', { class: 'wl__navbtn', type: 'button' }, t(key), icon('down', 16));
  const pop = h('div', { class: 'wl__pop', id: 'sol-d', hidden: true }, solItems('sol-list'));
  const solBtn = h('button', { class: 'wl__navbtn', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'sol-d', onclick: (e) => { e.stopPropagation(); togglePop(pop.hidden); } }, t('welcome.solutions'), icon('down', 16));
  function togglePop(v) { pop.hidden = !v; solBtn.setAttribute('aria-expanded', String(v)); solBtn.classList.toggle('is-open', v); }
  const awayPop = (e) => { if (!pop.hidden && !pop.contains(e.target)) togglePop(false); };
  const escPop = (e) => { if (e.key === 'Escape' && !pop.hidden) { togglePop(false); solBtn.focus(); } };
  document.addEventListener('click', awayPop); document.addEventListener('keydown', escPop);
  main.append(h('main', { class: 'wl', id: 'main' },
    h('div', { class: 'wl__photo', role: 'img', 'aria-label': t('welcome.photo') }),
    h('div', { class: 'wl__stage' },
      h('header', { class: 'wl__top' },
        h('span', { class: 'wl__brand' }, 'FieldFlow'),
        h('nav', { class: 'wl__nav', 'aria-label': t('nav.main') }, h('div', { class: 'wl__navitem' }, solBtn, pop), navBtn('welcome.resources'), navBtn('welcome.community')),
        h('div', { class: 'wl__tools' },
          langBtn('wl__lang'),
          h('a', { class: 'wl__login', href: '#/negocio' }, t('welcome.login')),
          h('a', { class: 'wl__create', href: '#/registro' }, t('login.create')),
          burger)),
      h('div', { class: 'wl__copy' },
        h('h1', { class: 'wl__title' }, t('welcome.title')),
        h('p', { class: 'wl__lead' }, t('welcome.lead')))),
    h('section', { class: 'wl__sheet', 'aria-label': t('welcome.login') },
      h('div', { class: 'wl__actions' },
        problem ? h('div', { class: 'err', role: 'alert' }, problem) : null,
        googleBtn(),
        h('a', { class: 'wbtn', href: '#/registro' }, icon('mail', 24), h('span', null, t('welcome.email'))),
        h('p', { class: 'wl__member' }, t('welcome.member'), ' ', h('a', { href: '#/negocio' }, t('welcome.login'))),
        h('p', { class: 'wl__legal' }, t('welcome.agree'), ' ', h('a', { href: '/legal.html', target: '_blank', rel: 'noopener' }, t('welcome.terms')))))));
  main.firstChild.append(drawer);
  if (keepOpen) { keepOpen = false; toggle(true); }
  return () => { document.removeEventListener('keydown', esc); document.removeEventListener('click', awayPop); document.removeEventListener('keydown', escPop); document.body.style.overflow = ''; };
}
