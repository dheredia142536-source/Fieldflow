import { query, tx } from './db.mjs';
import { nid, withNegocio } from './tenant.mjs';
import { crearNegocioConUsuario, iniciarRegistro, reenviarCodigo, verificarCodigo, FINES, TIPOS } from './registro.mjs';
import { DEFAULTS, getConfig, getNegocio, setConfig } from './config.mjs';
import { CLIENT_COOKIE, STAFF_COOKIE, createRouter } from './http.mjs';
import { hashPassword, sha256, signSession, verifyPassword } from './session.mjs';
import { HttpError, digits, iso, nowIso, sleep, uid } from './util.mjs';
import { addDays, isYmd, localToUtc, minutes, todayLocal } from './time.mjs';
import { slotsFor } from './availability.mjs';
import { cambiarEstado, cancelarCita, crearCita, getCita, listCitas, reprogramarCita } from './citas.mjs';
import { getConversation, listMessages, mapMsg, saveMessage, setHandling, setState, upsertCliente, usageToday } from './convos.mjs';
import { handleCustomerMessage } from './bot.mjs';
import { greeting } from './guided-bot.mjs';
import { appUrl } from './inbound.mjs';
import { dashboardData } from './dashboard.mjs';
import { iniciarRecuperacion, completarRecuperacion } from './recuperar.mjs';
import { googleStart, googleCallback, googleConfigured } from './google.mjs';
import { llmEnabled, llmSettings } from './llm.mjs';
import { waConfigured } from './whatsapp-send.mjs';
import { detectLang } from './util.mjs';
import { listContactos, crearContacto, editarContacto, borrarContacto, detalleContacto, agregarHistorial, enviarCorreo } from './crm.mjs';
import { miEnlace, cambiarSlug, entrarPorEnlace, identificarVisitante } from './enlace.mjs';
import { listTerrenos, guardarTerreno, detalleTerreno, borrarTerreno, agregarFoto, borrarFoto, fotoPortada, agregarInteresado, editarInteresado, borrarInteresado } from './terrenos.mjs';
import { listGanado, alertasGanado, guardarAnimal, detalleAnimal, borrarAnimal, fotoAnimal, crearEvento, borrarEvento, eventoLote } from './ganado.mjs';
import { listProductos, guardarProducto, getDia, fijarApertura, agregarMovimiento, borrarMovimiento, agregarStock, borrarStock, cerrarDia, reabrirDia, finanzas } from './dia.mjs';

const DAY = 86400000;
const lang2 = (l) => (l === 'en' ? 'en' : 'es');
const need = (cond, code, msg) => { if (!cond) throw new HttpError(400, code, msg || code); };
const text = (v, max = 500) => String(v ?? '').trim().slice(0, max);

