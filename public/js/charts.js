// Gráficos SVG/HTML hechos a mano: sin librerías, sin innerHTML con datos, solo transform/opacity al animar.
// Hand-built SVG/HTML charts: no libraries, no innerHTML with data, only transform/opacity when animating.
import { h } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
export const S = (tag, attrs, ...kids) => {
  const el = document.createElementNS(NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, v);
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
};
const f = (n) => Math.round(n * 10) / 10;

// Curva suave que no se pasa de los datos (Catmull-Rom → Bézier con tensión baja).
export function smooth(pts) {
  if (pts.length < 2) return pts.length ? `M${f(pts[0][0])},${f(pts[0][1])}` : '';
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]; const p1 = pts[i]; const p2 = pts[i + 1]; const p3 = pts[i + 2] || p2;
    const t = 0.18;
    const lo = Math.min(p1[1], p2[1]); const hi = Math.max(p1[1], p2[1]); // sin rebasar los datos
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, Math.max(lo, Math.min(hi, p1[1] + (p2[1] - p0[1]) * t))];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, Math.max(lo, Math.min(hi, p2[1] - (p3[1] - p1[1]) * t))];
    d += `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

// Dibuja cuando el contenedor ya tiene ancho y vuelve a dibujar si cambia (orientación, panel lateral…).
export function responsive(wrap, draw) {
  let last = 0; let raf = 0;
  const run = () => {
    const w = Math.round(wrap.clientWidth);
    if (!w || w === last) return;
    last = w;
    const node = draw(w);
    wrap.replaceChildren(...(Array.isArray(node) ? node : [node]));
  };
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(run); });
    ro.observe(wrap);
    wrap._stop = () => ro.disconnect();
  } else requestAnimationFrame(run);
  requestAnimationFrame(run);
  return wrap;
}

// ── Mini gráfico de línea (tarjetas KPI) ────────────────────────────────────────────────────────
export function sparkline(values, { w = 110, hgt = 34, cls = '' } = {}) {
  const max = Math.max(1, ...values); const min = Math.min(0, ...values);
  const n = values.length;
  const pts = values.map((v, i) => [(n === 1 ? w : (i / (n - 1)) * w), hgt - 3 - ((v - min) / (max - min || 1)) * (hgt - 8)]);
  const line = smooth(pts);
  return S('svg', { class: `spark ${cls}`, viewBox: `0 0 ${w} ${hgt}`, width: '100%', height: hgt, preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
    S('path', { class: 'spark__fill', d: `${line}L${w},${hgt}L0,${hgt}Z` }),
    S('path', { class: 'spark__line', d: line, pathLength: '1', 'vector-effect': 'non-scaling-stroke' }));
}

// ── Anillo de progreso ──────────────────────────────────────────────────────────────────────────
export function ring(pct, { size = 84, stroke = 9, label = '', cls = '' } = {}) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, pct));
  return S('svg', { class: `ring ${cls}`, viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': label || `${Math.round(v)}%` },
    S('circle', { class: 'ring__bg', cx: size / 2, cy: size / 2, r, 'stroke-width': stroke, fill: 'none' }),
    S('circle', { class: 'ring__fg', cx: size / 2, cy: size / 2, r, 'stroke-width': stroke, fill: 'none', 'stroke-linecap': 'round', 'stroke-dasharray': `${f((v / 100) * c)} ${f(c)}`, transform: `rotate(-90 ${size / 2} ${size / 2})` }));
}

// ── Anillo con segmentos (origen, estados) ─────────────────────────────────────────────────────
export function donut(items, { size = 132, stroke = 20, big = '', small = '', label = '' } = {}) {
  const total = items.reduce((a, b) => a + b.value, 0);
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r; const cx = size / 2;
  const svg = S('svg', { class: 'donut', viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': label });
  svg.append(S('circle', { class: 'ring__bg', cx, cy: cx, r, 'stroke-width': stroke, fill: 'none' }));
  let acc = 0;
  if (total > 0) {
    items.forEach((it, i) => {
      if (!it.value) return;
      const len = (it.value / total) * c; const gap = items.filter((x) => x.value).length > 1 ? Math.min(3, len * 0.2) : 0;
      svg.append(S('circle', { class: `donut__seg ${it.cls || ''}`, style: `--i:${i}`, cx, cy: cx, r, fill: 'none', 'stroke-width': stroke, 'stroke-dasharray': `${f(Math.max(0, len - gap))} ${f(c)}`, 'stroke-dashoffset': f(-acc), transform: `rotate(-90 ${cx} ${cx})` }));
      acc += len;
    });
  }
  svg.append(S('text', { class: 'donut__big', x: cx, y: cx + 2, 'text-anchor': 'middle' }, big), S('text', { class: 'donut__small', x: cx, y: cx + 19, 'text-anchor': 'middle' }, small));
  return svg;
}

// ── Barras horizontales (HTML, accesibles) ───────────────────────────────────────────────────────
export function hbars(items, { max = null, fmt = (v) => String(v) } = {}) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return h('ul', { class: 'hbars' }, items.map((it, i) => h('li', { class: 'hbar', style: `--i:${i};--c:${it.color || 'var(--accent)'}` },
    it.onclick
      ? h('button', { class: 'hbar__top', type: 'button', 'aria-pressed': String(!!it.active), onclick: it.onclick }, h('span', { class: 'hbar__name' }, it.label), h('b', null, fmt(it.value)))
      : h('div', { class: 'hbar__top' }, h('span', { class: 'hbar__name' }, it.label), h('b', null, fmt(it.value))),
    h('div', { class: 'hbar__track', role: 'img', 'aria-label': `${it.label}: ${fmt(it.value)}` }, h('i', { style: `--w:${Math.max(0.02, it.value / top)}` })),
    it.sub ? h('small', null, it.sub) : null)));
}

// ── Gráfico de área con comparación, cursor y teclado ───────────────────────────────────────────
export function areaChart({ values, compare = null, labels, fmtLabel, fmtTip, ariaLabel, hgt = 210, cls = '' }) {
  const wrap = h('div', { class: `chart ${cls}`, role: 'group', tabindex: '0', 'aria-label': ariaLabel, 'aria-roledescription': 'chart' });
  const live = h('div', { class: 'sr-only', 'aria-live': 'polite' });
  const tip = h('div', { class: 'tip', role: 'presentation' });
  const box = h('div', { class: 'chart__box' });
  wrap.append(box, tip, live);
  let idx = -1; let geo = null;

  const place = (i, show = true) => {
    if (!geo || i < 0) { tip.classList.remove('is-on'); geo?.cursor.classList.remove('is-on'); idx = -1; return; }
    idx = Math.max(0, Math.min(values.length - 1, i));
    const x = geo.x(idx); const y = geo.y(values[idx]);
    geo.cursor.setAttribute('transform', `translate(${f(x)} 0)`);
    geo.dot.setAttribute('transform', `translate(${f(x)} ${f(y)})`);
    geo.cursor.classList.toggle('is-on', show);
    tip.replaceChildren(h('b', null, fmtLabel(labels[idx], idx)), h('span', null, fmtTip(values[idx], compare ? compare[idx] : null, idx)));
    const w = wrap.clientWidth; const tw = tip.offsetWidth || 120;
    tip.style.transform = `translate(${Math.max(4, Math.min(w - tw - 4, x - tw / 2))}px, ${Math.max(0, y - 62)}px)`;
    tip.classList.toggle('is-on', show);
    live.textContent = `${fmtLabel(labels[idx], idx)}: ${fmtTip(values[idx], compare ? compare[idx] : null, idx)}`;
  };

  responsive(box, (W) => {
    const padL = 30; const padR = 8; const padT = 10; const padB = 24; const H = hgt;
    const all = values.concat(compare || []);
    const top = Math.max(4, Math.ceil(Math.max(...all, 1) / 4) * 4);
    const n = values.length;
    const x = (i) => padL + (n === 1 ? (W - padL - padR) / 2 : (i / (n - 1)) * (W - padL - padR));
    const y = (v) => padT + (1 - v / top) * (H - padT - padB);
    const svg = S('svg', { class: 'area', viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true', focusable: 'false' });
    for (let g = 0; g <= 4; g++) {
      const v = (top / 4) * g;
      svg.append(S('line', { class: 'grid', x1: padL, x2: W - padR, y1: f(y(v)), y2: f(y(v)) }), S('text', { class: 'axis', x: padL - 6, y: f(y(v)) + 3.5, 'text-anchor': 'end' }, Math.round(v)));
    }
    const ticks = Math.min(n, W < 420 ? 4 : 6);
    for (let k = 0; k < ticks; k++) {
      const i = ticks === 1 ? 0 : Math.round((k / (ticks - 1)) * (n - 1));
      svg.append(S('text', { class: 'axis', x: f(x(i)), y: H - 6, 'text-anchor': k === 0 ? 'start' : k === ticks - 1 ? 'end' : 'middle' }, fmtLabel(labels[i], i, true)));
    }
    const pts = values.map((v, i) => [x(i), y(v)]);
    const line = smooth(pts);
    if (compare) svg.append(S('path', { class: 'area__prev', d: smooth(compare.map((v, i) => [x(i), y(v)])), fill: 'none' }));
    svg.append(S('path', { class: 'area__fill', d: `${line}L${f(x(n - 1))},${y(0)}L${f(x(0))},${y(0)}Z` }), S('path', { class: 'area__line', d: line, fill: 'none', pathLength: '1' }));
    const cursor = S('g', { class: 'area__cursor' }, S('line', { x1: 0, x2: 0, y1: padT, y2: H - padB }));
    const dot = S('circle', { class: 'area__dot', r: 5, cx: 0, cy: 0 });
    svg.append(cursor, dot);
    geo = { x, y, cursor, dot };
    const at = (e) => { const r = svg.getBoundingClientRect(); return Math.round(((e.clientX - r.left - padL) / (W - padL - padR)) * (n - 1)); };
    svg.addEventListener('pointermove', (e) => place(at(e)));
    svg.addEventListener('pointerdown', (e) => place(at(e)));
    svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') place(-1); });
    if (idx >= 0) requestAnimationFrame(() => place(idx));
    return svg;
  });

  wrap.addEventListener('keydown', (e) => {
    const k = e.key;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(k)) return;
    e.preventDefault();
    if (k === 'Escape') place(-1);
    else if (k === 'Home') place(0);
    else if (k === 'End') place(values.length - 1);
    else place((idx < 0 ? (k === 'ArrowRight' ? -1 : values.length) : idx) + (k === 'ArrowRight' ? 1 : -1));
  });
  wrap.addEventListener('blur', () => place(-1));
  return wrap;
}

// ── Mapa de calor día × hora ─────────────────────────────────────────────────────────────────────
export function heatmap({ matrix, rowLabels, colLabels, fmtTip, ariaLabel }) {
  const max = Math.max(1, ...matrix.flat());
  const readout = h('div', { class: 'heat__read', 'aria-live': 'polite' }, ' ');
  const grid = h('div', { class: 'heat', role: 'img', 'aria-label': ariaLabel, style: `--cols:${colLabels.length}` });
  grid.append(h('span'), ...colLabels.map((c, ci) => h('span', { class: 'heat__col', 'aria-hidden': 'true' }, ci % 2 === 0 ? c : '')));
  matrix.forEach((row, ri) => {
    grid.append(h('span', { class: 'heat__row', 'aria-hidden': 'true' }, rowLabels[ri]));
    row.forEach((v, ci) => grid.append(h('i', { class: 'heat__cell', style: `--v:${(v / max).toFixed(2)}`, 'data-r': ri, 'data-c': ci, 'aria-hidden': 'true' })));
  });
  const show = (el) => { if (!el || !el.classList.contains('heat__cell')) return; const r = +el.dataset.r; const c = +el.dataset.c; readout.textContent = fmtTip(r, c, matrix[r][c]); grid.querySelectorAll('.is-sel').forEach((n) => n.classList.remove('is-sel')); el.classList.add('is-sel'); };
  grid.addEventListener('pointerover', (e) => show(e.target));
  grid.addEventListener('pointerdown', (e) => show(e.target));
  return h('div', { class: 'heatwrap' }, grid, readout);
}

// ── Ilustración del encabezado: parcelas y surcos con puntos de lectura ─────────────────────────
export function fieldArt() {
  const furrows = [];
  for (let i = 0; i < 9; i++) furrows.push(S('path', { class: 'fa__row', d: `M${-20 + i * 6},${300 - i * 22} C ${120 + i * 4},${250 - i * 20} ${260},${300 - i * 18} ${520},${232 - i * 17}`, style: `--i:${i}` }));
  return S('svg', { class: 'fieldart', viewBox: '0 0 480 320', preserveAspectRatio: 'xMidYMax slice', 'aria-hidden': 'true', focusable: 'false' },
    S('defs', null,
      S('linearGradient', { id: 'fa-sky', x1: 0, y1: 0, x2: 0, y2: 1 }, S('stop', { offset: 0, 'stop-color': 'var(--fa-sky1)' }), S('stop', { offset: 1, 'stop-color': 'var(--fa-sky2)' })),
      S('radialGradient', { id: 'fa-sun', cx: 0.5, cy: 0.5, r: 0.5 }, S('stop', { offset: 0, 'stop-color': 'var(--fa-sun)', 'stop-opacity': 0.95 }), S('stop', { offset: 1, 'stop-color': 'var(--fa-sun)', 'stop-opacity': 0 })),
      S('linearGradient', { id: 'fa-hill', x1: 0, y1: 0, x2: 0, y2: 1 }, S('stop', { offset: 0, 'stop-color': 'var(--fa-hill1)' }), S('stop', { offset: 1, 'stop-color': 'var(--fa-hill2)' }))),
    S('rect', { width: 480, height: 320, fill: 'url(#fa-sky)' }),
    S('circle', { class: 'fa__sun', cx: 372, cy: 82, r: 96, fill: 'url(#fa-sun)' }),
    S('circle', { cx: 372, cy: 82, r: 22, fill: 'var(--fa-sun)' }),
    S('path', { class: 'fa__far', d: 'M0 196 C 70 160 130 176 200 150 S 330 150 480 168 V320 H0Z' }),
    S('path', { class: 'fa__mid', d: 'M0 230 C 90 196 170 224 260 198 S 400 196 480 214 V320 H0Z', fill: 'url(#fa-hill)' }),
    S('g', { class: 'fa__rows' }, furrows),
    S('path', { class: 'fa__tree', d: 'M410 214 q-10 -28 6 -44 q16 16 6 44z' }),
    S('path', { class: 'fa__tree', d: 'M436 222 q-8 -22 5 -36 q13 14 5 36z' }));
}
