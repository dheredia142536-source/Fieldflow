// Envío de correo transaccional con Resend (https://resend.com). Sólo se usa para el código de verificación.
// Transactional email via Resend. Only used for the verification code.
export const mailConfigured = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const copy = {
  es: {
    subject: (code) => `${code} es tu código de FieldFlow`,
    title: 'Verifica tu correo',
    intro: (name) => `Hola${name ? ` ${name}` : ''}, usa este código para terminar de crear tu cuenta en FieldFlow:`,
    expires: (min) => `El código vence en ${min} minutos. Si no fuiste tú, ignora este mensaje.`,
  },
  en: {
    subject: (code) => `${code} is your FieldFlow code`,
    title: 'Verify your email',
    intro: (name) => `Hi${name ? ` ${name}` : ''}, use this code to finish creating your FieldFlow account:`,
    expires: (min) => `The code expires in ${min} minutes. If this wasn't you, ignore this message.`,
  },
};

export function verificationEmail({ code, name, lang, minutes }) {
  const c = copy[lang === 'en' ? 'en' : 'es'];
  const text = `${c.intro(name)}\n\n${code}\n\n${c.expires(minutes)}\n`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1b1d17">
<h1 style="font-size:20px;margin:0 0 12px">${esc(c.title)}</h1>
<p style="margin:0 0 16px;line-height:1.5">${esc(c.intro(name))}</p>
<p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:0 0 16px;font-family:ui-monospace,Menlo,monospace">${esc(code)}</p>
<p style="margin:0;color:#555;font-size:14px;line-height:1.5">${esc(c.expires(minutes))}</p></div>`;
  return { subject: c.subject(code), text, html };
}

export async function sendMail({ to, subject, text, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
