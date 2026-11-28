// CRM: contactos, embudo e historial (notas, correos, llamadas). / CRM: contacts, funnel and history.
import { query } from './db.mjs';
import { nid } from './tenant.mjs';
import { HttpError, iso, nowIso, uid } from './util.mjs';
import { isYmd } from './time.mjs';
import { mailConfigured, sendMail } from './mail.mjs';

export const ETAPAS = ['nuevo', 'contactado', 'cotizado', 'cerrado', 'perdido'];
const TIPOS_HIST = ['nota', 'correo_enviado', 'correo_recibido', 'llamada', 'visita', 'etapa'];
const txt = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const need = (c, code, msg) => { if (!c) throw new HttpError(400, code, msg || code); };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const mapC = (r) => ({
  id: r.id, nombre: r.nombre, correo: r.correo || '', telefono: r.telefono || '', empresa: r.empresa || '', etapa: r.etapa, origen: r.origen || '',
  valor: Number(r.valor) || 0, cliente_id: r.cliente_id || null, notas: r.notas || '', proxima_accion: r.proxima_accion || '', proxima_fecha: r.proxima_fecha || '',
  ultimo: r.ultimo_contacto_en ? iso(r.ultimo_contacto_en) : null, creado: iso(r.creado_en),
});

// Trae al CRM las personas que ya escribieron por el asistente (una sola vez cada una).
async function sincronizarClientes() {
  const N = nid();
  const nuevos = await query(
    `select cl.id, cl.nombre, coalesce(cl.contacto_tel, cl.telefono) as telefono, cl.creado_en, cl.origen, cl.correo from clientes cl
     where cl.negocio_id = $1 and (cl.telefono not like 'web-%' or cl.contacto_tel is not null) and not exists (select 1 from contactos c where c.cliente_id = cl.id) limit 200`,
    [N],
  );
  for (const cl of nuevos) {
    const ahora = nowIso();
    await query(
      `insert into contactos (id, negocio_id, nombre, telefono, correo, etapa, origen, cliente_id, creado_en, actualizado_en)
       values ($1, $2, $3, $4, $9, 'nuevo', $8, $5, $6, $7)`,
      [uid(), N, cl.nombre || `+${cl.telefono}`, cl.telefono, cl.id, iso(cl.creado_en) || ahora, ahora, cl.origen === 'enlace' ? 'enlace' : 'asistente', cl.correo || null],
    );
  }
}

export async function listContactos() {
  await sincronizarClientes();
  const rows = await query('select * from contactos where negocio_id = $1 order by actualizado_en desc limit 1000', [nid()]);
  return { etapas: ETAPAS, contactos: rows.map(mapC) };
}

function datos(b, parcial = false) {
  const o = {};
  const set = (k, v) => { if (!parcial || b[k] !== undefined) o[k] = v; };
  set('nombre', txt(b.nombre, 120));
  if (!parcial) need(o.nombre, 'name_required', 'Nombre requerido');
  else if (b.nombre !== undefined) need(o.nombre, 'name_required', 'Nombre requerido');
  set('correo', txt(b.correo, 160).toLowerCase() || null);
  if (o.correo) need(EMAIL.test(o.correo), 'invalid_email', 'Correo inválido');
  set('telefono', txt(b.telefono, 40) || null);
  set('empresa', txt(b.empresa, 120) || null);
  set('origen', txt(b.origen, 40) || null);
  set('notas', txt(b.notas, 2000) || null);
  set('proxima_accion', txt(b.proxima_accion, 160) || null);
  set('proxima_fecha', b.proxima_fecha ? (isYmd(b.proxima_fecha) ? b.proxima_fecha : (() => { throw new HttpError(400, 'invalid_date', 'Fecha inválida'); })()) : null);
  if (!parcial || b.valor !== undefined) { const v = Math.round(Number(b.valor) || 0); need(v >= 0 && v < 1e12, 'invalid_amount', 'Valor inválido'); o.valor = v; }
  if (!parcial || b.etapa !== undefined) { o.etapa = b.etapa || 'nuevo'; need(ETAPAS.includes(o.etapa), 'invalid_stage', 'Etapa inválida'); }
  return o;
}

async function mine(id) {
  const [c] = await query('select * from contactos where id = $1 and negocio_id = $2', [id, nid()]);
  if (!c) throw new HttpError(404, 'not_found');
  return c;
}

