import { query, tx } from './db.mjs';
import { DEFAULTS, getConfig, setConfig } from './config.mjs';
import { CLIENT_COOKIE, STAFF_COOKIE, createRouter } from './http.mjs';
import { hashPassword, sha256, signSession, verifyPassword } from './session.mjs';
import { HttpError, digits, iso, nowIso, sleep, uid } from './util.mjs';
import { addDays, isYmd, localToUtc, minutes, todayLocal } from './time.mjs';
import { slotsFor } from './availability.mjs';
import { cambiarEstado, cancelarCita, crearCita, getCita, listCitas, reprogramarCita } from './citas.mjs';
import { getConversation, listMessages, mapMsg, saveMessage, setHandling, setState, upsertCliente, usageToday } from './convos.mjs';
import { handleCustomerMessage } from './bot.mjs';
import { greeting } from './demo-bot.mjs';
import { handleInbound, appUrl } from './inbound.mjs';
import { loadDemoData } from './demo-data.mjs';
import { llmEnabled, llmSettings, chatCompletion } from './llm.mjs';
import { TOOL_DEFS, runTool } from './tools.mjs';
import { waConfigured } from './whatsapp-send.mjs';
import { detectLang } from './util.mjs';

const DAY = 86400000;
const lang2 = (l) => (l === 'en' ? 'en' : 'es');
const need = (cond, code, msg) => { if (!cond) throw new HttpError(400, code, msg || code); };
const text = (v, max = 500) => String(v ?? '').trim().slice(0, max);

