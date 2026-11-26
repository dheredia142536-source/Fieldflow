// Recuperar contraseña: correo → código de 6 dígitos + contraseña nueva → sesión iniciada.
import { get, post } from '../api.js';
import { h, field, busy, clear } from '../ui.js';
import { icon, logo } from '../icons.js';
import { t, getLang } from '../i18n.js';
import { state } from '../state.js';

export default function recuperar({ main, go }) {
  let current = null; // { correo, espera_s, vence_min }
  const show = (title, lead, body) => {
    clear(main);
    main.append(h('main', { class: 'authwrap', id: 'main' }, h('div', { class: 'authcard' },
      h('a', { class: 'brand', href: '#/' }, logo(36), 'FieldFlow'),
      h('div', null, h('h1', null, title), lead ? h('p', { class: 'muted', style: 'margin-top:6px' }, lead) : null),
      h('div', { class: 'card card--lg' }, body),
      h('a', { class: 'btn btn--ghost', href: '#/negocio' }, icon('left', 18), t('forgot.back')))));
  };
  const errBox = () => h('div', { class: 'err', role: 'alert', hidden: true });
  const fail = (box, e) => { box.textContent = e.message; box.hidden = false; };

  function stepEmail(prefill = '') {
    const err = errBox();
    const correo = h('input', { class: 'input', type: 'email', name: 'email', autocomplete: 'username', inputmode: 'email', autocapitalize: 'none', spellcheck: 'false', required: true, autofocus: true, value: prefill });
    const btn = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, t('forgot.send'));
    const form = h('form', { class: 'stack', novalidate: true }, field(t('login.email'), correo), err, btn);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      err.hidden = true;
      busy(btn, async () => {
        try {
          const r = await post('/api/auth/recuperar', { correo: correo.value, idioma: getLang() });
          current = { ...r, correo: correo.value.trim().toLowerCase() };
          stepCode(r);
        } catch (ex) { fail(err, ex); }
      });
    });
    show(t('forgot.title'), t('forgot.lead'), form);
  }

  function stepCode(info) {
    const err = errBox();
    const dev = info.codigo_dev ? h('div', { class: 'banner' }, icon('alert', 20), h('span', null, `${t('reg.devCode')}: ${info.codigo_dev}`)) : null;
    const code = h('input', { class: 'input', name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', pattern: '[0-9]*', placeholder: '000000', required: true, autofocus: true, style: 'font-size:1.6rem;letter-spacing:.4em;text-align:center;font-variant-numeric:tabular-nums' });
    const pass = h('input', { class: 'input', type: 'password', name: 'new-password', autocomplete: 'new-password', minlength: '8', required: true });
    const btn = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, t('forgot.save'));
    const resend = h('button', { class: 'btn btn--ghost', type: 'button' }, t('reg.resend'));
    let timer = null; let left = Number(info.espera_s) || 60;
    const tick = () => {
      resend.disabled = left > 0;
      resend.textContent = left > 0 ? t('reg.resendIn', { s: left }) : t('reg.resend');
      if (left > 0) timer = setTimeout(() => { left -= 1; tick(); }, 1000);
    };
    tick();
    code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, '').slice(0, 6); });
    const form = h('form', { class: 'stack', novalidate: true },
      h('p', null, t('forgot.codeSent', { email: current.correo, min: info.vence_min || 15 })),
      dev, field(t('reg.code'), code), field(t('forgot.newPass'), pass, t('reg.passwordHint')), err, btn,
      h('div', { class: 'row', style: 'justify-content:space-between;flex-wrap:wrap' }, resend,
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { clearTimeout(timer); stepEmail(current.correo); } }, t('forgot.changeEmail'))));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      err.hidden = true;
      if (code.value.length !== 6) { err.textContent = t('err.code_invalid'); err.hidden = false; return; }
      if (pass.value.length < 8) { err.textContent = t('err.weak_password'); err.hidden = false; return; }
      busy(btn, async () => {
        try {
          const r = await post('/api/auth/recuperar/verificar', { correo: current.correo, codigo: code.value, password: pass.value });
          clearTimeout(timer);
          state.staff = r.usuario;
          try { state.pub = await get('/api/public'); } catch { /* se actualiza al recargar */ }
          go('#/hoy');
        } catch (ex) {
          const extra = ex.code === 'code_invalid' && typeof ex.restantes === 'number' ? ` ${t('reg.left', { n: ex.restantes })}` : '';
          fail(err, { message: ex.message + extra });
          if (['too_many_attempts', 'code_expired', 'no_pending'].includes(ex.code)) clearTimeout(timer);
          else code.select();
        }
      });
    });
    resend.addEventListener('click', () => {
      err.hidden = true;
      busy(resend, async () => {
        try {
          const r = await post('/api/auth/recuperar', { correo: current.correo, idioma: getLang() });
          left = Number(r.espera_s) || 60;
          if (r.codigo_dev && dev) dev.lastChild.textContent = `${t('reg.devCode')}: ${r.codigo_dev}`;
          tick(); code.value = ''; code.focus();
        } catch (ex) { fail(err, ex); if (ex.wait) { left = ex.wait; tick(); } }
      });
    });
    show(t('forgot.codeTitle'), null, form);
  }

  stepEmail();
  return () => {};
}
