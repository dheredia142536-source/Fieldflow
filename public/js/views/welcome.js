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

export default function welcome({ main, rerender }) {
  const other = getLang() === 'es' ? 'en' : 'es';
  const problem = takeAuthError();
  main.append(h('main', { class: 'wl', id: 'main' },
    h('div', { class: 'wl__stage' },
      h('header', { class: 'wl__top' },
        h('span', { class: 'wl__brand' }, 'FieldFlow'),
        h('button', { class: 'wl__lang', type: 'button', lang: other, 'aria-label': other === 'en' ? 'English' : 'Español', onclick: () => { setLang(other); rerender(); } }, other.toUpperCase())),
      h('div', { class: 'wl__copy' },
        h('h1', { class: 'wl__title' }, t('welcome.title')),
        h('p', { class: 'wl__lead' }, t('welcome.lead')))),
    h('section', { class: 'wl__sheet', 'aria-label': t('welcome.login') },
      h('div', { class: 'wl__actions' },
        problem ? h('div', { class: 'err', role: 'alert' }, problem) : null,
        h('a', { class: 'wbtn', href: googleHref() }, googleG(22), h('span', null, t('welcome.google'))),
        h('a', { class: 'wbtn', href: '#/registro' }, icon('mail', 22), h('span', null, t('welcome.email'))),
        h('p', { class: 'wl__member' }, t('welcome.member'), ' ', h('a', { href: '#/negocio' }, t('welcome.login'))),
        h('p', { class: 'wl__legal' }, t('welcome.agree'), ' ', h('a', { href: '/legal.html', target: '_blank', rel: 'noopener' }, t('welcome.terms')))))));
}
