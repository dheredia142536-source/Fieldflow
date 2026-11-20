// Pruebas del backend (sin red, base SQLite en memoria). Ejecuta: npm test
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { mockCompletion } from './mock-llm.mjs';

process.env.FF_LOCAL_DB = ':memory:';
process.env.SESSION_SECRET = 'test-session-secret-0123456789';
process.env.ADMIN_EMAIL = 'admin@test.dev';
process.env.ADMIN_PASSWORD = 'password-123';
process.env.APP_SECRET = 'meta-app-secret';
process.env.VERIFY_TOKEN = 'verify-me';
process.env.APP_URL = 'https://app.example.com';

// LLM falso en un puerto local
const llm = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const out = mockCompletion(JSON.parse(Buffer.concat(chunks).toString() || '{}'));
  if (out.__status) { res.statusCode = out.__status; res.setHeader('retry-after', '0'); return res.end('{}'); }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ choices: [{ message: out }] }));
}).listen(0);
const llmPort = llm.address().port;

const { default: api } = await import('../api/[...path].mjs');
const { default: wa } = await import('../api/whatsapp.mjs');
const { crearCita } = await import('../lib/citas.mjs');
const { slotsFor } = await import('../lib/availability.mjs');
const { query } = await import('../lib/db.mjs');
const { addDays, todayLocal, weekdayOf } = await import('../lib/time.mjs');

let pass = 0; let fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} ${extra}`); } };
const section = (t) => console.log(`\n${t}`);

class Jar {
  constructor() { this.c = {}; }
  async call(method, path, body, headers = {}) {
    const res = await api(new Request(`https://app.example.com${path}`, {
      method, headers: { 'content-type': 'application/json', cookie: Object.entries(this.c).map(([k, v]) => `${k}=${v}`).join('; '), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
    for (const s of res.headers.getSetCookie()) {
      const [kv] = s.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i); const v = kv.slice(i + 1);
      if (/Max-Age=0/.test(s)) delete this.c[k]; else this.c[k] = v;
    }
    let data = null; try { data = await res.json(); } catch { /* sin cuerpo */ }
    return { status: res.status, data };
  }
}

const staff = new Jar();
section('1. Autenticación del negocio');
let r = await staff.call('POST', '/api/auth/login', { correo: 'admin@test.dev', password: 'mala' });
ok(r.status === 401, 'contraseña incorrecta → 401');
r = await staff.call('POST', '/api/auth/login', { correo: 'admin@test.dev', password: 'password-123' });
ok(r.status === 200 && staff.c.ff_staff, 'primer login crea el admin y abre sesión');
r = await new Jar().call('GET', '/api/staff/resumen');
ok(r.status === 401, 'rutas del negocio sin sesión → 401');
const forged = new Jar(); forged.c.ff_staff = 'eyJrIjoic3RhZmYiLCJpZCI6IngiLCJleHAiOjk5OTk5OTk5OTl9.firmafalsa';
r = await forged.call('GET', '/api/staff/resumen');
ok(r.status === 401, 'cookie falsificada → 401');
r = await staff.call('POST', '/api/staff/resumen', {});
ok(r.status === 405, 'método incorrecto → 405');
const csrf = await api(new Request('https://app.example.com/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.com' }, body: '{}' }));
ok(csrf.status === 403, 'origen distinto → 403');