export async function crearContacto(b) {
  const d = datos(b);
  const id = uid(); const ahora = nowIso();
  await query(
    `insert into contactos (id, negocio_id, nombre, correo, telefono, empresa, etapa, origen, valor, notas, proxima_accion, proxima_fecha, creado_en, actualizado_en)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
    [id, nid(), d.nombre, d.correo, d.telefono, d.empresa, d.etapa, d.origen || 'manual', d.valor, d.notas, d.proxima_accion, d.proxima_fecha, ahora],
  );
  return { id };
}

export async function editarContacto(id, b) {
  const prev = await mine(id);
  const d = datos(b, true);
  const keys = Object.keys(d);
  if (keys.length) {
    const sets = keys.map((k, i) => `${k} = $${i + 3}`).join(', ');
    await query(`update contactos set ${sets}, actualizado_en = $${keys.length + 3} where id = $1 and negocio_id = $2`, [id, nid(), ...keys.map((k) => d[k]), nowIso()]);
  }
  if (d.etapa && d.etapa !== prev.etapa) {
    await query('insert into contacto_historial (id, negocio_id, contacto_id, tipo, asunto, creado_en) values ($1, $2, $3, $4, $5, $6)', [uid(), nid(), id, 'etapa', `${prev.etapa} → ${d.etapa}`, nowIso()]);
  }
  return { ok: true };
}

export async function borrarContacto(id) {
  await mine(id);
  await query('delete from contactos where id = $1 and negocio_id = $2', [id, nid()]);
  return { ok: true };
}

export async function detalleContacto(id) {
  const c = await mine(id);
  const h = await query('select id, tipo, asunto, cuerpo, creado_en from contacto_historial where contacto_id = $1 and negocio_id = $2 order by creado_en desc limit 200', [id, nid()]);
  let citas = []; let conversacion_id = null;
  if (c.cliente_id) {
    citas = await query(
      `select ci.id, ci.inicio, ci.estado, s.nombre_es, s.nombre_en from citas ci join servicios s on s.id = ci.servicio_id
       where ci.cliente_id = $1 and ci.negocio_id = $2 order by ci.inicio desc limit 20`,
      [c.cliente_id, nid()],
    );
    const [cv] = await query('select id from conversaciones where cliente_id = $1 and negocio_id = $2 limit 1', [c.cliente_id, nid()]);
    conversacion_id = cv?.id || null;
  }
  return {
    contacto: mapC(c),
    historial: h.map((x) => ({ id: x.id, tipo: x.tipo, asunto: x.asunto || '', cuerpo: x.cuerpo || '', en: iso(x.creado_en) })),
    citas: citas.map((x) => ({ id: x.id, inicio: iso(x.inicio), estado: x.estado, es: x.nombre_es, en: x.nombre_en })),
    conversacion_id,
  };
}

export async function agregarHistorial(id, b) {
  await mine(id);
  const tipo = txt(b.tipo, 30) || 'nota';
  need(TIPOS_HIST.includes(tipo) && tipo !== 'etapa' && tipo !== 'correo_enviado', 'invalid_type', 'Tipo inválido');
  const cuerpo = txt(b.cuerpo, 5000); const asunto = txt(b.asunto, 200);
  need(cuerpo || asunto, 'empty', 'Escribe algo');
  const ahora = nowIso();
  await query('insert into contacto_historial (id, negocio_id, contacto_id, tipo, asunto, cuerpo, creado_en) values ($1, $2, $3, $4, $5, $6, $7)', [uid(), nid(), id, tipo, asunto || null, cuerpo || null, ahora]);
  await query('update contactos set ultimo_contacto_en = $3, actualizado_en = $3 where id = $1 and negocio_id = $2', [id, nid(), ahora]);
  return { ok: true };
}

const escH = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Envía un correo desde FieldFlow (respuestas llegan al correo de quien lo envía) y lo deja en el historial.
export async function enviarCorreo(id, b, staff, negocioNombre) {
  const c = await mine(id);
  need(c.correo, 'no_email', 'Este contacto no tiene correo');
  const asunto = txt(b.asunto, 200); const cuerpo = txt(b.cuerpo, 8000);
  need(asunto && cuerpo, 'empty', 'Asunto y mensaje requeridos');
  if (!mailConfigured()) throw new HttpError(503, 'mail_off', 'El envío de correo aún no está configurado');
  const html = `<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:560px;color:#262320;line-height:1.55;white-space:pre-wrap">${escH(cuerpo)}</div>`;
  try {
    await sendMail({ to: c.correo, subject: asunto, text: cuerpo, html, replyTo: staff?.correo ? { email: staff.correo, name: staff.nombre || negocioNombre || undefined } : undefined, senderName: negocioNombre || undefined });
  } catch (e) { throw new HttpError(502, 'mail_failed', 'No se pudo enviar el correo'); }
  const ahora = nowIso();
  await query('insert into contacto_historial (id, negocio_id, contacto_id, tipo, asunto, cuerpo, creado_en) values ($1, $2, $3, $4, $5, $6, $7)', [uid(), nid(), id, 'correo_enviado', asunto, cuerpo, ahora]);
  await query("update contactos set ultimo_contacto_en = $3, actualizado_en = $3, etapa = case when etapa = 'nuevo' then 'contactado' else etapa end where id = $1 and negocio_id = $2", [id, nid(), ahora]);
  return { ok: true };
}
