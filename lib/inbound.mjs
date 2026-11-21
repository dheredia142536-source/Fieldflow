// Lógica de un mensaje entrante de WhatsApp: registrar, generar enlace seguro y responder con botón.
// Inbound WhatsApp message logic: record, create a secure link and reply with a button.
import { query } from './db.mjs';
import { getConfig, getNegocio } from './config.mjs';
import { getConversation, saveMessage, upsertCliente } from './convos.mjs';
import { newToken, sha256 } from './session.mjs';
import { sendCtaLink, waConfigured } from './whatsapp-send.mjs';
import { detectLang, digits, nowIso, uid } from './util.mjs';

const LINK_COOLDOWN_MIN = 30;
const TOKEN_DAYS = 7;

export const appUrl = (origin = '') => (process.env.APP_URL || process.env.URL || origin || '').replace(/\/$/, '');

const copy = {
  es: (name, negocio) => `${name ? `¡Hola ${name}!` : '¡Hola!'} Soy el asistente de ${negocio}. Agenda y conversa conmigo aquí 👇`,
  en: (name, negocio) => `${name ? `Hi ${name}!` : 'Hi!'} I'm the ${negocio} assistant. Schedule and chat with me here 👇`,
};
const button = { es: 'Abrir asistente', en: 'Open assistant' };

export async function handleInbound({ phone, name = null, text = '', wamid = null, origin = '', simulate = false }) {
  if (wamid) {
    const fresh = await query('insert into eventos_webhook (id, recibido_en) values ($1, $2) on conflict (id) do nothing returning id', [wamid, nowIso()]);
    if (!fresh.length) return { duplicate: true };
  }
  const tel = digits(phone);
  if (!tel) return { ignored: true };
  const cfg = await getConfig();
  let cliente = await upsertCliente({ telefono: tel, nombre: name, idioma: detectLang(text, cfg.idioma_defecto) });
  const conv = await getConversation(cliente.id, 'whatsapp');
  await saveMessage(conv.id, 'cliente', text || '…', { canal: 'whatsapp' });

  const lang = detectLang(text, cliente.idioma === 'en' ? 'en' : 'es');
  const last = cliente.ultimo_enlace_en ? new Date(cliente.ultimo_enlace_en).getTime() : 0;
  if (Date.now() - last < LINK_COOLDOWN_MIN * 60000) return { throttled: true, cliente_id: cliente.id };

  const token = newToken();
  await query('insert into tokens_acceso (id, token_hash, cliente_id, expira_en, creado_en) values ($1, $2, $3, $4, $5)', [
    uid(), sha256(token), cliente.id, new Date(Date.now() + TOKEN_DAYS * 86400000).toISOString(), nowIso(),
  ]);
  const url = `${appUrl(origin)}/?t=${token}`;
  const body = copy[lang](cliente.nombre, cfg.negocio_nombre);

  // El número de WhatsApp de la plataforma pertenece al negocio principal; los demás negocios usan el simulador por ahora.
  const negocio = await getNegocio();
  const canSend = !simulate && !!negocio?.principal && waConfigured();
  let sent = false;
  let error = null;
  if (canSend) {
    try { await sendCtaLink({ to: tel, body, buttonText: button[lang], url }); sent = true; } catch (e) { error = e.message; console.error('[whatsapp]', e.message); }
  }
  await query('update clientes set ultimo_enlace_en = $1 where id = $2', [nowIso(), cliente.id]);
  await saveMessage(conv.id, 'sistema', `WhatsApp → ${button[lang]}`, { canal: 'whatsapp', enlace: true });
  return { sent, error, url, body, button: button[lang], lang, cliente_id: cliente.id, configured: canSend };
}
