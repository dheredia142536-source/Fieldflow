// Calendario del negocio: día por recurso, semana, y lista en móvil. Las citas son "parcelas".
import { get } from '../api.js';
import { h, clear, empty, toast } from '../ui.js';
import { icon, emptyArt } from '../icons.js';
import { t, getLang } from '../i18n.js';
import { pref } from '../state.js';
import { addDays, fmtDay, fmtIsoTime, fmtTime, hmFrom, minutes, startOfWeek, todayLocal, toLocal, weekdayOf, durationMin, pad } from '../time.js';
import { parcelColor, svcLabel, statusBadge, setPalette } from '../components.js';
import { openCitaSheet, openNewCitaSheet } from './cita-sheet.js';

const hourLabel = (h24) => (getLang() === 'en' ? `${((h24 + 11) % 12) + 1} ${h24 >= 12 ? 'PM' : 'AM'}` : `${((h24 + 11) % 12) + 1} ${h24 >= 12 ? 'p. m.' : 'a. m.'}`);
const wide = () => matchMedia('(min-width: 768px)').matches;

function bounds(catalog, ymds, citas) {
  let lo = 8 * 60; let hi = 17 * 60; let any = false;
  for (const ymd of ymds) {
    const wd = weekdayOf(ymd);
    for (const r of catalog.recursos) for (const s of r.horarios) if (s.dia_semana === wd) {
      const a = minutes(s.hora_inicio); const b = minutes(s.hora_fin);
      lo = any ? Math.min(lo, a) : a; hi = any ? Math.max(hi, b) : b; any = true;
    }
  }
  for (const c of citas) {
    const a = minutes(toLocal(c.inicio).hm); const b = a + durationMin(c.inicio, c.fin);
    lo = Math.min(lo, a); hi = Math.max(hi, b);
  }
  return { startH: Math.max(0, Math.floor(lo / 60)), endH: Math.min(24, Math.ceil(hi / 60)) };
}

function offBlocks(intervals, startH, endH) {
  // Horas fuera de horario: complemento de los intervalos dentro de [startH, endH].
  const lo = startH * 60; const hi = endH * 60;
  const merged = [...intervals].sort((a, b) => a[0] - b[0]).reduce((acc, cur) => {
    const prev = acc[acc.length - 1];
    if (prev && cur[0] <= prev[1]) prev[1] = Math.max(prev[1], cur[1]); else acc.push([...cur]);
    return acc;
  }, []);
  const out = []; let cursor = lo;
  for (const [a, b] of merged) { if (a > cursor) out.push([cursor, Math.min(a, hi)]); cursor = Math.max(cursor, b); }
  if (cursor < hi) out.push([cursor, hi]);
  return out.filter(([a, b]) => b > a);
}

const blockStyle = (a, b, startH) => `top:calc(var(--hour) * ${(a - startH * 60) / 60});height:calc(var(--hour) * ${(b - a) / 60})`;

