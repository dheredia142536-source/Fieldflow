// Piezas visuales del panel: tarjetas, indicadores, cambios, esqueletos.
import { h } from './ui.js';
import { icon } from './icons.js';
import { t } from './i18n.js';

export function card(title, { sub, actions, cls = '', id } = {}, ...kids) {
  return h('section', { class: `d-card ${cls}`, id },
    title || actions ? h('header', { class: 'd-card__head' }, h('div', { class: 'd-card__titles' }, title ? h('h2', { class: 'd-card__title' }, title) : null, sub ? h('p', { class: 'd-card__sub' }, sub) : null), actions || null) : null,
    ...kids);
}

// Chip de cambio: ▲ 12 % / ▼ 4 %. Sin base de comparación no se muestra.
export function deltaChip(pct, { invert = false } = {}) {
  if (pct == null) return null;
  const good = invert ? pct <= 0 : pct >= 0;
  const flat = pct === 0;
  return h('span', { class: `d-delta ${flat ? 'is-flat' : good ? 'is-up' : 'is-down'}`, 'aria-label': `${pct >= 0 ? '+' : ''}${pct}%` },
    h('span', { 'aria-hidden': 'true' }, flat ? '•' : pct > 0 ? '▲' : '▼'), `${Math.abs(pct)}%`);
}

export function kpi({ ic, label, value, pct, caption, href, invert }) {
  const body = [
    h('div', { class: 'd-kpi__top' }, h('span', { class: 'd-kpi__ic', 'aria-hidden': 'true' }, icon(ic, 18)), h('span', { class: 'd-kpi__label' }, label)),
    h('div', { class: 'd-kpi__val' }, h('strong', null, value), deltaChip(pct, { invert })),
    h('div', { class: 'd-kpi__cap' }, caption),
  ];
  return href ? h('a', { class: 'd-kpi', href }, body) : h('div', { class: 'd-kpi' }, body);
}

export const skel = (cls = '') => h('div', { class: `d-skel ${cls}`, 'aria-hidden': 'true' });

export function emptyNote(text, action) {
  return h('div', { class: 'd-note' }, h('p', null, text), action || null);
}

export const linkBtn = (href, label) => h('a', { class: 'd-link', href }, label, icon('right', 14));

// Selector segmentado accesible (pestañas o rangos).
export function seg(items, current, onPick, { label, cls = '' } = {}) {
  const wrap = h('div', { class: `d-seg ${cls}`, role: 'tablist', 'aria-label': label || null });
  for (const it of items) {
    const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(it.id === current), tabindex: it.id === current ? '0' : '-1', dataset: { id: it.id } }, it.label);
    b.addEventListener('click', () => onPick(it.id));
    wrap.append(b);
  }
  wrap.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const bs = [...wrap.querySelectorAll('button')]; const i = bs.indexOf(document.activeElement);
    if (i < 0) return;
    const n = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length]; n.focus(); n.click();
  });
  return wrap;
}
export const closeLabel = () => t('common.close');
