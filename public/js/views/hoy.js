// Dashboard del negocio: indicadores, línea de tiempo del día, tendencias, capacidad e insights.
// Todo se calcula en el navegador a partir de UNA respuesta del servidor: filtrar o cambiar de periodo es instantáneo.
import { get, post } from '../api.js';
import { h, clear, avatar, openSheet, toast, busy } from '../ui.js';
import { icon } from '../icons.js';
import { t, getLang } from '../i18n.js';
import { state, pref } from '../state.js';
import { fmtDay, fmtIsoTime, fmtTime, fmtWhen } from '../time.js';
import { svcLabel, parcelColor, statusBadge, setPalette } from '../components.js';
import { areaChart, donut, fieldArt, hbars, heatmap, ring, sparkline } from '../charts.js';
import { openCitaSheet, openNewCitaSheet } from './cita-sheet.js';
import { HOURS, addDays, answer, buildModel, parse, startMs } from './dash-model.js';

const T = (k, v) => t(`dash.${k}`, v);

const WIDGETS = ['hero', 'kpis', 'goal', 'timeline', 'trend', 'ask', 'insights', 'upcoming', 'services', 'resources', 'origin', 'heat', 'capacity', 'funnel', 'clients', 'status', 'activity', 'actions'];
const RANGES = [7, 30, 90];
let cache = null; // última respuesta: se pinta al instante y se refresca en segundo plano

