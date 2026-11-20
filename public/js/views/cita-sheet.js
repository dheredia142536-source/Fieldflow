// Hojas del negocio: detalle de cita (cambiar estado, reprogramar, notas) y nueva cita manual.
import { get, post, patch } from '../api.js';
import { h, clear, openSheet, toast, confirmDialog, busy, field } from '../ui.js';
import { t, getLang } from '../i18n.js';
import { fmtWhen, fmtDay, fmtTime, todayLocal, toLocal, addDays } from '../time.js';
import { statusBadge, svcLabel } from '../components.js';

function slotPicker(onPick) {
  const box = h('div', { class: 'slots', role: 'group', 'aria-label': t('cita.slots') });
  let picked = null;
  return {
    el: box,
    get value() { return picked; },
    set(slots) {
      picked = null; onPick(null); clear(box);
      if (!slots.length) { box.append(h('p', { class: 'hint' }, t('cita.noSlots'))); return; }
      for (const s of slots) {
        const b = h('button', { class: 'slot', type: 'button', 'aria-pressed': 'false' }, fmtTime(s.hm), h('small', null, s.recurso_nombre));
        b.addEventListener('click', () => {
          box.querySelectorAll('.slot').forEach((x) => x.setAttribute('aria-pressed', 'false'));
          b.setAttribute('aria-pressed', 'true'); picked = s; onPick(s);
        });
        box.append(b);
      }
    },
  };
}

export function openCitaSheet(c, onChange) {
  const lang = getLang();
  const notas = h('textarea', { class: 'textarea', maxlength: '500', 'aria-label': t('cita.notes') }, c.notas || '');
  notas.value = c.notas || '';
  const resched = h('div', { class: 'stack', hidden: true });
  const date = h('input', { class: 'input', type: 'date', min: todayLocal(), value: toLocal(c.inicio).ymd });
  const confirmMove = h('button', { class: 'btn btn--primary', type: 'button', disabled: true }, t('cita.move'));
  const picker = slotPicker((s) => { confirmMove.disabled = !s; });
  const load = async () => {
    clear(picker.el); picker.el.append(h('div', { class: 'spinner' }));
    try { picker.set((await get(`/api/staff/disponibilidad?servicio_id=${c.servicio_id}&fecha=${date.value}&excluir=${c.id}`)).slots); } catch (e) { toast(e.message, true); }
  };
  date.addEventListener('change', load);
  resched.append(field(t('cita.date'), date), picker.el, h('div', { class: 'row' }, confirmMove));

  const body = h('div', null,
    h('dl', { class: 'kv' },
      h('dt', null, t('cita.client')), h('dd', null, c.cliente_nombre || c.cliente_telefono),
      h('dt', null, t('cita.phone')), h('dd', null, h('a', { href: `tel:+${c.cliente_telefono}` }, `+${c.cliente_telefono}`)),
      h('dt', null, t('cita.service')), h('dd', null, svcLabel(c, lang)),
      h('dt', null, t('cita.when')), h('dd', null, fmtWhen(c.inicio)),
      h('dt', null, t('cita.who')), h('dd', null, c.recurso_nombre),
      h('dt', null, t('cita.status')), h('dd', null, statusBadge(c.estado)),
      h('dt', null, t('cita.origin')), h('dd', null, t(`origin.${c.origen}`))),
    field(t('cita.notes'), notas),
    resched);

  const done = () => { s.close(); onChange?.(); };
  const save = async (payload, okMsg) => { try { await patch(`/api/staff/citas/${c.id}`, payload); toast(okMsg); done(); } catch (e) { toast(e.message, true); } };

  const bSave = h('button', { class: 'btn btn--secondary', type: 'button' }, t('cita.saveNotes'));
  const bMove = h('button', { class: 'btn btn--secondary', type: 'button', 'aria-expanded': 'false' }, t('cita.resched'));
  const bDone = h('button', { class: 'btn btn--primary', type: 'button' }, t('cita.complete'));
  const bCancel = h('button', { class: 'btn btn--danger', type: 'button' }, t('cita.cancel'));
  const foot = c.estado === 'cancelada' ? [bSave] : [bCancel, bMove, bSave, ...(c.estado !== 'completada' ? [bDone] : [])];
  const s = openSheet({ title: t('cita.title'), body, foot });

  bSave.addEventListener('click', () => busy(bSave, () => save({ notas: notas.value }, t('cita.saved'))));
  bDone.addEventListener('click', () => busy(bDone, () => save({ estado: 'completada' }, t('cita.completed'))));
  bCancel.addEventListener('click', async () => {
    if (await confirmDialog({ title: t('cita.cancelTitle'), text: `${c.cliente_nombre || c.cliente_telefono} · ${fmtWhen(c.inicio)}`, okLabel: t('cita.cancelYes'), danger: true })) save({ estado: 'cancelada' }, t('cita.cancelled'));
  });
  bMove.addEventListener('click', () => {
    resched.hidden = !resched.hidden;
    bMove.setAttribute('aria-expanded', String(!resched.hidden));
    if (!resched.hidden) { load(); date.focus(); }
  });
  confirmMove.addEventListener('click', () => busy(confirmMove, () => save({ nuevo_inicio: picker.value.inicio, recurso_id: picker.value.recurso_id }, t('cita.moved'))));
  return s;
}

