// Entrada por el enlace público de un negocio (/n/nombre): abre el chat con el asistente, sin cuenta ni formularios.
import { get, post } from '../api.js';
import { h, clear } from '../ui.js';
import { logo } from '../icons.js';
import { t, getLang } from '../i18n.js';
import { state } from '../state.js';

export default async function entrar({ main, params, go }) {
  const slug = String(params[0] || '').toLowerCase();
  const wrap = h('div', { class: 'enter', role: 'status' }, h('div', { class: 'enter__logo' }, logo(56)), h('p', null, t('link.opening')), h('div', { class: 'spinner' }));
  main.append(wrap);
  try {
    await post(`/api/public/n/${encodeURIComponent(slug)}/entrar`, { idioma: getLang() });
    const [me, pub] = await Promise.all([get('/api/auth/me'), get('/api/public')]);
    state.client = me.client; state.pub = pub;
    go('#/chat');
  } catch (e) {
    clear(wrap);
    wrap.setAttribute('role', 'alert');
    wrap.append(h('div', { class: 'enter__logo' }, logo(56)), h('h1', null, e.status === 404 ? t('link.notFound') : t('err.generic')), h('p', null, e.status === 404 ? t('link.notFoundText') : e.message),
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => location.reload() }, t('common.retry')));
  }
}
