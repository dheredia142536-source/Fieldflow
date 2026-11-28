// Pruebas del backend (sin red, base SQLite en memoria). Ejecuta: npm test
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mockCompletion } from './mock-llm.mjs';

process.env.FF_LOCAL_DB = process.env.FF_TEST_PG ? '' : ':memory:'; if (process.env.FF_TEST_PG) process.env.DATABASE_URL = process.env.FF_TEST_PG;
process.env.SESSION_SECRET = 'test-session-secret-0123456789';
process.env.ADMIN_EMAIL = 'admin@test.dev';
process.env.ADMIN_PASSWORD = 'password-123';
process.env.APP_SECRET = 'meta-app-secret';
process.env.VERIFY_TOKEN = 'verify-me';
process.env.APP_URL = 'https://app.example.com';
process.env.FF_DEV_CODES = '1'; // el código de verificación viaja en la respuesta (nunca en producción)
delete process.env.BREVO_API_KEY;
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;

// LLM falso en un puerto local
const llm = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const out = mockCompletion(JSON.parse(Buffer.concat(chunks).toString() || '{}'));
  if (out.__status) { res.statusCode = out.__status; res.setHeader('retry-after', '0'); return res.end('{}'); }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ choices: [{ message: out }] }));
}).listen(0);
const llmPort = llm.address().port;

const { GET: api } = await import('../api/router.mjs');
const { POST: wa } = await import('../api/whatsapp.mjs');
const { crearCita: crearCita0 } = await import('../lib/citas.mjs');
const { slotsFor: slotsFor0 } = await import('../lib/availability.mjs');
const { withNegocio } = await import('../lib/tenant.mjs');
let NID = null; // negocio del administrador (se conoce tras el primer login)
const crearCita = (a) => withNegocio(NID, () => crearCita0(a));
const slotsFor = (a) => withNegocio(NID, () => slotsFor0(a));
const { query } = await import('../lib/db.mjs');
const { handleInbound } = await import('../lib/inbound.mjs');
const { loadDemoData } = await import('./fixtures.mjs');
// Datos de prueba: solo existen en las pruebas, nunca en el producto.
const seed = (nid) => withNegocio(nid, () => loadDemoData());
// Simula el mensaje entrante de WhatsApp que genera el enlace seguro (llama a la misma lógica del webhook).
const enlace = (nid, telefono, nombre) => withNegocio(nid, () => handleInbound({ phone: telefono, name: nombre, text: 'Hola', origin: 'https://app.example.com' }));
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
[{ id: NID }] = await query('select id from negocios where principal = 1');
ok(!!NID, 'el negocio del administrador es el principal');
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
r = { data: await seed(NID) };
ok(r.data.citas > 0, 'carga datos de prueba', JSON.stringify(r.data));
r = { data: await seed(NID) };
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
r = { data: await enlace(NID, '573001234567', 'Ana') };
ok(r.data.url.startsWith('https://app.example.com/?t='), 'el mensaje de WhatsApp genera el enlace seguro');
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
const sim2 = { data: await enlace(NID, '573007770000', 'Otro') };
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

section('9. Configuración');
r = await staff.call('PUT', '/api/staff/config', { negocio_nombre: 'Agro Prueba', instrucciones_bot: 'Atiende con cortesía.' });
r = await staff.call('GET', '/api/staff/config');
ok(r.data.config.negocio_nombre === 'Agro Prueba', 'guarda la configuración');
ok(!JSON.stringify(r.data).includes('meta-app-secret') && !JSON.stringify(r.data).includes('password-123'), 'la configuración no expone secretos');

section('10. Modo IA (LLM compatible con OpenAI, simulado)');
process.env.LLM_API_KEY = 'test-key';
process.env.LLM_BASE_URL = `http://127.0.0.1:${llmPort}/v1`;
const c2 = new Jar();
const sim3 = { data: await enlace(NID, '573005550000', 'Luz') };
await c2.call('POST', '/api/auth/enter', { token: new URL(sim3.data.url).searchParams.get('t') });
await c2.call('GET', '/api/client/chat');
const sv = (await staff.call('GET', '/api/staff/catalogo')).data.servicios.find((s) => s.nombre_es === 'Cosecha');
// Los datos de ejemplo pueden dejar ocupado todo el próximo día hábil (que es el que consulta la IA simulada): se libera para esta prueba.
{ const dd = new Date(Date.now() - 5 * 3600000); do { dd.setUTCDate(dd.getUTCDate() + 1); } while ([0, 6].includes(dd.getUTCDay())); await query('delete from citas where cast(inicio as text) like $1 and recurso_id in (select recurso_id from servicio_recurso where servicio_id = $2)', [`${dd.toISOString().slice(0, 10)}%`, sv.id]); }
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

section('12. Registro con código por correo');
const reg = (over = {}) => ({
  empresa: 'Finca Los Cedros', nombre: 'María Pérez', correo: 'maria@cedros.co', telefono: '573001112233', password: 'clave-segura-1',
  tipo: 'finca', departamento: 'Meta', municipio: 'Villavicencio', fines: ['agendar', 'whatsapp'], acepta: true, idioma: 'es', ...over,
});
const anon = new Jar();
r = await anon.call('POST', '/api/auth/registro', reg({ acepta: false }));
ok(r.status === 400 && r.data.error === 'terms_required', 'exige aceptar los términos');
r = await anon.call('POST', '/api/auth/registro', reg({ password: '123' }));
ok(r.status === 400 && r.data.error === 'weak_password', 'rechaza contraseñas cortas');
r = await anon.call('POST', '/api/auth/registro', reg({ correo: 'no-es-correo' }));
ok(r.status === 400 && r.data.error === 'invalid_email', 'rechaza correos inválidos');
r = await anon.call('POST', '/api/auth/registro', reg({ fines: [] }));
ok(r.status === 400 && r.data.error === 'purposes_required', 'exige al menos un fin');
r = await anon.call('POST', '/api/auth/registro', reg({ correo: 'admin@test.dev' }));
ok(r.status === 409 && r.data.error === 'email_taken', 'no permite registrar el correo del administrador');
r = await anon.call('POST', '/api/auth/registro', reg());
ok(r.status === 200 && /^\d{6}$/.test(r.data.codigo_dev || ''), 'registro válido envía un código de 6 dígitos');
const code = r.data.codigo_dev;
let [{ n: usersBefore }] = await query("select count(*) as n from usuarios_negocio where correo = 'maria@cedros.co'");
ok(Number(usersBefore) === 0, 'la cuenta NO existe hasta verificar el código');
r = await anon.call('POST', '/api/auth/login', { correo: 'maria@cedros.co', password: 'clave-segura-1' });
ok(r.status === 401, 'sin verificar no se puede iniciar sesión');
r = await anon.call('POST', '/api/auth/registro', reg());
ok(r.status === 429 && r.data.error === 'wait_before_resend', 'no permite reenviar de inmediato (espera 60 s)');
const wrong = code === '000000' ? '111111' : '000000';
r = await anon.call('POST', '/api/auth/registro/verificar', { correo: 'maria@cedros.co', codigo: wrong });
ok(r.status === 400 && r.data.error === 'code_invalid' && r.data.restantes === 4, 'código incorrecto → error y cuenta de intentos restantes', JSON.stringify(r.data));
r = await anon.call('POST', '/api/auth/registro/verificar', { correo: 'maria@cedros.co', codigo: code });
ok(r.status === 200 && anon.c.ff_staff && r.data.negocio === 'Finca Los Cedros', 'código correcto crea la cuenta y abre sesión');
r = await anon.call('GET', '/api/auth/me');
ok(r.data.staff?.correo === 'maria@cedros.co' && r.data.staff.negocio === 'Finca Los Cedros', 'la sesión pertenece al nuevo negocio');
r = await anon.call('POST', '/api/auth/registro/verificar', { correo: 'maria@cedros.co', codigo: code });
ok(r.status === 400, 'el código no se puede usar dos veces');
const again = new Jar();
r = await again.call('POST', '/api/auth/login', { correo: 'MARIA@cedros.co', password: 'clave-segura-1' });
ok(r.status === 200, 'puede iniciar sesión con su correo y contraseña (sin importar mayúsculas)');
r = await new Jar().call('POST', '/api/auth/registro', reg());
ok(r.status === 409 && r.data.error === 'email_taken', 'un correo ya registrado no se puede volver a registrar');

// Intentos limitados: 5 fallos invalidan el registro.
const bruteJar = new Jar();
r = await bruteJar.call('POST', '/api/auth/registro', reg({ correo: 'fuerza@bruta.co' }));
const real = r.data.codigo_dev; const bad = real === '123456' ? '654321' : '123456';
let last;
for (let i = 0; i < 6; i++) last = await bruteJar.call('POST', '/api/auth/registro/verificar', { correo: 'fuerza@bruta.co', codigo: bad });
ok(last.status === 429 && last.data.error === 'too_many_attempts', 'tras 5 intentos fallidos se bloquea el registro');
r = await bruteJar.call('POST', '/api/auth/registro/verificar', { correo: 'fuerza@bruta.co', codigo: real });
ok(r.status === 400, 'ni siquiera el código correcto sirve después del bloqueo');

