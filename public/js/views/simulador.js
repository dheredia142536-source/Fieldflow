// Simulador de WhatsApp: prueba el flujo "mensaje → enlace a la PWA" sin usar la API de Meta.
import { post } from '../api.js';
import { h, clear, field, busy, toast } from '../ui.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';

export default function simulador({ main }) {
  const phone = h('input', { class: 'input', type: 'tel', inputmode: 'tel', value: '573001112233', autocomplete: 'off' });
  const name = h('input', { class: 'input', value: 'Carlos', autocomplete: 'off', maxlength: '80' });
  const text = h('input', { class: 'input', value: t('sim.defaultText'), maxlength: '500', autocomplete: 'off' });
  const force = h('input', { type: 'checkbox', checked: true });
  const body = h('div', { class: 'wa__body', role: 'log', 'aria-live': 'polite' }, h('div', { class: 'wa__note' }, t('sim.empty')));
  const send = h('button', { class: 'btn btn--primary', type: 'submit' }, icon('send', 18), t('sim.send'));
  const info = h('div', { class: 'hint' });
  const form = h('form', { class: 'stack' }, field(t('sim.phone'), phone), field(t('sim.name'), name), field(t('sim.text'), text), h('label', { class: 'check' }, force, t('sim.force')), send, info);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(send, async () => {
      try {
        const r = await post('/api/staff/simulador', { telefono: phone.value, nombre: name.value, texto: text.value, forzar: force.checked });
        clear(body);
        body.append(h('div', { class: 'wa__b wa__b--me' }, text.value));
        if (r.throttled) body.append(h('div', { class: 'wa__note' }, t('sim.throttled')));
        else if (r.url) body.append(h('div', { class: 'wa__b wa__b--bot' }, r.body, h('a', { class: 'wa__cta', href: r.url }, r.button)));
        info.textContent = r.url ? t('sim.hint', { sent: r.configured ? t('sim.wouldSend') : t('sim.notConfigured') }) : '';
        body.scrollTop = body.scrollHeight;
      } catch (er) { toast(er.message, true); }
    });
  });
  main.append(h('div', { class: 'stack--lg stack' }, h('div', { class: 'pagehead' }, h('div', null, h('h1', null, t('nav.simulator')), h('p', null, t('sim.lead')))),
    h('div', { class: 'simgrid' }, h('div', { class: 'card card--surface' }, form),
      h('div', { class: 'wa', role: 'group', 'aria-label': 'WhatsApp' }, h('div', { class: 'wa__head' }, h('span', { class: 'avatar', 'aria-hidden': 'true' }, icon('chat', 18)), h('strong', null, 'WhatsApp')), body))));
}