export default async function calendario({ main, isCurrent, rerender }) {
  const lang = getLang();
  let view = pref('calview') === 'week' ? 'week' : 'day';
  let cursor = todayLocal();
  const catalog = await get('/api/staff/catalogo');
  if (!isCurrent()) return null;
  setPalette(catalog.servicios);
  const resources = catalog.recursos.filter((r) => r.activo);
  const body = h('div');
  const title = h('div', { class: 'label-date', 'aria-live': 'polite' });

  async function draw() {
    const stepWide = wide();
    const mode = stepWide ? view : 'list';
    const from = mode === 'day' ? cursor : startOfWeek(cursor);
    const to = mode === 'day' ? cursor : addDays(from, 6);
    title.textContent = mode === 'day' ? fmtDay(cursor) : `${fmtDay(from, { day: 'numeric', month: 'short' })} – ${fmtDay(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    clear(body).append(h('div', { class: 'skeleton' }));
    let citas;
    try { citas = (await get(`/api/staff/citas?desde=${from}&hasta=${to}`)).citas; } catch (e) { toast(e.message, true); return; }
    if (!isCurrent()) return;
    clear(body);

    const open = (c) => openCitaSheet(c, draw);
    const parcel = (c, extra = '', lines = 3) => {
      const label = `${fmtIsoTime(c.inicio)}–${fmtIsoTime(c.fin)} ${svcLabel(c, lang)}, ${c.cliente_nombre || c.cliente_telefono}`;
      return h('button', { class: `parcel${c.estado === 'completada' ? ' parcel--done' : ''}`, type: 'button', 'aria-label': label, style: `--p:${parcelColor(c.servicio_id)};${extra}`, onclick: () => open(c) },
        h('b', null, svcLabel(c, lang)), h('span', null, c.cliente_nombre || `+${c.cliente_telefono}`), lines > 2 ? h('span', null, `${fmtIsoTime(c.inicio)} · ${c.recurso_nombre}`) : null);
    };
    const nowLine = (startH, endH) => {
      const n = toLocal(new Date());
      const m = minutes(n.hm);
      return m >= startH * 60 && m <= endH * 60 ? h('div', { class: 'calnow', style: `top:calc(var(--hour) * ${(m - startH * 60) / 60})`, 'aria-hidden': 'true' }) : null;
    };
    const hoursCol = (startH, endH) => h('div', { class: 'calhours', 'aria-hidden': 'true' }, Array.from({ length: endH - startH }, (_, i) => h('div', { class: 'calhour' }, i === 0 ? '' : hourLabel(startH + i))));

    // Lista (móvil)
    const days = [];
    for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
    const list = h('div', { class: 'cal-list' });
    for (const d of days) {
      const day = citas.filter((c) => toLocal(c.inicio).ymd === d);
      if (!day.length) continue;
      list.append(h('section', { class: 'daygroup' }, h('h3', null, fmtDay(d)), h('div', { class: 'list' }, day.map((c) => h('button', { class: `pcard${c.estado === 'cancelada' ? ' pcard--cancel' : ''}`, type: 'button', style: `--p:${parcelColor(c.servicio_id)}`, onclick: () => open(c) },
        h('span', { class: 'pcard__bar' }), h('div', { class: 'pcard__time' }, fmtIsoTime(c.inicio), h('small', null, `${durationMin(c.inicio, c.fin)} min`)),
        h('div', { class: 'item__main' }, h('div', { class: 'item__title' }, svcLabel(c, lang)), h('div', { class: 'item__sub' }, `${c.cliente_nombre || `+${c.cliente_telefono}`} · ${c.recurso_nombre}`)), statusBadge(c.estado))))));
    }
    if (!list.children.length) list.append(empty({ art: emptyArt(), title: t('cal.emptyTitle'), text: t('cal.emptyText') }));
    body.append(list);

    const active = citas.filter((c) => c.estado !== 'cancelada');
    const { startH, endH } = bounds(catalog, days, active);
    const hours = endH - startH;

    if (mode === 'day') {
      const wd = weekdayOf(cursor);
      const cols = resources.map((r) => {
        const col = h('div', { class: 'calcol' });
        offBlocks(r.horarios.filter((s) => s.dia_semana === wd).map((s) => [minutes(s.hora_inicio), minutes(s.hora_fin)]), startH, endH)
          .forEach(([a, b]) => col.append(h('div', { class: 'caloff', style: blockStyle(a, b, startH), 'aria-hidden': 'true' })));
        active.filter((c) => c.recurso_id === r.id).forEach((c) => {
          const a = minutes(toLocal(c.inicio).hm); const dur = durationMin(c.inicio, c.fin);
          col.append(parcel(c, `${blockStyle(a, a + dur, startH)};left:4px;right:4px`, dur >= 45 ? 3 : 2));
        });
        if (cursor === todayLocal()) { const n = nowLine(startH, endH); if (n) col.append(n); }
        return col;
      });
      const grid = h('div', { class: 'calgrid', style: `--cols:${Math.max(resources.length, 1)};--hours:${hours}` },
        h('div', { class: 'calhead corner' }),
        resources.map((r) => h('div', { class: 'calhead' }, r.nombre, r.tipo ? h('small', null, r.tipo) : null)),
        hoursCol(startH, endH), cols);
      body.append(h('div', { class: 'cal-day' }, resources.length ? h('div', { class: 'calwrap', tabindex: '0', role: 'region', 'aria-label': t('cal.gridLabel') }, grid) : empty({ art: emptyArt(), title: t('cal.noResources'), text: t('cal.noResourcesText') })));
    } else if (mode === 'week') {
      const cols = days.map((d) => {
        const col = h('div', { class: 'calcol' });
        const wd = weekdayOf(d);
        const intervals = catalog.recursos.filter((r) => r.activo).flatMap((r) => r.horarios.filter((s) => s.dia_semana === wd).map((s) => [minutes(s.hora_inicio), minutes(s.hora_fin)]));
        offBlocks(intervals, startH, endH).forEach(([a, b]) => col.append(h('div', { class: 'caloff', style: blockStyle(a, b, startH), 'aria-hidden': 'true' })));
        // Carriles para citas que se solapan.
        const evs = active.filter((c) => toLocal(c.inicio).ymd === d).map((c) => ({ c, a: minutes(toLocal(c.inicio).hm), b: minutes(toLocal(c.inicio).hm) + durationMin(c.inicio, c.fin) })).sort((x, y) => x.a - y.a);
        const lanes = [];
        evs.forEach((e) => { let i = lanes.findIndex((end) => end <= e.a); if (i < 0) { i = lanes.length; lanes.push(0); } lanes[i] = e.b; e.lane = i; });
        evs.forEach((e) => {
          const overlapping = evs.filter((o) => o.a < e.b && o.b > e.a);
          const n = Math.max(...overlapping.map((o) => o.lane)) + 1;
          col.append(parcel(e.c, `${blockStyle(e.a, e.b, startH)};left:calc(${(e.lane / n) * 100}% + 3px);width:calc(${100 / n}% - 6px)`, e.b - e.a >= 45 ? 3 : 2));
        });
        if (d === todayLocal()) { const n = nowLine(startH, endH); if (n) col.append(n); }
        return col;
      });
      const grid = h('div', { class: 'calgrid calgrid--week', style: `--hours:${hours}` },
        h('div', { class: 'calhead corner' }),
        days.map((d) => h('div', { class: `calhead${d === todayLocal() ? ' calhead--today' : ''}`, 'aria-current': d === todayLocal() ? 'date' : null }, fmtDay(d, { weekday: 'short' }), h('small', null, fmtDay(d, { day: 'numeric', month: 'short' })))),
        hoursCol(startH, endH), cols);
      body.append(h('div', { class: 'cal-week' }, h('div', { class: 'calwrap', tabindex: '0', role: 'region', 'aria-label': t('cal.gridLabel') }, grid)));
    }

    const svcs = [...new Map(active.map((c) => [c.servicio_id, c])).values()];
    if (svcs.length) body.append(h('div', { class: 'legend', 'aria-label': t('cal.legend') }, svcs.map((c) => h('span', null, h('i', { style: `--p:${parcelColor(c.servicio_id)}` }), svcLabel(c, lang)))));
  }

  const step = (dir) => { cursor = addDays(cursor, dir * (wide() && view === 'day' ? 1 : 7)); draw(); };
  const seg = h('div', { class: 'seg calseg', role: 'group', 'aria-label': t('cal.view') },
    ['day', 'week'].map((v) => h('button', { type: 'button', 'aria-pressed': String(view === v), onclick: (e) => { view = v; pref('calview', v); e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false')); e.currentTarget.setAttribute('aria-pressed', 'true'); draw(); } }, t(`cal.${v}`))));

  main.append(h('div', null,
    h('div', { class: 'caltools' },
      h('div', { class: 'daynav' },
        h('button', { class: 'btn btn--ghost btn--icon', type: 'button', 'aria-label': t('cal.prev'), onclick: () => step(-1) }, icon('left', 20)),
        h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => { cursor = todayLocal(); draw(); } }, t('cal.today')),
        h('button', { class: 'btn btn--ghost btn--icon', type: 'button', 'aria-label': t('cal.next'), onclick: () => step(1) }, icon('right', 20))),
      title, seg,
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => openNewCitaSheet({ date: cursor < todayLocal() ? todayLocal() : cursor, onDone: draw }) }, icon('plus', 18), t('cita.new'))),
    body));
  void rerender;
  await draw();
  const onResize = () => draw();
  const mq = matchMedia('(min-width: 768px)');
  mq.addEventListener('change', onResize);
  return () => mq.removeEventListener('change', onResize);
}
