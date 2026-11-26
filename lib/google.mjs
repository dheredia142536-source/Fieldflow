// Ingreso con Google (OpenID Connect, flujo de código con PKCE). Todo ocurre en el servidor:
// no se carga ningún script de Google en la página.
// Variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET. URI de redirección autorizada en Google Cloud:
//   <APP_URL o tu dominio>/api/auth/google/callback
import { createHash, randomBytes } from 'node:crypto';
import { query } from './db.mjs';
import { hashPassword, readSession, signSession, safeEqual } from './session.mjs';
import { crearNegocioConUsuario, normalizeEmail } from './registro.mjs';
import { nowIso } from './util.mjs';

export const OAUTH_COOKIE = 'ff_oauth';
export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const redirectUri = (ctx) => `${(process.env.APP_URL || ctx.origin).replace(/\/+$/, '')}/api/auth/google/callback`;
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fail = (code) => ({ __redirect: `/?e=${code}` });

export function googleStart(ctx) {
  if (!googleConfigured()) return fail('google_not_configured');
  const state = b64u(randomBytes(24));
  const nonce = b64u(randomBytes(24));
  const verifier = b64u(randomBytes(48));
  const lang = ctx.q.get('lang') === 'en' ? 'en' : 'es';
  ctx.setCookie(OAUTH_COOKIE, signSession({ k: 'oauth', s: state, n: nonce, v: verifier, l: lang }, 600), 600);
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(ctx),
    response_type: 'code',
    scope: 'openid email profile',
    state, nonce,
    code_challenge: b64u(createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
    prompt: 'select_account',
    hl: lang,
  });
  return { __redirect: `https://accounts.google.com/o/oauth2/v2/auth?${p}` };
}

export async function googleCallback(ctx) {
  const sess = readSession(ctx.cookies[OAUTH_COOKIE]);
  ctx.setCookie(OAUTH_COOKIE, '', 0); // de un solo uso
  if (ctx.q.get('error')) return fail('google_denied');
  const code = ctx.q.get('code') || '';
  if (!googleConfigured() || sess?.k !== 'oauth' || !code || !safeEqual(ctx.q.get('state') || '', sess.s)) return fail('google_failed');

  let claims;
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(ctx), grant_type: 'authorization_code', code_verifier: sess.v,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`token ${res.status}`);
    const { id_token: idToken } = await res.json();
    // El token llega directo de Google por TLS: es válido leerlo sin verificar la firma (OpenID Connect Core §3.1.3.7).
    claims = JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8'));
  } catch (e) { console.error('[google]', e.message); return fail('google_failed'); }

  const issOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
  const audOk = claims.aud === process.env.GOOGLE_CLIENT_ID;
  const fresh = Number(claims.exp) > Math.floor(Date.now() / 1000);
  const nonceOk = typeof claims.nonce === 'string' && safeEqual(claims.nonce, sess.n);
  const verified = claims.email_verified === true || claims.email_verified === 'true';
  const correo = normalizeEmail(claims.email);
  if (!issOk || !audOk || !fresh || !nonceOk || !verified || !correo) return fail('google_failed');

  let [u] = await query('select id, negocio_id from usuarios_negocio where correo = $1', [correo]);
  if (!u) {
    const first = String(claims.given_name || claims.name || correo.split('@')[0]).trim().slice(0, 40);
    const en = sess.l === 'en';
    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    let principal = false;
    if (adminEmail && correo === adminEmail) { const [{ p }] = await query('select cast(count(*) as integer) as p from negocios where principal = 1'); principal = Number(p) === 0; }
    // Cuenta nueva: sin contraseña (clave aleatoria). Puede crearla después con "¿Olvidaste tu contraseña?".
    const { negocioId, userId } = await crearNegocioConUsuario({
      datos: { empresa: en ? `${first}'s business` : `Negocio de ${first}`, nombre: String(claims.name || first).slice(0, 80), idioma: en ? 'en' : 'es', fines: [], acepto_en: nowIso() },
      correo, hash: hashPassword(b64u(randomBytes(32))), principal,
    });
    u = { id: userId, negocio_id: negocioId };
  }
  ctx.setCookie('ff_staff', signSession({ k: 'staff', id: u.id, nid: u.negocio_id }, 7 * 86400), 7 * 86400);
  return { __redirect: '/#/hoy' };
}
