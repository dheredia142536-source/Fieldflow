// Pruebas del backend (sin red, base SQLite en memoria). Ejecuta: npm test
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mockCompletion } from './mock-llm.mjs';

process.env.FF_LOCAL_DB = ':memory:';
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
r = await maria.call('POST', '/api/staff/demo-data', {});
ok(r.status === 200 && r.data.skipped === false, 'puede cargar sus propios datos de ejemplo');
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
r = await maria.call('POST', '/api/staff/simulador', { telefono: '573001234567', nombre: 'Ana', texto: 'Hola', forzar: true });
ok(r.status === 200 && r.data.sent === false, 'el simulador del negocio nuevo funciona y no envía WhatsApp real');
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

console.log(`\n${pass} correctas, ${fail} con error`);
llm.close();
process.exit(fail ? 1 : 0);