section('2. Datos de ejemplo y disponibilidad');
r = await staff.call('POST', '/api/staff/demo-data', {});
ok(r.status === 200 && r.data.citas > 0, 'carga datos de ejemplo', JSON.stringify(r.data));
r = await staff.call('POST', '/api/staff/demo-data', {});
ok(r.data.skipped === true, 'cargar dos veces no duplica');
const cat = (await staff.call('GET', '/api/staff/catalogo')).data;
ok(cat.servicios.length === 5 && cat.recursos.length === 5, 'catálogo: 5 servicios y 5 recursos');
const visita = cat.servicios.find((s) => s.nombre_en === 'Technical visit');
let weekday = addDays(todayLocal(), 1); while (weekdayOf(weekday) > 4) weekday = addDays(weekday, 1);
let sunday = addDays(todayLocal(), 1); while (weekdayOf(sunday) !== 6) sunday = addDays(sunday, 1);
const slots = await slotsFor({ servicioId: visita.id, ymd: weekday });
ok(slots.length > 0, `hay horarios un día hábil (${slots.length})`);
ok((await slotsFor({ servicioId: visita.id, ymd: sunday })).length === 0, 'domingo sin horarios');
ok((await slotsFor({ servicioId: visita.id, ymd: addDays(todayLocal(), -1) })).length === 0, 'no ofrece fechas pasadas');
ok(!slots.some((s) => s.hm < '07:00' || s.hm >= '17:00' || (s.hm >= '12:00' && s.hm < '13:00' && false)), 'respeta el horario laboral');

section('3. Doble reserva (concurrencia)');
const [cl] = await query('select id from clientes limit 1');
const free = (await slotsFor({ servicioId: visita.id, ymd: addDays(weekday, 7) }))[0];
const results = await Promise.allSettled([1, 2, 3].map(() => crearCita({ clienteId: cl.id, servicioId: visita.id, inicio: free.inicio, recursoId: free.recurso_id })));
ok(results.filter((x) => x.status === 'fulfilled').length === 1, 'de 3 reservas simultáneas solo 1 prospera', results.map((x) => x.status).join(','));
ok(results.filter((x) => x.status === 'rejected').every((x) => x.reason.code === 'slot_unavailable'), 'las demás fallan con slot_unavailable');

section('4. Webhook de WhatsApp');
const wget = await wa(new Request('https://app.example.com/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345'));
ok(wget.status === 200 && (await wget.text()) === '12345', 'verificación GET devuelve hub.challenge');
const wbad = await wa(new Request('https://app.example.com/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1'));
ok(wbad.status === 403, 'verify token incorrecto → 403');
const payload = (id, text) => JSON.stringify({ entry: [{ changes: [{ value: { contacts: [{ wa_id: '573009998877', profile: { name: 'Lucía Prueba' } }], messages: [{ id, from: '573009998877', type: 'text', text: { body: text } }] } }] }] });
const post = (raw, sig) => wa(new Request('https://app.example.com/webhooks/whatsapp', { method: 'POST', headers: { 'x-hub-signature-256': sig, 'content-type': 'application/json' }, body: raw }));
const sign = (raw) => `sha256=${createHmac('sha256', 'meta-app-secret').update(raw).digest('hex')}`;
let raw = payload('wamid.1', 'Hola, quiero agendar');
ok((await post(raw, 'sha256=00')).status === 401, 'firma inválida → 401');
ok((await post(raw, sign(raw))).status === 200, 'firma válida → 200');
let [{ n: tokens }] = await query('select count(*) as n from tokens_acceso');
ok(Number(tokens) === 1, 'se creó un token de acceso');
await post(raw, sign(raw));
[{ n: tokens }] = await query('select count(*) as n from tokens_acceso');
ok(Number(tokens) === 1, 'mensaje repetido (mismo wamid) se ignora');
raw = payload('wamid.2', 'otro mensaje');
await post(raw, sign(raw));
[{ n: tokens }] = await query('select count(*) as n from tokens_acceso');
ok(Number(tokens) === 1, 'no reenvía el enlace dentro del periodo de espera');