// Vencimiento del código
r = await bruteJar.call('POST', '/api/auth/registro', reg({ correo: 'tarde@cedros.co' }));
await query("update registros_pendientes set expira_en = $1 where correo = 'tarde@cedros.co'", [new Date(Date.now() - 1000).toISOString()]);
r = await bruteJar.call('POST', '/api/auth/registro/verificar', { correo: 'tarde@cedros.co', codigo: r.data.codigo_dev });
ok(r.status === 410 && r.data.error === 'code_expired', 'un código vencido se rechaza');

// Reenvío: nuevo código, el anterior deja de servir
const rs = new Jar();
r = await rs.call('POST', '/api/auth/registro', reg({ correo: 'reenvio@cedros.co' }));
const c1 = r.data.codigo_dev;
await query("update registros_pendientes set ultimo_envio_en = $1 where correo = 'reenvio@cedros.co'", [new Date(Date.now() - 61000).toISOString()]);
r = await rs.call('POST', '/api/auth/registro/reenviar', { correo: 'reenvio@cedros.co' });
const c2n = r.data.codigo_dev;
ok(r.status === 200 && /^\d{6}$/.test(c2n), 'reenviar genera un código nuevo');
if (c1 !== c2n) { r = await rs.call('POST', '/api/auth/registro/verificar', { correo: 'reenvio@cedros.co', codigo: c1 }); ok(r.status === 400, 'el código anterior deja de servir'); }
r = await rs.call('POST', '/api/auth/registro/verificar', { correo: 'reenvio@cedros.co', codigo: c2n });
ok(r.status === 200, 'el código nuevo sí sirve');

// Sin proveedor de correo configurado y sin modo dev: no se crea nada y se avisa
delete process.env.FF_DEV_CODES;
r = await new Jar().call('POST', '/api/auth/registro', reg({ correo: 'sinmail@cedros.co' }));
ok(r.status === 503 && r.data.error === 'mail_not_configured', 'sin BREVO_API_KEY en producción avisa y no deja registros pendientes');
[{ n: usersBefore }] = await query("select count(*) as n from registros_pendientes where correo = 'sinmail@cedros.co'");
ok(Number(usersBefore) === 0, 'no queda un registro pendiente huérfano');
process.env.FF_DEV_CODES = '1';

section('13. Aislamiento entre negocios');
const maria = again; // sesión del negocio nuevo
r = await maria.call('GET', '/api/staff/catalogo');
ok(r.data.servicios.length === 0 && r.data.recursos.length === 0, 'un negocio nuevo empieza vacío (no ve el catálogo del otro)');
r = await maria.call('GET', '/api/staff/clientes');
ok(r.data.clientes.length === 0, 'no ve los clientes de otro negocio');
r = await maria.call('GET', '/api/staff/conversaciones');
ok(r.data.conversaciones.length === 0, 'no ve las conversaciones de otro negocio');
const hoy = todayLocal();
r = await maria.call('GET', `/api/staff/citas?desde=${hoy}&hasta=${addDays(hoy, 30)}`);
ok(r.data.citas.length === 0, 'no ve las citas de otro negocio');
const [{ negocio_id: MID }] = await query("select negocio_id from usuarios_negocio where correo = 'maria@cedros.co'");
r = { data: await seed(MID) };
ok(r.data.skipped === false, 'puede cargar sus propios datos de prueba');
const mcat = (await maria.call('GET', '/api/staff/catalogo')).data;
ok(mcat.servicios.length === 5 && mcat.servicios.every((x) => !cat.servicios.some((y) => y.id === x.id)), 'los datos de ejemplo de cada negocio son propios');
const adminCli = (await staff.call('GET', '/api/staff/clientes')).data.clientes[0];
r = await maria.call('GET', `/api/staff/clientes/${adminCli.id}`);
ok(r.status === 404, 'pedir un cliente ajeno por id → 404');
r = await maria.call('PATCH', `/api/staff/clientes/${adminCli.id}`, { nombre: 'Hackeado', idioma: 'es' });
const [chk] = await query('select nombre from clientes where id = $1', [adminCli.id]);
ok(chk.nombre !== 'Hackeado', 'no puede modificar un cliente ajeno');
const adminConv = (await staff.call('GET', '/api/staff/conversaciones')).data.conversaciones[0];
r = await maria.call('GET', `/api/staff/conversaciones/${adminConv.id}`);
ok(r.status === 404, 'no puede leer una conversación ajena');
r = await maria.call('POST', `/api/staff/conversaciones/${adminConv.id}/mensajes`, { texto: 'hola' });
ok(r.status === 404, 'no puede escribir en una conversación ajena');
const adminCita = (await staff.call('GET', `/api/staff/citas?desde=${hoy}&hasta=${addDays(hoy, 60)}`)).data.citas[0];
r = await maria.call('PATCH', `/api/staff/citas/${adminCita.id}`, { estado: 'cancelada' });
ok(r.status === 404, 'no puede cancelar una cita ajena');
r = await maria.call('POST', '/api/staff/servicios', { id: visita.id, nombre_es: 'Robado', nombre_en: 'Stolen', duracion_min: 60, recursos: [] });
const [svcChk] = await query('select nombre_es from servicios where id = $1', [visita.id]);
ok(r.status === 404 && svcChk.nombre_es !== 'Robado', 'no puede sobrescribir un servicio ajeno usando su id');
const recAjeno = cat.recursos[0];
r = await maria.call('POST', '/api/staff/recursos', { id: recAjeno.id, nombre: 'Robado', horarios: [] });
ok(r.status === 404, 'no puede sobrescribir un recurso ajeno usando su id');
r = await maria.call('POST', '/api/staff/servicios', { nombre_es: 'Riego', nombre_en: 'Irrigation', duracion_min: 60, recursos: [recAjeno.id] });
const [vinc] = await query('select count(*) as n from servicio_recurso where servicio_id = $1', [r.data.id]);
ok(Number(vinc.n) === 0, 'no puede vincular un recurso ajeno a su servicio');
r = await maria.call('POST', '/api/staff/citas', { cliente_id: adminCli.id, servicio_id: visita.id, inicio: new Date().toISOString() });
ok(r.status >= 400, 'no puede crear citas con clientes o servicios ajenos');
r = await maria.call('PUT', '/api/staff/config', { negocio_nombre: 'Finca Los Cedros S.A.S.' });
r = await staff.call('GET', '/api/staff/config');
ok(r.data.config.negocio_nombre === 'Agro Prueba', 'la configuración de cada negocio es independiente');
r = await maria.call('GET', '/api/staff/config');
ok(r.data.sistema.principal === false && r.data.sistema.whatsapp.webhook === '' && r.data.config.negocio_nombre === 'Finca Los Cedros S.A.S.', 'un negocio normal no ve datos de la plataforma');
r = { data: await enlace(MID, '573001234567', 'Ana') };
ok(r.data.sent === false, 'el negocio nuevo recibe su enlace y no envía WhatsApp real');
const mClient = new Jar();
await mClient.call('POST', '/api/auth/enter', { token: new URL(r.data.url).searchParams.get('t') });
r = await mClient.call('GET', '/api/client/chat');
ok(r.status === 200 && JSON.stringify(r.data).includes('Finca Los Cedros'), 'el cliente de ese negocio habla con su asistente (nombre propio)');
r = await mClient.call('GET', '/api/staff/resumen');
ok(r.status === 401, 'y no accede al panel');
const [{ n: sameTel }] = await query("select count(*) as n from clientes where telefono = '573001234567'");
ok(Number(sameTel) === 2, 'el mismo teléfono puede ser cliente de dos negocios distintos');
const forged2 = new Jar(); forged2.c.ff_staff = maria.c.ff_staff.split('.')[0] + '.' + 'x'.repeat(43);
r = await forged2.call('GET', '/api/staff/catalogo');
ok(r.status === 401, 'una cookie con otro negocio y firma falsa no sirve');