export function buildRouter() {
  const { add, handle } = createRouter();

  // ── Público / auth ──────────────────────────────────────────────────────────
  add('GET', '/api/health', null, () => ({ ok: true, time: nowIso() }));

  add('GET', '/api/public', null, async () => {
    const cfg = await getConfig();
    return { nombre: cfg.negocio_nombre, idioma: cfg.idioma_defecto, whatsapp: digits(process.env.WHATSAPP_PUBLIC_NUMBER) || null };
  });

  add('GET', '/api/auth/me', null, async (c) => {
    let staff = null; let client = null;
    if (c.staff) { const [u] = await query('select id, correo, nombre from usuarios_negocio where id = $1', [c.staff.id]); staff = u || null; }
    if (c.client) { const [u] = await query('select id, nombre, idioma from clientes where id = $1', [c.client.id]); client = u || null; }
    return { staff, client };
  });

  add('POST', '/api/auth/login', null, async (c) => {
    const correo = text(c.body.correo, 200).toLowerCase();
    const password = String(c.body.password || '');
    need(correo && password, 'missing_fields', 'Correo y contraseña requeridos');
    const [{ n }] = await query('select cast(count(*) as integer) as n from usuarios_negocio');
    if (Number(n) === 0) {
      const ae = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      const ap = process.env.ADMIN_PASSWORD || '';
      if (!ae || ap.length < 8) throw new HttpError(401, 'no_admin_configured', 'Configura ADMIN_EMAIL y ADMIN_PASSWORD (mín. 8 caracteres) en Vercel');
      if (correo === ae && password === ap) {
        await query('insert into usuarios_negocio (id, correo, nombre, hash, creado_en) values ($1, $2, $3, $4, $5)', [uid(), ae, 'Admin', hashPassword(ap), nowIso()]);
      }
    }
    const [u] = await query('select id, correo, nombre, hash from usuarios_negocio where correo = $1', [correo]);
    if (!u || !verifyPassword(password, u.hash)) { await sleep(400); throw new HttpError(401, 'bad_credentials', 'Correo o contraseña incorrectos'); }
    c.setCookie(STAFF_COOKIE, signSession({ k: 'staff', id: u.id }, 7 * 86400), 7 * 86400);
    return { ok: true, usuario: { id: u.id, correo: u.correo, nombre: u.nombre } };
  });

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
    const [cl] = await query('select id, nombre, idioma from clientes where id = $1', [t.cliente_id]);
    c.setCookie(CLIENT_COOKIE, signSession({ k: 'client', id: cl.id }, 30 * 86400), 30 * 86400);
    return { ok: true, cliente: cl };
  });

  // ── Cliente final ───────────────────────────────────────────────────────────
  const me = async (c) => {
    const [cl] = await query('select * from clientes where id = $1', [c.client.id]);
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
    if (lang !== cliente.idioma) await query('update clientes set idioma = $1 where id = $2', [lang, cliente.id]);
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

  add('POST', '/api/client/idioma', 'client', async (c) => {
    await query('update clientes set idioma = $1 where id = $2', [lang2(c.body.idioma), c.client.id]);
    return { ok: true };
  });

  // ── Negocio ─────────────────────────────────────────────────────────────────
  add('GET', '/api/staff/resumen', 'staff', async () => {
    const hoy = todayLocal();
    const desde = localToUtc(hoy, '00:00').toISOString();
    const hasta = localToUtc(addDays(hoy, 1), '00:00').toISOString();
    const citasHoy = await listCitas({ desde, hasta });
    const semana = await listCitas({ desde, hasta: localToUtc(addDays(hoy, 7), '00:00').toISOString() });
    const [{ n: totalClientes }] = await query('select cast(count(*) as integer) as n from clientes');
    const atencion = await query(
      `select cv.id, cv.atendida_por, cv.ultimo_mensaje_en, cl.nombre, cl.telefono from conversaciones cv
       join clientes cl on cl.id = cv.cliente_id where cv.necesita_atencion = 1 order by cv.ultimo_mensaje_en desc limit 10`,
    );
    for (const a of atencion) {
      const [m] = await query('select contenido from mensajes where conversacion_id = $1 order by creado_en desc limit 1', [a.id]);
      a.ultimo = m?.contenido || '';
      a.ultimo_mensaje_en = iso(a.ultimo_mensaje_en);
    }
    const proxima = (await listCitas({ desde: new Date().toISOString(), hasta: new Date(Date.now() + 30 * DAY).toISOString() }))[0] || null;
    return { hoy, citas_hoy: citasHoy, semana: semana.length, clientes: Number(totalClientes), atencion, proxima };
  });

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
    if ('notas' in b) await query('update citas set notas = $1 where id = $2', [text(b.notas, 500) || null, id]);
    const cita = await getCita(id);
    if (!cita) throw new HttpError(404, 'not_found');
    return { cita };
  });

  add('GET', '/api/staff/disponibilidad', 'staff', async (c) => {
    const slots = await slotsFor({ servicioId: c.q.get('servicio_id') || '', ymd: c.q.get('fecha') || '', excludeCitaId: c.q.get('excluir') || null });
    return { slots };
  });

  add('GET', '/api/staff/catalogo', 'staff', async () => {
    const servicios = await query('select * from servicios order by nombre_es');
    const recursos = await query('select * from recursos order by nombre');
    const links = await query('select servicio_id, recurso_id from servicio_recurso');
    const disp = await query('select recurso_id, dia_semana, hora_inicio, hora_fin from disponibilidad order by dia_semana, hora_inicio');
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
      await q(
        `insert into servicios (id, nombre_es, nombre_en, descripcion_es, descripcion_en, duracion_min, activo) values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (id) do update set nombre_es = excluded.nombre_es, nombre_en = excluded.nombre_en, descripcion_es = excluded.descripcion_es,
         descripcion_en = excluded.descripcion_en, duracion_min = excluded.duracion_min, activo = excluded.activo`,
        [id, text(b.nombre_es, 120), text(b.nombre_en, 120), text(b.descripcion_es, 300) || null, text(b.descripcion_en, 300) || null, dur, b.activo === false ? 0 : 1],
      );
      await q('delete from servicio_recurso where servicio_id = $1', [id]);
      for (const r of Array.isArray(b.recursos) ? b.recursos : []) await q('insert into servicio_recurso (servicio_id, recurso_id) values ($1, $2)', [id, r]);
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
      await q(
        'insert into recursos (id, nombre, tipo, activo) values ($1, $2, $3, $4) on conflict (id) do update set nombre = excluded.nombre, tipo = excluded.tipo, activo = excluded.activo',
        [id, text(b.nombre, 100), text(b.tipo, 60) || null, b.activo === false ? 0 : 1],
      );
      await q('delete from disponibilidad where recurso_id = $1', [id]);
      for (const h of horarios) await q('insert into disponibilidad (id, recurso_id, dia_semana, hora_inicio, hora_fin) values ($1, $2, $3, $4, $5)', [uid(), id, h.dia_semana, h.hora_inicio, h.hora_fin]);
    });
    return { id };
  });

  add('GET', '/api/staff/conversaciones', 'staff', async () => {
    const rows = await query(
      `select cv.id, cv.atendida_por, cv.necesita_atencion, cv.ultimo_mensaje_en, cv.creado_en, cl.id as cliente_id, cl.nombre, cl.telefono, cl.idioma
       from conversaciones cv join clientes cl on cl.id = cv.cliente_id order by coalesce(cv.ultimo_mensaje_en, cv.creado_en) desc limit 60`,
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
      `select cv.id, cv.atendida_por, cv.necesita_atencion, cl.id as cliente_id, cl.nombre, cl.telefono, cl.idioma
       from conversaciones cv join clientes cl on cl.id = cv.cliente_id where cv.id = $1`, [id],
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

  add('GET', '/api/staff/clientes', 'staff', async (c) => {
    const term = `%${text(c.q.get('q'), 60).toLowerCase()}%`;
    const rows = await query(
      `select cl.id, cl.nombre, cl.telefono, cl.idioma, cl.notas,
       (select cast(count(*) as integer) from citas ci where ci.cliente_id = cl.id and ci.estado <> 'cancelada') as citas
       from clientes cl where lower(coalesce(cl.nombre, '')) like $1 or cl.telefono like $1 order by cl.creado_en desc limit 100`,
      [term],
    );
    return { clientes: rows };
  });
  add('GET', '/api/staff/clientes/:id', 'staff', async (c) => {
    const [cl] = await query('select id, nombre, telefono, idioma, notas from clientes where id = $1', [c.params[0]]);
    if (!cl) throw new HttpError(404, 'not_found');
    const citas = await listCitas({ desde: '2000-01-01T00:00:00.000Z', hasta: '2100-01-01T00:00:00.000Z', clienteId: cl.id, incluirCanceladas: true });
    const [cv] = await query('select id from conversaciones where cliente_id = $1 limit 1', [cl.id]);
    return { cliente: cl, citas: citas.reverse(), conversacion_id: cv?.id || null };
  });
  add('PATCH', '/api/staff/clientes/:id', 'staff', async (c) => {
    await query('update clientes set nombre = $1, notas = $2, idioma = $3 where id = $4', [text(c.body.nombre, 120) || null, text(c.body.notas, 1000) || null, lang2(c.body.idioma), c.params[0]]);
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
    sys.whatsapp.webhook = `${appUrl(c.origin)}/webhooks/whatsapp`;
    sys.whatsapp.app_url = appUrl(c.origin);
    return { config: Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, cfg[k]])), sistema: sys };
  });
  add('PUT', '/api/staff/config', 'staff', async (c) => {
    const clean = {};
    for (const k of Object.keys(DEFAULTS)) if (k in c.body) clean[k] = text(c.body[k], k === 'instrucciones_bot' ? 2000 : 400);
    if ('idioma_defecto' in clean && !['es', 'en'].includes(clean.idioma_defecto)) clean.idioma_defecto = 'es';
    await setConfig(clean);
    return { ok: true };
  });

  add('POST', '/api/staff/simulador', 'staff', async (c) => {
    const phone = digits(c.body.telefono);
    need(phone.length >= 7, 'invalid_phone', 'Teléfono inválido');
    if (c.body.forzar) await query('update clientes set ultimo_enlace_en = null where telefono = $1', [phone]);
    const r = await handleInbound({ phone, name: text(c.body.nombre, 80) || null, text: text(c.body.texto, 500) || 'Hola', origin: c.origin, simulate: true });
    return r;
  });

  add('POST', '/api/staff/demo-data', 'staff', async () => loadDemoData());

  add('POST', '/api/staff/probar-bot', 'staff', async () => {
    const pasos = [];
    const step = async (nombre, fn) => {
      try { pasos.push({ nombre, ok: true, detalle: String((await fn()) ?? '') }); } catch (e) { pasos.push({ nombre, ok: false, detalle: e.message }); }
    };
    const cliente = await upsertCliente({ telefono: '0000000000', nombre: 'Prueba / Test', idioma: 'es' });
    const conv = await getConversation(cliente.id);
    const ctx = { cliente, conv, lang: 'es' };
    const [svc] = await query('select id, nombre_es from servicios where activo = 1 order by nombre_es limit 1');
    let slot = null; let cita = null;
    await step('Servicios configurados', async () => { if (!svc) throw new Error('No hay servicios: carga los datos de ejemplo'); return svc.nombre_es; });
    if (svc) {
      await step('consultar_disponibilidad', async () => {
        for (let i = 1; i <= 10 && !slot; i++) { const s = await slotsFor({ servicioId: svc.id, ymd: addDays(todayLocal(), i) }); slot = s[0] || null; }
        if (!slot) throw new Error('Sin horarios en los próximos días');
        return slot.inicio;
      });
      if (slot) {
        await step('crear_cita (con confirmación)', async () => {
          const r = await runTool('crear_cita', { servicio_id: svc.id, inicio: slot.inicio, recurso_id: slot.recurso_id, confirmado: true }, ctx);
          if (!r.result.ok) throw new Error(JSON.stringify(r.result));
          cita = r.result.cita.id; return cita;
        });
        await step('Bloqueo de doble reserva', async () => {
          const r = await runTool('crear_cita', { servicio_id: svc.id, inicio: slot.inicio, recurso_id: slot.recurso_id, confirmado: true }, ctx);
          if (r.result.ok) throw new Error('¡Permitió una doble reserva!');
          return 'rechazada correctamente';
        });
        if (cita) await step('cancelar_cita', async () => {
          const r = await runTool('cancelar_cita', { cita_id: cita, confirmado: true }, ctx);
          if (!r.result.ok) throw new Error(JSON.stringify(r.result)); return 'ok';
        });
      }
    }
    if (llmEnabled()) {
      await step(`IA (${llmSettings().model}) con herramientas`, async () => {
        const data = await chatCompletion({
          messages: [{ role: 'system', content: 'Call the tool listar_servicios now.' }, { role: 'user', content: 'Which services do you offer?' }],
          tools: TOOL_DEFS, signal: AbortSignal.timeout(20000),
        });
        const calls = data.choices?.[0]?.message?.tool_calls || [];
        if (!calls.length) throw new Error('El modelo respondió sin usar herramientas: prueba otro modelo');
        return `usó ${calls[0].function.name}`;
      });
    } else {
      pasos.push({ nombre: 'IA', ok: true, detalle: 'Modo demostración (sin LLM_API_KEY)' });
    }
    return { pasos, ok: pasos.every((p) => p.ok) };
  });

  return handle;
}