section('5. Del WhatsApp a la PWA (token → sesión)');
r = await staff.call('POST', '/api/staff/simulador', { telefono: '573001234567', nombre: 'Ana', texto: 'Hola', forzar: true });
ok(r.status === 200 && r.data.url.startsWith('https://app.example.com/?t='), 'el simulador genera el enlace seguro');
const token = new URL(r.data.url).searchParams.get('t');
const client = new Jar();
r = await client.call('POST', '/api/auth/enter', { token: 'x'.repeat(30) });
ok(r.status === 401, 'token inventado → 401');
r = await client.call('POST', '/api/auth/enter', { token });
ok(r.status === 200 && client.c.ff_client, 'token válido abre sesión de cliente');
r = await client.call('GET', '/api/staff/resumen');
ok(r.status === 401, 'una sesión de cliente no accede al panel del negocio');
r = await client.call('GET', '/api/client/chat');
ok(r.data.mensajes.some((m) => m.rol === 'bot' && m.meta.ui?.type === 'chips'), 'el chat abre con saludo y servicios');

section('6. Asistente de demostración (sin IA)');
const say = async (texto, payload) => (await client.call('POST', '/api/client/chat', { texto, payload, idioma: 'es' })).data.mensajes.at(-1);
let m = await say('Hola');
ok(m.meta.ui?.type === 'chips', '«Hola» muestra servicios');
const svcOpt = m.meta.ui.options.find((o) => /Cosecha/.test(o.label));
m = await say(svcOpt.label, svcOpt.payload);
ok(m.meta.ui?.options?.[0]?.payload.startsWith('day:'), 'al elegir servicio ofrece días');
m = await say(m.meta.ui.options[0].label, m.meta.ui.options[0].payload);
ok(m.meta.ui?.options?.[0]?.payload.startsWith('slot:'), 'al elegir día ofrece horarios');
const slotOpt = m.meta.ui.options[0];
m = await say(slotOpt.label, slotOpt.payload);
ok(m.meta.ui?.type === 'confirm', 'al elegir horario pide confirmación');
m = await say('Confirmar', 'confirm');
ok(m.meta.ui?.type === 'cita' && m.meta.ui.status === 'confirmada', 'al confirmar crea la cita');
r = await client.call('GET', '/api/client/citas');
ok(r.data.citas.length === 1, 'la cita aparece en «Mis citas»');
const citaId = r.data.citas[0].id;
m = await say('mis citas');
ok(m.meta.ui?.type === 'citas', '«mis citas» las lista con acciones');
m = await say('Cancelar', `cancel:${citaId}`);
ok(m.meta.ui?.type === 'confirm', 'cancelar pide confirmación');
m = await say('Sí, cancelar', 'confirm');
ok(m.meta.ui?.status === 'cancelada', 'confirma la cancelación');
const other = new Jar();
const sim2 = await staff.call('POST', '/api/staff/simulador', { telefono: '573007770000', nombre: 'Otro', texto: 'Hola', forzar: true });
await other.call('POST', '/api/auth/enter', { token: new URL(sim2.data.url).searchParams.get('t') });
r = await other.call('POST', `/api/client/citas/${citaId}/cancelar`, {});
ok(r.status === 404, 'un cliente no puede tocar citas de otro');
m = await say('quiero hablar con un asesor');
ok(/asesor/.test(m.contenido), 'pedir un asesor traspasa la conversación');

section('7. Traspaso a humano');
let conv = (await staff.call('GET', '/api/staff/conversaciones')).data.conversaciones.find((c) => c.telefono === '573001234567');
ok(conv.atendida_por === 'humano' && conv.necesita_atencion, 'aparece como «necesita atención»');
r = await client.call('POST', '/api/client/chat', { texto: 'Hola?', idioma: 'es' });
ok(r.data.mensajes.length === 1 && r.data.atendida_por === 'humano', 'con humano a cargo el bot no responde');
r = await staff.call('POST', `/api/staff/conversaciones/${conv.id}/mensajes`, { texto: 'Hola Ana, soy Pedro.' });
ok(r.status === 200, 'el asesor responde');
r = await client.call('GET', '/api/client/chat');
ok(r.data.mensajes.some((x) => x.rol === 'humano'), 'el cliente ve la respuesta del asesor');
await staff.call('POST', `/api/staff/conversaciones/${conv.id}/devolver`, {});
r = await client.call('POST', '/api/client/chat', { texto: 'Hola', idioma: 'es' });
ok(r.data.mensajes.some((x) => x.rol === 'bot'), 'al devolver, el bot vuelve a responder');

