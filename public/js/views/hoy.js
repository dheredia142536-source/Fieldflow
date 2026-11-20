// Panel "Hoy" del negocio.
import { get } from '../api.js';
import { h, clear, empty, avatar } from '../ui.js';
import { icon, emptyArt } from '../icons.js';
import { t, getLang } from '../i18n.js';
import { state } from '../state.js';
import { fmtDay, fmtIsoTime, fmtWhen, fmtRelative, durationMin } from '../time.js';
import { svcLabel, parcelColor, statusBadge } from '../components.js';
import { openCitaSheet, openNewCitaSheet } from './cita-sheet.js';

export default async function hoy({ main, isCurrent, rerender }) {
  const r = await get('/api/staff/resumen');
  if (!isCurrent()) return null;
  state.attention = r.atencion.length;
  clear(main);
  const lang = getLang();
  const hr = new Date(Date.now() - 5 * 3600000).getUTCHours();
  const hello = hr < 12 ? 'hoy.morning' : hr < 19 ? 'hoy.afternoon' : 'hoy.evening';

  const row = (c) => h('button', { class: `pcard${c.estado === 'cancelada' ? ' pcard--cancel' : ''}`, type: 'button', style: `--p:${parcelColor(c.servicio_id)}`, onclick: () => openCitaSheet(c, rerender) },
    h('span', { class: 'pcard__bar' }),
    h('div', { class: 'pcard__time' }, fmtIsoTime(c.inicio), h('small', null, `${durationMin(c.inicio, c.fin)} min`)),
    h('div', { class: 'item__main' }, h('div', { class: 'item__title' }, svcLabel(c, lang)), h('div', { class: 'item__sub' }, `${c.cliente_nombre || `+${c.cliente_telefono}`} · ${c.recurso_nombre}`)),
    statusBadge(c.estado));

  main.append(h('div', null,
    h('section', { class: 'greet' }, h('h1', null, t(hello)), h('p', null, fmtDay(r.hoy))),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', null, String(r.citas_hoy.filter((c) => c.estado !== 'cancelada').length)), h('span', null, t('hoy.statToday'))),
      h('div', { class: 'stat' }, h('b', null, String(r.semana)), h('span', null, t('hoy.statWeek'))),
      h('div', { class: 'stat' }, h('b', null, String(r.clientes)), h('span', null, t('hoy.statClients'))),
      h('a', { class: `stat${r.atencion.length ? ' stat--alert' : ''}`, href: '#/chats', style: 'text-decoration:none' }, h('b', null, String(r.atencion.length)), h('span', null, t('hoy.statAttention')))),
    h('div', { class: 'cols' },
      h('section', { 'aria-labelledby': 'agenda' },
        h('h2', { class: 'sectiontitle', id: 'agenda' }, t('hoy.agenda'), h('button', { class: 'btn btn--primary btn--sm right', type: 'button', onclick: () => openNewCitaSheet({ onDone: rerender }) }, icon('plus', 16), t('cita.new'))),
        r.citas_hoy.length ? h('div', { class: 'list' }, r.citas_hoy.map(row))
          : empty({ art: emptyArt(), title: t('hoy.emptyTitle'), text: r.proxima ? t('hoy.emptyNext', { when: fmtWhen(r.proxima.inicio) }) : t('hoy.emptyText') })),
      h('section', { 'aria-labelledby': 'att' },
        h('h2', { class: 'sectiontitle', id: 'att' }, t('hoy.attention')),
        r.atencion.length
          ? h('div', { class: 'list' }, r.atencion.map((a) => h('a', { class: 'item', href: `#/chats/${a.id}` }, avatar(a.nombre || a.telefono),
            h('div', { class: 'item__main' }, h('div', { class: 'item__title' }, a.nombre || `+${a.telefono}`), h('div', { class: 'item__sub' }, a.ultimo)),
            h('span', { class: 'item__meta' }, fmtRelative(a.ultimo_mensaje_en)), h('span', { class: 'unread', 'aria-hidden': 'true' }))))
          : h('p', { class: 'muted' }, t('hoy.noAttention'))))));
  return null;
}
