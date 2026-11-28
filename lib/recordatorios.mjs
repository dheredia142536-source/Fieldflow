// Recordatorios de cita por correo (Brevo). Una vez al día, la mañana anterior a la cita.
// Appointment reminders by email (Brevo). Once a day, the morning before the appointment.
import { query } from './db.mjs';
import { nid, withNegocio } from './tenant.mjs';
import { getConfig } from './config.mjs';
import { mailConfigured, sendMail } from './mail.mjs';
import { newToken, sha256 } from './session.mjs';
import { HttpError, nowIso, uid } from './util.mjs';
import { addDays, fmtDay, fmtTime, isYmd, localToUtc, toLocal, todayLocal } from './time.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MAX_POR_CORRIDA = 150;

const copy = {
  es: {
    subject: (svc, hora) => `Recordatorio: ${svc} mañana a las ${hora}`,
    hi: (n) => `Hola${n ? ` ${n}` : ''},`, intro: (neg) => `Te recordamos tu cita con ${neg} para mañana:`,
    service: 'Servicio', when: 'Cuándo', who: 'Atiende', manage: 'Ver o cancelar mi cita', linkNote: 'Si no puedes asistir, avísanos con el botón de arriba para liberar el espacio.',
    why: (neg) => `Recibes este correo porque agendaste una cita con ${neg}.`,
  },
  en: {
    subject: (svc, hora) => `Reminder: ${svc} tomorrow at ${hora}`,
    hi: (n) => `Hi${n ? ` ${n}` : ''},`, intro: (neg) => `This is a reminder of your appointment with ${neg} tomorrow:`,
    service: 'Service', when: 'When', who: 'With', manage: 'View or cancel my appointment', linkNote: "If you can't make it, let us know with the button above so we can free the slot.",
    why: (neg) => `You are receiving this email because you booked an appointment with ${neg}.`,
  },
};

export function armar({ lang, negocio, cliente, svc, cuando, recurso, url }) {
  const L = copy[lang === 'en' ? 'en' : 'es'];
  const lines = [[L.service, svc], [L.when, cuando], recurso ? [L.who, recurso] : null].filter(Boolean);
  const text = `${L.hi(cliente)}\n\n${L.intro(negocio)}\n\n${lines.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${L.manage}: ${url}\n${L.linkNote}\n\n${L.why(negocio)}\n`;
  const html = `<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#161616">
<p style="margin:0 0 12px;line-height:1.5">${esc(L.hi(cliente))}</p>
<p style="margin:0 0 16px;line-height:1.5">${esc(L.intro(negocio))}</p>
<table style="width:100%;border-collapse:collapse;margin:0 0 20px;background:#f6f8f9;border-radius:8px">${lines.map(([k, v]) => `<tr><td style="padding:10px 14px;color:#625e55;font-size:14px;width:96px">${esc(k)}</td><td style="padding:10px 14px;font-weight:500">${esc(v)}</td></tr>`).join('')}</table>
<p style="margin:0 0 16px"><a href="${esc(url)}" style="display:inline-block;background:#0118df;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:500">${esc(L.manage)}</a></p>
<p style="margin:0 0 20px;color:#625e55;font-size:14px;line-height:1.5">${esc(L.linkNote)}</p>
<p style="margin:0;color:#8a867d;font-size:12px">${esc(L.why(negocio))}</p></div>`;
  return { text, html };
}

// Citas confirmadas de un día (hora de Bogotá) con el correo del cliente (el suyo o el de su ficha en Clientes).
async function citasDelDia(dia) {
  const desde = localToUtc(dia, '00:00').toISOString(); const hasta = localToUtc(addDays(dia, 1), '00:00').toISOString();
  return query(
    `select ci.id, ci.inicio, ci.recordatorio_en, cl.id as cliente_id, cl.nombre, cl.idioma,
            coalesce(nullif(cl.correo, ''), (select ct.correo from contactos ct where ct.cliente_id = cl.id and ct.correo is not null and ct.correo <> '' limit 1)) as correo,
            sv.nombre_es, sv.nombre_en, rc.nombre as recurso
     from citas ci join clientes cl on cl.id = ci.cliente_id join servicios sv on sv.id = ci.servicio_id join recursos rc on rc.id = ci.recurso_id
     where ci.negocio_id = $1 and ci.estado = 'confirmada' and ci.inicio >= $2 and ci.inicio < $3 order by ci.inicio`,
    [nid(), desde, hasta],
  );
}

