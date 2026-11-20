import { query, tx } from './db.mjs';
import { slotsFor } from './availability.mjs';
import { HttpError, iso, nowIso, uid } from './util.mjs';
import { toLocal } from './time.mjs';

const SELECT = `select c.id, c.inicio, c.fin, c.estado, c.notas, c.origen, c.cliente_id, c.servicio_id, c.recurso_id,
  cl.nombre as cliente_nombre, cl.telefono as cliente_telefono,
  s.nombre_es, s.nombre_en, r.nombre as recurso_nombre
  from citas c join clientes cl on cl.id = c.cliente_id
  join servicios s on s.id = c.servicio_id join recursos r on r.id = c.recurso_id`;

export const mapCita = (r) => ({ ...r, inicio: iso(r.inicio), fin: iso(r.fin) });

export async function getCita(id, q = query) {
  const [r] = await q(`${SELECT} where c.id = $1`, [id]);
  return r ? mapCita(r) : null;
}

export async function listCitas({ desde, hasta, clienteId = null, incluirCanceladas = false, q = query }) {
  const where = ['c.inicio >= $1', 'c.inicio < $2'];
  const params = [desde, hasta];
  if (clienteId) { params.push(clienteId); where.push(`c.cliente_id = $${params.length}`); }
  if (!incluirCanceladas) where.push("c.estado <> 'cancelada'");
  const rows = await q(`${SELECT} where ${where.join(' and ')} order by c.inicio`, params);
  return rows.map(mapCita);
}

export async function crearCita({ clienteId, servicioId, inicio, recursoId = null, origen = 'manual', notas = null }) {
  const start = new Date(inicio);
  if (Number.isNaN(start.getTime())) throw new HttpError(400, 'invalid_date', 'Fecha inválida');
  const id = uid();
  await tx(async (q) => {
    const { ymd } = toLocal(start);
    const slot = (await slotsFor({ q, servicioId, ymd, recursoId })).find((s) => s.inicio === start.toISOString());
    if (!slot) throw new HttpError(409, 'slot_unavailable', 'Horario no disponible');
    // Bloqueo de la fila del recurso: serializa reservas concurrentes. / Row lock: serializes concurrent bookings.
    await q('update recursos set activo = activo where id = $1', [slot.recurso_id]);
    const clash = await q(
      "select id from citas where recurso_id = $1 and estado <> 'cancelada' and inicio < $3 and fin > $2",
      [slot.recurso_id, slot.inicio, slot.fin],
    );
    if (clash.length) throw new HttpError(409, 'slot_unavailable', 'Horario no disponible');
    await q(
      `insert into citas (id, cliente_id, servicio_id, recurso_id, inicio, fin, estado, notas, origen, creado_en)
       values ($1, $2, $3, $4, $5, $6, 'confirmada', $7, $8, $9)`,
      [id, clienteId, servicioId, slot.recurso_id, slot.inicio, slot.fin, notas, origen, nowIso()],
    );
  });
  return getCita(id);
}

export async function reprogramarCita({ citaId, nuevoInicio, recursoId = null, clienteId = null }) {
  const start = new Date(nuevoInicio);
  if (Number.isNaN(start.getTime())) throw new HttpError(400, 'invalid_date', 'Fecha inválida');
  await tx(async (q) => {
    const [c] = await q('select id, cliente_id, servicio_id, recurso_id, estado from citas where id = $1', [citaId]);
    if (!c || (clienteId && c.cliente_id !== clienteId)) throw new HttpError(404, 'not_found', 'Cita no encontrada');
    if (c.estado === 'cancelada') throw new HttpError(409, 'cancelled', 'La cita está cancelada');
    const { ymd } = toLocal(start);
    const all = await slotsFor({ q, servicioId: c.servicio_id, ymd, recursoId: recursoId || null, excludeCitaId: citaId });
    const match = all.filter((s) => s.inicio === start.toISOString());
    const slot = match.find((s) => s.recurso_id === c.recurso_id) || match[0];
    if (!slot) throw new HttpError(409, 'slot_unavailable', 'Horario no disponible');
    await q('update recursos set activo = activo where id = $1', [slot.recurso_id]);
    const clash = await q(
      "select id from citas where recurso_id = $1 and estado <> 'cancelada' and id <> $4 and inicio < $3 and fin > $2",
      [slot.recurso_id, slot.inicio, slot.fin, citaId],
    );
    if (clash.length) throw new HttpError(409, 'slot_unavailable', 'Horario no disponible');
    await q('update citas set inicio = $1, fin = $2, recurso_id = $3 where id = $4', [slot.inicio, slot.fin, slot.recurso_id, citaId]);
  });
  return getCita(citaId);
}

export async function cambiarEstado({ citaId, estado, clienteId = null }) {
  if (!['confirmada', 'cancelada', 'completada'].includes(estado)) throw new HttpError(400, 'invalid_state', 'Estado inválido');
  const c = await getCita(citaId);
  if (!c || (clienteId && c.cliente_id !== clienteId)) throw new HttpError(404, 'not_found', 'Cita no encontrada');
  await query('update citas set estado = $1 where id = $2', [estado, citaId]);
  return { ...c, estado };
}

export const cancelarCita = ({ citaId, clienteId = null }) => cambiarEstado({ citaId, estado: 'cancelada', clienteId });