export async function openNewCitaSheet({ onDone, date: startDate, cliente } = {}) {
  const { servicios } = await get('/api/staff/catalogo');
  const activos = servicios.filter((x) => x.activo);
  if (!activos.length) { toast(t('cita.noServices'), true); return null; }
  const lang = getLang();
  const phone = h('input', { class: 'input', type: 'tel', inputmode: 'tel', autocomplete: 'off', placeholder: '573001234567', value: cliente?.telefono || '' });
  const name = h('input', { class: 'input', type: 'text', autocomplete: 'off', value: cliente?.nombre || '' });
  const svc = h('select', { class: 'select' }, activos.map((x) => h('option', { value: x.id }, `${lang === 'en' ? x.nombre_en : x.nombre_es} · ${x.duracion_min} min`)));
  const date = h('input', { class: 'input', type: 'date', min: todayLocal(), value: startDate || addDays(todayLocal(), 1) });
  const notes = h('input', { class: 'input', type: 'text', maxlength: '500' });
  const save = h('button', { class: 'btn btn--primary', type: 'button', disabled: true }, t('cita.create'));
  const picker = slotPicker((x) => { save.disabled = !x; });
  const load = async () => {
    clear(picker.el); picker.el.append(h('div', { class: 'spinner' }));
    try { picker.set((await get(`/api/staff/disponibilidad?servicio_id=${svc.value}&fecha=${date.value}`)).slots); } catch (e) { toast(e.message, true); }
  };
  svc.addEventListener('change', load); date.addEventListener('change', load);
  const body = h('div', null,
    h('div', { class: 'grid2' }, field(t('cita.phone'), phone, t('cita.phoneHint')), field(t('cita.clientName'), name)),
    h('div', { class: 'grid2' }, field(t('cita.service'), svc), field(t('cita.date'), date)),
    h('div', { class: 'field' }, h('span', { class: 'label' }, t('cita.slots')), picker.el),
    field(t('cita.notes'), notes));
  const s = openSheet({ title: t('cita.new'), body, foot: [save] });
  save.addEventListener('click', () => busy(save, async () => {
    if (String(phone.value).replace(/\D/g, '').length < 7) { toast(t('err.invalid_phone'), true); phone.focus(); return; }
    const slot = picker.value;
    try {
      await post('/api/staff/citas', { cliente: { telefono: phone.value, nombre: name.value }, servicio_id: svc.value, inicio: slot.inicio, recurso_id: slot.recurso_id, notas: notes.value });
      toast(t('cita.created')); s.close(); onDone?.();
    } catch (e) { toast(e.message, true); load(); }
  }));
  load();
  void fmtDay;
  return s;
}
