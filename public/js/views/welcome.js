// Pantalla de inicio: titular, ingreso con Google, con correo, o iniciar sesión.
import { h } from '../ui.js';
import { googleG, icon } from '../icons.js';
import { t, getLang } from '../i18n.js';
import { siteNav } from './sitenav.js';

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
  const problem = takeAuthError();
  const nav = siteNav({ rerender });
  main.append(h('main', { class: 'wl', id: 'main' },
    h('div', { class: 'wl__photo', role: 'img', 'aria-label': t('welcome.photo') }),
    h('div', { class: 'wl__stage' },
      nav.header,
      h('div', { class: 'wl__copy' },
        h('h1', { class: 'wl__title' }, t('welcome.title')),
        h('p', { class: 'wl__lead' }, t('welcome.lead')))),
    h('section', { class: 'wl__sheet', 'aria-label': t('welcome.login') },
      h('div', { class: 'wl__actions' },
        problem ? h('div', { class: 'err', role: 'alert' }, problem) : null,
        googleBtn(),
        h('a', { class: 'wbtn', href: '#/registro' }, icon('mail', 24), h('span', null, t('welcome.email'))),
        h('p', { class: 'wl__member' }, t('welcome.member'), ' ', h('a', { href: '#/negocio' }, t('welcome.login'))),
        h('p', { class: 'wl__legal' }, t('welcome.agree'), ' ', h('a', { href: '#/terminos' }, t('welcome.terms')), ' ', t('welcome.and'), ' ', h('a', { href: '#/privacidad' }, t('welcome.privacy')), '.')))));
  main.firstChild.append(nav.drawer);
  nav.reopen();
  return nav.cleanup;
}
