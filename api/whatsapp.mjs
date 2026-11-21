// Webhook de la WhatsApp Cloud API: https://TU-DOMINIO/webhooks/whatsapp (vercel.json lo reescribe a /api/whatsapp)
// Cada mensaje entrante recibe un botón con enlace seguro a la PWA (el chat ocurre en la PWA).
import { handleInbound } from '../lib/inbound.mjs';
import { query } from '../lib/db.mjs';
import { withNegocio } from '../lib/tenant.mjs';
import { safeEqual, verifyMetaSignature } from '../lib/session.mjs';

const text = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

function extractMessages(payload) {
  const out = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      for (const m of v.messages || []) {
        const name = (v.contacts || []).find((c) => c.wa_id === m.from)?.profile?.name || null;
        const body = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '';
        out.push({ wamid: m.id, phone: m.from, name, text: body });
      }
    }
  }
  return out;
}

async function webhook(req) {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe'
      && process.env.VERIFY_TOKEN
      && safeEqual(url.searchParams.get('hub.verify_token'), process.env.VERIFY_TOKEN);
    return ok ? text(url.searchParams.get('hub.challenge') || '') : text('Forbidden', 403);
  }
  if (req.method !== 'POST') return text('Method not allowed', 405);

  const raw = await req.text();
  if (!process.env.APP_SECRET) return text('APP_SECRET not configured', 503);
  if (!verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'), process.env.APP_SECRET)) return text('Invalid signature', 401);

  let payload;
  try { payload = JSON.parse(raw); } catch { return text('Bad request', 400); }

  const origin = `${url.protocol}//${req.headers.get('x-forwarded-host') || url.host}`;
  // El número de WhatsApp de la plataforma atiende al negocio principal (el del administrador).
  let principal = null;
  try { [principal] = await query('select id from negocios where principal = 1 limit 1'); } catch (e) { console.error('[webhook]', e); }
  if (!principal) { console.error('[webhook] no hay negocio principal: el administrador debe iniciar sesión una vez'); return text('ok'); }
  for (const m of extractMessages(payload)) {
    try { await withNegocio(principal.id, () => handleInbound({ ...m, origin })); } catch (e) { console.error('[webhook]', e); }
  }
  return text('ok'); // siempre 200 para mensajes firmados: evita reintentos en cascada de Meta
}

export const GET = webhook;
export const POST = webhook;
