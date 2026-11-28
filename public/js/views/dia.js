// Control del día: caja (apertura, ingresos, egresos) y productos libres (stock), con cierre diario independiente.
// Cada día tiene sus propios movimientos; abre con lo contado en el cierre anterior y no mezcla un día con otro.
import { get, post, put, del } from '../api.js';
import { h, clear, openSheet, toast, busy, field, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';
import { t, getLang } from '../i18n.js';
import { addDays, fmtDay, fmtRelative, todayLocal } from '../time.js';
import { seg, skel } from '../dui.js';
import { money, qty } from '../fmt.js';

const TABS = ['caja', 'productos', 'cierre'];
const UNITS = ['unidad', 'kg', 'libra', 'bulto', 'litro', 'caja', 'docena', 'cabeza', 'porción'];
const MEDIOS = ['efectivo', 'transferencia', 'otro'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const dayLong = (ymd) => cap(fmtDay(ymd, { weekday: 'long', day: 'numeric', month: 'long' }));
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

export default function dia({ main, params, go, isCurrent }) {
  const hoy = todayLocal();
  const ymd = isYmd(params[0]) && params[0] <= hoy ? params[0] : hoy;
  let tab = TABS.includes(params[1]) ? params[1] : 'caja';
  let D = null; let busyLoad = false;
  const draft = { cash: '', counts: {}, note: '' };
  const root = h('div', { class: 'd-page' });
  main.append(root);
  const goDay = (d, tb = tab) => go(`#/dia/${d}${tb !== 'caja' ? `/${tb}` : ''}`);

  async function load(quiet) {
    if (busyLoad) return; busyLoad = true;
    try { D = await get(`/api/staff/dia/${ymd}`); } catch (e) { if (!D) { clear(root); root.append(h('div', { class: 'empty' }, h('h3', null, t('err.generic')), h('p', null, e.message), h('button', { class: 'btn btn--primary', type: 'button', onclick: () => load() }, t('common.retry')))); busyLoad = false; return; } toast(e.message, true); }
    busyLoad = false;
    if (isCurrent()) paint(quiet);
  }
  const act = async (fn, ok) => { try { await fn(); if (ok) toast(ok); await load(true); } catch (e) { toast(e.message, true); } };

  // ── Sheets ────────────────────────────────────────────────────────────────────────────────────
  function moveSheet(tipo) {
    const amount = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: '1', step: '1', autofocus: true, 'aria-label': t('day.amount') });
    let medio = 'efectivo';
    const concept = h('input', { class: 'input', maxlength: '160', placeholder: t(tipo === 'ingreso' ? 'day.conceptInPh' : 'day.conceptOutPh'), autocomplete: 'off' });
    const medios = seg(MEDIOS.map((m) => ({ id: m, label: t(`day.m_${m}`) })), medio, (id) => { medio = id; medios.querySelectorAll('button').forEach((b) => { const on = b.dataset.id === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }); }, { label: t('day.method') });
    const save = h('button', { class: `btn ${tipo === 'ingreso' ? 'btn--primary' : 'btn--secondary'}`, type: 'button' }, t('common.save'));
    const sh = openSheet({ title: t(tipo === 'ingreso' ? 'day.addIncome' : 'day.addExpense'), body: h('div', null, field(t('day.amount'), amount), h('div', { class: 'field' }, h('span', { class: 'label' }, t('day.method')), medios), field(t('day.concept'), concept)), foot: [save] });
    save.addEventListener('click', () => busy(save, async () => { try { await post(`/api/staff/dia/${ymd}/caja`, { tipo, medio, concepto: concept.value, monto: Number(amount.value) }); sh.close(); toast(t('common.saved')); await load(true); } catch (e) { toast(e.message, true); } }));
  }
  function stockSheet(p, tipo0) {
    let tipo = tipo0;
    const amount = h('input', { class: 'input', type: 'number', inputmode: 'decimal', step: 'any', autofocus: true, 'aria-label': t('day.quantity') });
    const note = h('input', { class: 'input', maxlength: '160', autocomplete: 'off', placeholder: t('day.notePh') });
    const kinds = ['entrada', 'salida', 'merma', 'ajuste'];
    const sg = seg(kinds.map((k) => ({ id: k, label: t(`day.s_${k}`) })), tipo, (id) => { tipo = id; sg.querySelectorAll('button').forEach((b) => { const on = b.dataset.id === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }); }, { label: t('day.kind'), cls: 'd-seg--scroll' });
    const save = h('button', { class: 'btn btn--primary', type: 'button' }, t('common.save'));
    const sh = openSheet({ title: p.nombre, body: h('div', null, h('p', { class: 'hint' }, t('day.nowHave', { n: qty(p.esperado), u: p.unidad })), h('div', { class: 'field' }, h('span', { class: 'label' }, t('day.kind')), sg), field(`${t('day.quantity')} (${p.unidad})`, amount, tipo === 'ajuste' ? t('day.adjustHint') : null), field(t('day.note'), note)), foot: [save] });
    save.addEventListener('click', () => busy(save, async () => { try { await post(`/api/staff/dia/${ymd}/stock`, { producto_id: p.id, tipo, cantidad: Number(amount.value), nota: note.value }); sh.close(); toast(t('common.saved')); await load(true); } catch (e) { toast(e.message, true); } }));
  }
  function productSheet(p) {
    const d = p || { nombre: '', unidad: 'unidad', precio: 0, stock_minimo: 0, activo: true };
    const x = {
      nombre: h('input', { class: 'input', value: d.nombre, maxlength: '120', autofocus: true, autocomplete: 'off', placeholder: t('day.prodPh') }),
      unidad: h('input', { class: 'input', value: d.unidad, maxlength: '30', list: 'units', autocomplete: 'off' }),
      precio: h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: '0', step: '100', value: d.precio || '' }),
      min: h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: d.stock_minimo || '' }),
    };
    const active = h('input', { type: 'checkbox', checked: d.activo !== false });
    const save = h('button', { class: 'btn btn--primary', type: 'button' }, t('common.save'));
    const sh = openSheet({ title: p ? t('day.editProduct') : t('day.newProduct'), body: h('div', null, h('datalist', { id: 'units' }, UNITS.map((u) => h('option', { value: u }))), field(t('day.prodName'), x.nombre), h('div', { class: 'grid2' }, field(t('day.unit'), x.unidad, t('day.unitHint')), field(t('day.price'), x.precio)), field(t('day.minStock'), x.min, t('day.minHint')), p ? h('label', { class: 'check' }, active, t('cfg.active')) : null), foot: [save] });
    save.addEventListener('click', () => busy(save, async () => { try { await post('/api/staff/productos', { id: p?.id, nombre: x.nombre.value, unidad: x.unidad.value, precio: Number(x.precio.value) || 0, stock_minimo: Number(x.min.value) || 0, activo: active.checked }); sh.close(); toast(t('common.saved')); await load(true); } catch (e) { toast(e.message, true); } }));
  }

  // ── Pestañas ──────────────────────────────────────────────────────────────────────────────────
  const stat = (l, v, cls = '') => h('div', { class: `y-stat ${cls}` }, h('span', null, l), h('strong', null, v));

  function cajaTab() {
    const r = D.resumen;
    const open = !D.cerrado;
    const ap = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: '0', step: '1000', value: D.apertura || '', 'aria-label': t('day.opening'), disabled: !open, placeholder: '0' });
    const saveAp = h('button', { class: 'btn btn--secondary btn--sm', type: 'button', disabled: !open }, t('common.save'));
    saveAp.addEventListener('click', () => busy(saveAp, () => act(() => put(`/api/staff/dia/${ymd}/apertura`, { apertura: Number(ap.value) || 0 }), t('common.saved'))));
    const mv = (m) => h('li', { class: `y-mv is-${m.tipo}` }, h('span', { class: 'y-mv__ic', 'aria-hidden': 'true' }, icon(m.tipo === 'ingreso' ? 'download' : 'send', 16)),
      h('div', { class: 'y-mv__main' }, h('strong', null, m.concepto || t(m.tipo === 'ingreso' ? 'day.income' : 'day.expenses')), h('small', null, `${t(`day.m_${m.medio}`)} · ${fmtRelative(m.en)}`)),
      h('strong', { class: 'y-mv__amt' }, `${m.tipo === 'ingreso' ? '+' : '−'}${money(m.monto)}`),
      open ? h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': t('day.remove'), onclick: () => act(() => del(`/api/staff/caja/${m.id}`)) }, icon('x', 14)) : null);
    return h('div', { class: 'y-grid' },
      h('section', { class: 'd-card' }, h('h2', { class: 'd-card__title' }, t('day.opening')), h('p', { class: 'd-card__sub' }, D.apertura_fijada ? t('day.openingSet') : t('day.openingAuto', { v: money(D.apertura_sugerida) })),
        h('div', { class: 'y-inline' }, ap, saveAp)),
      h('section', { class: 'd-card' }, h('h2', { class: 'd-card__title' }, t('day.byMethod')),
        h('div', { class: 'y-methods' }, stat(t('day.m_efectivo'), money(r.ing_efectivo - r.egr_efectivo)), stat(t('day.m_transferencia'), money(r.ing_transferencia - r.egr_transferencia)))),
      h('section', { class: 'd-card y-wide' }, h('header', { class: 'd-card__head' }, h('h2', { class: 'd-card__title' }, t('day.movements')),
        open ? h('div', { class: 'row' }, h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: () => moveSheet('ingreso') }, icon('plus', 16), t('day.income')), h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => moveSheet('egreso') }, icon('plus', 16), t('day.expenses'))) : null),
        D.movimientos.length ? h('ul', { class: 'y-mvlist' }, D.movimientos.map(mv)) : h('p', { class: 'd-calm' }, t('day.noMoves'))));
  }

  function productosTab() {
    const open = !D.cerrado;
    const head = h('div', { class: 'y-prodhead' }, h('p', { class: 'd-calm' }, t('day.prodIntro')), h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: () => productSheet(null) }, icon('plus', 16), t('day.newProduct')));
    if (!D.productos.length) return h('div', null, head, h('div', { class: 'empty' }, h('h3', null, t('day.noProducts')), h('p', null, t('day.noProductsText'))));
    const log = D.movs_stock.slice().reverse();
    const name = (id) => D.productos.find((p) => p.id === id)?.nombre || '';
    return h('div', { class: 'y-prods' }, head, h('div', { class: 'y-prodgrid' }, D.productos.map((p) => {
      const low = p.stock_minimo > 0 && p.esperado <= p.stock_minimo;
      return h('article', { class: `y-prod${low ? ' is-low' : ''}` },
        h('header', null, h('button', { class: 'y-prod__name', type: 'button', onclick: () => get('/api/staff/productos').then((r) => productSheet(r.productos.find((x) => x.id === p.id))).catch((e) => toast(e.message, true)) }, h('strong', null, p.nombre), h('small', null, `${p.unidad}${p.precio ? ` · ${money(p.precio)}` : ''}`)), low ? h('span', { class: 'badge badge--warn' }, t('day.low')) : null),
        h('div', { class: 'y-prod__nums' }, stat(t('day.initial'), qty(p.inicial)), stat(t('day.in'), `+${qty(p.entradas)}`, 'is-in'), stat(t('day.out'), `−${qty(p.salidas)}`, 'is-out'), stat(t('day.expected'), qty(p.esperado), 'is-total')),
        open ? h('footer', null, h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => stockSheet(p, 'entrada') }, icon('plus', 14), t('day.s_entrada')), h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => stockSheet(p, 'salida') }, icon('plus', 14), t('day.s_salida'))) : null);
    })),
    log.length ? h('section', { class: 'd-card' }, h('h2', { class: 'd-card__title' }, t('day.stockLog')), h('ul', { class: 'y-mvlist' }, log.map((m) => h('li', { class: `y-mv is-${m.tipo === 'entrada' ? 'ingreso' : 'egreso'}` },
      h('div', { class: 'y-mv__main' }, h('strong', null, name(m.producto_id)), h('small', null, `${t(`day.s_${m.tipo}`)}${m.nota ? ` · ${m.nota}` : ''} · ${fmtRelative(m.en)}`)),
      h('strong', { class: 'y-mv__amt' }, `${m.tipo === 'entrada' ? '+' : m.tipo === 'ajuste' ? (m.cantidad > 0 ? '+' : '−') : '−'}${qty(Math.abs(m.cantidad))}`),
      open ? h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': t('day.remove'), onclick: () => act(() => del(`/api/staff/stock/${m.id}`)) }, icon('x', 14)) : null)))) : null);
  }

  const diffChip = (diff, unit) => {
    const z = Math.abs(diff) < 0.005;
    return h('span', { class: `y-diff ${z ? 'is-ok' : diff > 0 ? 'is-more' : 'is-less'}` }, z ? t('day.matches') : `${diff > 0 ? t('day.over') : t('day.short')} ${unit === '$' ? money(Math.abs(diff)) : `${qty(Math.abs(diff))} ${unit}`}`);
  };

  function cierreTab() {
    const r = D.resumen; const open = !D.cerrado;
    const cashVal = () => (draft.cash !== '' ? draft.cash : D.cierre_real != null ? String(D.cierre_real) : '');
    const cashIn = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: '0', step: '1000', value: cashVal(), disabled: !open, placeholder: money(r.esperado_efectivo), 'aria-label': t('day.countedCash') });
    const cashDiff = h('div', { class: 'y-diffbox' });
    const showCash = () => { clear(cashDiff); if (cashIn.value !== '') cashDiff.append(diffChip(Number(cashIn.value) - r.esperado_efectivo, '$')); };
    cashIn.addEventListener('input', () => { draft.cash = cashIn.value; showCash(); }); showCash();
    const rows = D.productos.map((p) => {
      const cur = draft.counts[p.id] !== undefined ? draft.counts[p.id] : p.conteo != null ? String(p.conteo) : '';
      const inp = h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: cur, disabled: !open, placeholder: qty(p.esperado), 'aria-label': `${t('day.counted')} ${p.nombre}` });
      const diff = h('div', { class: 'y-diffbox' });
      const show = () => { clear(diff); if (inp.value !== '') diff.append(diffChip(Number(inp.value) - p.esperado, p.unidad)); };
      inp.addEventListener('input', () => { draft.counts[p.id] = inp.value; show(); }); show();
      return { p, inp, row: h('div', { class: 'y-count' }, h('div', { class: 'y-count__name' }, h('strong', null, p.nombre), h('small', null, `${t('day.expected')}: ${qty(p.esperado)} ${p.unidad}`)), h('div', { class: 'y-count__in' }, inp, diff)) };
    });
    const note = h('textarea', { class: 'textarea', maxlength: '500', rows: '2', disabled: !open, placeholder: t('day.closeNotePh'), 'aria-label': t('day.closeNote') });
    note.value = draft.note || D.nota || '';
    note.addEventListener('input', () => { draft.note = note.value; });
    const closeBtn = h('button', { class: 'btn btn--primary', type: 'button' }, icon('check', 18), t('day.closeDay'));
    closeBtn.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: t('day.closeDay'), text: t('day.closeConfirm', { d: dayLong(ymd) }), okLabel: t('day.closeDay') }))) return;
      busy(closeBtn, () => act(async () => { await post(`/api/staff/dia/${ymd}/cerrar`, { cierre_real: cashIn.value === '' ? null : Number(cashIn.value), conteos: Object.fromEntries(rows.filter((x) => x.inp.value !== '').map((x) => [x.p.id, Number(x.inp.value)])), nota: note.value }); draft.cash = ''; draft.counts = {}; draft.note = ''; }, t('day.closedOk')));
    });
    const reopen = h('button', { class: 'btn btn--secondary', type: 'button' }, t('day.reopen'));
    reopen.addEventListener('click', () => busy(reopen, () => act(() => post(`/api/staff/dia/${ymd}/reabrir`, {}), t('day.reopened'))));
    return h('div', { class: 'y-grid' },
      D.cerrado ? h('div', { class: 'y-closed y-wide' }, icon('check', 20), h('div', null, h('strong', null, t('day.closedBanner')), h('p', null, t('day.closedSub')))) : h('div', { class: 'y-hint y-wide' }, icon('info', 18), h('p', null, t('day.closeIntro'))),
      h('section', { class: 'd-card' }, h('h2', { class: 'd-card__title' }, t('day.cashCount')), h('p', { class: 'd-card__sub' }, `${t('day.expectedCash')}: ${money(r.esperado_efectivo)}`), h('div', { class: 'y-count__in' }, cashIn, cashDiff)),
      h('section', { class: 'd-card' }, h('h2', { class: 'd-card__title' }, t('day.summary')),
        h('div', { class: 'y-sum' }, stat(t('day.opening'), money(D.apertura)), stat(t('day.income'), money(r.ingresos), 'is-in'), stat(t('day.expenses'), money(r.egresos), 'is-out'), stat(t('day.expectedCash'), money(r.esperado_efectivo), 'is-total'))),
      h('section', { class: 'd-card y-wide' }, h('h2', { class: 'd-card__title' }, t('day.stockCount')), D.productos.length ? rows.map((x) => x.row) : h('p', { class: 'd-calm' }, t('day.noProductsShort'))),
      h('section', { class: 'd-card y-wide' }, field(t('day.closeNote'), note), h('div', { class: 'row' }, open ? closeBtn : reopen)));
  }

  function paint(quiet) {
    const y = window.scrollY;
    clear(root);
    const prev = addDays(ymd, -1); const next = addDays(ymd, 1);
    const date = h('input', { class: 'y-date', type: 'date', value: ymd, max: hoy, 'aria-label': t('day.pickDate') });
    date.addEventListener('change', () => { if (isYmd(date.value) && date.value <= hoy) goDay(date.value); });
    const r = D.resumen;
    root.append(
      h('header', { class: 'd-head' }, h('div', null, h('h1', null, t('nav.day')), h('p', null, t('day.sub'))),
        h('span', { class: `badge ${D.cerrado ? 'badge--ok' : 'badge--info'}` }, h('i', { class: 'dot' }), D.cerrado ? t('day.closed') : t('day.open'))),
      h('div', { class: 'y-nav' },
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': t('day.prev'), onclick: () => goDay(prev) }, icon('left', 16)),
        h('label', { class: 'y-nav__day' }, h('strong', null, dayLong(ymd)), h('small', null, ymd === hoy ? t('day.today') : ''), date),
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': t('day.next'), disabled: ymd >= hoy, onclick: () => goDay(next) }, icon('right', 16)),
        ymd !== hoy ? h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => goDay(hoy) }, t('day.goToday')) : null),
      h('div', { class: 'y-stats' }, stat(t('day.opening'), money(D.apertura)), stat(t('day.income'), money(r.ingresos), 'is-in'), stat(t('day.expenses'), money(r.egresos), 'is-out'), stat(t('day.expectedCash'), money(r.esperado_efectivo), 'is-total')),
      seg(TABS.map((x) => ({ id: x, label: t(`day.tab_${x}`) })), tab, (id) => { tab = id; history.replaceState(null, '', `#/dia/${ymd}${id !== 'caja' ? `/${id}` : ''}`); paint(); }, { label: t('day.tabs') }),
      tab === 'caja' ? cajaTab() : tab === 'productos' ? productosTab() : cierreTab());
    if (quiet) window.scrollTo(0, y);
  }

  root.append(h('div', { class: 'd-head' }, h('div', null, h('h1', null, t('nav.day')))), skel('d-skel--kpi'), skel('d-skel--chart'));
  load();
}