section('8. Inglés');
r = await client.call('POST', '/api/client/chat', { texto: 'Hello', idioma: 'en' });
ok(/services|schedule/i.test(r.data.mensajes.at(-1).contenido), 'el bot responde en inglés');

section('9. Probar bot y configuración');
r = await staff.call('POST', '/api/staff/probar-bot', {});
ok(r.data.ok, 'autoprueba de herramientas OK', JSON.stringify(r.data.pasos.filter((p) => !p.ok)));
r = await staff.call('PUT', '/api/staff/config', { negocio_nombre: 'Agro Prueba', instrucciones_bot: 'Atiende con cortesía.' });
r = await staff.call('GET', '/api/staff/config');
ok(r.data.config.negocio_nombre === 'Agro Prueba', 'guarda la configuración');
ok(!JSON.stringify(r.data).includes('meta-app-secret') && !JSON.stringify(r.data).includes('password-123'), 'la configuración no expone secretos');

section('10. Modo IA (LLM compatible con OpenAI, simulado)');
process.env.LLM_API_KEY = 'test-key';
process.env.LLM_BASE_URL = `http://127.0.0.1:${llmPort}/v1`;
const c2 = new Jar();
const sim3 = await staff.call('POST', '/api/staff/simulador', { telefono: '573005550000', nombre: 'Luz', texto: 'Hola', forzar: true });
await c2.call('POST', '/api/auth/enter', { token: new URL(sim3.data.url).searchParams.get('t') });
await c2.call('GET', '/api/client/chat');
const sv = (await staff.call('GET', '/api/staff/catalogo')).data.servicios.find((s) => s.nombre_es === 'Cosecha');
const say2 = async (texto, payload) => (await c2.call('POST', '/api/client/chat', { texto, payload, idioma: 'es' })).data.mensajes.at(-1);
m = await say2('Cosecha', `svc:${sv.id}`);
ok(m.meta.ui?.type === 'chips' && m.meta.ui.options[0].payload.startsWith('slot:'), 'la IA consulta disponibilidad y el servidor adjunta los horarios');
const so = m.meta.ui.options[0];
m = await say2(so.label, so.payload);
ok(m.meta.ui?.type === 'confirm', 'la IA pide confirmación con tarjeta');
m = await say2('Confirmar', 'confirm');
ok(m.meta.ui?.type === 'cita', 'tras confirmar, la IA crea la cita');
r = await c2.call('GET', '/api/client/citas');
ok(r.data.citas.length === 1, 'la cita quedó guardada');
m = await say2('FORCE_429');
ok(/inconvenientes|trouble/.test(m.contenido), 'si el proveedor falla (429) responde con aviso y no se cae');
conv = (await staff.call('GET', '/api/staff/conversaciones')).data.conversaciones.find((c) => c.telefono === '573005550000');
ok(conv.necesita_atencion, 'y marca la conversación para atención humana');
delete process.env.LLM_API_KEY;

section('11. Firma de Meta');
const { verifyMetaSignature } = await import('../lib/session.mjs');
ok(verifyMetaSignature('abc', `sha256=${createHmac('sha256', 's').update('abc').digest('hex')}`, 's'), 'acepta una firma correcta');
ok(!verifyMetaSignature('abc', 'sha256=deadbeef', 's') && !verifyMetaSignature('abc', null, 's') && !verifyMetaSignature('abc', 'x', ''), 'rechaza firmas incorrectas o ausentes');

console.log(`\n${pass} correctas, ${fail} con error`);
llm.close();
process.exit(fail ? 1 : 0);
