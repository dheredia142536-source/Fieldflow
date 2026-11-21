// Datos de ejemplo del sector agro. / Agro demo data.
import { query } from './db.mjs';
import { slotsFor } from './availability.mjs';
import { crearCita } from './citas.mjs';
import { getConversation, saveMessage, setHandling, upsertCliente } from './convos.mjs';
import { addDays, todayLocal, weekdayOf } from './time.mjs';
import { nowIso, uid } from './util.mjs';
import { nid } from './tenant.mjs';

export async function loadDemoData() {
  const N = nid();
  const [{ n }] = await query('select cast(count(*) as integer) as n from servicios where negocio_id = $1', [N]);
  if (Number(n) > 0) return { skipped: true };

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

  return { skipped: false, citas: made, creado_en: nowIso() };
}
