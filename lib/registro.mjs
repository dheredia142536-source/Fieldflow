// Registro de negocios con verificación del correo (código de 6 dígitos).
// La cuenta NO existe hasta que el código es correcto: mientras tanto sólo hay un registro pendiente.
import { randomInt } from 'node:crypto';
import { query, tx } from './db.mjs';
import { hashPassword, hmac, safeEqual } from './session.mjs';
import { mailConfigured, sendMail, verificationEmail } from './mail.mjs';
import { HttpError, digits, nowIso, uid } from './util.mjs';

export const CODE_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const MAX_RESENDS = 5;
const RESEND_WAIT_SEC = 60;
const MAX_PENDING_PER_IP_HOUR = 10;

export const TIPOS = ['finca', 'cooperativa', 'transporte', 'insumos', 'asistencia', 'otro'];
export const FINES = ['agendar', 'logistica', 'whatsapp', 'otro'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clip = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const need = (cond, code, msg) => { if (!cond) throw new HttpError(400, code, msg || code); };

export const normalizeEmail = (v) => clip(v, 200).toLowerCase();

export function validateRegistro(b) {
  const correo = normalizeEmail(b.correo);
  const empresa = clip(b.empresa, 80);
  const nombre = clip(b.nombre, 80);
  const telefono = digits(b.telefono);
  const password = String(b.password || '');
  const fines = [...new Set((Array.isArray(b.fines) ? b.fines : []).filter((f) => FINES.includes(f)))];
  need(empresa.length >= 2, 'company_required', 'Escribe el nombre de tu empresa');
  need(nombre.length >= 2, 'name_required', 'Escribe tu nombre');
  need(EMAIL_RE.test(correo), 'invalid_email', 'Correo inválido');
  need(telefono.length >= 7 && telefono.length <= 15, 'invalid_phone', 'Teléfono inválido');
  need(password.length >= 8 && password.length <= 200, 'weak_password', 'La contraseña debe tener al menos 8 caracteres');
  need(TIPOS.includes(b.tipo), 'type_required', 'Elige el tipo de negocio');
  need(fines.length >= 1, 'purposes_required', 'Elige al menos un fin');
  need(b.acepta === true, 'terms_required', 'Debes aceptar los términos');
  return {
    correo, password,
    datos: {
      empresa, nombre, telefono, tipo: b.tipo, fines,
      departamento: clip(b.departamento, 60), municipio: clip(b.municipio, 60),
      idioma: b.idioma === 'en' ? 'en' : 'es', acepto_en: nowIso(),
    },
  };
}

// Crea el negocio, su configuración inicial y su primer usuario (ya verificado).
export async function crearNegocioConUsuario({ datos, correo, hash, principal = false }) {
  const negocioId = uid();
  const userId = uid();
  const t = nowIso();
  await tx(async (q) => {
    const [dup] = await q('select id from usuarios_negocio where correo = $1', [correo]);
    if (dup) throw new HttpError(409, 'email_taken', 'Ese correo ya tiene cuenta');
    await q(
      `insert into negocios (id, nombre, tipo, departamento, municipio, telefono, fines, idioma, principal, acepto_terminos_en, creado_en)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [negocioId, datos.empresa, datos.tipo || null, datos.departamento || null, datos.municipio || null, datos.telefono || null,
        JSON.stringify(datos.fines || []), datos.idioma || 'es', principal ? 1 : 0, datos.acepto_en || null, t],
    );
    await q('insert into configuracion (negocio_id, clave, valor) values ($1, $2, $3)', [negocioId, 'negocio_nombre', datos.empresa]);
    await q('insert into configuracion (negocio_id, clave, valor) values ($1, $2, $3)', [negocioId, 'idioma_defecto', datos.idioma || 'es']);
    await q(
      'insert into usuarios_negocio (id, negocio_id, correo, nombre, telefono, hash, verificado_en, creado_en) values ($1, $2, $3, $4, $5, $6, $7, $8)',
      [userId, negocioId, correo, datos.nombre || null, datos.telefono || null, hash, t, t],
    );
  });
  return { negocioId, userId };
}

const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
const codeHash = (correo, code) => hmac(`reg:${correo}:${code}`);
export const ipHash = (ip) => hmac(`ip:${ip || 'unknown'}`).slice(0, 32);

async function deliver({ correo, nombre, idioma, code }) {
  if (!mailConfigured()) {
    if (process.env.FF_DEV_CODES === '1') return { codigo_dev: code }; // sólo desarrollo y pruebas
    throw new HttpError(503, 'mail_not_configured', 'El envío de correo no está configurado');
  }
  const mail = verificationEmail({ code, name: nombre, lang: idioma, minutes: CODE_MINUTES });
  try { await sendMail({ to: correo, ...mail }); } catch (e) {
    console.error('[mail]', e.message);
    throw new HttpError(502, 'mail_failed', 'No pudimos enviar el correo. Inténtalo de nuevo.');
  }
  return {};
}

const secondsSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 1000);

export async function iniciarRegistro(body, ip) {
  const { correo, password, datos } = validateRegistro(body);
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const [existing] = await query('select id from usuarios_negocio where correo = $1', [correo]);
  if (existing || (adminEmail && correo === adminEmail)) throw new HttpError(409, 'email_taken', 'Ese correo ya tiene cuenta');

  const [pending] = await query('select * from registros_pendientes where correo = $1', [correo]);
  if (pending) {
    const wait = RESEND_WAIT_SEC - secondsSince(pending.ultimo_envio_en);
    if (wait > 0) throw Object.assign(new HttpError(429, 'wait_before_resend', `Espera ${wait} s`), { wait });
    if (Number(pending.reenvios) >= MAX_RESENDS) throw new HttpError(429, 'too_many_resends', 'Demasiados envíos. Inténtalo más tarde.');
  } else {
    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    const [{ n }] = await query('select cast(count(*) as integer) as n from registros_pendientes where ip_hash = $1 and creado_en > $2', [ipHash(ip), hourAgo]);
    if (Number(n) >= MAX_PENDING_PER_IP_HOUR) throw new HttpError(429, 'too_many_requests', 'Demasiados intentos. Inténtalo más tarde.');
  }

  const code = newCode();
  const t = nowIso();
  const row = [JSON.stringify(datos), hashPassword(password), codeHash(correo, code), new Date(Date.now() + CODE_MINUTES * 60000).toISOString(), t];
  if (pending) {
    await query(
      'update registros_pendientes set datos = $1, hash = $2, codigo_hash = $3, expira_en = $4, ultimo_envio_en = $5, intentos = 0, reenvios = reenvios + 1 where id = $6',
      [...row, pending.id],
    );
  } else {
    await query(
      'insert into registros_pendientes (id, correo, datos, hash, codigo_hash, expira_en, ultimo_envio_en, ip_hash, creado_en) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [uid(), correo, ...row, ipHash(ip), t],
    );
  }
  try {
    const extra = await deliver({ correo, nombre: datos.nombre, idioma: datos.idioma, code });
    return { ok: true, correo, vence_min: CODE_MINUTES, espera_s: RESEND_WAIT_SEC, ...extra };
  } catch (e) {
    await query('delete from registros_pendientes where correo = $1', [correo]);
    throw e;
  }
}

export async function reenviarCodigo(correoRaw) {
  const correo = normalizeEmail(correoRaw);
  const [p] = await query('select * from registros_pendientes where correo = $1', [correo]);
  if (!p) throw new HttpError(404, 'no_pending', 'No hay un registro pendiente para ese correo. Empieza de nuevo.');
  const wait = RESEND_WAIT_SEC - secondsSince(p.ultimo_envio_en);
  if (wait > 0) throw Object.assign(new HttpError(429, 'wait_before_resend', `Espera ${wait} s`), { wait });
  if (Number(p.reenvios) >= MAX_RESENDS) throw new HttpError(429, 'too_many_resends', 'Demasiados envíos. Inténtalo más tarde.');
  const datos = JSON.parse(p.datos);
  const code = newCode();
  await query(
    'update registros_pendientes set codigo_hash = $1, expira_en = $2, ultimo_envio_en = $3, intentos = 0, reenvios = reenvios + 1 where id = $4',
    [codeHash(correo, code), new Date(Date.now() + CODE_MINUTES * 60000).toISOString(), nowIso(), p.id],
  );
  const extra = await deliver({ correo, nombre: datos.nombre, idioma: datos.idioma, code });
  return { ok: true, correo, vence_min: CODE_MINUTES, espera_s: RESEND_WAIT_SEC, ...extra };
}

export async function verificarCodigo(correoRaw, codeRaw) {
  const correo = normalizeEmail(correoRaw);
  const code = digits(codeRaw);
  need(code.length === 6, 'code_invalid', 'Código incorrecto');
  const [p] = await query('select * from registros_pendientes where correo = $1', [correo]);
  if (!p) throw new HttpError(400, 'no_pending', 'No hay un registro pendiente. Empieza de nuevo.');
  if (new Date(p.expira_en).getTime() < Date.now()) {
    await query('delete from registros_pendientes where id = $1', [p.id]);
    throw new HttpError(410, 'code_expired', 'El código venció. Pide uno nuevo.');
  }
  // Se cuenta el intento ANTES de comparar para que peticiones simultáneas no permitan adivinar el código.
  const [{ intentos }] = await query('update registros_pendientes set intentos = intentos + 1 where id = $1 returning intentos', [p.id]);
  if (Number(intentos) > MAX_ATTEMPTS) {
    await query('delete from registros_pendientes where id = $1', [p.id]);
    throw new HttpError(429, 'too_many_attempts', 'Demasiados intentos. Empieza de nuevo.');
  }
  if (!safeEqual(codeHash(correo, code), p.codigo_hash)) {
    throw Object.assign(new HttpError(400, 'code_invalid', 'Código incorrecto'), { restantes: MAX_ATTEMPTS - Number(intentos) });
  }
  const datos = JSON.parse(p.datos);
  const out = await crearNegocioConUsuario({ datos, correo, hash: p.hash });
  await query('delete from registros_pendientes where id = $1', [p.id]);
  return { ...out, correo, nombre: datos.nombre, negocio: datos.empresa };
}