section('14. Dashboard');
r = await new Jar().call('GET', '/api/staff/dashboard');
ok(r.status === 401, 'el dashboard exige sesión');
r = await staff.call('GET', '/api/staff/dashboard');
const D = r.data;
ok(r.status === 200 && D.citas.length > 40 && D.servicios.length === 5 && D.recursos.length === 5, `dashboard: historial de ejemplo (${D.citas?.length} citas)`);
ok(JSON.stringify(D).length < 400000, `la respuesta es liviana (${Math.round(JSON.stringify(D).length / 1024)} KB)`);
ok(D.capacidad.length === 5 && D.capacidad.every((c) => c.length === 7 && c[0] > 0 && c[6] === 0), 'capacidad por recurso y día (domingo = 0)');
ok(D.chats.every((c) => 'att' in c && 'canal' in c), 'las conversaciones llegan con su estado de atención y canal');
r = await maria.call('GET', '/api/staff/dashboard');
ok(r.status === 200 && !JSON.stringify(r.data).includes(D.servicios[0].id) && r.data.citas.every((x) => !D.citas.some((y) => y[9] === x[9])), 'el dashboard de otro negocio no mezcla datos');

section('15. Recuperar contraseña (Brevo) e ingreso con Google');
{
  const realFetch = globalThis.fetch; const sent = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.brevo.com/')) { sent.push({ url: String(url), init, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ messageId: 'x' }), { status: 201 }); }
    if (String(url).startsWith('https://oauth2.googleapis.com/token')) return globalThis.__googleToken(init);
    return realFetch(url, init);
  };
  const raw = (path, cookie = '') => api(new Request(`https://app.example.com${path}`, { method: 'GET', headers: { cookie }, redirect: 'manual' }));
  const cookieOf = (res) => res.headers.getSetCookie().map((c) => c.split(';')[0]).filter((c) => !/=$/.test(c)).join('; ');

  // Con Brevo configurado: el correo sale por la API de Brevo y el código no viaja en la respuesta.
  delete process.env.FF_DEV_CODES;
  process.env.BREVO_API_KEY = 'brevo-key'; process.env.MAIL_FROM = 'FieldFlow <no-reply@fieldflow.test>';
  const rj = new Jar();
  r = await rj.call('POST', '/api/auth/recuperar', { correo: 'nadie@desconocido.co', idioma: 'es' });
  ok(r.status === 200 && r.data.ok && !r.data.codigo_dev && sent.length === 0, 'correo sin cuenta: misma respuesta y no se envía nada');
  r = await rj.call('POST', '/api/auth/recuperar', { correo: 'Maria@Cedros.co', idioma: 'en' });
  const mail = sent[0];
  ok(r.status === 200 && !r.data.codigo_dev && mail?.url === 'https://api.brevo.com/v3/smtp/email', 'recuperar envía el correo por Brevo');
  ok(mail?.init.headers['api-key'] === 'brevo-key' && mail.body.sender.email === 'no-reply@fieldflow.test' && mail.body.sender.name === 'FieldFlow' && mail.body.to[0].email === 'maria@cedros.co', 'cabecera api-key, remitente y destinatario correctos');
  const rcode = (mail?.body.textContent.match(/\b(\d{6})\b/) || [])[1];
  ok(/^\d{6}$/.test(rcode || '') && /password/i.test(mail.body.subject), 'el correo trae el código de 6 dígitos (en inglés si se pidió)');
  r = await rj.call('POST', '/api/auth/recuperar', { correo: 'maria@cedros.co' });
  ok(r.status === 429 && r.data.error === 'wait_before_resend', 'no permite pedir otro código de inmediato');
  const wrongR = rcode === '000000' ? '111111' : '000000';
  r = await rj.call('POST', '/api/auth/recuperar/verificar', { correo: 'maria@cedros.co', codigo: wrongR, password: 'nueva-clave-99' });
  ok(r.status === 400 && r.data.error === 'code_invalid' && r.data.restantes === 4, 'código incorrecto → error con intentos restantes');
  r = await rj.call('POST', '/api/auth/recuperar/verificar', { correo: 'maria@cedros.co', codigo: rcode, password: '123' });
  ok(r.status === 400 && r.data.error === 'weak_password', 'rechaza contraseñas cortas');
  r = await rj.call('POST', '/api/auth/recuperar/verificar', { correo: 'maria@cedros.co', codigo: rcode, password: 'nueva-clave-99' });
  ok(r.status === 200 && rj.c.ff_staff, 'código correcto guarda la contraseña nueva y abre sesión');
  r = await new Jar().call('POST', '/api/auth/login', { correo: 'maria@cedros.co', password: 'nueva-clave-99' });
  ok(r.status === 200, 'ya puede entrar con la contraseña nueva');
  r = await new Jar().call('POST', '/api/auth/login', { correo: 'maria@cedros.co', password: 'clave-segura-1' });
  ok(r.status === 401, 'la contraseña anterior deja de servir');
  r = await rj.call('POST', '/api/auth/recuperar/verificar', { correo: 'maria@cedros.co', codigo: rcode, password: 'otra-clave-123' });
  ok(r.status === 400, 'el código no se puede usar dos veces');
  // Bloqueo por intentos
  await query("delete from recuperaciones");
  sent.length = 0;
  await new Jar().call('POST', '/api/auth/recuperar', { correo: 'maria@cedros.co' });
  const c2 = sent[0].body.textContent.match(/\b(\d{6})\b/)[1]; const bad2 = c2 === '123456' ? '654321' : '123456';
  let lastR; for (let i = 0; i < 6; i++) lastR = await new Jar().call('POST', '/api/auth/recuperar/verificar', { correo: 'maria@cedros.co', codigo: bad2, password: 'nueva-clave-99' });
  ok(lastR.status === 429 && lastR.data.error === 'too_many_attempts', 'tras 5 intentos fallidos se bloquea la recuperación');
  r = await new Jar().call('POST', '/api/auth/recuperar/verificar', { correo: 'maria@cedros.co', codigo: c2, password: 'nueva-clave-99' });
  ok(r.status === 400, 'ni el código correcto sirve después del bloqueo');
  // Sin proveedor de correo ni modo dev
  delete process.env.BREVO_API_KEY;
  r = await new Jar().call('POST', '/api/auth/recuperar', { correo: 'maria@cedros.co' });
  ok(r.status === 503 && r.data.error === 'mail_not_configured', 'sin Brevo configurado avisa en vez de fingir que envió');
  process.env.FF_DEV_CODES = '1'; delete process.env.MAIL_FROM;

  // ── Google ──
  let g = await raw('/api/auth/google/start');
  ok(g.status === 302 && g.headers.get('location') === '/?e=google_not_configured', 'Google sin configurar: vuelve al inicio con un aviso claro');
  process.env.GOOGLE_CLIENT_ID = 'cid-123'; process.env.GOOGLE_CLIENT_SECRET = 'sec-456';
  g = await raw('/api/auth/google/start?lang=en');
  const loc = new URL(g.headers.get('location'));
  ok(g.status === 302 && loc.origin === 'https://accounts.google.com' && loc.searchParams.get('client_id') === 'cid-123'
    && loc.searchParams.get('redirect_uri') === 'https://app.example.com/api/auth/google/callback' && loc.searchParams.get('code_challenge_method') === 'S256'
    && loc.searchParams.get('scope') === 'openid email profile', 'inicia el flujo OAuth con PKCE, estado y la URI de redirección correcta');
  const oc = cookieOf(g); const sess = JSON.parse(Buffer.from(oc.split('=')[1].split('.')[0], 'base64url').toString());
  ok(sess.s === loc.searchParams.get('state') && sess.n === loc.searchParams.get('nonce') && /ff_oauth=/.test(oc), 'guarda estado y nonce en una cookie firmada de un solo uso');
  g = await raw(`/api/auth/google/callback?code=abc&state=otro`, oc);
  ok(g.headers.get('location') === '/?e=google_failed' && !cookieOf(g).includes('ff_staff'), 'estado distinto (CSRF) → se rechaza');
  g = await raw(`/api/auth/google/callback?error=access_denied`, oc);
  ok(g.headers.get('location') === '/?e=google_denied', 'si cancela en Google vuelve con un aviso');
  const idToken = (over = {}) => { const c = { iss: 'https://accounts.google.com', aud: 'cid-123', exp: Math.floor(Date.now() / 1000) + 600, nonce: sess.n, email: 'Ana@Gmail.test', email_verified: true, name: 'Ana Pérez', given_name: 'Ana', ...over }; return `h.${Buffer.from(JSON.stringify(c)).toString('base64url')}.s`; };
  const tokenWith = (over) => async (init) => { const f = new URLSearchParams(init.body); globalThis.__seen = Object.fromEntries(f); return new Response(JSON.stringify({ id_token: idToken(over) }), { status: 200 }); };
  for (const [name, over] of [['audiencia ajena', { aud: 'otro' }], ['nonce distinto', { nonce: 'x' }], ['correo sin verificar', { email_verified: false }], ['token vencido', { exp: 1 }]]) {
    globalThis.__googleToken = tokenWith(over);
    g = await raw(`/api/auth/google/callback?code=abc&state=${sess.s}`, oc);
    ok(g.headers.get('location') === '/?e=google_failed', `se rechaza un token con ${name}`);
  }
  globalThis.__googleToken = tokenWith({});
  g = await raw(`/api/auth/google/callback?code=abc&state=${sess.s}`, oc);
  ok(g.status === 302 && g.headers.get('location') === '/#/hoy' && /ff_staff=/.test(cookieOf(g)), 'Google válido: crea la cuenta y abre sesión');
  ok(globalThis.__seen.code_verifier === sess.v && globalThis.__seen.client_secret === 'sec-456' && globalThis.__seen.grant_type === 'authorization_code', 'el intercambio de código usa PKCE y el secreto del servidor');
  const gj = new Jar(); gj.c.ff_staff = cookieOf(g).match(/ff_staff=([^;]+)/)[1];
  r = await gj.call('GET', '/api/auth/me');
  ok(r.data.staff?.correo === 'ana@gmail.test' && r.data.staff.negocio === "Ana's business", 'la cuenta nueva queda con el correo de Google y un negocio inicial');
  g = await raw(`/api/auth/google/callback?code=abc&state=${sess.s}`, oc);
  ok(g.headers.getSetCookie().some((c) => /^ff_oauth=;.*Max-Age=0/.test(c)), 'la cookie del flujo se borra al volver de Google (un solo uso)');
  const gs = await raw('/api/auth/google/start'); const oc2 = cookieOf(gs); const s2 = JSON.parse(Buffer.from(oc2.split('=')[1].split('.')[0], 'base64url').toString());
  sess.n = s2.n; sess.s = s2.s; sess.v = s2.v;
  g = await raw(`/api/auth/google/callback?code=abc&state=${s2.s}`, oc2);
  const [{ n: gUsers }] = await query("select count(*) as n from usuarios_negocio where correo = 'ana@gmail.test'");
  ok(g.headers.get('location') === '/#/hoy' && Number(gUsers) === 1, 'volver a entrar con Google reutiliza la misma cuenta');
  delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET;
  globalThis.fetch = realFetch;
}