// ── Utilidades ──────────────────────────────────────────────────────────────────────────────────
const nf = (n, d = 0) => new Intl.NumberFormat(getLang() === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: d, minimumFractionDigits: d }).format(n);
const dowName = (i, style = 'long') => new Intl.DateTimeFormat(getLang() === 'en' ? 'en-US' : 'es-CO', { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 5 + i, 12)));
const dayLong = (ymd) => fmtDay(ymd, { weekday: 'long', day: 'numeric', month: 'long' });
const dayShort = (ymd) => fmtDay(ymd, { day: 'numeric', month: 'short' });
const hourLabel = (hr) => fmtTime(`${String(hr).padStart(2, '0')}:00`);
const svcName = (s) => (getLang() === 'en' ? s.en : s.es) || s.es;
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const rel = (ymd, hoy) => {
  const n = Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${ymd}T12:00:00Z`)) / 86400000);
  return n <= 0 ? T('relToday') : n === 1 ? T('relYesterday') : T('relDays', { n });
};
const readPref = (k, d) => { try { return JSON.parse(pref(k) ?? 'null') ?? d; } catch { return d; } };

// Convierte los parámetros de un texto (fechas, horas, servicios) a lo que se ve en pantalla.
function fmtParams(p, key) {
  const o = {};
  for (const [k, v] of Object.entries(p || {})) {
    if (k === 'ymd') o.ymd = dayLong(v);
    else if (k === 'dow') o.dow = dowName(v);
    else if (k === 'hour') o.hour = hourLabel(v);
    else if (k === 'svc') o.svc = svcName(v);
    else o[k] = typeof v === 'number' ? nf(v) : v;
  }
  if (p && p.n === 1 && key && t(`dash.${key}One`) !== `dash.${key}One`) return { o, key: `${key}One` };
  return { o, key };
}
const say = (key, p) => { const r = fmtParams(p, key); return T(r.key, r.o); };

function deltaChip(d, { invert = false, unit = '%', abs = false } = {}) {
  if (d == null) return h('span', { class: 'dchip dchip--new' }, T('newBadge'));
  const v = Math.round(d * 10) / 10;
  if (Math.abs(v) < 0.5) return h('span', { class: 'dchip dchip--flat', 'aria-label': T('flat') }, '= 0');
  const up = v > 0; const good = invert ? !up : up;
  return h('span', { class: `dchip ${good ? 'dchip--good' : 'dchip--bad'}`, 'aria-label': `${up ? T('chipUp') : T('chipDown')} ${nf(Math.abs(v))}${unit}` },
    icon(up ? 'trendUp' : 'trendDown', 14), `${nf(Math.abs(v), abs ? 1 : 0)}${unit}`);
}

function card(id, title, { sub, actions, cls = '', body, label } = {}) {
  const tid = `dc-${id}`;
  return h('section', { class: `dc dc--${id} ${cls}`, 'aria-labelledby': tid, 'data-w': id },
    h('header', { class: 'dc__head' }, h('div', null, h('h2', { id: tid }, title || label), sub ? h('p', null, sub) : null), actions ? h('div', { class: 'dc__act' }, actions) : null),
    body);
}

// ── Vista principal ─────────────────────────────────────────────────────────────────────────────
export default async function hoy({ main, isCurrent, rerender, go, toggleTheme }) {
  const ui = {
    dias: RANGES.includes(+pref('dash_dias')) ? +pref('dash_dias') : 30,
    svc: new Set(), rec: new Set(),
    metric: 'citas', tl: window.innerWidth < 720 ? 'list' : 'line', hidden: new Set(readPref('dash_hidden', [])),
    goal: Math.max(5, Math.min(2000, +pref('dash_goal') || 40)), animate: true,
  };
  let data = cache?.data || null; let res = cache?.res || null; let M = null; let updated = cache?.at || 0;
  let timers = [];

  const root = h('div', { class: 'dash' });
  main.append(root);

  // Un solo viaje al servidor para todo (en paralelo) y el dashboard queda listo.
  const load = async () => {
    const [d, r] = await Promise.all([get('/api/staff/dashboard'), get('/api/staff/resumen')]);
    data = d; res = r; updated = Date.now(); cache = { data, res, at: updated };
    state.attention = r.atencion.length;
    setPalette(d.servicios.map((s) => ({ id: s.id })));
  };

  // ── pintar ────────────────────────────────────────────────────────────────────────────────────
  function stopCharts() { root.querySelectorAll('.chart__box').forEach((n) => n._stop?.()); }
  function refresh() { paint(); }

  function paint() {
    if (!data) return;
    stopCharts();
    const rows = data._rows || (data._rows = parse(data));
    M = buildModel(data, { dias: ui.dias, svc: ui.svc, rec: ui.rec, rows });
    const scroll = window.scrollY;
    const grid = h('div', { class: `dbento${ui.animate ? ' is-intro' : ''}` });
    const w = (id, node) => { if (!ui.hidden.has(id) && node) grid.append(node); };
    const empty = !data.citas.length;

    w('hero', heroCard());
    w('kpis', kpiGrid());
    w('timeline', timelineCard());
    if (empty) grid.append(emptyCard());
    w('trend', trendCard());
    w('ask', askCard());
    w('insights', insightsCard());
    w('upcoming', upcomingCard());
    w('services', servicesCard());
    w('resources', resourcesCard());
    w('origin', originCard());
    w('heat', heatCard());
    w('capacity', capacityCard());
    w('funnel', funnelCard());
    w('clients', clientsCard());
    w('status', statusCard());
    w('activity', activityCard());
    w('actions', actionsCard());

    [...grid.children].forEach((c, i) => c.style.setProperty('--n', String(i)));
    clear(root);
    root.append(header(), filtersBar(), grid);
    window.scrollTo(0, scroll);
    startNowTicker();
  }

  // ── encabezado ────────────────────────────────────────────────────────────────────────────────
  function header() {
    const hr = new Date(Date.now() - 5 * 3600000).getUTCHours();
    const hello = hr < 12 ? 'hoy.morning' : hr < 19 ? 'hoy.afternoon' : 'hoy.evening';
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': T('rangeLabel') }, RANGES.map((n) => h('button', { type: 'button', 'aria-pressed': String(ui.dias === n), onclick: () => { ui.dias = n; pref('dash_dias', String(n)); refresh(); } }, T(`r${n}`))));
    const spin = h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': T('refresh'), title: T('refresh'), onclick: async (e) => { const b = e.currentTarget; b.classList.add('is-spin'); try { await load(); paint(); } catch (er) { toast(er.message, true); } b.classList.remove('is-spin'); } }, icon('refresh', 18));
    const time = new Date(updated || Date.now());
    return h('header', { class: 'dash__head' },
      h('div', { class: 'dash__hello' }, h('h1', null, h('span', null, t(hello)), state.pub?.nombre ? h('em', null, `, ${state.pub.nombre}`) : null), h('p', null, cap1(dayLong(data.hoy)), ' · ', h('span', { class: 'muted' }, T('updated', { time: fmtTime(`${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`) })))),
      h('div', { class: 'dash__tools' },
        h('button', { class: 'dsearch', type: 'button', onclick: openPalette, 'aria-label': T('search') }, icon('search', 18), h('span', null, T('search')), h('kbd', null, 'Ctrl K')),
        seg, spin,
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': T('customize'), title: T('customize'), onclick: openCustomize }, icon('sliders', 18)),
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': T('export'), title: T('export'), onclick: exportCsv }, icon('download', 18)),
        h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: () => openNewCitaSheet({ onDone: async () => { await load(); paint(); } }) }, icon('plus', 16), t('cita.new'))));
  }

  function filtersBar() {
    const n = ui.svc.size + ui.rec.size;
    const chip = (label, active, onclick, color) => h('button', { class: 'dfchip', type: 'button', 'aria-pressed': String(active), onclick }, color ? h('i', { style: `background:${color}` }) : null, label);
    const toggle = (set, i) => { if (set.has(i)) set.delete(i); else set.add(i); refresh(); };
    return h('div', { class: 'filters', role: 'group', 'aria-label': T('filters') },
      chip(T('fAll'), n === 0, () => { ui.svc.clear(); ui.rec.clear(); refresh(); }),
      data.servicios.map((s, i) => chip(svcName(s), ui.svc.has(i), () => toggle(ui.svc, i), parcelColor(s.id))),
      h('span', { class: 'filters__sep', 'aria-hidden': 'true' }),
      data.recursos.filter((r) => r.activo).map((r) => { const i = data.recursos.indexOf(r); return chip(r.nombre, ui.rec.has(i), () => toggle(ui.rec, i)); }));
  }

  // ── hero (campo con puntos de lectura) ────────────────────────────────────────────────────────
  function heroCard() {
    const hoyN = res.citas_hoy.filter((c) => c.estado !== 'cancelada').length;
    const hoyMin = res.citas_hoy.filter((c) => c.estado !== 'cancelada').reduce((a, c) => a + durMin(c), 0);
    const capHoy = data.recursos.reduce((a, r, i) => a + (r.activo ? data.capacidad[i][(new Date(`${data.hoy}T12:00:00Z`).getUTCDay() + 6) % 7] : 0), 0);
    const occ = capHoy ? Math.min(100, Math.round((hoyMin / capHoy) * 100)) : 0;
    const hot = (cls, label, value, sub, href) => h('a', { class: `hot ${cls}`, href }, h('span', { class: 'hot__dot' }), h('span', { class: 'hot__card' }, h('small', null, label), h('b', null, value), h('em', null, sub)));
    return h('section', { class: 'dc dc--hero', 'aria-label': T('w_hero') },
      fieldArt(),
      h('div', { class: 'hero__txt' }, h('span', { class: 'hero__tag' }, icon('leaf', 14), T('heroTag')), h('p', null, T('heroCap'))),
      hot('hot--a', T('hotToday'), nf(hoyN), T('hotTodaySub', { h: nf(hoyMin / 60, 1) }), '#/calendario'),
      hot('hot--b', T('hotOcc'), `${occ}%`, T('hotOccSub'), '#/calendario'),
      hot('hot--c', T('hotChats'), nf(M.chats.att), M.chats.att ? T('hotChatsSub') : T('hotChatsOk'), '#/chats'));
  }
  const durMin = (c) => Math.max(0, Math.round((new Date(c.fin) - new Date(c.inicio)) / 60000));

  // ── indicadores ───────────────────────────────────────────────────────────────────────────────
  function kpiGrid() {
    const k = M.kpi;
    const tile = (id, tone, title, value, unit, d, extra, opts = {}) => h('article', { class: `kpi kpi--${tone}`, 'data-k': id },
      h('header', null, h('h3', null, title), h('a', { class: 'kpi__go', href: opts.href || '#/calendario', 'aria-label': title }, icon('right', 16))),
      h('div', { class: 'kpi__val' }, h('b', null, value), unit ? h('span', null, unit) : null),
      h('div', { class: 'kpi__foot' }, deltaChip(d, opts), h('small', null, T('vsPrev'))),
      extra);
    return h('div', { class: 'kpis', 'data-w': 'kpis' },
      tile('citas', 'green', T('k_citas'), nf(k.citas.v), '', k.citas.d, h('div', { class: 'kpi__viz' }, sparkline(k.citas.spark))),
      tile('ocup', 'orange', T('k_ocup'), nf(k.ocup.v), '%', k.ocup.d, h('div', { class: 'kpi__viz kpi__viz--ring' }, ring(k.ocup.v, { size: 58, stroke: 7, label: `${T('k_ocup')} ${Math.round(k.ocup.v)}%` })), { unit: ' pts', abs: false }),
      tile('nuevos', 'blue', T('k_nuevos'), nf(k.nuevos.v), '', k.nuevos.d, h('div', { class: 'kpi__viz' }, sparkline(k.nuevos.spark)), { href: '#/clientes' }),
      tile('cancel', 'rose', T('k_cancel'), nf(k.cancel.v, 1), '%', k.cancel.d, h('div', { class: 'kpi__viz kpi__viz--ring' }, ring(k.cancel.v, { size: 58, stroke: 7, label: `${T('k_cancel')} ${nf(k.cancel.v, 1)}%` })), { invert: true, unit: ' pts' }),
      tile('auto', 'violet', T('k_auto'), nf(k.auto.v), '%', k.auto.d, h('div', { class: 'kpi__viz kpi__viz--ring' }, ring(k.auto.v, { size: 58, stroke: 7, label: `${T('k_auto')} ${Math.round(k.auto.v)}%` })), { href: '#/chats', unit: ' pts' }),
      tile('horas', 'sand', T('k_horas'), nf(k.horas.v, 1), 'h', k.horas.d, h('div', { class: 'kpi__viz' }, sparkline(k.horas.spark))),
      ui.hidden.has('goal') ? null : goalStrip());
  }

  // ── línea de tiempo de hoy ────────────────────────────────────────────────────────────────────
  let nowEl = null; let nowTimer = null;
  const bounds = () => {
    const list = res.citas_hoy;
    let a = 7 * 60; let b = 17 * 60;
    for (const c of list) { const s = mins(c.inicio); const e = s + durMin(c); a = Math.min(a, Math.floor(s / 60) * 60); b = Math.max(b, Math.ceil(e / 60) * 60); }
    return [a - 0, b + 0];
  };
  const mins = (isoStr) => { const d = new Date(new Date(isoStr).getTime() - 5 * 3600000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  const nowMin = () => { const d = new Date(Date.now() - 5 * 3600000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };

  function timelineCard() {
    const seg = h('div', { class: 'seg seg--sm', role: 'group', 'aria-label': T('tlView') },
      h('button', { type: 'button', 'aria-pressed': String(ui.tl === 'line'), onclick: () => { ui.tl = 'line'; refresh(); }, 'aria-label': T('tl'), title: T('tl') }, icon('gantt', 16)),
      h('button', { type: 'button', 'aria-pressed': String(ui.tl === 'list'), onclick: () => { ui.tl = 'list'; refresh(); }, 'aria-label': T('tlList'), title: T('tlList') }, icon('list', 16)));
    const todays = res.citas_hoy;
    let body;
    if (!todays.length) {
      body = h('div', { class: 'dempty' }, icon('calendar', 28), h('b', null, t('hoy.emptyTitle')), h('span', null, res.proxima ? t('hoy.emptyNext', { when: fmtWhen(res.proxima.inicio) }) : t('hoy.emptyText')));
    } else if (ui.tl === 'list') {
      body = h('div', { class: 'list' }, todays.map((c) => h('button', { class: `pcard${c.estado === 'cancelada' ? ' pcard--cancel' : ''}`, type: 'button', style: `--p:${parcelColor(c.servicio_id)}`, onclick: () => openCitaSheet(c, async () => { await load(); paint(); }) },
        h('span', { class: 'pcard__bar' }), h('div', { class: 'pcard__time' }, fmtIsoTime(c.inicio), h('small', null, `${durMin(c)} min`)),
        h('div', { class: 'item__main' }, h('div', { class: 'item__title' }, svcLabel(c, getLang())), h('div', { class: 'item__sub' }, `${c.cliente_nombre || `+${c.cliente_telefono}`} · ${c.recurso_nombre}`)), statusBadge(c.estado))));
    } else {
      const [a, b] = bounds(); const span = b - a;
      const lanes = data.recursos.filter((r) => r.activo || todays.some((c) => c.recurso_id === r.id)).filter((r) => todays.some((c) => c.recurso_id === r.id) || data.recursos.length <= 5).slice(0, 8);
      const ticks = []; for (let m = a; m <= b; m += 60) ticks.push(m);
      nowEl = h('div', { class: 'tl__now', 'aria-hidden': 'true' }, h('span', null));
      const track = h('div', { class: 'tl__plot' },
        h('div', { class: 'tl__axis', 'aria-hidden': 'true' }, ticks.map((m) => h('span', { style: `left:${((m - a) / span) * 100}%` }, fmtTime(`${String(Math.floor(m / 60) % 24).padStart(2, '0')}:00`).replace(':00', '')))),
        lanes.map((r) => h('div', { class: 'tl__lane' },
          h('span', { class: 'tl__name' }, r.nombre),
          h('div', { class: 'tl__track' }, ticks.map((m) => h('i', { class: 'tl__grid', style: `left:${((m - a) / span) * 100}%` })),
            todays.filter((c) => c.recurso_id === r.id).map((c) => {
              const s = mins(c.inicio); const l = ((s - a) / span) * 100; const wd = (durMin(c) / span) * 100;
              return h('button', { class: `tl__blk${c.estado === 'cancelada' ? ' is-off' : ''}`, type: 'button', style: `left:${l}%;width:${Math.max(wd, 3)}%;--p:${parcelColor(c.servicio_id)}`, 'aria-label': `${fmtIsoTime(c.inicio)} · ${svcLabel(c, getLang())} · ${c.cliente_nombre || c.cliente_telefono}`, onclick: () => openCitaSheet(c, async () => { await load(); paint(); }) },
                h('b', null, svcLabel(c, getLang())), h('small', null, fmtIsoTime(c.inicio)));
            })))),
        nowEl);
      nowEl._b = [a, b];
      body = h('div', { class: 'dtl' }, h('div', { class: 'tl__scroll' }, track));
    }
    return card('timeline', T('w_timeline'), { sub: T('tlSub', { n: todays.filter((c) => c.estado !== 'cancelada').length }), actions: [seg, h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => go('#/calendario') }, icon('calendar', 16), t('nav.calendar'))], body });
  }
  function startNowTicker() {
    const place = () => {
      if (!nowEl || !nowEl.isConnected) return;
      const [a, b] = nowEl._b; const m = nowMin();
      const inside = m >= a && m <= b;
      nowEl.style.display = inside ? '' : 'none';
      nowEl.style.left = `calc(var(--lab) + (100% - var(--lab)) * ${((m - a) / (b - a)).toFixed(4)})`;
      nowEl.firstChild.textContent = fmtTime(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`).replace(/ [ap]\. m\./, '').replace(/ [AP]M/, '');
    };
    place();
    clearInterval(nowTimer);
    nowTimer = setInterval(place, 30000);
  }

  // ── hallazgos + atención ──────────────────────────────────────────────────────────────────────
  function insightsCard() {
    const att = res.atencion.slice(0, 2);
    const items = M.insights.slice(0, 5).map((i) => h('li', { class: `ins ins--${i.tone}` }, h('span', { class: 'ins__ico' }, icon(i.ico, 18)), h('p', null, say(i.k, i.p))));
    const body = h('div', { class: 'insights' },
      att.length ? h('div', { class: 'need' }, h('h3', null, T('act')), att.map((a) => h('a', { class: 'need__row', href: `#/chats/${a.id}` }, avatar(a.nombre || a.telefono), h('div', null, h('b', null, a.nombre || `+${a.telefono}`), h('span', null, a.ultimo)), icon('right', 16)))) : null,
      items.length ? h('ul', { class: 'inslist' }, items) : h('p', { class: 'muted' }, T('insNone')));
    return card('insights', T('w_insights'), { sub: T('insSub'), body });
  }

  // ── tendencia ─────────────────────────────────────────────────────────────────────────────────
  function trendCard() {
    const metrics = { citas: [M.series, M.seriesPrev], ocup: [M.kpi.ocup.spark, null], horas: [M.kpi.horas.spark, null], nuevos: [M.kpi.nuevos.spark, null] };
    const [vals, prevVals] = metrics[ui.metric];
    const total = vals.reduce((a, b) => a + b, 0);
    const best = vals.indexOf(Math.max(...vals));
    const unit = ui.metric === 'ocup' ? '%' : ui.metric === 'horas' ? ' h' : '';
    const seg = h('div', { class: 'seg seg--sm', role: 'group', 'aria-label': T('trendMetric') }, ['citas', 'ocup', 'horas', 'nuevos'].map((m) => h('button', { type: 'button', 'aria-pressed': String(ui.metric === m), onclick: () => { ui.metric = m; refresh(); } }, T(`m_${m}`))));
    const stat = (l, v) => h('div', { class: 'tstat' }, h('small', null, l), h('b', null, v));
    const chart = areaChart({
      values: vals.map((v) => Math.round(v * 10) / 10), compare: prevVals, labels: M.days, ariaLabel: T('trendAria', { metric: T(`m_${ui.metric}`), n: ui.dias }),
      fmtLabel: (ymd, i, short) => (short ? dayShort(ymd) : dayLong(ymd)), fmtTip: (v, p) => `${nf(v, ui.metric === 'horas' ? 1 : 0)}${unit}${p != null ? ` · ${T('tipVs', { n: nf(p) })}` : ''}`, cls: ui.animate ? 'is-intro' : '', hgt: root.clientWidth >= 1040 ? 330 : 220,
    });
    const avg = vals.length ? total / vals.length : 0;
    const body = h('div', { class: 'trend' },
      h('div', { class: 'tstats' }, ui.metric === 'ocup' ? stat(T('tAvg'), `${nf(avg)}%`) : stat(T('tTotal'), `${nf(total, ui.metric === 'horas' ? 1 : 0)}${unit}`), ui.metric === 'ocup' ? null : stat(T('tAvg'), `${nf(avg, 1)}${unit}`), stat(T('tBest'), vals[best] ? `${dayShort(M.days[best])} · ${nf(vals[best], ui.metric === 'horas' ? 1 : 0)}${unit}` : '—'),
        prevVals ? h('div', { class: 'tkey' }, h('i', null), T('tPrev')) : null),
      chart);
    return card('trend', T('w_trend'), { sub: T('trendSub', { n: ui.dias }), actions: seg, body });
  }

  // ── meta del mes (franja dentro de los indicadores) ───────────────────────────────────────────
  function goalStrip() {
    const g = M.goal; const p = Math.min(100, (g.n / ui.goal) * 100);
    const set = (n) => { ui.goal = Math.max(5, Math.min(2000, n)); pref('dash_goal', String(ui.goal)); refresh(); };
    return h('article', { class: 'goal', 'data-k': 'goal', 'aria-label': T('w_goal') },
      h('div', { class: 'goal__l' }, h('h3', null, icon('target', 16), T('w_goal')), h('p', null, g.n >= ui.goal ? T('goalDone') : T('goalOf', { n: g.n, goal: ui.goal }))),
      h('div', { class: 'goal__m' },
        h('div', { class: 'goal__bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(ui.goal), 'aria-valuenow': String(g.n), 'aria-label': T('w_goal') }, h('i', { style: `--w:${(p / 100).toFixed(3)}` })),
        h('small', null, T('goalProj', { n: g.proy }))),
      h('b', { class: 'goal__pct' }, `${nf(p)}%`),
      h('div', { class: 'stepper', role: 'group', 'aria-label': T('goalEdit') },
        h('button', { class: 'btn btn--secondary btn--icon btn--sm', type: 'button', 'aria-label': T('goalMinus'), onclick: () => set(ui.goal - 5) }, '−'),
        h('span', null, T('goalTarget', { n: ui.goal })),
        h('button', { class: 'btn btn--secondary btn--icon btn--sm', type: 'button', 'aria-label': T('goalPlus'), onclick: () => set(ui.goal + 5) }, '+')));
  }

  // ── pregunta rápida ───────────────────────────────────────────────────────────────────────────
  function askCard() {
    const out = h('div', { class: 'ask__out', 'aria-live': 'polite' }, h('p', { class: 'muted' }, T('askHint')));
    const Q = [['peak', 'qPeak'], ['topSvc', 'qTopSvc'], ['freeRes', 'qFreeRes'], ['week', 'qWeek'], ['topClient', 'qTopClient'], ['freeDay', 'qFreeDay']];
    const chips = h('div', { class: 'chips' }, Q.map(([k, lbl]) => h('button', { class: 'chip', type: 'button', onclick: () => { const a = answer(k, M, data); out.replaceChildren(h('div', { class: 'bub bub--q' }, T(lbl)), h('div', { class: 'bub bub--a' }, icon('sparkles', 16), say(a.k, a.p))); } }, T(lbl))));
    return card('ask', T('w_ask'), { sub: T('askSub'), body: h('div', { class: 'ask' }, chips, out) });
  }

  // ── servicios / recursos / origen / estados ───────────────────────────────────────────────────
  function servicesCard() {
    const items = M.servicios.filter((s) => s.n || ui.svc.has(s.i)).slice(0, 8).map((s) => ({ label: svcName(data.servicios[s.i]), value: s.n, color: parcelColor(data.servicios[s.i].id), sub: T('svcSub', { n: s.n, h: nf(s.min / 60, 1) }), active: ui.svc.has(s.i), onclick: () => { if (ui.svc.has(s.i)) ui.svc.delete(s.i); else ui.svc.add(s.i); refresh(); } }));
    return card('services', T('w_services'), { sub: T('svcHint'), body: items.length ? hbars(items) : h('p', { class: 'muted' }, T('noData')) });
  }
  function resourcesCard() {
    const items = M.recursos.map((r) => ({ label: r.nombre, value: Math.round(r.pct), color: r.pct >= 85 ? 'var(--warn)' : r.pct < 35 ? 'var(--accent)' : 'var(--green)', sub: r.cap ? T('resSub', { a: nf(r.res / 60, 1), b: nf(r.cap / 60) }) : T('resNoCap'), active: ui.rec.has(r.i), onclick: () => { if (ui.rec.has(r.i)) ui.rec.delete(r.i); else ui.rec.add(r.i); refresh(); } }));
    return card('resources', T('w_resources'), { sub: T('resHint'), body: items.length ? hbars(items, { max: 100, fmt: (v) => `${v}%` }) : h('p', { class: 'muted' }, T('noData')) });
  }
  function legend(items, total) {
    return h('ul', { class: 'dlegend' }, items.map((it) => h('li', null, h('i', { style: `background:${it.color}` }), h('span', null, it.label), h('b', null, nf(it.value)), h('small', null, `${total ? Math.round((it.value / total) * 100) : 0}%`))));
  }
  function originCard() {
    const items = [{ label: T('oWa'), value: M.origen[0], color: 'var(--p1)' }, { label: T('oPwa'), value: M.origen[1], color: 'var(--p2)' }, { label: T('oMan'), value: M.origen[2], color: 'var(--p3)' }];
    const total = M.origen.reduce((a, b) => a + b, 0);
    return card('origin', T('w_origin'), { sub: T('originSub'), body: h('div', { class: 'dnwrap' }, h('div', { class: 'ddn' }, donut(items.map((i, k) => ({ ...i, cls: `s${k}` })), { big: nf(total), small: T('oTotal'), label: T('w_origin') }), legend(items, total)), h('p', { class: 'dnote' }, icon('bot', 16), T('originNote', { pct: Math.round(M.kpi.auto.v) }))) });
  }
  function statusCard() {
    const items = [{ label: T('sDone'), value: M.estados[1], color: 'var(--green)' }, { label: T('sConf'), value: M.estados[0], color: 'var(--accent)' }, { label: T('sCan'), value: M.estados[2], color: 'var(--warn)' }];
    const total = items.reduce((a, b) => a + b.value, 0);
    return card('status', T('w_status'), { sub: T('statusSub'), body: h('div', { class: 'dnwrap' }, h('div', { class: 'ddn' }, donut(items.map((i, k) => ({ ...i, cls: `t${k}` })), { big: nf(total), small: T('oTotal'), label: T('w_status') }), legend(items, total)), h('p', { class: 'dnote' }, icon('shield', 16), T('statusNote', { pct: M.estados[1] + M.estados[2] ? Math.round((M.estados[1] / (M.estados[1] + M.estados[2])) * 100) : 0 }))) });
  }

  // ── calor, capacidad, embudo, clientes ────────────────────────────────────────────────────────
  function heatCard() {
    const body = M.peak.n
      ? heatmap({ matrix: M.matrix, rowLabels: M.matrix.map((_, i) => cap1(dowName(i, 'short'))), colLabels: HOURS.map((x) => String(x > 12 ? x - 12 : x)), ariaLabel: T('heatAria', { dow: dowName(M.peak.r), hour: hourLabel(HOURS[M.peak.c]), n: M.peak.n }), fmtTip: (r, c, n) => T('heatTip', { dow: cap1(dowName(r)), hour: hourLabel(HOURS[c]), n }) })
      : h('p', { class: 'muted' }, T('noData'));
    return card('heat', T('w_heat'), { sub: T('heatSub'), body });
  }
  function capacityCard() {
    const days = M.futuro;
    const body = h('div', { class: 'cap', role: 'list' }, days.map((d, i) => h('a', { class: `cap__d${i === 0 ? ' is-today' : ''}${d.pct >= 90 ? ' is-full' : ''}`, role: 'listitem', href: '#/calendario', 'aria-label': T('capTip', { ymd: dayLong(d.ymd), n: d.n, pct: Math.round(d.pct) }), title: T('capTip', { ymd: dayLong(d.ymd), n: d.n, pct: Math.round(d.pct) }) },
      h('b', null, String(d.n)), h('span', { class: 'cap__bar' }, h('i', { style: `--h:${Math.max(0.04, d.pct / 100).toFixed(2)};--i:${i}` })), h('small', null, cap1(dowName((new Date(`${d.ymd}T12:00:00Z`).getUTCDay() + 6) % 7, 'narrow'))), h('small', { class: 'cap__n' }, d.ymd.slice(8)))));
    return card('capacity', T('w_capacity'), { sub: T('capSub'), body });
  }
  function funnelCard() {
    const F = M.funnel; const base = Math.max(1, F.clientes);
    const steps = [[T('fClients'), F.clientes], [T('fChat'), F.chat], [T('fCita'), F.cita], [T('fRepeat'), F.recurrentes]];
    return card('funnel', T('w_funnel'), { sub: T('funnelSub'), body: h('ol', { class: 'funnel' }, steps.map(([l, v], i) => h('li', { style: `--w:${Math.max(0.08, v / base).toFixed(2)};--i:${i}` }, h('div', { class: 'funnel__bar' }, h('i'), h('b', null, nf(v))), h('span', null, l), h('small', null, `${Math.round((v / base) * 100)}%`)))) });
  }
  function clientsCard() {
    const top = M.topClientes; const max = Math.max(1, ...top.map((c) => c.n));
    return card('clients', T('w_clients'), { sub: T('cSub'), actions: h('a', { class: 'btn btn--ghost btn--sm', href: '#/clientes' }, t('nav.clients')),
      body: top.length ? h('ul', { class: 'toplist' }, top.map((c, i) => h('li', { style: `--w:${(c.n / max).toFixed(2)};--i:${i}` }, h('span', { class: 'rank' }, String(i + 1)), avatar(c.nombre), h('div', null, h('b', null, c.nombre), h('div', { class: 'toplist__bar' }, h('i'))), h('em', null, T('cN', { n: c.n }))))) : h('p', { class: 'muted' }, T('noData')) });
  }

  // ── próximas, actividad, acciones ─────────────────────────────────────────────────────────────
  function upcomingCard() {
    const full = new Map(res.citas_hoy.map((c) => [c.id, c]));
    const rows = M.proximas.map((r) => {
      const svc = data.servicios[r.svc]; const cli = r.cli >= 0 ? data.clientes[r.cli] : null;
      const when = r.ymd === data.hoy ? T('relToday') : r.ymd === addDays(data.hoy, 1) ? T('tomorrow_') : cap1(dayShort(r.ymd));
      const fx = full.get(r.id);
      return h('button', { class: 'urow', type: 'button', style: `--p:${parcelColor(svc.id)}`, onclick: () => (fx ? openCitaSheet(fx, async () => { await load(); paint(); }) : go('#/calendario')) },
        h('span', { class: 'urow__bar' }), h('div', { class: 'urow__t' }, h('b', null, fmtTime(`${String(Math.floor(r.s / 60)).padStart(2, '0')}:${String(r.s % 60).padStart(2, '0')}`)), h('small', null, when)),
        h('div', { class: 'item__main' }, h('div', { class: 'item__title' }, svcName(svc)), h('div', { class: 'item__sub' }, `${cli ? cli[0] || `+${cli[1]}` : '—'} · ${data.recursos[r.rec].nombre}`)),
        h('span', { class: 'badge' }, `${r.d} min`));
    });
    return card('upcoming', T('w_upcoming'), { sub: T('upSub'), body: rows.length ? h('div', { class: 'list' }, rows) : h('p', { class: 'muted' }, T('upNone')) });
  }
  function activityCard() {
    const ico = ['chat', 'phone', 'edit'];
    const rows = M.recientes.map((r) => {
      const svc = data.servicios[r.svc]; const cli = r.cli >= 0 ? data.clientes[r.cli] : null;
      return h('li', { class: 'act' }, h('span', { class: 'act__ico', style: `--c:var(--p${r.org + 1})` }, icon(ico[r.org], 16)),
        h('div', null, h('b', null, cli ? cli[0] || `+${cli[1]}` : '—'), h('span', null, ` · ${svcName(svc)}`), h('small', null, `${T(['oWa', 'oPwa', 'oMan'][r.org])} · ${T('actWhen', { rel: rel(r.cre, data.hoy) })} · ${cap1(dayShort(r.ymd))}`)));
    });
    return card('activity', T('w_activity'), { sub: T('actSub'), body: rows.length ? h('ul', { class: 'actlist' }, rows) : h('p', { class: 'muted' }, T('noData')) });
  }
  function actionsCard() {
    const a = (ico, label, fn, href) => (href ? h('a', { class: 'qa', href }, h('span', null, icon(ico, 20)), label) : h('button', { class: 'qa', type: 'button', onclick: fn }, h('span', null, icon(ico, 20)), label));
    return card('actions', T('w_actions'), { sub: T('aSub'), body: h('div', { class: 'qas' },
      a('plus', t('cita.new'), () => openNewCitaSheet({ onDone: async () => { await load(); paint(); } })),
      a('chat', T('aChats'), null, '#/chats'), a('calendar', T('aCal'), null, '#/calendario'), a('users', t('nav.clients'), null, '#/clientes'),
      a('phone', T('aSim'), null, '#/simulador'), a('download', T('export'), exportCsv), a('sliders', T('customize'), openCustomize),
      a(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', T('aTheme'), () => toggleTheme()), a('settings', t('nav.settings'), null, '#/config')) });
  }

  function emptyCard() {
    const btn = h('button', { class: 'btn btn--primary', type: 'button' }, icon('leaf', 16), T('emDemo'));
    btn.addEventListener('click', () => busy(btn, async () => { try { await post('/api/staff/demo-data', {}); toast(T('emDone')); cache = null; rerender(); } catch (e) { toast(e.message, true); } }));
    return h('section', { class: 'dc dc--empty' }, h('div', null, icon('sparkles', 26), h('h2', null, T('emTitle')), h('p', null, T('emText'))), h('div', { class: 'row' }, btn, h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => openNewCitaSheet({ onDone: async () => { await load(); paint(); } }) }, icon('plus', 16), t('cita.new'))));
  }

  // ── personalizar, exportar, paleta de comandos ───────────────────────────────────────────────
  function openCustomize() {
    const boxes = WIDGETS.map((id) => { const cb = h('input', { type: 'checkbox', id: `cw-${id}`, checked: !ui.hidden.has(id) }); cb.checked = !ui.hidden.has(id); return [id, cb]; });
    const body = h('div', { class: 'custom' }, h('p', { class: 'muted' }, T('customText')), h('div', { class: 'custom__grid' }, boxes.map(([id, cb]) => h('label', { class: 'check', for: `cw-${id}` }, cb, h('span', null, T(`w_${id}`))))));
    const reset = h('button', { class: 'btn btn--secondary', type: 'button' }, T('reset'));
    const ok = h('button', { class: 'btn btn--primary', type: 'button' }, t('common.save'));
    const s = openSheet({ title: T('customize'), body, foot: [reset, ok] });
    reset.addEventListener('click', () => boxes.forEach(([, cb]) => { cb.checked = true; }));
    ok.addEventListener('click', () => { ui.hidden = new Set(boxes.filter(([, cb]) => !cb.checked).map(([id]) => id)); pref('dash_hidden', JSON.stringify([...ui.hidden])); s.close(); refresh(); });
  }

  function exportCsv() {
    const safe = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"', '""')}"`; };
    const head = ['fecha', 'hora', 'servicio', 'recurso', 'cliente', 'telefono', 'estado', 'origen'];
    const lines = [head.join(',')];
    for (const r of [...M.rows].sort((a, b) => startMs(a) - startMs(b))) {
      const cli = r.cli >= 0 ? data.clientes[r.cli] : ['', ''];
      lines.push([r.ymd, `${String(Math.floor(r.s / 60)).padStart(2, '0')}:${String(r.s % 60).padStart(2, '0')}`, svcName(data.servicios[r.svc]), data.recursos[r.rec].nombre, cli[0], cli[1], data.estados[r.est], data.origenes[r.org]].map(safe).join(','));
    }
    const url = URL.createObjectURL(new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
    const a = h('a', { href: url, download: `fieldflow-citas-${data.hoy}.csv` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(T('exported'));
  }

  function openPalette() {
    const opener = document.activeElement;
    const input = h('input', { class: 'pal__in', type: 'search', placeholder: T('searchPh'), 'aria-label': T('search'), autocomplete: 'off', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'pal-list' });
    const list = h('ul', { class: 'pal__list', id: 'pal-list', role: 'listbox' });
    const box = h('div', { class: 'pal', role: 'dialog', 'aria-modal': 'true', 'aria-label': T('search') }, h('div', { class: 'pal__head' }, icon('search', 18), input, h('kbd', null, 'Esc')), list);
    const ov = h('div', { class: 'pal__ov' }, box);
    let items = []; let sel = 0;
    const base = [
      [T('pNav'), 'home', t('nav.today'), () => go('#/hoy')], [T('pNav'), 'calendar', t('nav.calendar'), () => go('#/calendario')], [T('pNav'), 'chat', t('nav.chats'), () => go('#/chats')],
      [T('pNav'), 'users', t('nav.clients'), () => go('#/clientes')], [T('pNav'), 'phone', t('nav.simulator'), () => go('#/simulador')], [T('pNav'), 'settings', t('nav.settings'), () => go('#/config')],
      [T('pActions'), 'plus', t('cita.new'), () => openNewCitaSheet({ onDone: async () => { await load(); paint(); } })], [T('pActions'), 'download', T('export'), exportCsv], [T('pActions'), 'sliders', T('customize'), openCustomize],
      [T('pActions'), 'moon', T('aTheme'), () => toggleTheme()], ...RANGES.map((n) => [T('pActions'), 'clock', T('pRange', { n }), () => { ui.dias = n; pref('dash_dias', String(n)); refresh(); }]),
    ];
    const close = () => { ov.remove(); document.removeEventListener('keydown', onK, true); opener?.focus?.(); };
    const run = (i) => { const it = items[i]; if (!it) return; close(); it[3](); };
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      items = base.filter((b) => !q || b[2].toLowerCase().includes(q));
      if (q.length >= 2) {
        const hits = data.clientes.map((c, i) => [c, i]).filter(([c]) => (c[0] || '').toLowerCase().includes(q) || c[1].includes(q)).slice(0, 6);
        items = items.concat(hits.map(([c]) => [T('pClients'), 'user', `${c[0] || `+${c[1]}`} · +${c[1]}`, () => go('#/clientes')]));
      }
      sel = Math.min(sel, Math.max(0, items.length - 1));
      clear(list);
      if (!items.length) { list.append(h('li', { class: 'pal__none' }, T('pNone'))); return; }
      let last = '';
      items.forEach((it, i) => {
        if (it[0] !== last) { list.append(h('li', { class: 'pal__grp', role: 'presentation' }, it[0])); last = it[0]; }
        list.append(h('li', { role: 'option', id: `pal-${i}`, 'aria-selected': String(i === sel), class: i === sel ? 'is-sel' : '', onpointerdown: (e) => { e.preventDefault(); run(i); }, onpointerenter: () => { sel = i; mark(); } }, icon(it[1], 18), h('span', null, it[2])));
      });
      input.setAttribute('aria-activedescendant', `pal-${sel}`);
    };
    const mark = () => { list.querySelectorAll('[role=option]').forEach((n) => { const on = n.id === `pal-${sel}`; n.classList.toggle('is-sel', on); n.setAttribute('aria-selected', String(on)); if (on) n.scrollIntoView({ block: 'nearest' }); }); input.setAttribute('aria-activedescendant', `pal-${sel}`); };
    const onK = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, items.length); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % Math.max(1, items.length); mark(); }
      else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
      else if (e.key === 'Tab') { e.preventDefault(); }
    };
    input.addEventListener('input', () => { sel = 0; draw(); });
    ov.addEventListener('pointerdown', (e) => { if (e.target === ov) close(); });
    document.addEventListener('keydown', onK, true);
    document.body.append(ov); draw(); input.focus();
  }

  function skeleton() {
    return h('div', { class: 'dash__skel', role: 'status', 'aria-label': t('common.loading') },
      h('div', { class: 'sk sk--head' }), h('div', { class: 'sk-grid' }, Array.from({ length: 7 }, (_, i) => h('div', { class: `sk sk--c${i}` }))));
  }

  // ── arranque (al final: todas las funciones y constantes ya existen) ──────────────────────────
  if (data) { setPalette(data.servicios.map((s) => ({ id: s.id }))); paint(); } else root.append(skeleton());
  try { await load(); } catch (e) { if (!isCurrent()) return null; if (!data) throw e; toast(e.message, true); }
  if (!isCurrent()) return null;
  paint();
  ui.animate = false;

  // Actualización silenciosa cada minuto (solo si la pestaña está visible).
  timers.push(setInterval(async () => {
    if (document.visibilityState !== 'visible' || !isCurrent()) return;
    try { await load(); paint(); } catch { /* sigue con lo que hay */ }
  }, 60000));
  const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); } };
  document.addEventListener('keydown', onKey);
  return () => { timers.forEach(clearInterval); clearInterval(nowTimer); document.removeEventListener('keydown', onKey); stopCharts(); };
}
