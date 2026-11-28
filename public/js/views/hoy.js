// Panel del negocio (Dashboard): cifras del día con su cambio, ingresos por rango, agenda, atención pendiente,
// embudo de contactos, caja y stock de hoy y bandeja. Se pinta al instante con lo último guardado y se actualiza en segundo plano.
import { get } from '../api.js';
import { h, clear, avatar } from '../ui.js';
import { icon } from '../icons.js';
import { t, getLang } from '../i18n.js';
import { state } from '../state.js';
import { addDays, fmtDay, fmtRelative, fmtTime, hmFrom, startOfWeek, todayLocal, toLocal } from '../time.js';
import { parcelColor } from '../components.js';
import { card, deltaChip, emptyNote, kpi, linkBtn, seg, skel } from '../dui.js';
import { money, moneyShort, int, pctChange } from '../fmt.js';
import { openNewCitaSheet } from './cita-sheet.js';

const KEY = 'ff_panel_v1';
const ETAPAS = ['nuevo', 'contactado', 'cotizado', 'cerrado', 'perdido'];
const RANGES = [{ id: '1w', days: 7 }, { id: '1m', days: 30 }, { id: '3m', days: 90 }, { id: '6m', days: 180 }, { id: '1y', days: 365 }, { id: 'all', days: 0 }];
const loc = () => (getLang() === 'en' ? 'en-US' : 'es-CO');
const dow = (i, style = 'narrow') => new Intl.DateTimeFormat(loc(), { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 5 + i, 12)));
const dayLong = (ymd) => fmtDay(ymd, { weekday: 'long', day: 'numeric', month: 'long' });
const monthName = (ym) => fmtDay(`${ym}-01`, { month: 'long', year: 'numeric' });
const diffDays = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const svcName = (s) => (getLang() === 'en' ? s.en : s.es) || s.es;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Guarda sólo lo necesario para el primer pintado del siguiente arranque.
function slim(d) {
  const hoy = d.dash?.hoy || todayLocal();
  const lo = addDays(hoy, -45);
  return {
    ...d,
    dash: d.dash && { ...d.dash, citas: d.dash.citas.filter((c) => c[0] >= lo), clientes: [], capacidad: [] },
    crm: d.crm && { etapas: d.crm.etapas, contactos: d.crm.contactos.map((c) => ({ id: c.id, nombre: c.nombre, etapa: c.etapa, valor: c.valor, creado: c.creado, proxima_fecha: c.proxima_fecha, proxima_accion: c.proxima_accion })) },
    fin: d.fin && { ...d.fin, dias: d.fin.dias.slice(-800) },
  };
}

