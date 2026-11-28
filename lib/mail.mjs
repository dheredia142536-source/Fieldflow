// Envío de correo transaccional con Brevo (https://www.brevo.com): código de verificación y recuperación de contraseña.
// Transactional email via Brevo: verification code and password recovery.
// Variables: BREVO_API_KEY (clave v3 de la API), MAIL_FROM (remitente verificado en Brevo; admite "Nombre <correo@dominio>"), MAIL_FROM_NAME (opcional).
export const mailConfigured = () => !!(process.env.BREVO_API_KEY && process.env.MAIL_FROM);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Acepta "correo@dominio.com" o "Nombre <correo@dominio.com>".
export function parseSender(from, fallbackName = 'FieldFlow') {
  const raw = String(from || '').trim();
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const email = (m ? m[2] : raw).trim();
  const name = (m && m[1].trim()) || fallbackName;
  return { name, email };
}

const copy = {
  es: {
    verify: {
      subject: (code) => `${code} es tu código de FieldFlow`,
      title: 'Verifica tu correo',
      intro: (name) => `Hola${name ? ` ${name}` : ''}, usa este código para terminar de crear tu cuenta en FieldFlow:`,
    },
    reset: {
      subject: (code) => `${code} es tu código para recuperar tu contraseña`,
      title: 'Recupera tu contraseña',
      intro: (name) => `Hola${name ? ` ${name}` : ''}, usa este código para crear una contraseña nueva en FieldFlow:`,
    },
    expires: (min) => `El código vence en ${min} minutos. Si no fuiste tú, ignora este mensaje.`,
  },
  en: {
    verify: {
      subject: (code) => `${code} is your FieldFlow code`,
      title: 'Verify your email',
      intro: (name) => `Hi${name ? ` ${name}` : ''}, use this code to finish creating your FieldFlow account:`,
    },
    reset: {
      subject: (code) => `${code} is your password reset code`,
      title: 'Reset your password',
      intro: (name) => `Hi${name ? ` ${name}` : ''}, use this code to set a new FieldFlow password:`,
    },
    expires: (min) => `The code expires in ${min} minutes. If this wasn't you, ignore this message.`,
  },
};

function codeEmail(kind, { code, name, lang, minutes }) {
  const L = copy[lang === 'en' ? 'en' : 'es'];
  const c = L[kind];
  const text = `${c.intro(name)}\n\n${code}\n\n${L.expires(minutes)}\n`;
  const html = `<div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#262320">
<h1 style="font-size:24px;font-weight:500;letter-spacing:-0.03em;margin:0 0 12px">${esc(c.title)}</h1>
<p style="margin:0 0 16px;line-height:1.45">${esc(c.intro(name))}</p>
<p style="font-size:32px;letter-spacing:8px;font-weight:600;margin:0 0 16px;color:#2052eb;font-family:ui-monospace,Menlo,monospace">${esc(code)}</p>
<p style="margin:0;color:#6b6762;font-size:14px;line-height:1.5">${esc(L.expires(minutes))}</p></div>`;
  return { subject: c.subject(code), text, html };
}

export const verificationEmail = (o) => codeEmail('verify', o);
export const resetEmail = (o) => codeEmail('reset', o);

export async function sendMail({ to, subject, text, html, replyTo, senderName }) {
  const sender = parseSender(process.env.MAIL_FROM, process.env.MAIL_FROM_NAME || 'FieldFlow');
  if (senderName) sender.name = senderName;
  const res = await fetch(`${(process.env.BREVO_API_BASE || 'https://api.brevo.com').replace(/\/$/, '')}/v3/smtp/email`, {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text, htmlContent: html, ...(replyTo ? { replyTo } : {}) }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
