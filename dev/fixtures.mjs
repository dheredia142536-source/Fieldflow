// Datos de ejemplo del sector agro. / Agro demo data.
import { query } from '../lib/db.mjs';
import { slotsFor } from '../lib/availability.mjs';
import { crearCita } from '../lib/citas.mjs';
import { getConversation, saveMessage, setHandling, upsertCliente } from '../lib/convos.mjs';
import { addDays, localToUtc, todayLocal, weekdayOf } from '../lib/time.mjs';
import { nowIso, uid } from '../lib/util.mjs';
import { nid } from '../lib/tenant.mjs';

export async function loadDemoData() {
  const N = nid();
  const [{ n }] = await query('select cast(count(*) as integer) as n from servicios where negocio_id = $1', [N]);
  if (Number(n) > 0) return { skipped: true, historial: await loadDemoHistory() };

  const R = {};
  for (const [key, nombre, tipo] of [
    ['ca', 'Cuadrilla A', 'cuadrilla'], ['cb', 'Cuadrilla B', 'cuadrilla'], ['t2', 'Tractor 2', 'maquinaria'],
    ['c1', 'Camión 1', 'vehículo'], ['ag', 'Agrónomo', 'técnico'],
  ]) {
    R[key] = uid();
    await query('insert into recursos (id, negocio_id, nombre, tipo, activo) values ($1, $2, $3, $4, 1)', [R[key], N, nombre, tipo]);
    for (let d = 0; d < 6; d++) {
      const wins = d === 5 ? [['07:00', '12:00']] : [['07:00', '12:00'], ['13:00', '17:00']];
      for (const [a, b] of wins) await query('insert into disponibilidad (id, recurso_id, dia_semana, hora_inicio, hora_fin) values ($1, $2, $3, $4, $5)', [uid(), R[key], d, a, b]);
    }
  }
  const S_ = {};
  for (const [key, es, en, des, den, min, res] of [
    ['vt', 'Visita técnica', 'Technical visit', 'Diagnóstico del cultivo en finca', 'Crop diagnosis on site', 60, ['ag']],
    ['fu', 'Fumigación', 'Spraying', 'Aplicación de insumos por lote', 'Input application by plot', 120, ['t2', 'cb']],
    ['co', 'Cosecha', 'Harvest', 'Cuadrilla de recolección', 'Harvest crew', 180, ['ca', 'cb']],
    ['tr', 'Transporte a acopio', 'Transport to collection point', 'Recogida y entrega de producto', 'Product pickup and delivery', 120, ['c1']],
    ['ms', 'Muestreo de suelo', 'Soil sampling', 'Toma de muestras para análisis', 'Samples for lab analysis', 90, ['ag']],
  ]) {
    S_[key] = uid();
    await query('insert into servicios (id, negocio_id, nombre_es, nombre_en, descripcion_es, descripcion_en, duracion_min, activo) values ($1, $2, $3, $4, $5, $6, $7, 1)', [S_[key], N, es, en, des, den, min]);
    for (const r of res) await query('insert into servicio_recurso (servicio_id, recurso_id) values ($1, $2)', [S_[key], R[r]]);
  }

  const carlos = await upsertCliente({ telefono: '573001110001', nombre: 'Carlos Ramírez', idioma: 'es' });
  const marta = await upsertCliente({ telefono: '573001110002', nombre: 'Marta Gómez', idioma: 'es' });
  const john = await upsertCliente({ telefono: '12025550143', nombre: 'John Miller', idioma: 'en' });
  await query('update clientes set notas = $1 where id = $2 and negocio_id = $3', ['Finca La Esperanza · aguacate Hass · 12 ha', carlos.id, N]);

  // Citas de ejemplo en los próximos días hábiles. / Sample appointments on upcoming working days.
  let day = addDays(todayLocal(), -1); // incluye hoy si es día hábil
  const days = [];
  while (days.length < 4) { day = addDays(day, 1); if (weekdayOf(day) < 5) days.push(day); }
  const plan = [
    [0, 'co', '08:00', carlos], [0, 'vt', '10:00', marta], [0, 'tr', '14:00', carlos], [0, 'fu', '09:00', john],
    [1, 'ms', '08:00', marta], [1, 'co', '13:00', carlos], [2, 'fu', '07:00', john], [3, 'vt', '09:00', carlos],
  ];
  let made = 0;
  for (const [di, svc, hm, cli] of plan) {
    const slots = await slotsFor({ servicioId: S_[svc], ymd: days[di] });
    const slot = slots.find((s) => s.hm === hm) || slots[0];
    if (!slot) continue;
    try { await crearCita({ clienteId: cli.id, servicioId: S_[svc], inicio: slot.inicio, recursoId: slot.recurso_id, origen: 'manual' }); made++; } catch { /* sigue */ }
  }

  // Conversaciones de ejemplo. / Sample conversations.
  const cc = await getConversation(carlos.id, 'whatsapp');
  await saveMessage(cc.id, 'cliente', 'Hola, necesito cosechar 2 hectáreas esta semana.', { canal: 'whatsapp' });
  await saveMessage(cc.id, 'sistema', 'WhatsApp → Abrir asistente', { canal: 'whatsapp', enlace: true });
  await saveMessage(cc.id, 'bot', '¡Hola Carlos! Tengo cuadrilla disponible el jueves a las 8:00 a. m. ¿Te confirmo?', {});
  await saveMessage(cc.id, 'cliente', 'Sí, por favor.', { canal: 'pwa' });
  const mc = await getConversation(marta.id, 'whatsapp');
  await saveMessage(mc.id, 'cliente', 'Quiero hablar con una persona sobre el precio de la fumigación.', { canal: 'pwa' });
  await saveMessage(mc.id, 'bot', 'Claro, avisé a un asesor. Te responderá por aquí en cuanto pueda.', {});
  await setHandling(mc.id, 'humano', true);
  await query('update conversaciones set estado = null where id = $1 and negocio_id = $2', [mc.id, N]);
  const jc = await getConversation(john.id, 'whatsapp');
  await saveMessage(jc.id, 'cliente', 'Hi, I need a technical visit next week.', { canal: 'whatsapp' });
  await saveMessage(jc.id, 'bot', 'Hi John! Which day works best for you?', {});

  return { skipped: false, citas: made, historial: await loadDemoHistory(), creado_en: nowIso() };
}