// ── 16. Páginas legales ──
{
  console.log('\n16. Páginas legales (Términos y Privacidad)');
  const { LEGAL, CONTACT, UPDATED } = await import('../public/js/legal-content.js');
  for (const doc of ['terminos', 'privacidad']) {
    const es = LEGAL[doc].es; const en = LEGAL[doc].en;
    ok(es.sections.length >= 10 && es.sections.length === en.sections.length, `${doc}: mismas secciones en español e inglés (${es.sections.length})`);
    const flat = (d) => d.sections.flatMap((x) => x.blocks.flat());
    ok(flat(es).every((x) => typeof x === 'string' && x.length > 10) && flat(en).every((x) => typeof x === 'string' && x.length > 10), `${doc}: ningún bloque vacío`);
    ok(es.sections.every((x, i) => x.blocks.length === en.sections[i].blocks.length), `${doc}: cada sección tiene la misma estructura en ambos idiomas`);
    ok(!JSON.stringify(LEGAL[doc]).includes('servewise'), `${doc}: sin referencias a otra marca`);
  }
  ok(/^[^@\s]+@googlegroups\.com$/.test(CONTACT) && /^\d{4}-\d{2}-\d{2}$/.test(UPDATED), 'contacto y fecha de actualización definidos');
  const priv = JSON.stringify(LEGAL.privacidad.es);
  ok(['Ley 1581 de 2012', 'Superintendencia de Industria y Comercio', '10 días hábiles', '15 días hábiles', 'Brevo', 'Vercel', 'Neon', 'Google'].every((k) => priv.includes(k)), 'la política cita la ley, los plazos de respuesta, la SIC y los proveedores');
  const vj = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  ok(['/terminos', '/privacidad'].every((p) => vj.rewrites.some((r) => r.source === p)), 'vercel.json sirve /terminos y /privacidad');
}

// ── 17. CRM, productos libres, caja y stock por día ──
{
  section('17. CRM, caja y stock diarios');
  const hoy = addDays(todayLocal(), -29); const ayer = addDays(hoy, -1); // días lejanos: los datos de ejemplo no los tocan
  let r = await staff.call('POST', '/api/staff/contactos', { nombre: 'Finca La Esperanza', correo: 'compras@esperanza.co', valor: 2500000 });
  ok(r.status === 200 && r.data.id, 'CRM: crear contacto');
  const cid = r.data.id;
  r = await staff.call('POST', '/api/staff/contactos', { nombre: 'X', correo: 'no-es-correo' });
  ok(r.status === 400, 'CRM: correo inválido se rechaza');
  r = await staff.call('PATCH', `/api/staff/contactos/${cid}`, { etapa: 'cotizado' });
  r = await staff.call('GET', `/api/staff/contactos/${cid}`);
  ok(r.data.contacto.etapa === 'cotizado' && r.data.historial.some((h) => h.tipo === 'etapa'), 'CRM: cambio de etapa queda en el historial');
  r = await staff.call('POST', `/api/staff/contactos/${cid}/historial`, { tipo: 'llamada', cuerpo: 'Pidió cotización de cosecha' });
  r = await staff.call('POST', `/api/staff/contactos/${cid}/correo`, { asunto: 'Cotización', cuerpo: 'Hola' });
  ok(r.status === 503, 'CRM: sin Brevo configurado el envío avisa claramente');
  r = await staff.call('GET', '/api/staff/crm');
  ok(r.data.contactos.length >= 1 && r.data.etapas.length === 5, 'CRM: lista con las 5 etapas');
  r = await maria.call('GET', `/api/staff/contactos/${cid}`);
  ok(r.status === 404, 'CRM: otro negocio no ve el contacto');

  r = await staff.call('POST', '/api/staff/productos', { nombre: 'Empanadas', unidad: 'unidad', precio: 3000, stock_minimo: 20 });
  const p1 = r.data.id;
  r = await staff.call('POST', '/api/staff/productos', { nombre: 'Vacas', unidad: 'cabeza', precio: 4500000 });
  const p2 = r.data.id;
  ok(p1 && p2, 'productos libres: empanadas y vacas');
  await staff.call('POST', `/api/staff/dia/${ayer}/stock`, { producto_id: p1, tipo: 'entrada', cantidad: 100 });
  await staff.call('POST', `/api/staff/dia/${ayer}/stock`, { producto_id: p1, tipo: 'salida', cantidad: 30 });
  await staff.call('POST', `/api/staff/dia/${ayer}/caja`, { tipo: 'ingreso', medio: 'efectivo', concepto: 'Ventas', monto: 90000 });
  await staff.call('POST', `/api/staff/dia/${ayer}/caja`, { tipo: 'egreso', medio: 'efectivo', concepto: 'Gasolina', monto: 20000 });
  await staff.call('POST', `/api/staff/dia/${ayer}/caja`, { tipo: 'ingreso', medio: 'transferencia', concepto: 'Cliente', monto: 50000 });
  await staff.call('PUT', `/api/staff/dia/${ayer}/apertura`, { apertura: 100000 });
  let d = (await staff.call('GET', `/api/staff/dia/${ayer}`)).data;
  ok(d.resumen.esperado_efectivo === 170000 && d.resumen.ingresos === 140000, 'caja: esperado = apertura + ingresos − egresos en efectivo');
  ok(d.productos.find((x) => x.id === p1).esperado === 70, 'stock: esperado del día = inicial + entradas − salidas');
  r = await staff.call('POST', `/api/staff/dia/${ayer}/cerrar`, { cierre_real: 168000, conteos: { [p1]: 68 }, nota: 'Faltaron 2000' });
  ok(r.status === 200, 'cierre del día');
  r = await staff.call('POST', `/api/staff/dia/${ayer}/caja`, { tipo: 'ingreso', monto: 1000 });
  ok(r.status === 409, 'un día cerrado no se edita');
  d = (await staff.call('GET', `/api/staff/dia/${hoy}`)).data;
  ok(d.apertura === 168000 && d.apertura_sugerida === 168000, 'cada día abre con el efectivo contado del cierre anterior');
  ok(d.productos.find((x) => x.id === p1).inicial === 68, 'cada día abre con el conteo físico del cierre anterior');
  ok(d.productos.find((x) => x.id === p1).entradas === 0 && d.resumen.ingresos === 0, 'cada día es independiente: sus movimientos empiezan en cero');
  r = await staff.call('POST', `/api/staff/dia/${ayer}/reabrir`, {});
  r = await staff.call('POST', `/api/staff/dia/${ayer}/caja`, { tipo: 'ingreso', monto: 1000 });
  ok(r.status === 200, 'reabrir permite corregir');
  r = await staff.call('GET', `/api/staff/dia/${addDays(todayLocal(), 5)}`);
  ok(r.status === 400, 'no se registran días futuros');
  r = await staff.call('GET', '/api/staff/finanzas');
  ok(r.data.dias.some((x) => x[0] === ayer && x[1] >= 140000), 'finanzas: serie diaria de ingresos');
  r = await maria.call('POST', `/api/staff/dia/${ayer}/stock`, { producto_id: p1, tipo: 'entrada', cantidad: 5 });
  ok(r.status === 400, 'stock: no se puede usar el producto de otro negocio');
  r = await staff.call('POST', '/api/staff/servicios', { id: visita.id, nombre_es: visita.nombre_es, nombre_en: visita.nombre_en, duracion_min: 60, precio: 80000, recursos: visita.recursos });
  ok((await staff.call('GET', '/api/staff/catalogo')).data.servicios.find((x) => x.id === visita.id).precio === 80000, 'servicios con precio');
}

