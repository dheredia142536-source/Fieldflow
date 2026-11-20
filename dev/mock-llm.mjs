// LLM de mentira (compatible con OpenAI) para probar el bucle de herramientas sin red.
// Fake OpenAI-compatible LLM to exercise the tool loop offline. Dev/test only.
const lastUser = (messages) => [...messages].reverse().find((m) => m.role === 'user')?.content || '';
const findCode = (messages, kind) => {
  for (const m of [...messages].reverse()) {
    if (m.role !== 'user') continue;
    const hit = String(m.content).match(new RegExp(`\\(${kind}:([^)]*)\\)`));
    if (hit) return hit[1];
  }
  return null;
};
const call = (name, args) => ({
  role: 'assistant', content: null,
  tool_calls: [{ id: `call_${Math.random().toString(36).slice(2, 8)}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
});
const say = (content) => ({ role: 'assistant', content });

function nextWorkday() {
  const d = new Date(Date.now() - 5 * 3600000);
  do { d.setUTCDate(d.getUTCDate() + 1); } while ([0, 6].includes(d.getUTCDay()));
  return d.toISOString().slice(0, 10);
}

export function mockCompletion(body) {
  const { messages } = body;
  const last = messages[messages.length - 1];
  if (last.role === 'tool') {
    const result = JSON.parse(last.content);
    const prev = [...messages].reverse().find((m) => m.tool_calls);
    const name = prev?.tool_calls?.[0]?.function?.name;
    if (result.error) return say(`No pude completarlo (${result.error}).`);
    if (name === 'consultar_disponibilidad') return say(result.horarios?.length ? 'Estos son los horarios libres. ¿Cuál prefieres?' : 'No hay horarios ese día.');
    if (name === 'solicitar_confirmacion') return say('Revisa los datos y confirma, por favor.');
    if (name === 'crear_cita') return say('Listo, tu cita quedó creada.');
    if (name === 'listar_servicios') return say('Estos son nuestros servicios.');
    return say('Hecho.');
  }
  const u = lastUser(messages);
  if (/FORCE_429/.test(u)) return { __status: 429 };
  if (/\(confirm\)/.test(u)) {
    const slot = findCode(messages, 'slot');
    if (!slot) return say('¿Qué horario quieres confirmar?');
    const [svc, inicio, res] = slot.split('|');
    return call('crear_cita', { servicio_id: svc, inicio, recurso_id: res, confirmado: true });
  }
  const slot = /\(slot:/.test(u) ? findCode([{ role: 'user', content: u }], 'slot') : null;
  if (slot) { const [svc, inicio, res] = slot.split('|'); return call('solicitar_confirmacion', { accion: 'crear', servicio_id: svc, inicio, recurso_id: res }); }
  const day = findCode([{ role: 'user', content: u }], 'day');
  if (day) { const [svc, fecha] = day.split('|'); return call('consultar_disponibilidad', { servicio_id: svc, fecha }); }
  const svc = findCode([{ role: 'user', content: u }], 'svc');
  if (svc) return call('consultar_disponibilidad', { servicio_id: svc, fecha: nextWorkday() });
  if (/servicios|services/i.test(u)) return call('listar_servicios', {});
  return say('Hola, ¿qué servicio necesitas agendar?');
}
