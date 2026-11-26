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

export default function welcome({ main, rerender }) {
  const other = getLang() === 'es' ? 'en' : 'es';
  const problem = takeAuthError();
  let open = false;
  const menu = h('nav', { class: 'wl__menu', hidden: true, 'aria-label': t('nav.main') },
    h('a', { href: '#/negocio' }, t('welcome.login')),
    h('a', { href: '#/registro' }, t('login.create')),
    h('a', { href: '/legal.html', target: '_blank', rel: 'noopener' }, t('welcome.terms')));
  const burger = h('button', { class: 'wl__burger', type: 'button', 'aria-label': t('nav.main'), 'aria-expanded': 'false', onclick: (e) => { e.stopPropagation(); toggle(!open); } }, icon('menu', 30));
  function toggle(v) { open = v; menu.hidden = !v; burger.setAttribute('aria-expanded', String(v)); }
  const away = (e) => { if (open && !menu.contains(e.target)) toggle(false); };
  const esc = (e) => { if (e.key === 'Escape' && open) { toggle(false); burger.focus(); } };
  document.addEventListener('click', away);
  document.addEventListener('keydown', esc);

  // Escritorio: menús «Soluciones / Recursos / Comunidad» (sus paneles se agregan después).
  const navBtn = (key) => h('button', { class: 'wl__navbtn', type: 'button' }, t(key), icon('down', 16));
  main.append(h('main', { class: 'wl', id: 'main' },
    h('div', { class: 'wl__photo', role: 'img', 'aria-label': t('welcome.photo') }),
    h('div', { class: 'wl__stage' },
      h('header', { class: 'wl__top' },
        h('span', { class: 'wl__brand' }, 'FieldFlow'),
        h('nav', { class: 'wl__nav', 'aria-label': t('nav.main') }, navBtn('welcome.solutions'), navBtn('welcome.resources'), navBtn('welcome.community')),
        h('div', { class: 'wl__tools' },
          h('button', { class: 'wl__lang', type: 'button', lang: other, 'aria-label': other === 'en' ? 'English' : 'Español', onclick: () => { setLang(other); rerender(); } }, other.toUpperCase()),
          h('a', { class: 'wl__login', href: '#/negocio' }, t('welcome.login')),
          h('a', { class: 'wl__create', href: '#/registro' }, t('login.create')),
          burger, menu)),
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
  return () => { document.removeEventListener('click', away); document.removeEventListener('keydown', esc); };
}
