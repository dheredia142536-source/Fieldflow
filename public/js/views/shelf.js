// Estantería 3D de servicios (inspirada en la interacción de la referencia, con diseño propio):
// lomos en perspectiva; el elegido se adelanta como tarjeta. Cursor, toque/desliz, flechas, teclado y línea de tiempo.
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { reduced } from '../fx.js';

// [clave, ícono, categoría, color]
const ITEMS = [
  [1, 'leaf', 'field', '#375033'], [2, 'search', 'field', '#8a4b2d'], [3, 'shield', 'field', '#006bb8'], [4, 'hand', 'field', '#566b2a'],
  [5, 'refresh', 'field', '#4a5568'], [6, 'users', 'field', '#b83200'], [7, 'truck', 'logi', '#375033'], [8, 'pin', 'logi', '#006bb8'],
  [9, 'tractor', 'mach', '#8a4b2d'], [10, 'settings', 'mach', '#4a5568'],
];
const FILTERS = [['all', 'landing.fAll'], ['field', 'landing.fField'], ['logi', 'landing.fLogi'], ['mach', 'landing.fMach']];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function buildShelf({ ctaHref }) {
  let cat = 'all'; let idx = 0; let touched = false; let visible = false; let timer = null; let hoverT = null;
  const visibleItems = () => ITEMS.filter((it) => cat === 'all' || it[2] === cat);

  // ── Lomos ──
  const spines = ITEMS.map((it, i) => {
    const [k, ic, , color] = it;
    const b = h('button', { class: 'sp', type: 'button', 'aria-label': t(`landing.sv${k}n`), tabindex: '-1', style: `--c:${color};--v:${(i * 37) % 10}` },
      h('span', { class: 'sp__ic', 'aria-hidden': 'true' }, icon(ic, 18)),
      h('span', { class: 'sp__t', 'aria-hidden': 'true' }, t(`landing.sv${k}n`)),
      h('span', { class: 'sp__n', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')));
    return b;
  });

  // ── Tarjeta frontal ──
  const face = h('div', { class: 'fc', 'aria-hidden': 'true' },
    h('svg', { class: 'fc__lines', viewBox: '0 0 200 300', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
      [0, 1, 2, 3, 4, 5].map((n) => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', `M-10 ${150 + n * 24}C50 ${110 + n * 24} 110 ${210 + n * 24} 210 ${150 + n * 24}`); return p; })),
    h('span', { class: 'fc__chip' }), h('span', { class: 'fc__ic' }), h('strong', { class: 'fc__n' }), h('span', { class: 'fc__no' }));
  const floor = h('div', { class: 'shelf__floor', 'aria-hidden': 'true' });
  const stage = h('div', { class: 'shelf__stage', role: 'group', 'aria-label': t('landing.shLabel') }, floor, spines, face);

  // ── Información, flechas y línea de tiempo ──
  const nameEl = h('h3', { class: 'shelf__name' }); const descEl = h('p', { class: 'shelf__desc' }); const metaEl = h('p', { class: 'shelf__meta' });
  const cta = h('a', { class: 'btn btn--primary', href: ctaHref }, t('landing.shCta'), icon('right', 18));
  const prev = h('button', { class: 'btn btn--ghost btn--icon', type: 'button', 'aria-label': t('landing.shPrev') }, icon('left', 20));
  const next = h('button', { class: 'btn btn--ghost btn--icon', type: 'button', 'aria-label': t('landing.shNext') }, icon('right', 20));
  const info = h('div', { class: 'shelf__info', 'aria-live': 'polite' }, nameEl, metaEl, descEl);
  const range = h('input', { class: 'tl__range', type: 'range', min: '0', max: '9', step: '1', value: '0', 'aria-label': t('landing.shTimeline') });
  const dots = h('div', { class: 'tl__dots', 'aria-hidden': 'true' });
  const timeline = h('div', { class: 'tl' }, h('div', { class: 'tl__line', 'aria-hidden': 'true' }), dots, range);
  const chips = FILTERS.map(([id, k]) => h('button', { class: 'fchip', type: 'button', 'aria-pressed': String(id === cat), dataset: { cat: id } }, t(k)));
  const bar = h('div', { class: 'shelf__filters', role: 'group', 'aria-label': t('landing.shEyebrow') }, chips);

  const el = h('section', { class: 'lsec shelf', id: 'services', 'aria-labelledby': 'sh-t' },
    h('div', { class: 'lsec__head', 'data-reveal': '1' }, h('span', { class: 'eyebrow' }, t('landing.shEyebrow')), h('h2', { id: 'sh-t' }, t('landing.shTitle'))),
    h('div', { class: 'shelf__wrap', 'data-reveal': '2' }, bar, stage,
      h('div', { class: 'shelf__foot' }, prev, h('div', { class: 'shelf__center' }, info, cta), next), timeline,
      h('p', { class: 'shelf__hint' }, t('landing.shHint'))));

  // ── Geometría ──
  function layout() {
    const list = visibleItems();
    const W = stage.clientWidth || 360;
    const sw = clamp(W * 0.055, 30, 70); const aw = clamp(W * 0.24, 150, 290); const ah = Math.round(aw * 1.5);
    stage.style.setProperty('--sw', `${sw}px`); stage.style.setProperty('--aw', `${aw}px`); stage.style.setProperty('--ah', `${ah}px`);
    const step = sw * 1.16; const gap = 12;
    const cur = list[idx];
    spines.forEach((sp, i) => {
      const pos = list.indexOf(ITEMS[i]);
      const shown = pos >= 0;
      const d = shown ? pos - idx : 0; const ad = Math.abs(d); const sg = Math.sign(d);
      const active = shown && d === 0;
      const x = sg * (aw / 2 + gap + sw / 2 + (ad - 1) * step);
      sp.style.setProperty('--x', `${active ? 0 : x}px`);
      sp.style.setProperty('--z', `${-ad * 34}px`);
      sp.style.setProperty('--ry', `${active ? 0 : -sg * 30}deg`);
      sp.style.setProperty('--s', String(Math.max(0.62, 1 - ad * 0.035)));
      sp.style.setProperty('--o', !shown || active ? '0' : String(clamp(1.15 - Math.max(0, ad - 3) * 0.22, 0.08, 1)));
      sp.style.setProperty('--ih', `${Math.round(ah * (0.9 + (Number(sp.style.getPropertyValue('--v')) || 0) * 0.011))}px`);
      sp.style.pointerEvents = shown ? '' : 'none';
      sp.setAttribute('aria-pressed', String(active)); sp.tabIndex = active ? 0 : -1; sp.hidden = false;
    });
    if (cur) {
      face.style.setProperty('--c', cur[3]);
      face.querySelector('.fc__n').textContent = t(`landing.sv${cur[0]}n`);
      face.querySelector('.fc__ic').replaceChildren(icon(cur[1], 40));
      face.querySelector('.fc__chip').textContent = t(FILTERS.find((f) => f[0] === cur[2])[1]);
      face.querySelector('.fc__no').textContent = String(ITEMS.indexOf(cur) + 1).padStart(2, '0');
      nameEl.textContent = t(`landing.sv${cur[0]}n`); descEl.textContent = t(`landing.sv${cur[0]}d`); metaEl.textContent = t(`landing.sv${cur[0]}m`);
    }
    range.max = String(Math.max(0, list.length - 1)); range.value = String(idx); range.setAttribute('aria-valuetext', cur ? t(`landing.sv${cur[0]}n`) : '');
    dots.replaceChildren(...list.map((_, n) => h('i', { class: n === idx ? 'on' : null, style: `left:${list.length > 1 ? (n / (list.length - 1)) * 100 : 0}%` })));
    prev.disabled = idx <= 0; next.disabled = idx >= list.length - 1;
  }

  let dir = 1;
  function go(n, { user = true } = {}) {
    const list = visibleItems(); const m = clamp(n, 0, list.length - 1);
    if (user) { touched = true; stop(); }
    if (m === idx) return;
    dir = m > idx ? 1 : -1; idx = m;
    layout();
    face.dataset.dir = String(dir); face.classList.remove('is-swap'); void face.offsetWidth; face.classList.add('is-swap');
  }
  const setCat = (c) => {
    cat = c; idx = 0; chips.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === c)));
    touched = true; stop(); layout(); face.classList.remove('is-swap'); void face.offsetWidth; face.classList.add('is-swap');
  };

  // ── Eventos ──
  chips.forEach((b) => b.addEventListener('click', () => setCat(b.dataset.cat)));
  spines.forEach((sp, i) => {
    const pos = () => visibleItems().indexOf(ITEMS[i]);
    sp.addEventListener('click', () => go(pos()));
    sp.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse') return; clearTimeout(hoverT); hoverT = setTimeout(() => go(pos()), 90); });
    sp.addEventListener('pointerleave', () => clearTimeout(hoverT));
    sp.addEventListener('focus', () => { if (pos() !== idx && pos() >= 0) go(pos()); });
  });
  prev.addEventListener('click', () => go(idx - 1)); next.addEventListener('click', () => go(idx + 1));
  range.addEventListener('input', () => go(Number(range.value)));
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); go(idx + 1); stage.querySelectorAll('.sp')[ITEMS.indexOf(visibleItems()[idx])]?.focus(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); go(idx - 1); stage.querySelectorAll('.sp')[ITEMS.indexOf(visibleItems()[idx])]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); } else if (e.key === 'End') { e.preventDefault(); go(visibleItems().length - 1); }
  });
  // Deslizar con el dedo
  let sx = null;
  stage.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') sx = e.clientX; });
  stage.addEventListener('pointermove', (e) => { if (sx == null) return; const dx = e.clientX - sx; if (Math.abs(dx) > 38) { go(idx + (dx < 0 ? 1 : -1)); sx = e.clientX; } });
  const end = () => { sx = null; };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end); stage.addEventListener('pointerleave', end);

  // Avance automático hasta que la persona interactúa
  function stop() { clearInterval(timer); timer = null; }
  function play() {
    stop(); if (reduced() || touched || !visible) return;
    timer = setInterval(() => { const n = visibleItems().length; go(idx + 1 >= n ? 0 : idx + 1, { user: false }); }, 3200);
  }
  const cleanups = [];
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; visible ? play() : stop(); }, { threshold: 0.45 });
    io.observe(el); cleanups.push(() => io.disconnect());
  }
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(() => layout()); ro.observe(stage); cleanups.push(() => ro.disconnect()); }
  requestAnimationFrame(layout);
  layout();
  return { el, destroy: () => { stop(); clearTimeout(hoverT); cleanups.forEach((c) => c()); } };
}