// ── Ingresos: agrupa la serie diaria en barras según el rango ───────────────────────────────────
function buildBuckets(fin, hoy, range) {
  const map = new Map((fin?.dias || []).map(([d, i, e]) => [d, [i, e]]));
  let days = RANGES.find((r) => r.id === range).days;
  if (!days) { const first = fin?.dias?.[0]?.[0]; days = Math.max(30, first ? diffDays(first, hoy) + 1 : 30); }
  const start = addDays(hoy, -(days - 1));
  const mode = days <= 31 ? 'day' : days <= 200 ? 'week' : 'month';
  const keyOf = (ymd) => (mode === 'day' ? ymd : mode === 'week' ? startOfWeek(ymd) : ymd.slice(0, 7));
  const out = []; const idx = new Map();
  for (let i = 0; i < days; i++) {
    const ymd = addDays(start, i); const k = keyOf(ymd);
    if (!idx.has(k)) { idx.set(k, out.length); out.push({ key: k, mode, ing: 0, egr: 0 }); }
    const [ing, egr] = map.get(ymd) || [0, 0];
    out[idx.get(k)].ing += ing; out[idx.get(k)].egr += egr;
  }
  let prev = 0;
  if (range !== 'all') for (let i = 1; i <= days; i++) prev += (map.get(addDays(start, -i)) || [0])[0];
  const total = out.reduce((a, b) => a + b.ing, 0);
  return { buckets: out, total, prev: range === 'all' ? null : prev, days, mode };
}
const bucketLabel = (b, range) => (b.mode === 'day' ? (range === '1w' ? dow(((new Date(`${b.key}T12:00:00Z`).getUTCDay() + 6) % 7), 'short') : String(Number(b.key.slice(8)))) : b.mode === 'week' ? fmtDay(b.key, { day: 'numeric', month: 'short' }) : cap(fmtDay(`${b.key}-01`, { month: 'short' })));
const bucketTitle = (b) => (b.mode === 'day' ? dayLong(b.key) : b.mode === 'week' ? t('pn.weekOf', { d: fmtDay(b.key, { day: 'numeric', month: 'long' }) }) : cap(monthName(b.key)));
function niceMax(v) {
  if (v <= 0) return 100000;
  const p = 10 ** Math.floor(Math.log10(v)); const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function revenueCard(S, data, rerender) {
  const hoy = data.hoy;
  const { buckets, total, prev, mode } = buildBuckets(data.fin, hoy, S.range);
  const pct = prev == null ? null : pctChange(total, prev);
  const max = niceMax(Math.max(...buckets.map((b) => Math.max(b.ing, b.egr)), 0));
  const hasData = buckets.some((b) => b.ing > 0 || b.egr > 0);
  let sel = Math.min(S.sel ?? buckets.length - 1, buckets.length - 1);

  const tip = h('div', { class: 'd-tip', role: 'status', 'aria-live': 'polite' });
  const bars = h('div', { class: 'd-chart__bars' });
  const xs = h('div', { class: 'd-chart__x', 'aria-hidden': 'true' });
  const plot = h('div', { class: 'd-chart__plot' },
    h('div', { class: 'd-chart__grid', 'aria-hidden': 'true' }, [0, 1, 2, 3].map(() => h('i'))), bars, tip);
  const yl = h('div', { class: 'd-chart__y', 'aria-hidden': 'true' }, [1, 0.75, 0.5, 0.25, 0].map((f) => h('span', null, f ? moneyShort(max * f) : '0')));
  const btns = buckets.map((b, i) => {
    const el = h('button', { type: 'button', class: 'd-bar', style: `--h:${(b.ing / max) * 100}%;--e:${(b.egr / max) * 100}%`, 'aria-label': `${bucketTitle(b)}: ${money(b.ing)}` },
      h('span', { class: 'd-bar__fill' }), b.egr > 0 ? h('span', { class: 'd-bar__out' }) : null);
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') select(i); });
    el.addEventListener('focus', () => select(i));
    el.addEventListener('click', () => select(i));
    return el;
  });
  bars.append(...btns);
  const xl = buckets.map((b) => h('span', null, bucketLabel(b, S.range)));
  xs.append(...xl);

  function thin() {
    const w = plot.clientWidth || 300; const per = w / buckets.length;
    const step = Math.max(1, Math.ceil(buckets.length / Math.max(2, Math.floor(w / (mode === 'week' ? 64 : mode === 'month' ? 44 : 34)))));
    xl.forEach((s, i) => { s.style.visibility = i % step === (buckets.length - 1) % step ? 'visible' : 'hidden'; });
    return per;
  }
  function select(i) {
    sel = i; S.sel = i;
    btns.forEach((b, j) => b.classList.toggle('is-sel', j === i));
    const b = buckets[i]; const p = i > 0 ? buckets[i - 1] : null;
    const ch = p && p.ing > 0 ? pctChange(b.ing, p.ing) : null;
    clear(tip);
    tip.append(h('div', { class: 'd-tip__t' }, bucketTitle(b)),
      h('div', { class: 'd-tip__v' }, money(b.ing), deltaChip(ch)),
      h('div', { class: 'd-tip__s' }, h('i', { class: 'd-dash' }), `${t('pn.expenses')} ${money(b.egr)}`));
    requestAnimationFrame(() => {
      const w = plot.clientWidth; const tw = tip.offsetWidth || 150;
      const x = ((i + 0.5) / buckets.length) * w;
      tip.style.left = `${Math.max(tw / 2, Math.min(w - tw / 2, x))}px`;
    });
  }
  requestAnimationFrame(() => { thin(); select(sel); });
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(() => { thin(); select(sel); }); ro.observe(plot); S.ro?.disconnect(); S.ro = ro; }

  const rangeSeg = seg(RANGES.map((r) => ({ id: r.id, label: t(`pn.r_${r.id}`) })), S.range, (id) => { S.range = id; S.sel = null; rerender(); }, { label: t('pn.range'), cls: 'd-seg--scroll' });
  return card(null, { cls: 'd-revenue', id: 'ingresos' },
    h('div', { class: 'd-revenue__head' },
      h('div', null, h('h2', { class: 'd-card__title' }, t('pn.income')),
        h('div', { class: 'd-revenue__total' }, h('strong', null, money(total)), prev != null ? h('span', { class: 'd-revenue__vs' }, deltaChip(pct), h('span', null, t('pn.vsPrev'))) : null)),
      rangeSeg),
    h('div', { class: `d-chart${hasData ? '' : ' is-empty'}`, role: 'group', 'aria-label': t('pn.chartLabel') },
      yl, h('div', { class: 'd-chart__main' }, plot, xs),
      hasData ? null : h('div', { class: 'd-chart__empty' }, h('p', null, t('pn.noIncome')), h('a', { class: 'btn btn--secondary btn--sm', href: '#/dia' }, icon('plus', 16), t('pn.registerIncome')))),
    h('div', { class: 'd-legend' }, h('span', null, h('i', { class: 'd-sw' }), t('pn.income')), h('span', null, h('i', { class: 'd-dash' }), t('pn.expenses'))));
}

