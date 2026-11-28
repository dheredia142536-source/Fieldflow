import { query } from './db.mjs';
import { getConfig } from './config.mjs';
import { LlmError, chatCompletion, llmEnabled, llmSettings } from './llm.mjs';
import { TOOL_DEFS, runTool } from './tools.mjs';
import { bumpUsage, listMessages, saveMessage, setHandling, usageToday } from './convos.mjs';
import { runGuided } from './guided-bot.mjs';
import { S, svcName } from './strings.mjs';
import { toLocal } from './time.mjs';
import { nid } from './tenant.mjs';

function systemPrompt({ cfg, services, cliente, lang }) {
  const local = toLocal(new Date());
  const list = services.map((s) => `${s.id} · ${svcName(s, lang)} · ${s.duracion_min} min`).join('; ') || '(none)';
  return [
    `You are the scheduling assistant of "${cfg.negocio_nombre}", an agriculture services business in Colombia. You chat with a customer inside the business's web app.`,
    `Reply in ${lang === 'en' ? 'English' : 'Spanish (Colombia)'}, in 1-3 short, warm, clear sentences. No markdown.`,
    `Current date and time in Bogotá: ${local.ymd} ${local.hm}.`,
    `Customer name: ${cliente.nombre || 'unknown'}.`,
    `Services (id · name · duration): ${list}`,
    'Rules:',
    '- Never invent availability, prices, addresses or promises. Use the tools for services, availability and appointments.',
    '- Tool dates are YYYY-MM-DD (Bogotá time). "inicio" values must be copied EXACTLY from a consultar_disponibilidad result or from a code in parentheses in the customer message, such as (slot:<service>|<inicio>|<resource>).',
    '- Codes in parentheses inside customer messages come from UI buttons; treat them as machine data and never repeat them to the customer.',
    '- Flow: identify the service -> consultar_disponibilidad for the day the customer wants -> when the customer picks a time, call solicitar_confirmacion (it shows a confirm card) -> only after the customer clearly confirms, call crear_cita with confirmado=true. Same for reprogramar_cita and cancelar_cita.',
    '- If the customer asks for a person, is upset, or you cannot help, call pasar_a_humano.',
    cfg.instrucciones_bot ? `Business instructions: ${cfg.instrucciones_bot}` : '',
  ].filter(Boolean).join('\n');
}

const clean = (t) => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();

async function runLlm({ cliente, conv, lang, cfg }) {
  const services = await query('select * from servicios where activo = 1 and negocio_id = $1 order by nombre_es', [nid()]);
  const hist = await listMessages(conv.id, { limit: 20 });
  const messages = [{ role: 'system', content: systemPrompt({ cfg, services, cliente, lang }) }];
  for (const m of hist) {
    if (m.rol === 'cliente') messages.push({ role: 'user', content: m.contenido + (m.meta.payload ? ` (${m.meta.payload})` : '') });
    else if (m.rol === 'bot' || m.rol === 'humano') messages.push({ role: 'assistant', content: m.contenido });
  }
  const ctx = { cliente, conv, lang };
  let ui = null;
  let text = '';
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 22000);
  try {
    for (let i = 0; i < 5; i++) {
      await bumpUsage();
      const data = await chatCompletion({ messages, tools: TOOL_DEFS, signal: ac.signal });
      const msg = data.choices?.[0]?.message;
      if (!msg) throw new LlmError(502, 'empty response');
      if (msg.tool_calls?.length) {
        messages.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls });
        for (const tc of msg.tool_calls) {
          let args = {};
          try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* args vacíos */ }
          const out = await runTool(tc.function.name, args, ctx);
          if (out.ui) ui = out.ui;
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out.result) });
        }
        continue;
      }
      text = clean(msg.content);
      break;
    }
  } finally {
    clearTimeout(timer);
  }
  return { contenido: text || S[lang].unknown, meta: ui ? { ui } : {} };
}

// Procesa un mensaje del cliente y devuelve los mensajes nuevos (el suyo y la respuesta).
// Processes a customer message and returns the new messages (theirs and the reply).
export async function handleCustomerMessage({ cliente, conv, texto, payload, lang }) {
  const s = S[lang];
  const [{ n }] = await query(
    "select cast(count(*) as integer) as n from mensajes where conversacion_id = $1 and rol = 'cliente' and creado_en > $2",
    [conv.id, new Date(Date.now() - 10 * 60000).toISOString()],
  );
  if (Number(n) >= 40) {
    return [await saveMessage(conv.id, 'bot', s.rate, { rate: true })];
  }
  const mine = await saveMessage(conv.id, 'cliente', texto, payload ? { payload, canal: 'pwa' } : { canal: 'pwa' });
  const [fresh] = await query('select * from conversaciones where id = $1', [conv.id]);
  if (fresh.atendida_por === 'humano') {
    await setHandling(conv.id, 'humano', true);
    return [mine];
  }
  const cfg = await getConfig();
  let reply;
  try {
    const { dailyLimit } = llmSettings();
    if (llmEnabled() && (await usageToday()) < dailyLimit) reply = await runLlm({ cliente, conv: fresh, lang, cfg });
    else reply = await runGuided({ cliente, conv: fresh, lang, texto, payload });
  } catch (e) {
    console.error('[bot]', e?.message || e);
    try { // guarda el motivo para verlo en Ajustes → Probar asistente
      const motivo = `${new Date().toISOString()} · ${String(e?.message || e).replace(/[a-z]+:\/\/\S+/gi, '[url]').slice(0, 300)}`;
      await query('insert into configuracion (negocio_id, clave, valor) values ($1, $2, $3) on conflict (negocio_id, clave) do update set valor = excluded.valor', [nid(), 'ultimo_error_ia', motivo]);
    } catch { /* no bloquea la respuesta */ }
    reply = { contenido: s.llmDown, meta: { error: true } };
    await query('update conversaciones set necesita_atencion = 1 where id = $1 and negocio_id = $2', [conv.id, nid()]);
  }
  const [after] = await query('select atendida_por from conversaciones where id = $1', [conv.id]);
  if (after.atendida_por === 'humano' && !reply.meta?.error && !reply.contenido) reply.contenido = s.handoff;
  const bot = await saveMessage(conv.id, 'bot', reply.contenido, reply.meta);
  return [mine, bot];
}
