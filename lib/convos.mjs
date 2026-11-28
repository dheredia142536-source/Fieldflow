import { query } from './db.mjs';
import { nid } from './tenant.mjs';
import { digits, iso, nowIso, uid } from './util.mjs';

export async function upsertCliente({ telefono, nombre = null, idioma = null, correo = null }) {
  const tel = digits(telefono);
  if (!tel) throw new Error('telefono requerido');
  const [found] = await query('select * from clientes where telefono = $1 and negocio_id = $2', [tel, nid()]);
  if (found) {
    if (nombre && !found.nombre) await query('update clientes set nombre = $1 where id = $2 and negocio_id = $3', [nombre, found.id, nid()]);
    if (correo && correo !== found.correo) await query('update clientes set correo = $1 where id = $2 and negocio_id = $3', [correo, found.id, nid()]);
    return { ...found, nombre: found.nombre || nombre, correo: correo || found.correo };
  }
  const id = uid();
  await query('insert into clientes (id, negocio_id, telefono, nombre, idioma, correo, creado_en) values ($1, $2, $3, $4, $5, $6, $7)', [id, nid(), tel, nombre, idioma || 'es', correo, nowIso()]);
  const [c] = await query('select * from clientes where id = $1', [id]);
  return c;
}

export async function getConversation(clienteId, canal = 'pwa') {
  const [c] = await query('select * from conversaciones where cliente_id = $1 and negocio_id = $2 order by creado_en limit 1', [clienteId, nid()]);
  if (c) return c;
  const id = uid();
  await query('insert into conversaciones (id, negocio_id, cliente_id, canal, creado_en) values ($1, $2, $3, $4, $5)', [id, nid(), clienteId, canal, nowIso()]);
  const [n] = await query('select * from conversaciones where id = $1', [id]);
  return n;
}

export const parseMeta = (m) => { try { return m ? JSON.parse(m) : {}; } catch { return {}; } };
export const mapMsg = (r) => ({ id: r.id, rol: r.rol, contenido: r.contenido, meta: parseMeta(r.meta), creado_en: iso(r.creado_en) });

export async function saveMessage(convId, rol, contenido, meta = null) {
  const id = uid();
  const t = nowIso();
  await query('insert into mensajes (id, conversacion_id, rol, contenido, meta, creado_en) values ($1, $2, $3, $4, $5, $6)', [id, convId, rol, String(contenido).slice(0, 4000), meta ? JSON.stringify(meta) : null, t]);
  await query('update conversaciones set ultimo_mensaje_en = $1 where id = $2', [t, convId]);
  return { id, rol, contenido, meta: meta || {}, creado_en: t };
}

export async function listMessages(convId, { after = null, limit = 60 } = {}) {
  const rows = after
    ? await query('select * from mensajes where conversacion_id = $1 and creado_en > $2 order by creado_en limit $3', [convId, after, limit])
    : await query('select * from (select * from mensajes where conversacion_id = $1 order by creado_en desc limit $2) t order by creado_en', [convId, limit]);
  return rows.map(mapMsg);
}

export async function setHandling(convId, atendidaPor, necesitaAtencion) {
  await query('update conversaciones set atendida_por = $1, necesita_atencion = $2 where id = $3 and negocio_id = $4', [atendidaPor, necesitaAtencion ? 1 : 0, convId, nid()]);
}

export async function setState(convId, state) {
  await query('update conversaciones set estado = $1 where id = $2 and negocio_id = $3', [state ? JSON.stringify(state) : null, convId, nid()]);
}

// Contador diario de llamadas a la IA (protege el límite gratuito). / Daily AI call counter.
export async function bumpUsage() {
  const day = nowIso().slice(0, 10);
  await query('insert into uso_diario (dia, llamadas) values ($1, 1) on conflict (dia) do update set llamadas = uso_diario.llamadas + 1', [day]);
}
export async function usageToday() {
  const [r] = await query('select llamadas from uso_diario where dia = $1', [nowIso().slice(0, 10)]);
  return r ? Number(r.llamadas) : 0;
}
