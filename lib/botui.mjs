// Componentes de interfaz que acompañan los mensajes del asistente (botones, tarjetas).
// UI components attached to assistant messages (buttons, cards).
import { query } from './db.mjs';
import { nid } from './tenant.mjs';
import { S, svcName } from './strings.mjs';
import { fmtDay, fmtTime, fmtWhen } from './time.mjs';

export const activeServices = () => query('select * from servicios where activo = 1 and negocio_id = $1 order by nombre_es', [nid()]);

export const chipsServices = (services, lang) => ({
  type: 'chips',
  options: services.map((s) => ({ label: svcName(s, lang), payload: `svc:${s.id}` })),
});

export const chipsDays = (svcId, days, lang) => ({
  type: 'chips',
  options: days.map((d) => ({ label: fmtDay(d.ymd, lang, { weekday: 'short', day: 'numeric', month: 'short' }), payload: `day:${svcId}|${d.ymd}` })),
});

export const chipsSlots = (svcId, slots, lang) => ({
  type: 'chips',
  options: slots.map((s) => ({ label: fmtTime(s.hm, lang), payload: `slot:${svcId}|${s.inicio}|${s.recurso_id}` })),
});

export async function confirmUi({ kind = 'create', servicioId, inicio, recursoId, cita, lang }) {
  const s = S[lang];
  if (kind === 'cancel') {
    return {
      type: 'confirm',
      title: s.confirmCancelTitle,
      lines: [svcName(cita, lang), fmtWhen(cita.inicio, lang)],
      confirm: { label: s.cancelYes, payload: 'confirm' },
      change: { label: s.keep, payload: 'keep' },
    };
  }
  const [svc] = await query('select * from servicios where id = $1 and negocio_id = $2', [servicioId, nid()]);
  const [res] = recursoId ? await query('select nombre from recursos where id = $1 and negocio_id = $2', [recursoId, nid()]) : [null];
  const lines = [`${s.service}: ${svc ? svcName(svc, lang) : ''}`, `${s.when}: ${fmtWhen(inicio, lang)}`];
  if (res) lines.push(`${s.who}: ${res.nombre}`);
  return { type: 'confirm', title: s.confirmTitle, lines, confirm: { label: s.confirm, payload: 'confirm' }, change: { label: s.change, payload: 'change' } };
}

export const citaUi = (cita, lang, title) => ({
  type: 'cita',
  title,
  lines: [svcName(cita, lang), fmtWhen(cita.inicio, lang), cita.recurso_nombre],
  status: cita.estado,
});

export const citasListUi = (citas, lang) => ({
  type: 'citas',
  items: citas.map((c) => ({
    id: c.id,
    title: svcName(c, lang),
    when: fmtWhen(c.inicio, lang),
    resource: c.recurso_nombre,
    actions: [
      { label: S[lang].reschedBtn, payload: `resched:${c.id}` },
      { label: S[lang].cancelBtn, payload: `cancel:${c.id}`, tone: 'danger' },
    ],
  })),
});
