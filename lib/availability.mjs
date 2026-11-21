// Disponibilidad calculada en el servidor. La IA nunca decide horarios.
// Availability is computed server-side. The AI never decides times.
import { query } from './db.mjs';
import { getConfig } from './config.mjs';
import { nid } from './tenant.mjs';
import { addDays, hmFrom, isYmd, localToUtc, minutes, todayLocal, weekdayOf } from './time.mjs';

const STEP_MIN = 30;

export async function slotsFor({ q = query, servicioId, ymd, recursoId = null, excludeCitaId = null, now = new Date(), cfg = null }) {
  if (!isYmd(ymd)) return [];
  cfg = cfg || (await getConfig(q));
  const today = todayLocal();
  if (ymd < today || ymd > addDays(today, Number(cfg.dias_max))) return [];

  const [svc] = await q('select id, duracion_min, activo from servicios where id = $1 and negocio_id = $2', [servicioId, nid()]);
  if (!svc || !svc.activo) return [];
  const dur = Number(svc.duracion_min);

  let recursos = await q(
    `select r.id, r.nombre from recursos r join servicio_recurso sr on sr.recurso_id = r.id
     where sr.servicio_id = $1 and r.negocio_id = $2 and r.activo = 1 order by r.nombre`,
    [servicioId, nid()],
  );
  if (recursoId) recursos = recursos.filter((r) => r.id === recursoId);

  const dow = weekdayOf(ymd);
  const dayStart = localToUtc(ymd, '00:00');
  const dayEnd = localToUtc(addDays(ymd, 1), '00:00');
  const earliest = now.getTime() + Number(cfg.anticipacion_min) * 60000;
  const out = [];

  for (const r of recursos) {
    const wins = await q('select hora_inicio, hora_fin from disponibilidad where recurso_id = $1 and dia_semana = $2 order by hora_inicio', [r.id, dow]);
    if (!wins.length) continue;
    let busy = await q(
      "select id, inicio, fin from citas where recurso_id = $1 and estado <> 'cancelada' and inicio < $3 and fin > $2",
      [r.id, dayStart.toISOString(), dayEnd.toISOString()],
    );
    busy = busy.filter((b) => b.id !== excludeCitaId).map((b) => [new Date(b.inicio).getTime(), new Date(b.fin).getTime()]);

    for (const w of wins) {
      for (let m = minutes(w.hora_inicio); m + dur <= minutes(w.hora_fin); m += STEP_MIN) {
        const hm = hmFrom(m);
        const s = localToUtc(ymd, hm).getTime();
        const e = s + dur * 60000;
        if (s < earliest) continue;
        if (busy.some(([bs, be]) => s < be && e > bs)) continue;
        out.push({
          inicio: new Date(s).toISOString(),
          fin: new Date(e).toISOString(),
          hm,
          recurso_id: r.id,
          recurso_nombre: r.nombre,
        });
      }
    }
  }
  return out.sort((a, b) => a.inicio.localeCompare(b.inicio) || a.recurso_nombre.localeCompare(b.recurso_nombre));
}

// Un horario por hora (el primer recurso libre). / One slot per time (first free resource).
export function uniqueByTime(slots) {
  const seen = new Set();
  return slots.filter((s) => (seen.has(s.inicio) ? false : seen.add(s.inicio)));
}

// Próximos días con cupo para un servicio. / Next days with availability.
export async function daysWithSlots({ servicioId, max = 5, lookahead = 12, q = query }) {
  const cfg = await getConfig(q);
  const days = [];
  const today = todayLocal();
  for (let i = 0; i < lookahead && days.length < max; i++) {
    const ymd = addDays(today, i);
    const s = await slotsFor({ q, servicioId, ymd, cfg });
    if (s.length) days.push({ ymd, count: uniqueByTime(s).length });
  }
  return days;
}
