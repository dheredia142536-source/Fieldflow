// Recuperación de contraseña con código de 6 dígitos por correo.
// No revela si el correo existe: la respuesta es la misma tanto si hay cuenta como si no.
import { randomInt } from 'node:crypto';
import { query } from './db.mjs';
import { hashPassword, hmac, safeEqual } from './session.mjs';
import { mailConfigured, sendMail, resetEmail } from './mail.mjs';
import { CODE_MINUTES, normalizeEmail, ipHash } from './registro.mjs';
import { HttpError, digits, nowIso, uid } from './util.mjs';

const MAX_ATTEMPTS = 5;
const MAX_SENDS = 5;
const WAIT_SEC = 60;
const MAX_ROWS_PER_IP_HOUR = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
const codeHash = (correo, code) => hmac(`reset:${correo}:${code}`);
const secondsSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
const out = (extra = {}) => ({ ok: true, vence_min: CODE_MINUTES, espera_s: WAIT_SEC, ...extra });

export async function iniciarRecuperacion(body, ip) {
  const correo = normalizeEmail(body.correo);
  if (!EMAIL_RE.test(correo)) throw new HttpError(400, 'invalid_email', 'Correo inválido');
  const idioma = body.idioma === 'en' ? 'en' : 'es';
  if (!mailConfigured() && process.env.FF_DEV_CODES !== '1') throw new HttpError(503, 'mail_not_configured', 'El envío de correo no está configurado');

  const [user] = await query('select id, nombre from usuarios_negocio where correo = $1', [correo]);
  if (!user) return out(); // misma respuesta: no se revela qué correos existen

  let [row] = await query('select * from recuperaciones where correo = $1', [correo]);
  if (row && secondsSince(row.creado_en) > 3600) { await query('delete from recuperaciones where id = $1', [row.id]); row = null; }
  if (row) {
    const wait = WAIT_SEC - secondsSince(row.ultimo_envio_en);
    if (wait > 0) throw Object.assign(new HttpError(429, 'wait_before_resend', `Espera ${wait} s`), { wait });
    if (Number(row.reenvios) >= MAX_SENDS) throw new HttpError(429, 'too_many_resends', 'Demasiados envíos. Inténtalo más tarde.');
  } else {
    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    const [{ n }] = await query('select cast(count(*) as integer) as n from recuperaciones where ip_hash = $1 and creado_en > $2', [ipHash(ip), hourAgo]);
    if (Number(n) >= MAX_ROWS_PER_IP_HOUR) throw new HttpError(429, 'too_many_requests', 'Demasiados intentos. Inténtalo más tarde.');
  }

  const code = newCode();
  const t = nowIso();
  const vals = [codeHash(correo, code), new Date(Date.now() + CODE_MINUTES * 60000).toISOString(), t];
  if (row) await query('update recuperaciones set codigo_hash = $1, expira_en = $2, ultimo_envio_en = $3, intentos = 0, reenvios = reenvios + 1 where id = $4', [...vals, row.id]);
  else await query('insert into recuperaciones (id, correo, codigo_hash, expira_en, ultimo_envio_en, ip_hash, creado_en) values ($1, $2, $3, $4, $5, $6, $7)', [uid(), correo, ...vals, ipHash(ip), t]);

  if (!mailConfigured()) return out({ codigo_dev: code }); // sólo desarrollo y pruebas (FF_DEV_CODES=1)
  try {
    await sendMail({ to: correo, ...resetEmail({ code, name: user.nombre, lang: idioma, minutes: CODE_MINUTES }) });
  } catch (e) {
    console.error('[mail]', e.message);
    await query('delete from recuperaciones where correo = $1', [correo]);
    const err = new HttpError(502, 'mail_failed', 'No pudimos enviar el correo. Inténtalo de nuevo.');
    err.detail = String(e.message || '').replace(/^Brevo\s+/, '').replace(/[{}"\\]/g, '').slice(0, 140);
    throw err;
  }
  return out();
}

// Comprueba el código y guarda la contraseña nueva. Devuelve el usuario para iniciar sesión.
export async function completarRecuperacion(body) {
  const correo = normalizeEmail(body.correo);
  const code = digits(body.codigo);
  const password = String(body.password || '');
  if (code.length !== 6) throw new HttpError(400, 'code_invalid', 'Código incorrecto');
  if (password.length < 8 || password.length > 200) throw new HttpError(400, 'weak_password', 'La contraseña debe tener al menos 8 caracteres');
  const [row] = await query('select * from recuperaciones where correo = $1', [correo]);
  if (!row) throw new HttpError(400, 'no_pending', 'No hay una solicitud activa. Pide un código nuevo.');
  if (new Date(row.expira_en).getTime() < Date.now()) {
    await query('delete from recuperaciones where id = $1', [row.id]);
    throw new HttpError(410, 'code_expired', 'El código venció. Pide uno nuevo.');
  }
  // El intento se cuenta ANTES de comparar para que peticiones simultáneas no permitan adivinar el código.
  const [{ intentos }] = await query('update recuperaciones set intentos = intentos + 1 where id = $1 returning intentos', [row.id]);
  if (Number(intentos) > MAX_ATTEMPTS) {
    await query('delete from recuperaciones where id = $1', [row.id]);
    throw new HttpError(429, 'too_many_attempts', 'Demasiados intentos. Pide un código nuevo.');
  }
  if (!safeEqual(codeHash(correo, code), row.codigo_hash)) {
    throw Object.assign(new HttpError(400, 'code_invalid', 'Código incorrecto'), { restantes: MAX_ATTEMPTS - Number(intentos) });
  }
  const [u] = await query('select id, negocio_id, correo, nombre from usuarios_negocio where correo = $1', [correo]);
  if (!u) throw new HttpError(400, 'no_pending', 'No hay una solicitud activa. Pide un código nuevo.');
  await query('update usuarios_negocio set hash = $1 where id = $2', [hashPassword(password), u.id]);
  await query('delete from recuperaciones where id = $1', [row.id]);
  return u;
}