section('18. Terrenos (compra y venta)');
{
  const tiny = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
  r = await staff.call('POST', '/api/staff/terrenos', { titulo: '' });
  ok(r.status === 400, 'terreno: exige título');
  r = await staff.call('POST', '/api/staff/terrenos', { titulo: 'Lote El Mirador', operacion: 'venta', uso: 'ganadero', departamento: 'Meta', municipio: 'Villavicencio', area_ha: 12.5, precio: 2500000000, caracteristicas: ['agua', 'luz', 'inventado'], documentos: ['escritura'], lat: 4.14, lng: -73.62 });
  ok(r.status === 200 && r.data.id, 'terreno: crea una ficha (precio de miles de millones)');
  const t1 = r.data.id;
  r = await staff.call('POST', '/api/staff/terrenos', { titulo: 'Finca vecina', operacion: 'venta', municipio: 'Villavicencio', area_ha: 10, precio: 1500000000 });
  r = await staff.call('POST', '/api/staff/terrenos', { titulo: 'Mala', area_ha: 1, precio: 1, lat: 200 });
  ok(r.status === 400, 'terreno: rechaza coordenadas fuera de rango');
  r = await staff.call('GET', `/api/staff/terrenos/${t1}`);
  ok(r.data.terreno.precio === 2500000000 && r.data.terreno.precio_ha === 200000000, 'terreno: precio por hectárea calculado');
  ok(r.data.terreno.caracteristicas.length === 2 && !r.data.terreno.caracteristicas.includes('inventado'), 'terreno: solo guarda características conocidas');
  ok(r.data.referencia && r.data.referencia.n === 1 && r.data.referencia.promedio_ha === 150000000, 'terreno: referencia de precio por hectárea de la zona');
  r = await staff.call('POST', `/api/staff/terrenos/${t1}/fotos`, { grande: tiny, mini: tiny });
  ok(r.status === 200, 'terreno: sube una foto');
  const f1 = r.data.id;
  r = await staff.call('POST', `/api/staff/terrenos/${t1}/fotos`, { grande: 'data:text/html;base64,AAAA', mini: tiny });
  ok(r.status === 400, 'terreno: rechaza archivos que no son imagen');
  await staff.call('POST', `/api/staff/terrenos/${t1}/fotos`, { grande: tiny, mini: tiny });
  r = await staff.call('GET', '/api/staff/terrenos');
  ok(r.data.terrenos.find((x) => x.id === t1).fotos === 2 && !!r.data.terrenos.find((x) => x.id === t1).portada, 'terreno: la lista trae portada y número de fotos');
  r = await staff.call('POST', `/api/staff/terrenos/${t1}/interesados`, { nombre: 'Pedro Gómez', telefono: '3001234567', oferta: 2300000000 });
  ok(r.status === 200, 'terreno: registra un interesado con su oferta');
  const i1 = r.data.id;
  r = await staff.call('PATCH', `/api/staff/terreno-interesados/${i1}`, { estado: 'visita' });
  ok(r.status === 200 && (await staff.call('GET', `/api/staff/terrenos/${t1}`)).data.interesados[0].estado === 'visita', 'terreno: cambia el estado del interesado');
  r = await maria.call('GET', `/api/staff/terrenos/${t1}`);
  ok(r.status === 404, 'terreno: otro negocio no lo ve');
  r = await maria.call('DELETE', `/api/staff/terreno-fotos/${f1}`);
  ok(r.status === 404, 'terreno: otro negocio no borra sus fotos');
  r = await staff.call('POST', '/api/staff/terrenos', { id: t1, titulo: 'Lote El Mirador', estado: 'negociacion', area_ha: 12.5, precio: 2400000000 });
  ok((await staff.call('GET', `/api/staff/terrenos/${t1}`)).data.terreno.estado === 'negociacion', 'terreno: edita el estado y el precio');
  r = await staff.call('DELETE', `/api/staff/terrenos/${t1}`);
  ok(r.status === 200 && (await staff.call('GET', `/api/staff/terrenos/${t1}`)).status === 404, 'terreno: se elimina con sus fotos e interesados');
}

section('19. Ganado');
{
  const hoyG = todayLocal(); const hace = (n) => addDays(hoyG, -n);
  r = await staff.call('POST', '/api/staff/ganado/animales', { sexo: 'hembra' });
  ok(r.status === 400, 'ganado: exige arete o nombre');
  r = await staff.call('POST', '/api/staff/ganado/animales', { arete: 'A-001', nombre: 'Luna', sexo: 'hembra', raza: 'Holstein', nacimiento: hace(1000), lote: 'Lecheras', peso: 450 });
  ok(r.status === 200, 'ganado: registra un animal');
  const vaca = r.data.id;
  r = await staff.call('POST', '/api/staff/ganado/animales', { arete: 'a-001', sexo: 'macho' });
  ok(r.status === 400 && r.data.error === 'duplicate_tag', 'ganado: no repite el arete');
  r = await staff.call('POST', '/api/staff/ganado/animales', { arete: 'A-002', sexo: 'hembra', nacimiento: hace(1200), lote: 'Lecheras' });
  const vaca2 = r.data.id;
  r = await staff.call('POST', '/api/staff/ganado/animales', { arete: 'T-010', sexo: 'macho', nacimiento: hace(200), lote: 'Levante' });
  const ternero = r.data.id;
  let g = (await staff.call('GET', '/api/staff/ganado')).data;
  ok(g.resumen.activos === 3 && g.animales.find((a) => a.id === vaca).categoria === 'vaca' && g.animales.find((a) => a.id === ternero).categoria === 'ternero', 'ganado: la categoría se sugiere por sexo y edad');
  // Pesajes y ganancia diaria
  await staff.call('POST', '/api/staff/ganado/eventos', { animal_id: ternero, tipo: 'peso', fecha: hace(30), valor: 150 });
  await staff.call('POST', '/api/staff/ganado/eventos', { animal_id: ternero, tipo: 'peso', fecha: hace(0), valor: 180 });
  g = (await staff.call('GET', '/api/staff/ganado')).data;
  const tj = g.animales.find((a) => a.id === ternero);
  ok(tj.peso === 180 && tj.gdp === 1, 'ganado: peso actual y ganancia diaria (1 kg/día)');
  r = await staff.call('POST', '/api/staff/ganado/eventos', { animal_id: ternero, tipo: 'peso', fecha: hace(0), valor: -5 });
  ok(r.status === 400, 'ganado: rechaza pesos inválidos');
  r = await staff.call('POST', '/api/staff/ganado/eventos', { animal_id: ternero, tipo: 'peso', fecha: addDays(hoyG, 3), valor: 190 });
  ok(r.status === 400, 'ganado: no registra fechas futuras');
  // Reproducción
  r = await staff.call('POST', '/api/staff/ganado/eventos', { animal_id: ternero, tipo: 'monta', fecha: hace(1) });
  ok(r.status === 400, 'ganado: la monta solo va en hembras');
  r = await staff.call('POST', '/api/staff/ganado/eventos', { animal_id: vaca, tipo: 'monta', fecha: hace(50), toro: 'Brahman 7' });
  ok(r.status === 200 && r.data.parto_probable === addDays(hace(50), 283), 'ganado: la monta calcula el parto probable (283 días)');
  g = (await staff.call('GET', '/api/staff/ganado')).data;
  ok(g.alertas.sin_diagnostico.some((x) => x.id === vaca), 'ganado: avisa que falta el diagnóstico de preñez');
  await staff.call('POST', '/api/staff/ganado/eventos', { animal_id: vaca, tipo: 'diagnostico', fecha: hace(10), prenada: true });
  g = (await staff.call('GET', '/api/staff/ganado')).data;
  ok(g.resumen.prenadas === 1 && g.animales.find((a) => a.id === vaca).repro === 'prenada', 'ganado: marca la vaca como preñada');
  // Sanidad masiva por lote y avisos
  r = await staff.call('POST', '/api/staff/ganado/lote', { lote: 'Lecheras', tipo: 'vacuna', producto: 'Aftosa', fecha: hace(180), proxima_fecha: hace(2) });
  ok(r.status === 200 && r.data.n === 2, 'ganado: vacuna a todo un lote con un solo registro');
  g = (await staff.call('GET', '/api/staff/ganado')).data;
  ok(g.alertas.sanidad.length === 1 && g.alertas.sanidad[0].n === 2 && g.alertas.sanidad[0].dias < 0, 'ganado: avisa vacunas vencidas, agrupadas por producto');
  await staff.call('POST', '/api/staff/ganado/eventos', { animal_id: vaca, tipo: 'vacuna', producto: 'Aftosa', fecha: hace(0) });
  g = (await staff.call('GET', '/api/staff/ganado')).data;
  ok(g.alertas.sanidad[0].n === 1, 'ganado: al repetir la vacuna deja de estar pendiente');
  r = await staff.call('POST', '/api/staff/ganado/lote', { lote: 'No existe', tipo: 'vacuna', producto: 'X' });
  ok(r.status === 400, 'ganado: un lote vacío no registra nada');
  // Leche
  await staff.call('POST', '/api/staff/ganado/eventos', { tipo: 'leche', fecha: hoyG, valor: 120 });
  await staff.call('POST', '/api/staff/ganado/eventos', { tipo: 'leche', fecha: hoyG, valor: 135 });
  g = (await staff.call('GET', '/api/staff/ganado')).data;
  ok(g.resumen.leche_hoy === 135 && g.leche.length === 14, 'ganado: la leche del día se reemplaza, no se duplica');
  // Parto con cría
  r = await staff.call('POST', '/api/staff/ganado/eventos', { animal_id: vaca, tipo: 'parto', fecha: hace(0), cria: { arete: 'T-011', sexo: 'hembra', peso: 35 } });
  ok(r.status === 200 && r.data.cria_id, 'ganado: el parto registra a la cría');
  let d = (await staff.call('GET', `/api/staff/ganado/animales/${vaca}`)).data;
  ok(d.repro.estado === 'parida' && d.crias.length === 1 && d.crias[0].arete === 'T-011', 'ganado: la ficha de la madre muestra su cría');
  // Venta con caja
  r = await staff.call('POST', '/api/staff/ganado/eventos', { animal_id: ternero, tipo: 'venta', fecha: hoyG, valor: 1800000, comprador: 'Frigorífico', caja: true });
  ok(r.status === 200 && r.data.caja === true, 'ganado: la venta se anota también en la caja del día');
  d = (await staff.call('GET', `/api/staff/dia/${hoyG}`)).data;
  ok(d.movimientos.some((m) => m.monto === 1800000 && /T-010/.test(m.concepto)), 'ganado: el ingreso aparece en Ventas y dinero');
  g = (await staff.call('GET', '/api/staff/ganado')).data;
  ok(g.animales.find((a) => a.id === ternero).estado === 'vendido' && g.resumen.vendidos === 1, 'ganado: el animal vendido sale del hato activo');
  r = await staff.call('POST', '/api/staff/ganado/eventos', { animal_id: ternero, tipo: 'venta', fecha: hoyG, valor: 1 });
  ok(r.status === 400, 'ganado: no se vende dos veces');
  // Aislamiento entre negocios
  r = await maria.call('GET', `/api/staff/ganado/animales/${vaca}`);
  ok(r.status === 404, 'ganado: otro negocio no ve tus animales');
  r = await maria.call('POST', '/api/staff/ganado/eventos', { animal_id: vaca, tipo: 'peso', fecha: hoyG, valor: 400 });
  ok(r.status === 404, 'ganado: otro negocio no registra eventos en tus animales');
  ok((await maria.call('GET', '/api/staff/ganado')).data.animales.length === 0, 'ganado: cada negocio solo ve su hato');
  r = await staff.call('GET', '/api/staff/ganado/alertas');
  ok(r.status === 200 && typeof r.data.activos === 'number', 'ganado: resumen de avisos para el Inicio');
}

