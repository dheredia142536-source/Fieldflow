// Registro de un negocio nuevo: datos → código por correo → cuenta lista.
import { get, post } from '../api.js';
import { h, field, busy, clear } from '../ui.js';
import { icon, logo } from '../icons.js';
import { googleBtn } from './welcome.js';
import { t, getLang } from '../i18n.js';
import { state } from '../state.js';

const TIPOS = ['finca', 'cooperativa', 'transporte', 'insumos', 'asistencia', 'otro'];
const FINES = ['agendar', 'logistica', 'whatsapp', 'otro'];

export default function registro({ main, go }) {
  const card = h('div', { class: 'card card--lg' });
  let current = null; // { correo, espera_s }

  const shell = (...kids) => h('main', { class: 'authwrap', id: 'main' }, h('div', { class: 'authcard' }, ...kids));
  const show = (title, lead, body, back) => {
    clear(main);
    main.append(shell(
      h('a', { class: 'brand', href: '#/' }, logo(36), 'FieldFlow'),
      h('div', null, h('h1', null, title), h('p', { class: 'muted', style: 'margin-top:6px' }, lead)),
      h('div', { class: 'card card--lg' }, body),
      back));
  };
  const errBox = () => h('div', { class: 'err', role: 'alert', hidden: true });
  const fail = (box, e) => { box.textContent = e.message; box.hidden = false; };

  // ── Paso 1: datos ──
  function stepForm(prefill = {}) {
    const err = errBox();
    const v = (k) => prefill[k] ?? '';
    const empresa = h('input', { class: 'input', name: 'organization', autocomplete: 'organization', maxlength: '80', required: true, autofocus: true, value: v('empresa') });
    const nombre = h('input', { class: 'input', name: 'name', autocomplete: 'name', maxlength: '80', required: true, value: v('nombre') });
    const correo = h('input', { class: 'input', type: 'email', name: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'none', spellcheck: 'false', required: true, value: v('correo') });
    const telefono = h('input', { class: 'input', type: 'tel', name: 'tel', autocomplete: 'tel', inputmode: 'tel', placeholder: '573001234567', required: true, value: v('telefono') });
    const pass = h('input', { class: 'input', type: 'password', name: 'new-password', autocomplete: 'new-password', minlength: '8', required: true });
    const tipo = h('select', { class: 'select', required: true }, h('option', { value: '' }, t('reg.typePick')), TIPOS.map((x) => h('option', { value: x }, t(`reg.type_${x}`))));
    tipo.value = v('tipo');
    const depto = h('input', { class: 'input', name: 'state', autocomplete: 'address-level1', maxlength: '60', value: v('departamento') });
    const muni = h('input', { class: 'input', name: 'city', autocomplete: 'address-level2', maxlength: '60', value: v('municipio') });
    const fines = FINES.map((f) => ({ f, cb: h('input', { type: 'checkbox', value: f, checked: (prefill.fines || []).includes(f) }) }));
    const acepta = h('input', { type: 'checkbox', required: true });
    const btn = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, t('reg.send'));
    const form = h('form', { class: 'stack', novalidate: true },
      googleBtn(t('login.google')),
      h('div', { class: 'sep' }, h('span', null, t('login.or'))),
      field(t('reg.company'), empresa),
      h('div', { class: 'grid2', style: 'align-items:start' }, field(t('reg.name'), nombre), field(t('reg.phone'), telefono, t('reg.phoneHint'))),
      field(t('reg.email'), correo),
      field(t('reg.password'), pass, t('reg.passwordHint')),
      field(t('reg.type'), tipo),
      h('div', { class: 'grid2' }, field(t('reg.state'), depto), field(t('reg.city'), muni)),
      h('div', { class: 'field' }, h('span', { class: 'label', id: 'fines-l' }, t('reg.purposes')),
        h('div', { class: 'checks', role: 'group', 'aria-labelledby': 'fines-l' }, fines.map(({ f, cb }) => h('label', { class: 'check' }, cb, t(`reg.purpose_${f}`))))),
      h('label', { class: 'check', style: 'align-items:flex-start;border-radius:var(--r-md)' }, acepta,
        h('span', null, t('reg.accept'), ' ', h('a', { href: '/legal.html', target: '_blank', rel: 'noopener' }, t('reg.terms')))),
      err, btn);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      err.hidden = true;
      const data = {
        empresa: empresa.value, nombre: nombre.value, correo: correo.value, telefono: telefono.value, password: pass.value,
        tipo: tipo.value, departamento: depto.value, municipio: muni.value,
        fines: fines.filter((x) => x.cb.checked).map((x) => x.f), acepta: acepta.checked, idioma: getLang(),
      };
      busy(btn, async () => {
        try {
          const r = await post('/api/auth/registro', data);
          current = { ...r, ...data };
          stepCode(r);
        } catch (ex) { fail(err, ex); }
      });
    });
    show(t('reg.title'), t('reg.lead'), form,
      h('a', { class: 'btn btn--ghost', href: '#/negocio' }, icon('left', 18), t('reg.haveAccount')));
  }

  // ── Paso 2: código ──
  function stepCode(info) {
    const err = errBox();
    const dev = info.codigo_dev ? h('div', { class: 'banner' }, icon('alert', 20), h('span', null, `${t('reg.devCode')}: ${info.codigo_dev}`)) : null;
    const code = h('input', { class: 'input', name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', pattern: '[0-9]*', placeholder: '000000', required: true, autofocus: true, 'aria-describedby': 'code-hint', style: 'font-size:1.6rem;letter-spacing:.4em;text-align:center;font-variant-numeric:tabular-nums' });
    const btn = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, t('reg.verify'));
    const resend = h('button', { class: 'btn btn--ghost', type: 'button' }, t('reg.resend'));
    let timer = null; let left = Number(info.espera_s) || 60;
    const tick = () => {
      resend.disabled = left > 0;
      resend.textContent = left > 0 ? t('reg.resendIn', { s: left }) : t('reg.resend');
      if (left > 0) timer = setTimeout(() => { left -= 1; tick(); }, 1000);
    };
    tick();
    const form = h('form', { class: 'stack', novalidate: true },
      h('p', { id: 'code-hint' }, t('reg.codeSent', { email: current.correo.trim().toLowerCase(), min: info.vence_min || 15 })),
      dev,
      field(t('reg.code'), code),
      err, btn,
      h('div', { class: 'row', style: 'justify-content:space-between;flex-wrap:wrap' },
        resend,
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { clearTimeout(timer); stepForm(current); } }, t('reg.changeEmail'))));
    code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, '').slice(0, 6); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      err.hidden = true;
      if (code.value.length !== 6) { err.textContent = t('err.code_invalid'); err.hidden = false; return; }
      busy(btn, async () => {
        try {
          const r = await post('/api/auth/registro/verificar', { correo: current.correo, codigo: code.value });
          clearTimeout(timer);
          state.staff = { ...r.usuario, negocio: r.negocio };
          try { state.pub = await get('/api/public'); } catch { /* se actualiza al recargar */ }
          go('#/hoy');
        } catch (ex) {
          const extra = ex.status === 400 && ex.code === 'code_invalid' && typeof ex.restantes === 'number' ? ` ${t('reg.left', { n: ex.restantes })}` : '';
          fail(err, { message: ex.message + extra });
          if (['too_many_attempts', 'code_expired', 'no_pending'].includes(ex.code)) { clearTimeout(timer); }
          code.select();
        }
      });
    });
    resend.addEventListener('click', () => {
      err.hidden = true;
      busy(resend, async () => {
        try {
          const r = await post('/api/auth/registro/reenviar', { correo: current.correo });
          left = Number(r.espera_s) || 60;
          if (r.codigo_dev) alert_dev(r.codigo_dev);
          tick();
          code.value = ''; code.focus();
        } catch (ex) { fail(err, ex); if (ex.wait) { left = ex.wait; tick(); } }
      });
    });
    const alert_dev = (c) => { if (dev) dev.lastChild.textContent = `${t('reg.devCode')}: ${c}`; };
    show(t('reg.codeTitle'), t('reg.codeLead'), form,
      h('a', { class: 'btn btn--ghost', href: '#/negocio' }, icon('left', 18), t('reg.haveAccount')));
    return () => clearTimeout(timer);
  }

  stepForm();
  return () => {};
}