// ── Calendario del mes con la agenda del día elegido ──────────────────────────────────────────
function calendarCard(S, data, rerender) {
  const hoy = data.hoy; const d = data.dash;
  S.month ||= hoy.slice(0, 7); S.day ||= hoy;
  const byDay = new Map();
  for (const c of d?.citas || []) if (c[5] !== 2) { if (!byDay.has(c[0])) byDay.set(c[0], []); byDay.get(c[0]).push(c); }
  const first = `${S.month}-01`;
  const lead = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const len = new Date(Date.UTC(Number(S.month.slice(0, 4)), Number(S.month.slice(5)), 0)).getUTCDate();
  const shift = (n) => { const dt = new Date(`${first}T12:00:00Z`); dt.setUTCMonth(dt.getUTCMonth() + n); S.month = dt.toISOString().slice(0, 7); rerender(); };
  const grid = h('div', { class: 'd-cal__grid', role: 'grid', 'aria-label': cap(monthName(S.month)) },
    [0, 1, 2, 3, 4, 5, 6].map((i) => h('span', { class: 'd-cal__dow', 'aria-hidden': 'true' }, dow(i))),
    Array.from({ length: lead }, () => h('span')),
    Array.from({ length: len }, (_, i) => {
      const ymd = `${S.month}-${String(i + 1).padStart(2, '0')}`;
      const n = byDay.get(ymd)?.length || 0;
      const b = h('button', { type: 'button', class: `d-cal__day${ymd === hoy ? ' is-today' : ''}${ymd === S.day ? ' is-sel' : ''}${n ? ' has' : ''}`, 'aria-pressed': String(ymd === S.day), 'aria-label': `${dayLong(ymd)}${n ? `, ${t('pn.nApps', { n })}` : ''}` }, String(i + 1));
      b.addEventListener('click', () => { S.day = ymd; rerender(); });
      return b;
    }));
  const list = (byDay.get(S.day) || []).sort((a, b) => a[1] - b[1]);
  const cl = d?.clientes || [];
  return card(null, { cls: 'd-cal', id: 'agenda' },
    h('div', { class: 'd-cal__head' },
      h('h2', { class: 'd-card__title' }, cap(monthName(S.month))),
      h('div', { class: 'd-cal__nav' },
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': t('pn.prevMonth'), onclick: () => shift(-1) }, icon('left', 16)),
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': t('pn.nextMonth'), onclick: () => shift(1) }, icon('right', 16)))),
    grid,
    h('div', { class: 'd-cal__agenda' },
      h('div', { class: 'd-cal__daytitle' }, cap(dayLong(S.day)), linkBtn('#/calendario', t('pn.fullAgenda'))),
      list.length ? h('ul', { class: 'd-agenda' }, list.slice(0, 5).map((c) => {
        const s = d.servicios[c[3]]; const r = d.recursos[c[4]];
        return h('li', { class: 'd-agenda__it' }, h('span', { class: 'd-agenda__bar', style: `background:${parcelColor(s?.id)}` }),
          h('div', { class: 'd-agenda__main' }, h('strong', null, s ? svcName(s) : ''), h('span', null, [r?.nombre, cl[c[7]]?.[0]].filter(Boolean).join(' · '))),
          h('time', { class: 'd-agenda__t' }, fmtTime(hmFrom(c[1]))));
      }).concat(list.length > 5 ? [h('li', { class: 'd-agenda__more' }, t('pn.more', { n: list.length - 5 }))] : [])) : h('p', { class: 'd-calm' }, t('pn.noApps'))));
}

// ── Requiere atención ─────────────────────────────────────────────────────────────────────────
function attentionCard(data) {
  const hoy = data.hoy; const items = [];
  const att = (data.dash?.chats || []).filter((c) => c.att).length;
  if (att) items.push({ ic: 'chat', tone: 'warn', text: t('pn.attChats', { n: att }), href: '#/chats' });
  const due = (data.crm?.contactos || []).filter((c) => c.proxima_fecha && c.proxima_fecha <= hoy && !['cerrado', 'perdido'].includes(c.etapa));
  if (due.length) items.push({ ic: 'users', tone: 'warn', text: t('pn.attFollow', { n: due.length }), sub: due.slice(0, 2).map((c) => c.nombre).join(', '), href: '#/crm' });
  const low = (data.dia?.productos || []).filter((p) => p.stock_minimo > 0 && p.esperado <= p.stock_minimo);
  if (low.length) items.push({ ic: 'alert', tone: 'warn', text: t('pn.attLow', { n: low.length }), sub: low.slice(0, 3).map((p) => p.nombre).join(', '), href: '#/dia/' + hoy + '/productos' });
  const ayer = addDays(hoy, -1);
  const had = (data.fin?.dias || []).some((x) => x[0] === ayer);
  if (had && !(data.fin?.cierres || []).some((c) => c.dia === ayer && c.cerrado)) items.push({ ic: 'clock', tone: 'info', text: t('pn.attYesterday'), href: `#/dia/${ayer}/cierre` });
  return card(t('pn.attention'), { cls: 'd-att' },
    items.length ? h('ul', { class: 'd-attlist' }, items.map((x) => h('li', null, h('a', { class: `d-att__it is-${x.tone}`, href: x.href },
      h('span', { class: 'd-att__ic', 'aria-hidden': 'true' }, icon(x.ic, 18)), h('span', { class: 'd-att__tx' }, h('strong', null, x.text), x.sub ? h('small', null, x.sub) : null), icon('right', 16)))))
      : h('div', { class: 'd-allgood' }, h('span', { 'aria-hidden': 'true' }, icon('check', 22)), h('div', null, h('strong', null, t('pn.allGood')), h('p', null, t('pn.allGoodSub')))));
}

// ── Embudo de contactos ───────────────────────────────────────────────────────────────────────
function funnelCard(data) {
  const cs = data.crm?.contactos || [];
  const rows = ETAPAS.map((e) => { const l = cs.filter((c) => c.etapa === e); return { e, n: l.length, v: l.reduce((a, c) => a + (c.valor || 0), 0) }; });
  const max = Math.max(1, ...rows.map((r) => r.n));
  return card(t('pn.funnel'), { sub: t('pn.funnelSub', { n: cs.length }), actions: linkBtn('#/crm', t('pn.openCrm')), cls: 'd-funnel' },
    cs.length ? h('ul', { class: 'd-funrows' }, rows.map((r) => h('li', null,
      h('a', { class: 'd-fun', href: '#/crm', 'aria-label': `${t(`crm.st_${r.e}`)}: ${r.n}` },
        h('span', { class: 'd-fun__n' }, t(`crm.st_${r.e}`)),
        h('span', { class: 'd-fun__track' }, h('i', { class: `st-${r.e}`, style: `width:${Math.max(r.n ? 6 : 0, (r.n / max) * 100)}%` })),
        h('span', { class: 'd-fun__c' }, String(r.n)), h('span', { class: 'd-fun__v' }, r.v ? moneyShort(r.v) : '')))))
      : emptyNote(t('pn.noContacts'), h('a', { class: 'btn btn--secondary btn--sm', href: '#/crm' }, icon('plus', 16), t('crm.add'))));
}

// ── Caja y stock de hoy ───────────────────────────────────────────────────────────────────────
function cashCard(data) {
  const d = data.dia; const hoy = data.hoy;
  if (!d) return card(t('pn.todayBox'), { cls: 'd-box' }, skel('d-skel--row'), skel('d-skel--row'));
  const low = d.productos.filter((p) => p.stock_minimo > 0 && p.esperado <= p.stock_minimo);
  const r = d.resumen;
  const row = (l, v, cls = '') => h('div', { class: `d-box__row ${cls}` }, h('span', null, l), h('strong', null, v));
  return card(t('pn.todayBox'), { sub: dayLong(hoy), cls: 'd-box', actions: h('span', { class: `badge ${d.cerrado ? 'badge--ok' : 'badge--info'}` }, h('i', { class: 'dot' }), d.cerrado ? t('day.closed') : t('day.open')) },
    h('div', { class: 'd-box__rows' }, row(t('day.opening'), money(d.apertura)), row(t('day.income'), money(r.ingresos), 'is-in'), row(t('day.expenses'), money(r.egresos), 'is-out'), row(t('day.expectedCash'), money(r.esperado_efectivo), 'is-total')),
    h('div', { class: 'd-box__stock' }, h('span', null, icon('leaf', 16), t('pn.products', { n: d.productos.length })), low.length ? h('span', { class: 'badge badge--warn' }, t('pn.lowN', { n: low.length })) : null),
    h('div', { class: 'd-box__act' },
      h('a', { class: 'btn btn--secondary btn--sm', href: `#/dia/${hoy}` }, icon('plus', 16), t('pn.register')),
      d.cerrado ? null : h('a', { class: 'btn btn--primary btn--sm', href: `#/dia/${hoy}/cierre` }, icon('check', 16), t('pn.closeDay'))));
}

// ── Bandeja ───────────────────────────────────────────────────────────────────────────────────
function inboxCard(data) {
  const chats = (data.dash?.chats || []).slice(0, 4);
  return card(t('pn.inbox'), { actions: linkBtn('#/chats', t('pn.openInbox')), cls: 'd-inbox' },
    chats.length ? h('ul', { class: 'd-chatlist' }, chats.map((c) => h('li', null, h('a', { class: 'd-chat', href: '#/chats' },
      avatar(c.nombre || c.tel), h('span', { class: 'd-chat__main' }, h('strong', null, c.nombre || `+${c.tel}`), h('small', null, `${c.por === 'humano' ? t('pn.byYou') : t('pn.byBot')} · ${c.canal === 'whatsapp' ? 'WhatsApp' : 'Web'}`)),
      h('span', { class: 'd-chat__meta' }, c.en ? h('time', null, fmtRelative(c.en)) : null, c.att ? h('span', { class: 'badge badge--warn' }, t('pn.needsYou')) : null)))))
      : emptyNote(t('pn.noChats')));
}

function kpis(data) {
  const hoy = data.hoy; const ayer = addDays(hoy, -1); const sem = addDays(hoy, -7);
  const fin = new Map((data.fin?.dias || []).map(([d, i]) => [d, i]));
  const ing = fin.get(hoy) || 0;
  const apps = (ymd) => (data.dash?.citas || []).filter((c) => c[0] === ymd && c[5] !== 2).length;
  const cs = data.crm?.contactos || [];
  const since = (n) => toLocal(new Date(Date.now() - n * 86400000)).ymd;
  const inRange = (c, a, b) => { const y = toLocal(c.creado).ymd; return y > a && y <= b; };
  const nuevos = cs.filter((c) => inRange(c, since(7), hoy)).length; const nuevosPrev = cs.filter((c) => inRange(c, since(14), since(7))).length;
  const att = (data.dash?.chats || []).filter((c) => c.att).length;
  return h('div', { class: 'd-kpis' },
    kpi({ ic: 'doc', label: t('pn.kIncome'), value: money(ing), pct: pctChange(ing, fin.get(ayer) || 0), caption: t('pn.vsYesterday'), href: '#/dia' }),
    kpi({ ic: 'calendar', label: t('pn.kApps'), value: int(apps(hoy)), pct: pctChange(apps(hoy), apps(sem)), caption: t('pn.vsLastWeek'), href: '#/calendario' }),
    kpi({ ic: 'users', label: t('pn.kContacts'), value: int(nuevos), pct: pctChange(nuevos, nuevosPrev), caption: t('pn.last7'), href: '#/crm' }),
    kpi({ ic: 'chat', label: t('pn.kAttention'), value: int(att), caption: att ? t('pn.waiting') : t('pn.noWaiting'), href: '#/chats', invert: true }));
}

// Cuatro accesos grandes para lo que más se hace: vender, gastar, mover inventario y anotar un cliente.
function quickTiles() {
  const d = todayLocal();
  const tile = (ic, title, sub, href) => h('a', { class: 'qa__tile', href }, h('span', { class: 'qa__top' }, icon(ic, 22), icon('right', 18)), h('span', null, h('strong', null, title), h('small', null, sub)));
  return h('section', { class: 'qa-wrap' }, h('h2', null, t('rg.ask')), h('div', { class: 'qa' },
    tile('download', t('rg.sale'), t('rg.saleSub'), `#/dia/${d}/caja/venta`),
    tile('send', t('rg.expense'), t('rg.expenseSub'), `#/dia/${d}/caja/gasto`),
    tile('leaf', t('rg.stock'), t('rg.stockSub'), `#/dia/${d}/productos`),
    tile('users', t('rg.client'), t('rg.clientSub'), '#/crm/nuevo')));
}

const greet = () => { const hr = Number(toLocal(new Date()).hm.slice(0, 2)); return t(hr < 12 ? 'pn.gMorning' : hr < 19 ? 'pn.gAfternoon' : 'pn.gEvening'); };

export default function hoy({ main, go, isCurrent }) {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* sin caché */ }
  const S = { range: '1m', sel: null, month: null, day: null };
  const root = h('div', { class: 'd-page' });
  main.append(root);
  let last = '';

  const header = () => {
    const first = (state.staff?.nombre || '').trim().split(/\s+/)[0];
    return h('header', { class: 'd-head' },
      h('div', null, h('h1', null, first ? `${greet()}, ${first}` : greet()), h('p', null, cap(dayLong(todayLocal())))),
      h('div', { class: 'd-head__act' },
        h('button', { class: 'btn btn--secondary btn--sm d-head__new', type: 'button', onclick: () => openNewCitaSheet({ onDone: load }) }, icon('plus', 16), t('nav.newCita')),
        h('a', { class: 'btn btn--primary btn--sm', href: `#/dia/${todayLocal()}/cierre` }, icon('check', 16), t('pn.closeDay'))));
  };

  const paint = () => {
    S.ro?.disconnect();
    const y = window.scrollY;
    clear(root);
    if (!data) {
      root.append(header(), quickTiles(), h('div', { class: 'd-kpis' }, [0, 1, 2, 3].map(() => skel('d-skel--kpi'))), h('div', { class: 'd-grid' }, skel('d-skel--chart'), skel('d-skel--chart')));
      return;
    }
    root.append(header(), quickTiles(), kpis(data),
      h('div', { class: 'd-grid' }, revenueCard(S, data, paint), calendarCard(S, data, paint)),
      h('div', { class: 'd-grid3' }, attentionCard(data), cashCard(data), funnelCard(data)),
      inboxCard(data));
    window.scrollTo(0, y);
  };

  async function load() {
    const hoyYmd = todayLocal();
    const [dash, crm, fin, dia] = await Promise.all([
      get('/api/staff/dashboard').catch(() => null), get('/api/staff/crm').catch(() => null),
      get('/api/staff/finanzas').catch(() => null), get(`/api/staff/dia/${hoyYmd}`).catch(() => null),
    ]);
    if (!isCurrent()) return;
    if (!dash && !crm && !fin && !data) { clear(root); root.append(h('div', { class: 'empty' }, h('h3', null, t('err.generic')), h('button', { class: 'btn btn--primary', type: 'button', onclick: load }, t('common.retry')))); return; }
    const next = { hoy: fin?.hoy || dash?.hoy || hoyYmd, dash: dash || data?.dash, crm: crm || data?.crm, fin: fin || data?.fin, dia: dia || data?.dia };
    if (!next.dash) return;
    const sig = JSON.stringify(next);
    if (sig === last) return;
    last = sig; data = next;
    try { localStorage.setItem(KEY, JSON.stringify(slim(next))); } catch { /* sin espacio */ }
    paint();
  }

  if (data) { if (data.hoy !== todayLocal()) data.dia = null; data.hoy = todayLocal(); last = ''; }
  paint();
  load();
  const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
  return () => { clearInterval(timer); S.ro?.disconnect(); };
}