export function buildRouter() {
  const { add, handle } = createRouter();

  // ── Público / auth ──────────────────────────────────────────────────────────
  add('GET', '/api/health', null, () => ({ ok: true, time: nowIso() }));

  // Diagnóstico de la base de datos (sin secretos): indica en qué paso falla.
  add('GET', '/api/salud', null, async () => {
    const env = { DATABASE_URL: !!(process.env.DATABASE_URL || process.env.POSTGRES_URL), SESSION_SECRET: !!process.env.SESSION_SECRET, BREVO_API_KEY: !!process.env.BREVO_API_KEY, MAIL_FROM: !!process.env.MAIL_FROM, GOOGLE: googleConfigured() };
    try {
      const [r] = await query('select count(*)::int as n from registros_pendientes');
      return { db: 'ok', pendientes: r.n, env };
    } catch (e) {
      const msg = String(e?.message || e).replace(/[a-z]+:\/\/\S+/gi, '[url]').slice(0, 160);
      return { db: 'error', codigo: e?.code || null, mensaje: msg, env };
    }
  });

  add('GET', '/api/public', null, async (c) => {
    if (!c.negocioId) return { nombre: 'FieldFlow', idioma: 'es', whatsapp: null, tipos: TIPOS, fines: FINES };
    const cfg = await getConfig();
    const neg = await getNegocio();
    return { nombre: cfg.negocio_nombre, idioma: cfg.idioma_defecto, whatsapp: neg?.principal ? digits(process.env.WHATSAPP_PUBLIC_NUMBER) || null : null };
  });

  // Entrada por el enlace público del negocio: crea un visitante y abre el chat, sin cuenta ni formularios.
  add('POST', '/api/public/n/:slug/entrar', null, async (c) => {
    const r = await entrarPorEnlace({ slug: c.params[0], idioma: c.body.idioma, ip: c.ip, clienteActual: c.client });
    if (r.nuevo || !c.client || c.client.nid !== r.negocio.id) c.setCookie(CLIENT_COOKIE, signSession({ k: 'client', id: r.clienteId, nid: r.negocio.id }, 30 * 86400), 30 * 86400);
    return { ok: true, negocio: r.negocio.nombre, nuevo: r.nuevo };
  });

  add('GET', '/api/auth/me', null, async (c) => {
    let staff = null; let client = null;
    if (c.staff) {
      const [u] = await query('select u.id, u.correo, u.nombre, n.nombre as negocio from usuarios_negocio u join negocios n on n.id = u.negocio_id where u.id = $1 and u.negocio_id = $2', [c.staff.id, c.staff.nid]);
      staff = u || null;
    }
    if (c.client) { const [u] = await query('select id, nombre, idioma from clientes where id = $1 and negocio_id = $2', [c.client.id, c.client.nid]); client = u || null; }
    return { staff, client };
  });

  add('POST', '/api/auth/login', null, async (c) => {
    const correo = text(c.body.correo, 200).toLowerCase();
    const password = String(c.body.password || '');
    need(correo && password, 'missing_fields', 'Correo y contraseña requeridos');
    const [u0] = await query('select id from usuarios_negocio where correo = $1', [correo]);
    if (!u0) {
      // Primer acceso del administrador de la plataforma: se crea su negocio (el principal, dueño del WhatsApp de la plataforma).
      const ae = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      const ap = process.env.ADMIN_PASSWORD || '';
      const [{ n }] = await query('select cast(count(*) as integer) as n from usuarios_negocio');
      if (Number(n) === 0 && (!ae || ap.length < 8)) throw new HttpError(401, 'no_admin_configured', 'Configura ADMIN_EMAIL y ADMIN_PASSWORD (mín. 8 caracteres) en Vercel');
      if (ae && ap.length >= 8 && correo === ae && password === ap) {
        const [{ p }] = await query('select cast(count(*) as integer) as p from negocios where principal = 1');
        await crearNegocioConUsuario({
          datos: { empresa: process.env.BUSINESS_NAME || 'FieldFlow', nombre: 'Admin', idioma: 'es', fines: [] },
          correo: ae, hash: hashPassword(ap), principal: Number(p) === 0,
        });
      }
    }
    let [u] = await query('select id, negocio_id, correo, nombre, hash from usuarios_negocio where correo = $1', [correo]);
    // El administrador de la plataforma se rige por ADMIN_PASSWORD: si cambió en Vercel, se sincroniza la clave guardada.
    if (u && u0 !== undefined) {
      const ae2 = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      const ap2 = process.env.ADMIN_PASSWORD || '';
      if (ae2 && ap2.length >= 8 && correo === ae2 && password === ap2 && !verifyPassword(password, u.hash)) {
        const nuevo = hashPassword(ap2);
        await query('update usuarios_negocio set hash = $1 where id = $2', [nuevo, u.id]);
        u = { ...u, hash: nuevo };
      }
    }
    if (!u || !verifyPassword(password, u.hash)) { await sleep(400); throw new HttpError(401, 'bad_credentials', 'Correo o contraseña incorrectos'); }
    c.setCookie(STAFF_COOKIE, signSession({ k: 'staff', id: u.id, nid: u.negocio_id }, 7 * 86400), 7 * 86400);
    return { ok: true, usuario: { id: u.id, correo: u.correo, nombre: u.nombre } };
  });

  // ── Registro con verificación por correo ────────────────────────────────────
  add('POST', '/api/auth/registro', null, async (c) => iniciarRegistro(c.body, c.ip));
  add('POST', '/api/auth/registro/reenviar', null, async (c) => reenviarCodigo(c.body.correo));
  add('POST', '/api/auth/registro/verificar', null, async (c) => {
    const r = await verificarCodigo(c.body.correo, c.body.codigo);
    c.setCookie(STAFF_COOKIE, signSession({ k: 'staff', id: r.userId, nid: r.negocioId }, 7 * 86400), 7 * 86400);
    return { ok: true, usuario: { id: r.userId, correo: r.correo, nombre: r.nombre }, negocio: r.negocio };
  });

  // ── Recuperar contraseña (código por correo) ────────────────────────────────
  add('POST', '/api/auth/recuperar', null, async (c) => iniciarRecuperacion(c.body, c.ip));
  add('POST', '/api/auth/recuperar/verificar', null, async (c) => {
    const u = await completarRecuperacion(c.body);
    c.setCookie(STAFF_COOKIE, signSession({ k: 'staff', id: u.id, nid: u.negocio_id }, 7 * 86400), 7 * 86400);
    return { ok: true, usuario: { id: u.id, correo: u.correo, nombre: u.nombre } };
  });

  // ── Ingreso con Google ──────────────────────────────────────────────────────
  add('GET', '/api/auth/google/start', null, async (c) => googleStart(c));
  add('GET', '/api/auth/google/callback', null, async (c) => googleCallback(c));

  add('POST', '/api/auth/logout', null, async (c) => {
    const which = c.body.rol;
    if (which !== 'client') c.setCookie(STAFF_COOKIE, '', 0);
    if (which !== 'staff') c.setCookie(CLIENT_COOKIE, '', 0);
    return { ok: true };
  });

  add('POST', '/api/auth/enter', null, async (c) => {
    const token = String(c.body.token || '');
    need(token.length >= 20, 'invalid_token');
    const [t] = await query('select cliente_id, expira_en from tokens_acceso where token_hash = $1', [sha256(token)]);
    if (!t || new Date(t.expira_en).getTime() < Date.now()) throw new HttpError(401, 'link_expired', 'El enlace expiró. Escribe de nuevo por WhatsApp.');
    const [cl] = await query('select id, negocio_id, nombre, idioma from clientes where id = $1', [t.cliente_id]);
    c.setCookie(CLIENT_COOKIE, signSession({ k: 'client', id: cl.id, nid: cl.negocio_id }, 30 * 86400), 30 * 86400);
    return { ok: true, cliente: { id: cl.id, nombre: cl.nombre, idioma: cl.idioma } };
  });

  // ── Cliente final ───────────────────────────────────────────────────────────
  const me = async (c) => {
    const [cl] = await query('select * from clientes where id = $1 and negocio_id = $2', [c.client.id, nid()]);
    if (!cl) throw new HttpError(401, 'unauthorized');
    return cl;
  };

  add('GET', '/api/client/chat', 'client', async (c) => {
    const cliente = await me(c);
    const conv = await getConversation(cliente.id);
    const after = c.q.get('after');
    if (!after) {
      // Saludo inicial si el asistente aún no ha hablado (p. ej. el cliente llegó desde WhatsApp).
      const [{ n }] = await query("select cast(count(*) as integer) as n from mensajes where conversacion_id = $1 and rol in ('bot', 'humano')", [conv.id]);
      if (Number(n) === 0) {
        const g = await greeting({ lang: lang2(cliente.idioma), cfg: await getConfig() });
        await saveMessage(conv.id, 'bot', g.contenido, g.meta);
      }
    }
    const [fresh] = await query('select atendida_por from conversaciones where id = $1', [conv.id]);
    return { mensajes: await listMessages(conv.id, { after }), atendida_por: fresh.atendida_por, cliente: { nombre: cliente.nombre, idioma: cliente.idioma } };
  });

  add('POST', '/api/client/chat', 'client', async (c) => {
    const cliente = await me(c);
    const t = text(c.body.texto, 1000);
    need(t, 'empty_message', 'Mensaje vacío');
    const lang = c.body.idioma ? lang2(c.body.idioma) : lang2(cliente.idioma);
    if (lang !== cliente.idioma) await query('update clientes set idioma = $1 where id = $2 and negocio_id = $3', [lang, cliente.id, nid()]);
    const conv = await getConversation(cliente.id);
    const payload = c.body.payload ? text(c.body.payload, 300) : null;
    const mensajes = await handleCustomerMessage({ cliente: { ...cliente, idioma: lang }, conv, texto: t, payload, lang });
    const [fresh] = await query('select atendida_por from conversaciones where id = $1', [conv.id]);
    return { mensajes, atendida_por: fresh.atendida_por };
  });

  add('GET', '/api/client/citas', 'client', async (c) => {
    const now = Date.now();
    const citas = await listCitas({ desde: new Date(now - 120 * DAY).toISOString(), hasta: new Date(now + 400 * DAY).toISOString(), clienteId: c.client.id, incluirCanceladas: true });
    return { citas };
  });

  add('POST', '/api/client/citas/:id/cancelar', 'client', async (c) => ({ cita: await cancelarCita({ citaId: c.params[0], clienteId: c.client.id }) }));

  add('POST', '/api/client/identificar', 'client', async (c) => identificarVisitante(await me(c), c.body));

  add('POST', '/api/client/idioma', 'client', async (c) => {
    await query('update clientes set idioma = $1 where id = $2 and negocio_id = $3', [lang2(c.body.idioma), c.client.id, nid()]);
    return { ok: true };
  });

  // ── Negocio ─────────────────────────────────────────────────────────────────
  add('GET', '/api/staff/resumen', 'staff', async () => {
    const hoy = todayLocal();
    const desde = localToUtc(hoy, '00:00').toISOString();
    const hasta = localToUtc(addDays(hoy, 1), '00:00').toISOString();
    const citasHoy = await listCitas({ desde, hasta });
    const semana = await listCitas({ desde, hasta: localToUtc(addDays(hoy, 7), '00:00').toISOString() });
    const [{ n: totalClientes }] = await query('select cast(count(*) as integer) as n from clientes where negocio_id = $1', [nid()]);
    const atencion = await query(
      `select cv.id, cv.atendida_por, cv.ultimo_mensaje_en, cl.nombre, coalesce(cl.contacto_tel, cl.telefono) as telefono from conversaciones cv
       join clientes cl on cl.id = cv.cliente_id where cv.negocio_id = $1 and cv.necesita_atencion = 1 order by cv.ultimo_mensaje_en desc limit 10`,
      [nid()],
    );
    for (const a of atencion) {
      const [m] = await query('select contenido from mensajes where conversacion_id = $1 order by creado_en desc limit 1', [a.id]);
      a.ultimo = m?.contenido || '';
      a.ultimo_mensaje_en = iso(a.ultimo_mensaje_en);
    }
    const proxima = (await listCitas({ desde: new Date().toISOString(), hasta: new Date(Date.now() + 30 * DAY).toISOString() }))[0] || null;
    return { hoy, citas_hoy: citasHoy, semana: semana.length, clientes: Number(totalClientes), atencion, proxima };
  });

  add('GET', '/api/staff/dashboard', 'staff', async () => dashboardData());

  add('GET', '/api/staff/citas', 'staff', async (c) => {
    const d = c.q.get('desde'); const h = c.q.get('hasta');
    need(isYmd(d) && isYmd(h), 'invalid_range', 'desde/hasta YYYY-MM-DD');
    return { citas: await listCitas({ desde: localToUtc(d, '00:00').toISOString(), hasta: localToUtc(addDays(h, 1), '00:00').toISOString(), incluirCanceladas: c.q.get('todas') === '1' }) };
  });

  add('POST', '/api/staff/citas', 'staff', async (c) => {
    const b = c.body;
    let clienteId = b.cliente_id;
    if (!clienteId) {
      need(b.cliente && digits(b.cliente.telefono), 'client_required', 'Cliente requerido');
      clienteId = (await upsertCliente({ telefono: b.cliente.telefono, nombre: text(b.cliente.nombre, 120) || null })).id;
    }
    return { cita: await crearCita({ clienteId, servicioId: text(b.servicio_id, 60), inicio: text(b.inicio, 40), recursoId: b.recurso_id || null, notas: text(b.notas, 500) || null, origen: 'manual' }) };
  });

  add('PATCH', '/api/staff/citas/:id', 'staff', async (c) => {
    const id = c.params[0];
    const b = c.body;
    if (b.nuevo_inicio) await reprogramarCita({ citaId: id, nuevoInicio: text(b.nuevo_inicio, 40), recursoId: b.recurso_id || null });
    if (b.estado) await cambiarEstado({ citaId: id, estado: b.estado });
    if ('notas' in b) await query('update citas set notas = $1 where id = $2 and negocio_id = $3', [text(b.notas, 500) || null, id, nid()]);
    const cita = await getCita(id);
    if (!cita) throw new HttpError(404, 'not_found');
    return { cita };
  });

  add('GET', '/api/staff/disponibilidad', 'staff', async (c) => {
    const slots = await slotsFor({ servicioId: c.q.get('servicio_id') || '', ymd: c.q.get('fecha') || '', excludeCitaId: c.q.get('excluir') || null });
    return { slots };
  });

  add('GET', '/api/staff/catalogo', 'staff', async () => {
    const servicios = await query('select * from servicios where negocio_id = $1 order by nombre_es', [nid()]);
    const recursos = await query('select * from recursos where negocio_id = $1 order by nombre', [nid()]);
    const links = await query('select sr.servicio_id, sr.recurso_id from servicio_recurso sr join servicios s on s.id = sr.servicio_id where s.negocio_id = $1', [nid()]);
    const disp = await query('select d.recurso_id, d.dia_semana, d.hora_inicio, d.hora_fin from disponibilidad d join recursos r on r.id = d.recurso_id where r.negocio_id = $1 order by d.dia_semana, d.hora_inicio', [nid()]);
    return {
      servicios: servicios.map((s) => ({ ...s, activo: !!s.activo, recursos: links.filter((l) => l.servicio_id === s.id).map((l) => l.recurso_id) })),
      recursos: recursos.map((r) => ({ ...r, activo: !!r.activo, horarios: disp.filter((d) => d.recurso_id === r.id).map(({ dia_semana, hora_inicio, hora_fin }) => ({ dia_semana, hora_inicio, hora_fin })) })),
    };
  });

  add('POST', '/api/staff/servicios', 'staff', async (c) => {
    const b = c.body;
    need(text(b.nombre_es) && text(b.nombre_en), 'name_required', 'Nombre en ES y EN');
    const dur = Number(b.duracion_min);
    need(Number.isInteger(dur) && dur >= 15 && dur <= 720, 'invalid_duration', 'Duración 15–720 min');
    const id = b.id || uid();
    await tx(async (q) => {
      const [prev] = await q('select negocio_id from servicios where id = $1', [id]);
      if (prev && prev.negocio_id !== nid()) throw new HttpError(404, 'not_found');
      await q(
        `insert into servicios (id, negocio_id, nombre_es, nombre_en, descripcion_es, descripcion_en, duracion_min, activo, precio) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (id) do update set nombre_es = excluded.nombre_es, nombre_en = excluded.nombre_en, descripcion_es = excluded.descripcion_es,
         descripcion_en = excluded.descripcion_en, duracion_min = excluded.duracion_min, activo = excluded.activo, precio = excluded.precio`,
        [id, nid(), text(b.nombre_es, 120), text(b.nombre_en, 120), text(b.descripcion_es, 300) || null, text(b.descripcion_en, 300) || null, dur, b.activo === false ? 0 : 1, Math.max(0, Math.round(Number(b.precio) || 0))],
      );
      await q('delete from servicio_recurso where servicio_id = $1', [id]);
      const mine = new Set((await q('select id from recursos where negocio_id = $1', [nid()])).map((r) => r.id));
      for (const r of new Set(Array.isArray(b.recursos) ? b.recursos : [])) if (mine.has(r)) await q('insert into servicio_recurso (servicio_id, recurso_id) values ($1, $2)', [id, r]);
    });
    return { id };
  });

  add('POST', '/api/staff/recursos', 'staff', async (c) => {
    const b = c.body;
    need(text(b.nombre), 'name_required', 'Nombre requerido');
    const horarios = Array.isArray(b.horarios) ? b.horarios : [];
    for (const h of horarios) {
      need(Number.isInteger(h.dia_semana) && h.dia_semana >= 0 && h.dia_semana <= 6, 'invalid_schedule');
      need(/^\d{2}:\d{2}$/.test(h.hora_inicio) && /^\d{2}:\d{2}$/.test(h.hora_fin) && minutes(h.hora_inicio) < minutes(h.hora_fin), 'invalid_schedule', 'Horario inválido');
    }
    const id = b.id || uid();
    await tx(async (q) => {
      const [prev] = await q('select negocio_id from recursos where id = $1', [id]);
      if (prev && prev.negocio_id !== nid()) throw new HttpError(404, 'not_found');
      await q(
        'insert into recursos (id, negocio_id, nombre, tipo, activo) values ($1, $2, $3, $4, $5) on conflict (id) do update set nombre = excluded.nombre, tipo = excluded.tipo, activo = excluded.activo',
        [id, nid(), text(b.nombre, 100), text(b.tipo, 60) || null, b.activo === false ? 0 : 1],
      );
      await q('delete from disponibilidad where recurso_id = $1', [id]);
      for (const h of horarios) await q('insert into disponibilidad (id, recurso_id, dia_semana, hora_inicio, hora_fin) values ($1, $2, $3, $4, $5)', [uid(), id, h.dia_semana, h.hora_inicio, h.hora_fin]);
    });
    return { id };
  });

  add('GET', '/api/staff/conversaciones', 'staff', async () => {
    const rows = await query(
      `select cv.id, cv.atendida_por, cv.necesita_atencion, cv.ultimo_mensaje_en, cv.creado_en, cl.id as cliente_id, cl.nombre, coalesce(cl.contacto_tel, cl.telefono) as telefono, cl.idioma
       from conversaciones cv join clientes cl on cl.id = cv.cliente_id where cv.negocio_id = $1 order by coalesce(cv.ultimo_mensaje_en, cv.creado_en) desc limit 60`,
      [nid()],
    );
    for (const r of rows) {
      const [m] = await query('select contenido, rol from mensajes where conversacion_id = $1 order by creado_en desc limit 1', [r.id]);
      r.ultimo = m?.contenido || '';
      r.ultimo_rol = m?.rol || null;
      r.necesita_atencion = !!r.necesita_atencion;
      r.ultimo_mensaje_en = iso(r.ultimo_mensaje_en || r.creado_en);
    }
    return { conversaciones: rows };
  });

  const convDetail = async (id) => {
    const [cv] = await query(
      `select cv.id, cv.atendida_por, cv.necesita_atencion, cl.id as cliente_id, cl.nombre, coalesce(cl.contacto_tel, cl.telefono) as telefono, cl.idioma
       from conversaciones cv join clientes cl on cl.id = cv.cliente_id where cv.id = $1 and cv.negocio_id = $2`, [id, nid()],
    );
    if (!cv) throw new HttpError(404, 'not_found');
    return { conversacion: { ...cv, necesita_atencion: !!cv.necesita_atencion }, mensajes: await listMessages(id, { limit: 200 }) };
  };
  add('GET', '/api/staff/conversaciones/:id', 'staff', async (c) => convDetail(c.params[0]));
  add('POST', '/api/staff/conversaciones/:id/mensajes', 'staff', async (c) => {
    const id = c.params[0];
    const t = text(c.body.texto, 1000);
    need(t, 'empty_message');
    await convDetail(id);
    await setHandling(id, 'humano', false);
    return { mensaje: await saveMessage(id, 'humano', t, { staff: c.staff.id }) };
  });
  add('POST', '/api/staff/conversaciones/:id/tomar', 'staff', async (c) => { await convDetail(c.params[0]); await setHandling(c.params[0], 'humano', false); return { ok: true }; });
  add('POST', '/api/staff/conversaciones/:id/devolver', 'staff', async (c) => {
    await convDetail(c.params[0]);
    await setHandling(c.params[0], 'bot', false);
    await setState(c.params[0], null);
    return { ok: true };
  });

  // ── CRM ─────────────────────────────────────────────────────────────────────
  add('GET', '/api/staff/crm', 'staff', async () => listContactos());
  add('POST', '/api/staff/contactos', 'staff', async (c) => crearContacto(c.body));
  add('GET', '/api/staff/contactos/:id', 'staff', async (c) => detalleContacto(c.params[0]));
  add('PATCH', '/api/staff/contactos/:id', 'staff', async (c) => editarContacto(c.params[0], c.body));
  add('DELETE', '/api/staff/contactos/:id', 'staff', async (c) => borrarContacto(c.params[0]));
  add('POST', '/api/staff/contactos/:id/historial', 'staff', async (c) => agregarHistorial(c.params[0], c.body));
  add('POST', '/api/staff/contactos/:id/correo', 'staff', async (c) => {
    const [u] = await query('select correo, nombre from usuarios_negocio where id = $1 and negocio_id = $2', [c.staff.id, nid()]);
    const neg = await getNegocio();
    return enviarCorreo(c.params[0], c.body, u, neg?.nombre);
  });

  // ── Productos, caja y stock por día ─────────────────────────────────────────
  add('GET', '/api/staff/productos', 'staff', async () => listProductos());
  add('POST', '/api/staff/productos', 'staff', async (c) => guardarProducto(c.body));
  add('GET', '/api/staff/finanzas', 'staff', async () => finanzas());
  add('GET', '/api/staff/dia/:ymd', 'staff', async (c) => getDia(c.params[0]));
  add('PUT', '/api/staff/dia/:ymd/apertura', 'staff', async (c) => fijarApertura(c.params[0], c.body));
  add('POST', '/api/staff/dia/:ymd/caja', 'staff', async (c) => agregarMovimiento(c.params[0], c.body));
  add('DELETE', '/api/staff/caja/:id', 'staff', async (c) => borrarMovimiento(c.params[0]));
  add('POST', '/api/staff/dia/:ymd/stock', 'staff', async (c) => agregarStock(c.params[0], c.body));
  add('DELETE', '/api/staff/stock/:id', 'staff', async (c) => borrarStock(c.params[0]));
  add('POST', '/api/staff/dia/:ymd/cerrar', 'staff', async (c) => cerrarDia(c.params[0], c.body));
  add('POST', '/api/staff/dia/:ymd/reabrir', 'staff', async (c) => reabrirDia(c.params[0]));

  // ── Mi enlace ───────────────────────────────────────────────────────────────
  add('GET', '/api/staff/enlace', 'staff', async (c) => miEnlace(c.origin));
  add('POST', '/api/staff/enlace', 'staff', async (c) => cambiarSlug(c.body.slug, c.origin));

  // ── Terrenos (compra y venta) ───────────────────────────────────────────────
  add('GET', '/api/staff/terrenos', 'staff', async () => listTerrenos());
  add('POST', '/api/staff/terrenos', 'staff', async (c) => guardarTerreno(c.body));
  add('GET', '/api/staff/terrenos/:id', 'staff', async (c) => detalleTerreno(c.params[0]));
  add('DELETE', '/api/staff/terrenos/:id', 'staff', async (c) => borrarTerreno(c.params[0]));
  add('POST', '/api/staff/terrenos/:id/fotos', 'staff', async (c) => agregarFoto(c.params[0], c.body));
  add('DELETE', '/api/staff/terreno-fotos/:id', 'staff', async (c) => borrarFoto(c.params[0]));
  add('POST', '/api/staff/terreno-fotos/:id/portada', 'staff', async (c) => fotoPortada(c.params[0]));
  add('POST', '/api/staff/terrenos/:id/interesados', 'staff', async (c) => agregarInteresado(c.params[0], c.body));
  add('PATCH', '/api/staff/terreno-interesados/:id', 'staff', async (c) => editarInteresado(c.params[0], c.body));
  add('DELETE', '/api/staff/terreno-interesados/:id', 'staff', async (c) => borrarInteresado(c.params[0]));

  // ── Ganado ──────────────────────────────────────────────────────────────────
  add('GET', '/api/staff/ganado', 'staff', async () => listGanado());
  add('GET', '/api/staff/ganado/alertas', 'staff', async () => alertasGanado());
  add('POST', '/api/staff/ganado/animales', 'staff', async (c) => guardarAnimal(c.body));
  add('GET', '/api/staff/ganado/animales/:id', 'staff', async (c) => detalleAnimal(c.params[0]));
  add('DELETE', '/api/staff/ganado/animales/:id', 'staff', async (c) => borrarAnimal(c.params[0]));
  add('POST', '/api/staff/ganado/animales/:id/foto', 'staff', async (c) => fotoAnimal(c.params[0], c.body));
  add('POST', '/api/staff/ganado/eventos', 'staff', async (c) => crearEvento(c.body));
  add('DELETE', '/api/staff/ganado/eventos/:id', 'staff', async (c) => borrarEvento(c.params[0]));
  add('POST', '/api/staff/ganado/lote', 'staff', async (c) => eventoLote(c.body));

  add('GET', '/api/staff/clientes', 'staff', async (c) => {
    const term = `%${text(c.q.get('q'), 60).toLowerCase()}%`;
    const rows = await query(
      `select cl.id, cl.nombre, cl.telefono, cl.idioma, cl.notas,
       (select cast(count(*) as integer) from citas ci where ci.cliente_id = cl.id and ci.estado <> 'cancelada') as citas
       from clientes cl where cl.negocio_id = $2 and (lower(coalesce(cl.nombre, '')) like $1 or cl.telefono like $1) order by cl.creado_en desc limit 100`,
      [term, nid()],
    );
    return { clientes: rows };
  });
  add('GET', '/api/staff/clientes/:id', 'staff', async (c) => {
    const [cl] = await query('select id, nombre, telefono, idioma, notas from clientes where id = $1 and negocio_id = $2', [c.params[0], nid()]);
    if (!cl) throw new HttpError(404, 'not_found');
    const citas = await listCitas({ desde: '2000-01-01T00:00:00.000Z', hasta: '2100-01-01T00:00:00.000Z', clienteId: cl.id, incluirCanceladas: true });
    const [cv] = await query('select id from conversaciones where cliente_id = $1 and negocio_id = $2 limit 1', [cl.id, nid()]);
    return { cliente: cl, citas: citas.reverse(), conversacion_id: cv?.id || null };
  });
  add('PATCH', '/api/staff/clientes/:id', 'staff', async (c) => {
    await query('update clientes set nombre = $1, notas = $2, idioma = $3 where id = $4 and negocio_id = $5', [text(c.body.nombre, 120) || null, text(c.body.notas, 1000) || null, lang2(c.body.idioma), c.params[0], nid()]);
    return { ok: true };
  });

  const estadoSistema = async () => {
    const llm = llmSettings();
    let host = '';
    try { host = new URL(llm.baseUrl).host; } catch { /* ignore */ }
    return {
      llm: { activo: llmEnabled(), modelo: llm.model, host, limite_diario: llm.dailyLimit },
      uso_ia_hoy: await usageToday(),
      whatsapp: {
        configurado: waConfigured(), app_secret: !!process.env.APP_SECRET, verify_token: !!process.env.VERIFY_TOKEN,
        webhook: `${appUrl()}/webhooks/whatsapp`, app_url: appUrl(),
      },
      sesion_ok: (process.env.SESSION_SECRET || '').length >= 16,
    };
  };
  add('GET', '/api/staff/config', 'staff', async (c) => {
    const cfg = await getConfig();
    const sys = await estadoSistema();
    const neg = await getNegocio();
    sys.principal = !!neg?.principal;
    if (!sys.principal) {
      // Infraestructura compartida: un negocio normal no ve su estado ni el consumo de los demás.
      sys.uso_ia_hoy = 0;
      sys.whatsapp = { configurado: false, app_secret: false, verify_token: false, webhook: '', app_url: '' };
    }
    if (sys.principal) { sys.whatsapp.webhook = `${appUrl(c.origin)}/webhooks/whatsapp`; sys.whatsapp.app_url = appUrl(c.origin); }
    return { config: Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, cfg[k]])), sistema: sys, negocio: { nombre: neg?.nombre || cfg.negocio_nombre, tipo: neg?.tipo || null, departamento: neg?.departamento || null, municipio: neg?.municipio || null, telefono: neg?.telefono || null } };
  });
  add('PUT', '/api/staff/config', 'staff', async (c) => {
    const clean = {};
    for (const k of Object.keys(DEFAULTS)) if (k in c.body) clean[k] = text(c.body[k], k === 'instrucciones_bot' ? 2000 : 400);
    if ('idioma_defecto' in clean && !['es', 'en'].includes(clean.idioma_defecto)) clean.idioma_defecto = 'es';
    await setConfig(clean);
    return { ok: true };
  });

  return handle;
}