export async function resumenRecordatorios(dia = addDays(todayLocal(), 1)) {
  const cfg = await getConfig();
  const rows = await citasDelDia(dia);
  return {
    activo: cfg.recordatorios_correo !== 'off', correo_ok: mailConfigured(), cron_ok: !!process.env.CRON_SECRET, dia,
    citas: rows.length, con_correo: rows.filter((r) => r.correo).length, sin_correo: rows.filter((r) => !r.correo).length, enviados: rows.filter((r) => r.recordatorio_en).length,
  };
}

// Envía los recordatorios de un día para el negocio activo. Cada cita recibe uno solo.
export async function enviarDelNegocio({ dia = addDays(todayLocal(), 1), origin = '', forzar = false } = {}) {
  if (!isYmd(dia)) throw new HttpError(400, 'invalid_date', 'Fecha inválida');
  if (!mailConfigured()) throw new HttpError(503, 'mail_not_configured', 'El correo aún no está configurado en este sitio');
  const cfg = await getConfig();
  if (cfg.recordatorios_correo === 'off' && !forzar) return { omitido: 'apagado', enviados: 0, sin_correo: 0, errores: 0 };
  const [neg] = await query('select nombre from negocios where id = $1', [nid()]);
  const [dueno] = await query('select correo from usuarios_negocio where negocio_id = $1 order by creado_en limit 1', [nid()]);
  const base = (process.env.APP_URL || process.env.URL || origin || '').replace(/\/$/, '');
  const rows = (await citasDelDia(dia)).filter((r) => !r.recordatorio_en);
  let enviados = 0; let sinCorreo = 0; let errores = 0;
  for (const r of rows.slice(0, MAX_POR_CORRIDA)) {
    if (!r.correo) { sinCorreo++; continue; }
    const lang = r.idioma === 'en' ? 'en' : 'es';
    const { ymd, hm } = toLocal(r.inicio);
    const hora = fmtTime(hm, lang); const svc = lang === 'en' ? r.nombre_en : r.nombre_es;
    const token = newToken();
    await query('insert into tokens_acceso (id, token_hash, cliente_id, expira_en, creado_en) values ($1, $2, $3, $4, $5)', [uid(), sha256(token), r.cliente_id, new Date(Date.now() + 3 * 86400000).toISOString(), nowIso()]);
    const body = armar({ lang, negocio: neg.nombre, cliente: (r.nombre || '').split(/\s+/)[0] || '', svc, cuando: `${fmtDay(ymd, lang)} · ${hora}`, recurso: r.recurso, url: `${base}/?t=${token}` });
    try {
      await sendMail({ to: r.correo, subject: copy[lang].subject(svc, hora), ...body, senderName: neg.nombre, replyTo: dueno?.correo || undefined });
      await query('update citas set recordatorio_en = $2 where id = $1 and negocio_id = $3', [r.id, nowIso(), nid()]);
      enviados++;
    } catch (e) { errores++; console.error('[recordatorio]', String(e.message).replace(/[a-z]+:\/\/\S+/gi, '[url]').slice(0, 160)); }
  }
  return { dia, enviados, sin_correo: sinCorreo, errores };
}

// Corrida diaria (Vercel Cron): todos los negocios.
export async function enviarDeTodos({ origin = '', dia } = {}) {
  const negocios = await query('select id from negocios');
  const total = { negocios: negocios.length, enviados: 0, sin_correo: 0, errores: 0 };
  for (const n of negocios) {
    try { const r = await withNegocio(n.id, () => enviarDelNegocio({ origin, ...(dia ? { dia } : {}) })); total.enviados += r.enviados || 0; total.sin_correo += r.sin_correo || 0; total.errores += r.errores || 0; }
    catch (e) { total.errores++; console.error('[recordatorios]', e.code || e.message); }
  }
  return total;
}