section('20. Enlace público del negocio (sin cuenta)');
{
  r = await staff.call('GET', '/api/staff/enlace');
  ok(r.status === 200 && /^[a-z0-9-]{3,40}$/.test(r.data.slug) && r.data.url.endsWith(`/n/${r.data.slug}`), 'enlace: se crea a partir del nombre del negocio');
  const slugA = r.data.slug;
  r = await staff.call('POST', '/api/staff/enlace', { slug: 'api' });
  ok(r.status === 400, 'enlace: no permite nombres reservados');
  r = await staff.call('POST', '/api/staff/enlace', { slug: 'Mi Finca Linda' });
  ok(r.status === 200 && r.data.slug === 'mi-finca-linda', 'enlace: se puede personalizar (se limpia a minúsculas y guiones)');
  const slugB = (await maria.call('GET', '/api/staff/enlace')).data.slug;
  r = await maria.call('POST', '/api/staff/enlace', { slug: 'mi-finca-linda' });
  ok(r.status === 400 && r.data.error === 'slug_taken', 'enlace: dos negocios no pueden tener el mismo');
  ok(slugB && slugB !== 'mi-finca-linda', 'enlace: cada negocio tiene el suyo');

  const visita = new Jar();
  r = await visita.call('POST', '/api/public/n/no-existe/entrar', {});
  ok(r.status === 404, 'visitante: un enlace inexistente da 404');
  r = await visita.call('POST', '/api/public/n/mi-finca-linda/entrar', { idioma: 'es' });
  ok(r.status === 200 && r.data.nuevo === true, 'visitante: entra por el enlace sin cuenta ni formulario');
  r = await visita.call('GET', '/api/client/chat');
  ok(r.status === 200 && r.data.mensajes.some((m) => m.rol === 'bot'), 'visitante: el bot lo saluda de inmediato con los servicios');
  const cat = (await staff.call('GET', '/api/staff/catalogo')).data;
  const svc = cat.servicios[0];
  const dias = (await visita.call('POST', '/api/client/chat', { texto: 'Hola', payload: `svc:${svc.id}` })).data.mensajes.at(-1);
  const ymdOpt = dias.meta.ui.options[0].payload;
  const horas = (await visita.call('POST', '/api/client/chat', { texto: 'día', payload: ymdOpt })).data.mensajes.at(-1);
  const slotP = horas.meta.ui.options[0].payload;
  r = await visita.call('POST', '/api/client/chat', { texto: 'hora', payload: slotP });
  ok(r.data.mensajes.at(-1).meta.ui.type === 'confirm', 'visitante: ve la tarjeta de confirmación sin dar datos todavía');
  r = await visita.call('POST', '/api/client/chat', { texto: 'Confirmar', payload: 'confirm' });
  ok(r.data.mensajes.at(-1).meta.ui.type === 'identify', 'visitante: al confirmar se le piden nombre y teléfono dentro del chat');
  r = await visita.call('POST', '/api/client/identificar', { nombre: 'Ana', telefono: '123', acepta: true });
  ok(r.status === 400, 'identificar: rechaza teléfonos inválidos');
  r = await visita.call('POST', '/api/client/identificar', { nombre: 'Ana Ruiz', telefono: '3105550123', acepta: false });
  ok(r.status === 400 && r.data.error === 'terms_required', 'identificar: exige aceptar el uso de datos');
  r = await visita.call('POST', '/api/client/identificar', { nombre: 'Ana Ruiz', telefono: '310 555 0123', acepta: true });
  ok(r.status === 200 && r.data.telefono === '573105550123', 'identificar: normaliza el teléfono de Colombia (57…)');
  r = await visita.call('POST', '/api/client/chat', { texto: 'Confirmar', payload: 'confirm' });
  ok(r.data.mensajes.at(-1).meta.ui?.type === 'cita', 'visitante: tras dar sus datos la cita queda agendada');
  const rep = (await staff.call('GET', '/api/staff/enlace')).data;
  ok(rep.ultimos30.entraron === 1 && rep.ultimos30.dejaron_datos === 1 && rep.ultimos30.agendaron === 1, 'enlace: cuenta entraron, dejaron datos y agendaron');
  const cr = (await staff.call('GET', '/api/staff/crm')).data.contactos.find((c) => c.nombre === 'Ana Ruiz');
  ok(cr && cr.telefono === '573105550123' && cr.origen === 'enlace', 'CRM: el visitante aparece como contacto con origen «enlace»');
  const again = await visita.call('POST', '/api/public/n/mi-finca-linda/entrar', {});
  ok(again.data.nuevo === false, 'visitante: si vuelve a abrir el enlace sigue su misma conversación');
  r = await maria.call('GET', '/api/staff/crm');
  ok(!r.data.contactos.some((c) => c.nombre === 'Ana Ruiz'), 'aislamiento: otro negocio no ve a ese visitante');
  const v2 = new Jar();
  await v2.call('POST', `/api/public/n/${slugB}/entrar`, {});
  r = await v2.call('POST', '/api/client/chat', { texto: 'x', payload: `slot:${svc.id}|2030-01-01T15:00:00.000Z|x` });
  ok(r.status === 200, 'visitante: el bot responde sin romperse con datos manipulados');
  const sinNombre = (await staff.call('GET', '/api/staff/crm')).data.contactos.filter((c) => /visitante/i.test(c.nombre));
  ok(sinNombre.length === 0, 'CRM: los visitantes que no dejaron datos no llenan los contactos');
}

