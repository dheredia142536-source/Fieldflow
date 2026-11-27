import { get, post } from '../api.js';
import { h, field, busy } from '../ui.js';
import { icon, logo } from '../icons.js';
import { t } from '../i18n.js';
import { state } from '../state.js';
import { googleBtn, takeAuthError } from './welcome.js';

export default function login({ main, go }) {
  const problem = takeAuthError();
  const err = h('div', { class: 'err', role: 'alert', hidden: !problem }, problem || '');
  const email = h('input', { class: 'input', type: 'email', name: 'email', autocomplete: 'username', inputmode: 'email', autocapitalize: 'none', spellcheck: 'false', required: true, autofocus: true });
  const pass = h('input', { class: 'input', type: 'password', name: 'password', autocomplete: 'current-password', required: true });
  const btn = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, t('login.submit'));
  const form = h('form', { class: 'stack', novalidate: true },
    field(t('login.email'), email), field(t('login.password'), pass), err, btn,
    h('a', { class: 'center', href: '#/recuperar' }, t('login.forgot')));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    err.hidden = true;
    if (!email.value.trim() || !pass.value) { err.textContent = t('err.missing_fields'); err.hidden = false; return; }
    busy(btn, async () => {
      try {
        const r = await post('/api/auth/login', { correo: email.value, password: pass.value });
        state.staff = r.usuario;
        // El nombre del negocio y la pantalla de Hoy se piden a la vez: el cambio es inmediato.
        const [pub] = await Promise.all([get('/api/public').catch(() => null), import('./hoy.js').catch(() => null)]);
        if (pub) state.pub = pub;
        go('#/hoy');
      } catch (ex) { err.textContent = ex.message; err.hidden = false; pass.focus(); }
    });
  });
  main.append(h('main', { class: 'authwrap', id: 'main' }, h('div', { class: 'authcard' },
    h('a', { class: 'brand', href: '#/' }, logo(36), 'FieldFlow'),
    h('div', null, h('h1', null, t('login.title')), h('p', { class: 'muted', style: 'margin-top:6px' }, t('login.lead'))),
    h('div', { class: 'card card--lg stack' },
      googleBtn(t('login.google')),
      h('div', { class: 'sep' }, h('span', null, t('login.or'))),
      form),
    h('p', { class: 'center' }, t('login.noAccount'), ' ', h('a', { href: '#/registro' }, t('login.create'))),
    h('a', { class: 'btn btn--ghost', href: '#/' }, icon('left', 18), t('common.back')))));
}
