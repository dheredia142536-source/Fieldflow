import { h, toast, busy } from './ui.js';
import { post } from './api.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { fmtIsoTime } from './time.js';

// Formulario dentro del chat: nombre y teléfono, solo cuando la persona va a reservar (llegó por el enlace público).
function identifyForm(ui, act) {
  const nm = h('input', { class: 'input', autocomplete: 'name', maxlength: '80', placeholder: t('link.yourName'), 'aria-label': t('link.yourName') });
  const tel = h('input', { class: 'input', type: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: '20', placeholder: t('link.yourPhone'), 'aria-label': t('link.yourPhone') });
  const ok = h('input', { type: 'checkbox' });
  const go = h('button', { class: 'btn btn--primary btn--block', type: 'button' }, t('link.continue'));
  const box = h('form', { class: 'ucard idform', novalidate: true },
    h('h4', null, icon('user', 18), t('link.yourData')), nm, tel,
    h('label', { class: 'check-line idform__ok' }, ok, h('span', null, t('link.consent'), ' ', h('a', { href: '/privacidad', target: '_blank', rel: 'noopener noreferrer' }, t('link.privacy')))), go);
  box.addEventListener('submit', (e) => { e.preventDefault(); go.click(); });
  go.addEventListener('click', () => busy(go, async () => {
    try {
      await post('/api/client/identificar', { nombre: nm.value, telefono: tel.value, acepta: ok.checked });
      box.replaceChildren(h('h4', null, icon('check', 18), t('link.saved', { n: nm.value.trim().split(/\s+/)[0] })));
      act?.(t('link.confirmLabel'), ui.payload || 'confirm');
    } catch (e) { toast(e.message, true); }
  }));
  return box;
}

// Componentes interactivos que el asistente adjunta a sus mensajes.
function uiBlock(ui, act, readonly) {
  if (!ui) return null;
  const btn = (o, cls) => h('button', { class: `chip ${cls || ''}`, type: 'button', disabled: readonly, onclick: (e) => act?.(o.label, o.payload, e.currentTarget) }, o.label);
  if (ui.type === 'identify') return readonly ? null : identifyForm(ui, act);
  if (ui.type === 'chips') return h('div', { class: 'chips', role: 'group' }, (ui.options || []).map((o) => btn(o)));
  if (ui.type === 'confirm') {
    return h('div', { class: 'ucard' }, h('h4', null, icon('calendar', 18), ui.title),
      h('ul', null, (ui.lines || []).filter(Boolean).map((l) => h('li', null, l))),
      h('div', { class: 'row' }, btn(ui.confirm, 'chip--solid'), btn(ui.change, 'chip--quiet')));
  }
  if (ui.type === 'cita') {
    const off = ui.status === 'cancelada';
    return h('div', { class: `ucard ${off ? 'ucard--off' : 'ucard--ok'}` }, h('h4', null, icon(off ? 'x' : 'check', 18), ui.title),
      h('ul', null, (ui.lines || []).filter(Boolean).map((l) => h('li', null, l))));
  }
  if (ui.type === 'citas') {
    return h('div', { class: 'stack tight' }, (ui.items || []).map((it) => h('div', { class: 'ucard' }, h('h4', null, it.title),
      h('ul', null, h('li', null, it.when), it.resource ? h('li', null, it.resource) : null),
      h('div', { class: 'row' }, (it.actions || []).map((a) => btn(a, 'chip--quiet'))))));
  }
  return null;
}

export function renderMessage(m, { act, readonly = false, staffView = false } = {}) {
  if (m.rol === 'sistema') {
    if (!staffView) return null;
    return h('div', { class: 'sysnote', dataset: { id: m.id } }, m.contenido);
  }
  const mine = m.rol === 'cliente';
  const human = m.rol === 'humano';
  // En la vista del negocio, el cliente va a la izquierda.
  const side = staffView ? (mine ? 'them' : 'me') : (mine ? 'me' : 'them');
  const who = staffView ? (mine ? null : t(human ? 'chat.team' : 'chat.bot')) : (human ? t('chat.team') : null);
  return h('div', { class: `msg msg--${side}${human ? ' msg--human' : ''}`, dataset: { id: m.id, ts: m.creado_en, rol: m.rol } },
    who ? h('span', { class: 'msg__who' }, who) : null,
    m.contenido ? h('div', { class: 'bubble' }, m.contenido) : null,
    uiBlock(m.meta?.ui, act, readonly),
    h('span', { class: 'msg__time' }, fmtIsoTime(m.creado_en)));
}

export const typingBubble = () => h('div', { class: 'typing', role: 'status', 'aria-label': t('chat.typing') }, h('i'), h('i'), h('i'));

export function statusBadge(estado) {
  const map = { confirmada: ['badge--ok', 'status.confirmada'], cancelada: ['badge--warn', 'status.cancelada'], completada: ['badge--info', 'status.completada'] };
  const [cls, key] = map[estado] || ['', null];
  return h('span', { class: `badge ${cls}` }, key ? t(key) : estado);
}

// Color de parcela estable por servicio: se reparten en orden para que no se repitan (hasta 6).
const palette = new Map();
export function setPalette(servicios) {
  palette.clear();
  [...servicios].sort((a, b) => String(a.id).localeCompare(String(b.id))).forEach((s, i) => palette.set(s.id, (i % 6) + 1));
}
export function parcelColor(id) {
  if (palette.has(id)) return `var(--p${palette.get(id)})`;
  let n = 2166136261;
  for (const c of String(id)) { n ^= c.charCodeAt(0); n = Math.imul(n, 16777619) >>> 0; }
  return `var(--p${(n % 6) + 1})`;
}
export const svcLabel = (c, lang) => (lang === 'en' ? c.nombre_en : c.nombre_es) || c.nombre_es;