// ── Historial de ejemplo (≈80 días) para que el dashboard muestre tendencias reales. ──────────────
// Determinista (misma semilla) y solo si el negocio casi no tiene citas: nunca toca datos reales.
const NOMBRES = ['Andrés Pardo', 'Luisa Fernanda Rojas', 'Jorge Iván Castaño', 'Paola Mendoza', 'Hernán Cuervo', 'Diana Ortiz', 'Camilo Vargas', 'Sandra Quintero',
  'Finca El Paraíso', 'Agrícola Los Llanos', 'Hacienda Santa Rita', 'Cooperativa Sembrar', 'Wilson Duarte', 'Natalia Prieto', 'Óscar Beltrán', 'Yenny Salazar',
  'Mateo Londoño', 'Rosa Elena Arias', 'Julián Mora', 'Tatiana Cruz', 'Samuel Torres', 'Lucía Herrera', 'Ricardo Peña', 'Valentina Gil'];

const NOM2 = ['Alejandro', 'Marcela', 'Fabián', 'Gloria', 'Iván', 'Liliana', 'Mauricio', 'Nancy', 'Pedro', 'Rocío', 'Sergio', 'Teresa'];
const APE2 = ['Aguirre', 'Barrera', 'Cárdenas', 'Delgado', 'Espinosa', 'Franco', 'Gaitán', 'Hoyos', 'Jaramillo', 'Lozano', 'Montoya', 'Naranjo'];
for (let i = 0; i < 24; i++) NOMBRES.push(`${NOM2[i % 12]} ${APE2[(i * 5 + 3) % 12]}`);

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export async function loadDemoHistory() {
  const N = nid();
  const [{ n: total }] = await query('select cast(count(*) as integer) as n from citas where negocio_id = $1', [N]);
  if (Number(total) > 12) return { skipped: true };
  const servicios = await query('select id, duracion_min from servicios where negocio_id = $1 order by id', [N]);
  const links = await query('select sr.servicio_id, sr.recurso_id from servicio_recurso sr join servicios s on s.id = sr.servicio_id where s.negocio_id = $1', [N]);
  if (!servicios.length) return { skipped: true };
  const rand = rng(20261123);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const hoy = todayLocal();

  // Clientes: 24 repartidos en el tiempo (los nuevos aparecen más hacia hoy).
  const clientes = [];
  for (let i = 0; i < NOMBRES.length; i++) {
    const hace = Math.floor(Math.pow(rand(), 0.85) * 88);
    const tel = `5730${String(20000000 + i * 137).padStart(8, '0').slice(0, 8)}`;
    const c = await upsertCliente({ telefono: tel, nombre: NOMBRES[i], idioma: i % 9 === 8 ? 'en' : 'es' });
    const creado = localToUtc(addDays(hoy, -hace), '09:00').toISOString();
    await query('update clientes set creado_en = $1 where id = $2 and negocio_id = $3', [creado, c.id, N]);
    clientes.push({ id: c.id, hace });
  }

  // Ocupación por recurso para no solapar citas.
  const ocupado = new Map();
  for (const c of await query('select recurso_id, inicio, fin from citas where negocio_id = $1', [N])) { const l = ocupado.get(c.recurso_id) || []; l.push([new Date(c.inicio).getTime(), new Date(c.fin).getTime()]); ocupado.set(c.recurso_id, l); }
  const libre = (rid, ini, fin) => !(ocupado.get(rid) || []).some(([a, b]) => ini < b && fin > a);
  const marca = (rid, ini, fin) => { const l = ocupado.get(rid) || []; l.push([ini, fin]); ocupado.set(rid, l); };
  const peso = [0.85, 1.15, 1.2, 1.15, 0.95, 0.5, 0]; // lunes…domingo
  const horas = [7, 7.5, 8, 8, 8.5, 9, 9.5, 10, 10.5, 11, 13, 13.5, 14, 14.5, 15, 15.5, 16];
  let made = 0;
  for (let off = -80; off <= 12; off++) {
    const ymd = addDays(hoy, off);
    const w = peso[weekdayOf(ymd)];
    if (!w) continue;
    const tendencia = 0.75 + (off + 80) / 92 * 0.55; // crece con el tiempo
    const cuantas = Math.round((3.4 + rand() * 4.4) * w * tendencia * (off > 0 ? 0.55 : 1));
    for (let k = 0; k < cuantas; k++) {
      const svc = servicios[Math.floor(Math.pow(rand(), 1.35) * servicios.length)];
      const rids = links.filter((l) => l.servicio_id === svc.id).map((l) => l.recurso_id);
      if (!rids.length) continue;
      const rid = pick(rids);
      const hh = pick(horas);
      const start = localToUtc(ymd, `${String(Math.floor(hh)).padStart(2, '0')}:${hh % 1 ? '30' : '00'}`);
      const end = new Date(start.getTime() + Number(svc.duracion_min) * 60000);
      if (!libre(rid, start.getTime(), end.getTime())) continue;
      marca(rid, start.getTime(), end.getTime());
      // Clientes recurrentes: los primeros pesan más.
      const pool = clientes.filter((c) => c.hace >= -off); // solo clientes que ya existían ese día
      if (!pool.length) continue;
      const cl = pool[Math.floor(Math.pow(rand(), 1.6) * pool.length)];
      const past = end.getTime() < Date.now();
      const r = rand();
      const estado = past ? (r < 0.12 ? 'cancelada' : 'completada') : (r < 0.06 ? 'cancelada' : 'confirmada');
      const o = rand();
      const origen = o < 0.5 ? 'whatsapp' : o < 0.78 ? 'pwa' : 'manual';
      const creada = new Date(start.getTime() - (1 + Math.floor(rand() * 5)) * 86400000 - Math.floor(rand() * 40000000));
      await query(
        `insert into citas (id, negocio_id, cliente_id, servicio_id, recurso_id, inicio, fin, estado, notas, origen, creado_en)
         values ($1, $2, $3, $4, $5, $6, $7, $8, null, $9, $10)`,
        [uid(), N, cl.id, svc.id, rid, start.toISOString(), end.toISOString(), estado, origen, creada.toISOString()],
      );
      made++;
    }
  }

  // Conversaciones: la mayoría las atiende el asistente; unas pocas esperan a una persona.
  let chats = 0;
  for (let i = 0; i < clientes.length; i++) {
    const [ya] = await query('select id from conversaciones where cliente_id = $1 and negocio_id = $2 limit 1', [clientes[i].id, N]);
    if (ya) continue;
    const humano = i % 7 === 3;
    const ultimo = new Date(Date.now() - Math.floor(rand() * 5 * 86400000) - 3600000).toISOString();
    await query(
      'insert into conversaciones (id, negocio_id, cliente_id, atendida_por, necesita_atencion, canal, ultimo_mensaje_en, creado_en) values ($1, $2, $3, $4, $5, $6, $7, $8)',
      [uid(), N, clientes[i].id, humano ? 'humano' : 'bot', i === 3 || i === 10 ? 1 : 0, i % 4 === 0 ? 'pwa' : 'whatsapp', ultimo, localToUtc(addDays(hoy, -clientes[i].hace), '09:05').toISOString()],
    );
    chats++;
  }
  return { skipped: false, citas: made, chats };
}