section('21. Mapa con Geoapify (la clave nunca sale del servidor)');
{
  const hits = []; let mode = 'ok';
  const geo = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); hits.push({ path: u.pathname, key: u.searchParams.get('apiKey'), q: u.searchParams });
    if (mode === '401') { res.statusCode = 401; return res.end('bad key'); }
    if (mode === '429') { res.statusCode = 429; return res.end('quota'); }
    if (u.pathname === '/v1/staticmap') { res.setHeader('content-type', 'image/png'); return res.end(Buffer.from('89504e470d0a1a0a', 'hex')); }
    res.setHeader('content-type', 'application/json');
    const row = { formatted: 'Villavicencio, Meta, Colombia', name: 'Villavicencio', city: 'Villavicencio', state: 'Meta', suburb: 'Apiay', lat: 4.142, lon: -73.6266, country_code: 'co' };
    res.end(JSON.stringify(u.pathname.endsWith('/reverse') ? { results: [row] } : { results: [row, { formatted: 'Vda. La Esperanza, Granada, Meta', hamlet: 'La Esperanza', town: 'Granada', state: 'Meta', lat: 3.54, lon: -73.7 }] }));
  }).listen(0);
  process.env.GEOAPIFY_API_BASE = `http://127.0.0.1:${geo.address().port}`; process.env.GEOAPIFY_MAPS_BASE = process.env.GEOAPIFY_API_BASE;
  const raw = (jar, path) => api(new Request(`https://app.example.com${path}`, { headers: { cookie: Object.entries(jar.c).map(([k, v]) => `${k}=${v}`).join('; ') } }));

  delete process.env.GEOAPIFY_API_KEY;
  r = await staff.call('GET', '/api/staff/geo/estado');
  ok(r.data.activo === false, 'mapa: sin clave el sistema lo indica (la app sigue funcionando sin mapa)');
  r = await staff.call('GET', '/api/staff/geo/buscar?q=Villavicencio');
  ok(r.status === 503 && r.data.error === 'geo_not_configured', 'mapa: sin clave la búsqueda responde 503 claro');

  process.env.GEOAPIFY_API_KEY = 'clave-secreta-de-prueba';
  r = await staff.call('GET', '/api/staff/geo/estado');
  ok(r.data.activo === true, 'mapa: con la clave en el servidor queda activo');
  r = await new Jar().call('GET', '/api/staff/geo/buscar?q=Villavicencio');
  ok(r.status === 401, 'mapa: solo lo usan personas con sesión');
  r = await staff.call('GET', '/api/staff/geo/buscar?q=Vi');
  ok(r.status === 400, 'mapa: pide al menos 3 letras');
  r = await staff.call('GET', '/api/staff/geo/buscar?q=Villavicencio');
  ok(r.status === 200 && r.data.resultados.length === 2 && r.data.resultados[0].departamento === 'Meta' && r.data.resultados[0].municipio === 'Villavicencio' && r.data.resultados[0].vereda === 'Apiay', 'mapa: busca un lugar y separa departamento, municipio y vereda');
  ok(r.data.resultados[1].municipio === 'Granada' && r.data.resultados[1].vereda === 'La Esperanza', 'mapa: entiende pueblos y veredas (town/hamlet)');
  ok(!JSON.stringify(r.data).includes('clave-secreta-de-prueba'), 'mapa: la clave nunca viaja en la respuesta');
  const h1 = hits.at(-1);
  ok(h1.key === 'clave-secreta-de-prueba' && h1.q.get('filter') === 'countrycode:co' && h1.q.get('lang') === 'es', 'mapa: el servidor usa la clave, limita a Colombia y pide español');
  const n0 = hits.length;
  await staff.call('GET', '/api/staff/geo/buscar?q=villavicencio');
  ok(hits.length === n0, 'mapa: repetir una búsqueda no gasta créditos (caché)');
  r = await staff.call('GET', '/api/staff/geo/inversa?lat=4.142&lng=-73.6266');
  ok(r.status === 200 && r.data.lugar.municipio === 'Villavicencio' && r.data.lugar.lat === 4.142, 'mapa: de unas coordenadas saca el municipio y el departamento');
  r = await staff.call('GET', '/api/staff/geo/inversa?lat=999&lng=0');
  ok(r.status === 400, 'mapa: rechaza coordenadas imposibles');
  let img = await raw(staff, '/api/staff/geo/mapa?lat=4.142&lng=-73.6266');
  const bytes = Buffer.from(await img.arrayBuffer());
  ok(img.status === 200 && img.headers.get('content-type') === 'image/png' && bytes.length === 8 && /private/.test(img.headers.get('cache-control')), 'mapa: entrega la imagen del terreno con caché privada');
  const hm = hits.at(-1);
  ok(hm.path === '/v1/staticmap' && hm.q.get('center') === 'lonlat:-73.6266,4.142' && /^lonlat:-73.6266,4.142;/.test(hm.q.get('marker')) && hm.key === 'clave-secreta-de-prueba', 'mapa: centra y marca el punto (longitud primero, como pide Geoapify)');
  img = await raw(staff, '/api/staff/geo/mapa?lat=abc&lng=1');
  ok(img.status === 400, 'mapa: la imagen rechaza coordenadas inválidas');
  mode = '401';
  r = await staff.call('GET', '/api/staff/geo/buscar?q=Otro lugar distinto');
  ok(r.status === 502 && r.data.error === 'geo_key_invalid' && !JSON.stringify(r.data).includes('clave-secreta'), 'mapa: si la clave es inválida avisa sin mostrarla');
  mode = '429';
  r = await staff.call('GET', '/api/staff/geo/buscar?q=Lugar sin creditos');
  ok(r.status === 503 && r.data.error === 'geo_quota', 'mapa: si se acaban los créditos lo explica');
  mode = 'ok';
  let last = 0; for (let i = 0; i < 100; i++) { const x = await maria.call('GET', `/api/staff/geo/buscar?q=Lugar numero ${i}`); last = x.status; if (last === 429) break; }
  ok(last === 429, 'mapa: límite por minuto para que un negocio no agote los créditos');
  delete process.env.GEOAPIFY_API_KEY; geo.close();
}

