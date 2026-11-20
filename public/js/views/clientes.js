// Clientes: búsqueda, ficha con historial y notas.
import { get, patch } from '../api.js';
import { h, clear, avatar, empty, openSheet, field, toast, busy, debounce } from '../ui.js';
import { icon, emptyArt } from '../icons.js';
import { t, getLang } from '../i18n.js';
import { fmtWhen } from '../time.js';
import { statusBadge, svcLabel } from '../components.js';
import { openCitaSheet, openNewCitaSheet } from './cita-sheet.js';

export default async function clientes({ main, go, isCurrent }) {
  const lang = getLang();
  const q = h('input', { class: 'input', type: 'search', placeholder: t('clients.search'), 'aria-label': t('clients.search'), enterkeyhint: 'search', autocomplete: 'off' });
  const listEl = h('div', { class: 'list' });
  let rows = [];

  const draw = () => {
    clear(listEl);
    if (!rows.length) { listEl.append(empty({ art: emptyArt(), title: t('clients.emptyTitle'), text: t('clients.emptyText') })); return; }
    rows.forEach((c) => listEl.append(h('button', { class: 'item', type: 'button', onclick: () => openClient(c.id) }, avatar(c.nombre || c.telefono),
      h('div', { class: 'item__main' }, h('div', { class: 'item__title' }, c.nombre || t('clients.noName')), h('div', { class: 'item__sub' }, `+${c.telefono}`)),
      h('span', { class: 'badge' }, t('clients.appts', { n: c.citas })), icon('right', 18))));
  };
  const load = async () => {
    try { rows = (await get(`/api/staff/clientes?q=${encodeURIComponent(q.value.trim())}`)).clientes; if (isCurrent()) draw(); } catch (e) { toast(e.message, true); }
  };
  q.addEventListener('input', debounce(load, 250));

  async function openClient(id) {
    const { cliente, citas, conversacion_id: convId } = await get(`/api/staff/clientes/${id}`);
    const name = h('input', { class: 'input', value: cliente.nombre || '', maxlength: '120' });
    const notes = h('textarea', { class: 'textarea', maxlength: '1000' }); notes.value = cliente.notas || '';
    const idioma = h('select', { class: 'select', value: cliente.idioma === 'en' ? 'en' : 'es' }, h('option', { value: 'es' }, 'Español'), h('option', { value: 'en' }, 'English'));
    const save = h('button', { class: 'btn btn--primary', type: 'button' }, t('common.save'));
    const body = h('div', null,
      h('p', { class: 'muted' }, `+${cliente.telefono}`),
      h('div', { class: 'grid2' }, field(t('clients.name'), name), field(t('clients.lang'), idioma)),
      field(t('clients.notes'), notes),
      h('h3', { class: 'sectiontitle' }, t('clients.history')),
      citas.length ? h('div', { class: 'list' }, citas.slice(0, 15).map((c) => h('button', { class: 'item item--stack', type: 'button', onclick: () => { s.close(); openCitaSheet(c, load); } },
        h('div', { class: 'item__main' }, h('div', { class: 'item__title' }, svcLabel(c, lang)), h('div', { class: 'item__sub' }, fmtWhen(c.inicio))), statusBadge(c.estado)))) : h('p', { class: 'muted' }, t('clients.noHistory')));
    const foot = [
      convId ? h('a', { class: 'btn btn--secondary', href: `#/chats/${convId}`, onclick: () => s.close() }, icon('chat', 18), t('clients.openChat')) : null,
      h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => { s.close(); openNewCitaSheet({ cliente, onDone: load }); } }, icon('plus', 18), t('cita.new')),
      save].filter(Boolean);
    const s = openSheet({ title: cliente.nombre || `+${cliente.telefono}`, body, foot });
    save.addEventListener('click', () => busy(save, async () => { try { await patch(`/api/staff/clientes/${id}`, { nombre: name.value, notas: notes.value, idioma: idioma.value }); toast(t('common.saved')); s.close(); load(); } catch (e) { toast(e.message, true); } }));
  }

  main.append(h('div', { class: 'stack--lg stack' }, h('div', { class: 'pagehead' }, h('div', null, h('h1', null, t('nav.clients')), h('p', null, t('clients.lead')))), q, listEl));
  await load();
  void go;
  return null;
}
