// Datos del dashboard. Una sola consulta compacta: el navegador agrega y filtra al instante (sin más viajes al servidor).
// Dashboard data. One compact payload: the browser aggregates and filters instantly (no more round trips).
import { query } from './db.mjs';
import { nid } from './tenant.mjs';
import { addDays, localToUtc, minutes, toLocal, todayLocal } from './time.mjs';
import { iso } from './util.mjs';

const ESTADOS = ['confirmada', 'completada', 'cancelada'];
const ORIGENES = ['whatsapp', 'pwa', 'manual'];
export const MAX_DIAS = 90;

// Minutos de disponibilidad por recurso y día de la semana (lunes = 0).
async function capacidad(recursos) {
  const rows = await query(
    'select d.recurso_id, d.dia_semana, d.hora_inicio, d.hora_fin from disponibilidad d join recursos r on r.id = d.recurso_id where r.negocio_id = $1',
    [nid()],
  );
  const idx = new Map(recursos.map((r, i) => [r.id, i]));
  const cap = recursos.map(() => [0, 0, 0, 0, 0, 0, 0]);
  for (const w of rows) {
    const i = idx.get(w.recurso_id);
    if (i == null) continue;
    cap[i][Number(w.dia_semana)] += Math.max(0, minutes(w.hora_fin) - minutes(w.hora_inicio));
  }
  return cap;
}

export async function dashboardData() {
  const N = nid();
  const hoy = todayLocal();
  // Periodo actual (hasta 90 días atrás) + el anterior de igual tamaño (para comparar) + 14 días hacia adelante.
  const desdeYmd = addDays(hoy, -2 * MAX_DIAS);
  const hastaYmd = addDays(hoy, 14);
  const desde = localToUtc(desdeYmd, '00:00').toISOString();
  const hasta = localToUtc(hastaYmd, '00:00').toISOString();

  const [servicios, recursos, clientes, citas, convs] = await Promise.all([
    query('select id, nombre_es, nombre_en, duracion_min, activo from servicios where negocio_id = $1 order by id', [N]),
    query('select id, nombre, tipo, activo from recursos where negocio_id = $1 order by id', [N]),
    query('select id, nombre, telefono, idioma, creado_en from clientes where negocio_id = $1 order by creado_en desc limit 3000', [N]),
    query(
      'select id, inicio, fin, estado, origen, cliente_id, servicio_id, recurso_id, creado_en from citas where negocio_id = $1 and inicio >= $2 and inicio < $3 order by inicio limit 8000',
      [N, desde, hasta],
    ),
    query(
      `select cv.id, cv.cliente_id, cv.atendida_por, cv.necesita_atencion, cv.canal, cv.ultimo_mensaje_en, cv.creado_en, cl.nombre, cl.telefono
       from conversaciones cv join clientes cl on cl.id = cv.cliente_id where cv.negocio_id = $1 order by coalesce(cv.ultimo_mensaje_en, cv.creado_en) desc limit 500`,
      [N],
    ),
  ]);

  const sIdx = new Map(servicios.map((s, i) => [s.id, i]));
  const rIdx = new Map(recursos.map((r, i) => [r.id, i]));
  const cIdx = new Map(clientes.map((c, i) => [c.id, i]));

  // Cita compacta: [ymd, minutoInicio, duración, servicio, recurso, estado, origen, cliente, creadaYmd, id]
  const rows = [];
  for (const c of citas) {
    const si = sIdx.get(c.servicio_id); const ri = rIdx.get(c.recurso_id); const ci = cIdx.get(c.cliente_id);
    if (si == null || ri == null) continue;
    const a = toLocal(iso(c.inicio));
    const dur = Math.max(5, Math.round((new Date(iso(c.fin)) - new Date(iso(c.inicio))) / 60000));
    const oi = ORIGENES.indexOf(c.origen);
    rows.push([a.ymd, minutes(a.hm), dur, si, ri, Math.max(0, ESTADOS.indexOf(c.estado)), oi < 0 ? 2 : oi, ci ?? -1, toLocal(iso(c.creado_en)).ymd, c.id]);
  }

  return {
    hoy,
    ahora: new Date().toISOString(),
    estados: ESTADOS,
    origenes: ORIGENES,
    servicios: servicios.map((s) => ({ id: s.id, es: s.nombre_es, en: s.nombre_en, min: Number(s.duracion_min), activo: !!s.activo })),
    recursos: recursos.map((r) => ({ id: r.id, nombre: r.nombre, tipo: r.tipo || '', activo: !!r.activo })),
    capacidad: await capacidad(recursos),
    clientes: clientes.map((c) => [c.nombre || '', c.telefono, toLocal(iso(c.creado_en)).ymd, c.id]),
    citas: rows,
    chats: convs.map((v) => ({
      id: v.id, c: cIdx.get(v.cliente_id) ?? -1, nombre: v.nombre || '', tel: v.telefono, por: v.atendida_por, att: !!v.necesita_atencion,
      canal: v.canal, en: v.ultimo_mensaje_en ? iso(v.ultimo_mensaje_en) : null, creada: toLocal(iso(v.creado_en)).ymd,
    })),
  };
}
