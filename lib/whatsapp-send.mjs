// Envío por la WhatsApp Cloud API. Sólo se usa para entregar el enlace a la PWA.
// Sending via the WhatsApp Cloud API. Only used to deliver the PWA link.
export const waConfigured = () => !!(process.env.WHATSAPP_TOKEN && process.env.PHONE_NUMBER_ID);

export async function sendCtaLink({ to, body, buttonText, url }) {
  const version = process.env.GRAPH_VERSION || 'v23.0';
  const res = await fetch(`https://graph.facebook.com/${version}/${process.env.PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: body },
        action: { name: 'cta_url', parameters: { display_text: buttonText.slice(0, 20), url } },
      },
    }),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
