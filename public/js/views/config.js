// Ajustes del negocio: estado del sistema, negocio y asistente, servicios y recursos.
import { get, post, put } from '../api.js';
import { h, clear, toast, openSheet, field, busy, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { addDays, fmtDay } from '../time.js';
import { setPalette } from '../components.js';

const MONDAY = '2026-11-16';

export default async function config({ main, isCurrent, rerender }) {
  const [{ config: cfg, sistema }, cat] = await Promise.all([get('/api/staff/config'), get('/api/staff/catalogo')]);
  if (!isCurrent()) return null;
  setPalette(cat.servicios);
  clear(main);

  const dot = (ok) => h('span', { class: `badge ${ok ? 'badge--ok' : 'badge--warn'}` }, icon(ok ? 'check' : 'alert', 14), t(ok ? 'cfg.ok' : 'cfg.missing'));
  const row = (label, status, extra) => h('div', { class: 'statusrow' }, h('span', null, label), h('span', { class: 'row' }, extra || null, status));
  const copy = (txt) => h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(txt); toast(t('cfg.copied')); } catch { toast(txt); } } }, icon('copy', 16), t('cfg.copy'));

  // ── Estado ──
  const wa = sistema.whatsapp;
  const status = h('section', { class: 'card card--surface', 'aria-labelledby': 's1' }, h('h2', { class: 'sectiontitle', id: 's1' }, t('cfg.status')),
    row(t('cfg.llm'), sistema.llm.activo ? h('span', { class: 'badge badge--ok' }, `${sistema.llm.modelo} · ${sistema.llm.host}`) : h('span', { class: 'badge badge--info' }, t('cfg.demoMode'))),
    sistema.principal && sistema.llm.activo ? row(t('cfg.usage'), h('span', null, `${sistema.uso_ia_hoy} / ${sistema.llm.limite_diario}`)) : null,
    sistema.principal ? [
      row(t('cfg.waSend'), dot(wa.configurado)), row(t('cfg.waSecret'), dot(wa.app_secret)), row(t('cfg.waVerify'), dot(wa.verify_token)),
      row(t('cfg.session'), dot(sistema.sesion_ok)),
      row(t('cfg.webhook'), h('code', null, wa.webhook), copy(wa.webhook)),
    ] : h('p', { class: 'hint' }, t('cfg.waSoon')),
);

  // ── Negocio ──
  const f = {
    negocio_nombre: h('input', { class: 'input', maxlength: '80', value: cfg.negocio_nombre }),
    idioma_defecto: h('select', { class: 'select', value: cfg.idioma_defecto }, h('option', { value: 'es' }, 'Español'), h('option', { value: 'en' }, 'English')),
    anticipacion_min: h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: '0', max: '10080', value: cfg.anticipacion_min }),
    dias_max: h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: '1', max: '365', value: cfg.dias_max }),
    bienvenida_es: h('textarea', { class: 'textarea', maxlength: '400' }),
    bienvenida_en: h('textarea', { class: 'textarea', maxlength: '400' }),
    instrucciones_bot: h('textarea', { class: 'textarea', maxlength: '2000' }),
  };
  f.bienvenida_es.value = cfg.bienvenida_es; f.bienvenida_en.value = cfg.bienvenida_en; f.instrucciones_bot.value = cfg.instrucciones_bot;
  const saveCfg = h('button', { class: 'btn btn--primary', type: 'submit' }, t('common.save'));
  const bizForm = h('form', { class: 'card card--surface', 'aria-labelledby': 's2' }, h('h2', { class: 'sectiontitle', id: 's2' }, t('cfg.business')),
    h('div', { class: 'grid2' }, field(t('cfg.name'), f.negocio_nombre), field(t('cfg.defLang'), f.idioma_defecto)),
    h('div', { class: 'grid2' }, field(t('cfg.leadTime'), f.anticipacion_min, t('cfg.leadHint')), field(t('cfg.maxDays'), f.dias_max)),
    field(t('cfg.welcomeEs'), f.bienvenida_es, t('cfg.welcomeHint')), field(t('cfg.welcomeEn'), f.bienvenida_en),
    field(t('cfg.instructions'), f.instrucciones_bot, t('cfg.instructionsHint')), saveCfg);
  bizForm.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(saveCfg, async () => {
      try { await put('/api/staff/config', Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value]))); toast(t('common.saved')); } catch (er) { toast(er.message, true); }
    });
  });

  // ── Servicios ──
  const recursosActivos = cat.recursos;
  function editService(s) {
    const d = s || { nombre_es: '', nombre_en: '', descripcion_es: '', descripcion_en: '', duracion_min: 60, activo: true, recursos: [] };
    const x = {
      es: h('input', { class: 'input', value: d.nombre_es, maxlength: '120' }), en: h('input', { class: 'input', value: d.nombre_en, maxlength: '120' }),
      des: h('input', { class: 'input', value: d.descripcion_es || '', maxlength: '300' }), den: h('input', { class: 'input', value: d.descripcion_en || '', maxlength: '300' }),
      dur: h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: '15', max: '720', step: '15', value: d.duracion_min }),
    };
    const active = h('input', { type: 'checkbox', checked: d.activo });
    const res = recursosActivos.map((r) => ({ r, cb: h('input', { type: 'checkbox', checked: d.recursos.includes(r.id) }) }));
    const save = h('button', { class: 'btn btn--primary', type: 'button' }, t('common.save'));
    const sh = openSheet({
      title: s ? t('cfg.editService') : t('cfg.newService'),
      body: h('div', null, h('div', { class: 'grid2' }, field(t('cfg.nameEs'), x.es), field(t('cfg.nameEn'), x.en)),
        h('div', { class: 'grid2' }, field(t('cfg.descEs'), x.des), field(t('cfg.descEn'), x.den)),
        field(t('cfg.duration'), x.dur),
        h('div', { class: 'field' }, h('span', { class: 'label' }, t('cfg.who')), recursosActivos.length ? h('div', { class: 'checks' }, res.map(({ r, cb }) => h('label', { class: 'check' }, cb, r.nombre))) : h('p', { class: 'hint' }, t('cfg.noResources'))),
        h('label', { class: 'check' }, active, t('cfg.active'))),
      foot: [save],
    });
    save.addEventListener('click', () => busy(save, async () => {
      try {
        await post('/api/staff/servicios', { id: s?.id, nombre_es: x.es.value, nombre_en: x.en.value, descripcion_es: x.des.value, descripcion_en: x.den.value, duracion_min: Number(x.dur.value), activo: active.checked, recursos: res.filter((q) => q.cb.checked).map((q) => q.r.id) });
        toast(t('common.saved')); sh.close(); rerender();
      } catch (e) { toast(e.message, true); }
    }));
  }
  const services = h('section', { 'aria-labelledby': 's3' }, h('h2', { class: 'sectiontitle', id: 's3' }, t('cfg.services'), h('button', { class: 'btn btn--secondary btn--sm right', type: 'button', onclick: () => editService(null) }, icon('plus', 16), t('common.add'))),
    cat.servicios.length ? h('div', { class: 'list' }, cat.servicios.map((s) => h('button', { class: 'item', type: 'button', onclick: () => editService(s) },
      h('div', { class: 'item__main' }, h('div', { class: 'item__title' }, s.nombre_es, s.nombre_en !== s.nombre_es ? ` / ${s.nombre_en}` : ''), h('div', { class: 'item__sub' }, `${s.duracion_min} min`)),
      s.activo ? null : h('span', { class: 'badge' }, t('cfg.inactive')), icon('edit', 18)))) : h('p', { class: 'muted' }, t('cfg.noServices')));

  // ── Recursos ──
  function editResource(r) {
    const d = r || { nombre: '', tipo: '', activo: true, horarios: [] };
    const name = h('input', { class: 'input', value: d.nombre, maxlength: '100' });
    const kind = h('input', { class: 'input', value: d.tipo || '', maxlength: '60', placeholder: t('cfg.kindHint') });
    const active = h('input', { type: 'checkbox', checked: d.activo });
    const rows = Array.from({ length: 7 }, (_, wd) => {
      const slots = d.horarios.filter((x) => x.dia_semana === wd);
      const on = h('input', { type: 'checkbox', checked: slots.length > 0, 'aria-label': fmtDay(addDays(MONDAY, wd), { weekday: 'long' }) });
      const mk = (v, label) => h('input', { class: 'input', type: 'time', value: v || '', step: '900', 'aria-label': `${fmtDay(addDays(MONDAY, wd), { weekday: 'long' })} ${label}` });
      const a1 = mk(slots[0]?.hora_inicio || '08:00', t('cfg.from')); const b1 = mk(slots[0]?.hora_fin || '17:00', t('cfg.to'));
      const a2 = mk(slots[1]?.hora_inicio || '', t('cfg.from2')); const b2 = mk(slots[1]?.hora_fin || '', t('cfg.to2'));
      const sub = h('div', { class: 'sched__sub' }, a2, b2);
      const sync = () => { [a1, b1, a2, b2].forEach((i) => { i.disabled = !on.checked; }); };
      on.addEventListener('change', sync); sync();
      return { wd, on, a1, b1, a2, b2, el: h('div', { class: 'sched__row' }, h('label', { class: 'day' }, on, ' ', fmtDay(addDays(MONDAY, wd), { weekday: 'short' })), a1, b1, sub) };
    });
    const save = h('button', { class: 'btn btn--primary', type: 'button' }, t('common.save'));
    const sh = openSheet({
      title: r ? t('cfg.editResource') : t('cfg.newResource'),
      body: h('div', null, h('div', { class: 'grid2' }, field(t('cfg.resName'), name), field(t('cfg.kind'), kind)),
        h('div', { class: 'field' }, h('span', { class: 'label' }, t('cfg.schedule')), h('div', { class: 'sched' }, rows.map((x) => x.el)), h('span', { class: 'hint' }, t('cfg.scheduleHint'))),
        h('label', { class: 'check' }, active, t('cfg.active'))),
      foot: [save],
    });
    save.addEventListener('click', () => busy(save, async () => {
      const horarios = [];
      rows.forEach((x) => { if (!x.on.checked) return; if (x.a1.value && x.b1.value) horarios.push({ dia_semana: x.wd, hora_inicio: x.a1.value, hora_fin: x.b1.value }); if (x.a2.value && x.b2.value) horarios.push({ dia_semana: x.wd, hora_inicio: x.a2.value, hora_fin: x.b2.value }); });
      try { await post('/api/staff/recursos', { id: r?.id, nombre: name.value, tipo: kind.value, activo: active.checked, horarios }); toast(t('common.saved')); sh.close(); rerender(); } catch (e) { toast(e.message, true); }
    }));
  }
  const summary = (r) => { const days = [...new Set(r.horarios.map((x) => x.dia_semana))].sort(); return days.length ? days.map((d) => fmtDay(addDays(MONDAY, d), { weekday: 'short' })).join(' · ') : t('cfg.noSchedule'); };
  const resources = h('section', { 'aria-labelledby': 's4' }, h('h2', { class: 'sectiontitle', id: 's4' }, t('cfg.resources'), h('button', { class: 'btn btn--secondary btn--sm right', type: 'button', onclick: () => editResource(null) }, icon('plus', 16), t('common.add'))),
    cat.recursos.length ? h('div', { class: 'list' }, cat.recursos.map((r) => h('button', { class: 'item', type: 'button', onclick: () => editResource(r) },
      h('span', { class: 'avatar', 'aria-hidden': 'true' }, icon('tractor', 20)),
      h('div', { class: 'item__main' }, h('div', { class: 'item__title' }, r.nombre), h('div', { class: 'item__sub' }, `${r.tipo ? `${r.tipo} · ` : ''}${summary(r)}`)),
      r.activo ? null : h('span', { class: 'badge' }, t('cfg.inactive')), icon('edit', 18)))) : h('p', { class: 'muted' }, t('cfg.noResourcesYet')));

  main.append(h('div', { class: 'settings' },
    h('div', { class: 'pagehead' }, h('div', null, h('h1', null, t('nav.settings')), h('p', null, t('cfg.lead')))),
    status, bizForm, services, resources));
  return null;
}