section('22. Recordatorios de cita por correo');
{
  const sent = [];
  const brevo = http.createServer(async (req, res) => { const ch = []; for await (const c of req) ch.push(c); sent.push({ key: req.headers['api-key'], ...JSON.parse(Buffer.concat(ch).toString() || '{}') }); res.setHeader('content-type', 'application/json'); res.end('{"messageId":"m1"}'); }).listen(0);
  process.env.BREVO_API_BASE = `http://127.0.0.1:${brevo.address().port}`; process.env.BREVO_API_KEY = 'brevo-prueba'; process.env.MAIL_FROM = 'FieldFlow <no-reply@fieldflow.test>';
  delete process.env.CRON_SECRET;
  const hoyR = todayLocal();
  r = await staff.call('GET', '/api/staff/recordatorios');
  ok(r.status === 200 && r.data.activo === true && r.data.correo_ok === true && r.data.cron_ok === false, 'recordatorios: el panel indica si el correo y la corrida diaria están listos');
  const catR = (await staff.call('GET', '/api/staff/catalogo')).data; const svcR = catR.servicios[0];
  let diaR = null; let slotsR = [];
  // Se elige, dentro de la próxima semana (el límite del envío manual), el día con más cupos libres.
  for (let i = 2; i <= 7; i++) { const f = addDays(hoyR, i); const x = (await staff.call('GET', `/api/staff/disponibilidad?servicio_id=${svcR.id}&fecha=${f}`)).data.slots; if (x.length > slotsR.length) { diaR = f; slotsR = x; } }
  ok(diaR && slotsR.length >= 6, 'recordatorios: hay un día con cupos para probar');
  // La cita de Ana se crea por la API (valida el correo); las demás se insertan directo para no depender de los cupos libres.
  let r0 = null; for (const sl of slotsR) { r0 = await staff.call('POST', '/api/staff/citas', { cliente: { telefono: '573008880001', nombre: 'Ana Gómez', correo: 'ana@test.co' }, servicio_id: svcR.id, inicio: sl.inicio, recurso_id: sl.recurso_id }); if (r0.status !== 409) break; }
  r = r0;
  ok(r.status === 200, 'recordatorios: la cita manual acepta el correo del cliente');
  const citaA = r.data.cita?.id || r.data.id;
  const { upsertCliente: upCli } = await import('../lib/convos.mjs'); const { localToUtc: l2u } = await import('../lib/time.mjs');
  const mkCita = (cli, hora) => withNegocio(NID, async () => { const c = await upCli(cli); const ini = l2u(diaR, hora); const id = crypto.randomUUID(); await query("insert into citas (id, negocio_id, cliente_id, servicio_id, recurso_id, inicio, fin, estado, origen, creado_en) values ($1, $2, $3, $4, $5, $6, $7, 'confirmada', 'manual', $8)", [id, NID, c.id, svcR.id, catR.recursos[0].id, ini.toISOString(), new Date(ini.getTime() + 3600000).toISOString(), new Date().toISOString()]); return id; });
  await mkCita({ telefono: '573008880002', nombre: 'Beto Sin Correo' }, '15:00');
  await mkCita({ telefono: '573008880003', nombre: 'Carla Ficha' }, '16:00');
  r = await staff.call('POST', '/api/staff/citas', { cliente: { telefono: '573008880004', nombre: 'Dani Correo Malo', correo: 'no-es-correo' }, servicio_id: svcR.id, inicio: slotsR[0].inicio, recurso_id: slotsR[0].recurso_id });
  ok(r.status === 400 && r.data.error === 'invalid_email', 'recordatorios: rechaza un correo inválido');
  const crmR = (await staff.call('GET', '/api/staff/crm')).data.contactos.find((c) => c.nombre === 'Carla Ficha');
  await staff.call('PATCH', `/api/staff/contactos/${crmR.id}`, { correo: 'carla@test.co' });
  r = await staff.call('POST', '/api/staff/recordatorios/enviar', { dia: diaR });
  ok(r.status === 200 && r.data.enviados === 2 && r.data.sin_correo >= 1 && r.data.errores === 0, 'recordatorios: envía a quien tiene correo (propio o de su ficha) y cuenta a quien no');
  ok(sent.length === 2 && sent.every((m) => m.key === 'brevo-prueba') && sent.map((m) => m.to[0].email).sort().join() === 'ana@test.co,carla@test.co', 'recordatorios: cada correo va a su destinatario con la clave de Brevo');
  const m1 = sent.find((m) => m.to[0].email === 'ana@test.co');
  ok(m1.subject.includes(svcR.nombre_es) && m1.sender.name && m1.htmlContent.includes('Ana') && /a\. m\.|p\. m\./.test(m1.textContent), 'recordatorios: el asunto trae el servicio y el texto la hora');
  const tok = (m1.textContent.match(/\?t=([\w-]+)/) || [])[1];
  ok(tok && (await new Jar().call('POST', '/api/auth/enter', { token: tok })).status === 200, 'recordatorios: el botón lleva a «Mis citas» sin crear cuenta');
  r = await staff.call('POST', '/api/staff/recordatorios/enviar', { dia: diaR });
  ok(r.data.enviados === 0 && sent.length === 2, 'recordatorios: no se repite el mismo recordatorio');
  const res2 = (await staff.call('GET', '/api/staff/recordatorios')).data;
  ok(typeof res2.citas === 'number' && typeof res2.con_correo === 'number', 'recordatorios: el panel cuenta citas de mañana, con y sin correo');
  // cancelada: no se avisa
  const idEva = await mkCita({ telefono: '573008880005', nombre: 'Eva Cancelada', correo: 'eva@test.co' }, '14:00');
  await query("update citas set estado = 'cancelada' where id = $1", [idEva]);
  r = await staff.call('POST', '/api/staff/recordatorios/enviar', { dia: diaR });
  ok(r.data.enviados === 0 && !sent.some((m) => m.to[0].email === 'eva@test.co'), 'recordatorios: una cita cancelada no recibe recordatorio');
  // aislamiento
  r = await maria.call('POST', '/api/staff/recordatorios/enviar', { dia: diaR });
  ok(r.status === 200 && r.data.enviados === 0 && sent.length === 2, 'recordatorios: otro negocio no toca tus citas');
  // corrida diaria
  r = await new Jar().call('GET', '/api/cron/recordatorios');
  ok(r.status === 503 && r.data.error === 'cron_not_configured', 'cron: sin CRON_SECRET se niega');
  process.env.CRON_SECRET = 'secreto-de-prueba-largo-123';
  r = await new Jar().call('GET', '/api/cron/recordatorios');
  ok(r.status === 401, 'cron: sin credencial responde 401');
  r = await new Jar().call('GET', '/api/cron/recordatorios', undefined, { authorization: 'Bearer otro-secreto-distinto-123456' });
  ok(r.status === 401, 'cron: con credencial equivocada responde 401');
  await query("update citas set recordatorio_en = null where id = $1", [citaA]);
  await staff.call('PUT', '/api/staff/config', { recordatorios_correo: 'off' });
  r = await new Jar().call('GET', `/api/cron/recordatorios?dia=${diaR}`, undefined, { authorization: 'Bearer secreto-de-prueba-largo-123' });
  ok(r.status === 200 && r.data.enviados === 0 && sent.length === 2, 'cron: respeta el interruptor apagado del negocio');
  await staff.call('PUT', '/api/staff/config', { recordatorios_correo: 'on' });
  r = await new Jar().call('GET', `/api/cron/recordatorios?dia=${diaR}`, undefined, { authorization: 'Bearer secreto-de-prueba-largo-123' });
  ok(r.status === 200 && r.data.enviados === 1 && sent.length === 3 && r.data.negocios >= 2, 'cron: con la credencial correcta recorre los negocios y envía lo pendiente');
  r = await new Jar().call('GET', '/api/salud');
  ok(r.data.env.CRON_SECRET === true && 'GEOAPIFY' in r.data.env && 'BREVO_API_KEY' in r.data.env, 'salud: informa si CRON_SECRET, Geoapify y Brevo están puestos (solo sí/no)');
  r = await new Jar().call('POST', '/api/public/n/x/entrar', {});
  delete process.env.BREVO_API_KEY; delete process.env.CRON_SECRET; delete process.env.MAIL_FROM; delete process.env.BREVO_API_BASE; brevo.close();
}

section('23. Guardados que se pueden reintentar sin duplicar');
{
  const id1 = crypto.randomUUID(); const id2 = crypto.randomUUID(); const id3 = crypto.randomUUID();
  r = await staff.call('POST', '/api/staff/terrenos', { id: id1, titulo: 'Reintento', area_ha: 3, precio: 100000000 });
  const r2 = await staff.call('POST', '/api/staff/terrenos', { id: id1, titulo: 'Reintento', area_ha: 3, precio: 100000000 });
  ok(r.status === 200 && r2.status === 200 && r.data.id === id1 && r2.data.id === id1, 'terreno: guardar dos veces con el mismo identificador devuelve la misma ficha');
  ok((await staff.call('GET', '/api/staff/terrenos')).data.terrenos.filter((x) => x.titulo === 'Reintento').length === 1, 'terreno: un reintento no duplica la ficha');
  r = await staff.call('POST', '/api/staff/terrenos', { id: 'no-es-uuid', titulo: 'X' });
  ok(r.status === 400 && r.data.error === 'invalid_id', 'terreno: rechaza identificadores inválidos');
  r = await maria.call('POST', '/api/staff/terrenos', { id: id1, titulo: 'Robo' });
  ok(r.status === 404, 'terreno: otro negocio no puede usar un identificador ajeno');
  r = await staff.call('POST', '/api/staff/ganado/animales', { id: id2, arete: 'RT-1', sexo: 'hembra' });
  const a2 = await staff.call('POST', '/api/staff/ganado/animales', { id: id2, arete: 'RT-1', sexo: 'hembra' });
  ok(r.status === 200 && a2.status === 200 && (await staff.call('GET', '/api/staff/ganado')).data.animales.filter((x) => x.arete === 'RT-1').length === 1, 'animal: un reintento no duplica el animal');
  r = await staff.call('POST', '/api/staff/ganado/eventos', { id: id3, animal_id: id2, tipo: 'peso', fecha: todayLocal(), valor: 300 });
  const e2 = await staff.call('POST', '/api/staff/ganado/eventos', { id: id3, animal_id: id2, tipo: 'peso', fecha: todayLocal(), valor: 300 });
  const det = (await staff.call('GET', `/api/staff/ganado/animales/${id2}`)).data;
  ok(r.status === 200 && e2.data.repetido === true && det.eventos.filter((e) => e.tipo === 'peso').length === 1, 'evento: un reintento no repite el pesaje');
  r = await maria.call('POST', '/api/staff/ganado/eventos', { id: id3, animal_id: id2, tipo: 'peso', fecha: todayLocal(), valor: 1 });
  ok(r.status === 404, 'evento: otro negocio no puede reutilizar ese identificador');
}

console.log(`\n${pass} correctas, ${fail} con error`);
llm.close();
process.exit(fail ? 1 : 0);
