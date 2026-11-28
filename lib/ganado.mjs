// Ganado: registro de animales, pesajes, sanidad, reproducción, leche y ventas, con avisos para el ganadero.
// Cattle: animal records, weights, health, breeding, milk and sales, with reminders for the rancher.
import { query } from './db.mjs';
import { nid } from './tenant.mjs';
import { HttpError, nowIso, uid } from './util.mjs';
import { addDays, isYmd, todayLocal } from './time.mjs';
import { agregarMovimiento } from './dia.mjs';

const txt = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const need = (c, code, msg) => { if (!c) throw new HttpError(400, code, msg || code); };
const num = (v) => Number(v) || 0;
const ymd = (v, campo = 'Fecha') => { need(isYmd(v), 'invalid_date', `${campo} inválida`); return v; };
export const SEXOS = ['hembra', 'macho'];
export const CATEGORIAS = ['ternera', 'ternero', 'novilla', 'novillo', 'vaca', 'toro', 'buey'];
export const ESTADOS = ['activo', 'vendido', 'muerto'];
export const TIPOS = ['peso', 'vacuna', 'desparasitacion', 'tratamiento', 'monta', 'diagnostico', 'parto', 'leche', 'venta', 'muerte', 'nota'];
const SANIDAD = ['vacuna', 'desparasitacion', 'tratamiento'];
export const GESTACION_DIAS = 283; // vacas: ~9 meses y 10 días
const IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const days = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const meses = (nac, hoy) => { if (!nac) return null; const [y1, m1, d1] = nac.split('-').map(Number); const [y2, m2, d2] = hoy.split('-').map(Number); return Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0)); };
const json = (s) => { try { return JSON.parse(s || '{}') || {}; } catch { return {}; } };

// Categoría sugerida por sexo y edad cuando no se escribe una.
export function categoriaAuto(sexo, edadMeses) {
  if (edadMeses == null) return sexo === 'macho' ? 'toro' : 'vaca';
  if (sexo === 'hembra') return edadMeses < 12 ? 'ternera' : edadMeses < 24 ? 'novilla' : 'vaca';
  return edadMeses < 12 ? 'ternero' : edadMeses < 30 ? 'novillo' : 'toro';
}

function mapA(a, hoy) {
  const edad = meses(a.nacimiento, hoy);
  return {
    id: a.id, arete: a.arete || '', nombre: a.nombre || '', sexo: a.sexo, raza: a.raza || '', nacimiento: a.nacimiento || '', edad_meses: edad,
    categoria: a.categoria || categoriaAuto(a.sexo, edad), estado: a.estado, lote: a.lote || '', madre: a.madre || '', padre: a.padre || '',
    peso: a.peso_actual == null ? null : Number(a.peso_actual), peso_en: a.peso_en || null, compra_fecha: a.compra_fecha || '', compra_precio: num(a.compra_precio), notas: a.notas || '',
    tiene_foto: !!a.foto,
  };
}

async function mine(id) {
  const [a] = await query('select * from animales where id = $1 and negocio_id = $2', [id, nid()]);
  if (!a) throw new HttpError(404, 'not_found');
  return a;
}

// Estado reproductivo de una hembra a partir de sus eventos (en orden cronológico).
export function estadoRepro(evs) {
  let s = { estado: 'sin_servicio', desde: null, parto: null, toro: null };
  for (const e of evs) {
    const x = json(e.extra);
    if (e.tipo === 'monta') s = { estado: 'servida', desde: e.fecha, parto: e.proxima_fecha, toro: x.toro || null };
    else if (e.tipo === 'diagnostico') s = x.prenada ? { estado: 'prenada', desde: e.fecha, parto: e.proxima_fecha || s.parto, toro: s.toro } : { estado: 'vacia', desde: e.fecha, parto: null, toro: null };
    else if (e.tipo === 'parto') s = { estado: 'parida', desde: e.fecha, parto: null, toro: null };
  }
  return s;
}
const gdp = (pesos) => { // ganancia diaria de peso (kg/día) entre los dos últimos pesajes
  if (pesos.length < 2) return null;
  const [a, b] = pesos.slice(-2); const d = days(a.fecha, b.fecha);
  return d > 0 ? Math.round(((num(b.valor) - num(a.valor)) / d) * 1000) / 1000 : null;
};

export async function listGanado() {
  const N = nid(); const hoy = todayLocal();
  const rows = await query('select id, arete, nombre, sexo, raza, nacimiento, categoria, estado, lote, madre, padre, peso_actual, peso_en, compra_fecha, compra_precio, notas, case when foto is null then null else 1 end as foto from animales where negocio_id = $1 order by arete, nombre limit 3000', [N]);
  const animales = rows.map((a) => mapA(a, hoy));
  const activos = new Map(animales.filter((a) => a.estado === 'activo').map((a) => [a.id, a]));
  const eventos = await query("select animal_id, tipo, fecha, valor, proxima_fecha, extra from ganado_eventos where negocio_id = $1 and tipo in ('peso', 'monta', 'diagnostico', 'parto') and animal_id is not null order by fecha, creado_en limit 20000", [N]);
  const porAnimal = new Map();
  for (const e of eventos) { if (!porAnimal.has(e.animal_id)) porAnimal.set(e.animal_id, []); porAnimal.get(e.animal_id).push(e); }
  const partos = []; const sinDiag = []; let prenadas = 0;
  for (const a of animales) {
    const evs = porAnimal.get(a.id) || [];
    a.gdp = gdp(evs.filter((e) => e.tipo === 'peso'));
    if (a.sexo === 'hembra') {
      const r = estadoRepro(evs.filter((e) => e.tipo !== 'peso'));
      a.repro = r.estado; a.parto_probable = r.parto;
      if (a.estado === 'activo') {
        if (r.estado === 'prenada') { prenadas++; if (r.parto && days(hoy, r.parto) <= 60) partos.push({ id: a.id, nombre: a.nombre || a.arete, parto: r.parto, dias: days(hoy, r.parto) }); }
        if (r.estado === 'servida' && days(r.desde, hoy) >= 35) sinDiag.push({ id: a.id, nombre: a.nombre || a.arete, desde: r.desde, dias: days(r.desde, hoy) });
      }
    }
  }
  partos.sort((x, y) => x.dias - y.dias);
  // Sanidad pendiente: la última aplicación de cada producto con "próxima fecha" que aún no se repitió.
  const san = await query(
    `select e.animal_id, e.tipo, e.producto, e.proxima_fecha from ganado_eventos e join animales a on a.id = e.animal_id and a.estado = 'activo'
     where e.negocio_id = $1 and e.tipo in ('vacuna', 'desparasitacion', 'tratamiento') and e.proxima_fecha is not null and e.proxima_fecha <= $2
       and not exists (select 1 from ganado_eventos e2 where e2.animal_id = e.animal_id and e2.tipo = e.tipo and coalesce(e2.producto, '') = coalesce(e.producto, '') and e2.fecha > e.fecha) limit 5000`,
    [N, addDays(hoy, 30)],
  );
  const grupos = new Map();
  for (const s of san) {
    const k = `${s.tipo}|${s.producto || ''}|${s.proxima_fecha}`;
    if (!grupos.has(k)) grupos.set(k, { tipo: s.tipo, producto: s.producto || '', fecha: s.proxima_fecha, dias: days(hoy, s.proxima_fecha), animales: [] });
    grupos.get(k).animales.push(s.animal_id);
  }
  const sanidad = [...grupos.values()].map((g) => ({ ...g, n: g.animales.length, animales: g.animales.slice(0, 50) })).sort((a, b) => a.fecha.localeCompare(b.fecha));
  // Leche: litros por día en los últimos 14 días (hato completo).
  const desde = addDays(hoy, -13);
  const leche = await query("select fecha, sum(valor) as litros from ganado_eventos where negocio_id = $1 and tipo = 'leche' and fecha >= $2 group by fecha", [N, desde]);
  const lmap = new Map(leche.map((l) => [l.fecha, Math.round(num(l.litros) * 10) / 10]));
  const serie = Array.from({ length: 14 }, (_, i) => { const d = addDays(desde, i); return [d, lmap.get(d) || 0]; });
  const pesados = [...activos.values()].filter((a) => a.peso);
  const sinPesar = [...activos.values()].filter((a) => !a.peso_en || days(a.peso_en, hoy) > 90).length;
  const porCat = {}; const porLote = {};
  for (const a of activos.values()) { porCat[a.categoria] = (porCat[a.categoria] || 0) + 1; const l = a.lote || ''; porLote[l] = (porLote[l] || 0) + 1; }
  return {
    hoy, animales,
    resumen: {
      activos: activos.size, vendidos: animales.filter((a) => a.estado === 'vendido').length, muertos: animales.filter((a) => a.estado === 'muerto').length,
      prenadas, peso_promedio: pesados.length ? Math.round(pesados.reduce((s, a) => s + a.peso, 0) / pesados.length) : null, peso_total: Math.round(pesados.reduce((s, a) => s + a.peso, 0)),
      leche_hoy: lmap.get(hoy) || 0, leche_prom7: Math.round((serie.slice(-7).reduce((s, x) => s + x[1], 0) / 7) * 10) / 10, sin_pesar: sinPesar, por_categoria: porCat, por_lote: porLote,
    },
    alertas: { sanidad, partos, sin_diagnostico: sinDiag }, leche: serie,
  };
}

// Aviso corto para el Inicio: cuántas cosas del hato requieren atención hoy.
export async function alertasGanado() {
  const g = await listGanado();
  return {
    activos: g.resumen.activos, vencidas: g.alertas.sanidad.filter((s) => s.dias < 0).reduce((s, x) => s + x.n, 0),
    proximas: g.alertas.sanidad.filter((s) => s.dias >= 0 && s.dias <= 15).reduce((s, x) => s + x.n, 0),
    partos: g.alertas.partos.filter((p) => p.dias <= 15).length, sin_diagnostico: g.alertas.sin_diagnostico.length,
  };
}

function datosAnimal(b) {
  const sexo = b.sexo || 'hembra'; need(SEXOS.includes(sexo), 'invalid_type', 'Sexo inválido');
  const arete = txt(b.arete, 40) || null; const nombre = txt(b.nombre, 80) || null;
  need(arete || nombre, 'name_required', 'Escribe el arete o un nombre');
  const categoria = b.categoria || null; need(!categoria || CATEGORIAS.includes(categoria), 'invalid_type', 'Categoría inválida');
  const estado = b.estado || 'activo'; need(ESTADOS.includes(estado), 'invalid_state', 'Estado inválido');
  const nac = b.nacimiento ? ymd(b.nacimiento, 'Fecha de nacimiento') : null; need(!nac || nac <= todayLocal(), 'future_day', 'El nacimiento no puede ser futuro');
  const compra = b.compra_fecha ? ymd(b.compra_fecha, 'Fecha de compra') : null;
  const precio = Math.round(num(b.compra_precio)); need(precio >= 0 && precio < 1e13, 'invalid_amount', 'Precio inválido');
  const peso = b.peso === '' || b.peso == null ? null : num(b.peso); need(peso == null || (peso > 0 && peso < 3000), 'invalid_amount', 'Peso inválido');
  return { arete, nombre, sexo, categoria, estado, nac, compra, precio, peso, raza: txt(b.raza, 60) || null, lote: txt(b.lote, 60) || null, madre: txt(b.madre, 60) || null, padre: txt(b.padre, 60) || null, notas: txt(b.notas, 1500) || null };
}

export async function guardarAnimal(b) {
  const d = datosAnimal(b); const N = nid(); const ahora = nowIso(); const hoy = todayLocal();
  if (d.arete) {
    const dup = (await query('select id from animales where negocio_id = $1 and lower(arete) = lower($2)', [N, d.arete])).filter((x) => x.id !== b.id);
    need(!dup.length, 'duplicate_tag', 'Ya existe un animal con ese arete');
  }
  if (b.id) need(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(b.id)), 'invalid_id', 'Identificador inválido');
  const [prev] = b.id ? await query('select negocio_id from animales where id = $1', [b.id]) : [null];
  if (prev && prev.negocio_id !== nid()) throw new HttpError(404, 'not_found');
  if (prev) {
    await query(
      `update animales set arete = $3, nombre = $4, sexo = $5, raza = $6, nacimiento = $7, categoria = $8, estado = $9, lote = $10, madre = $11, padre = $12, compra_fecha = $13, compra_precio = $14, notas = $15, actualizado_en = $16 where id = $1 and negocio_id = $2`,
      [b.id, N, d.arete, d.nombre, d.sexo, d.raza, d.nac, d.categoria, d.estado, d.lote, d.madre, d.padre, d.compra, d.precio, d.notas, ahora],
    );
    return { id: b.id };
  }
  const id = b.id || uid();
  await query(
    `insert into animales (id, negocio_id, arete, nombre, sexo, raza, nacimiento, categoria, estado, lote, madre, padre, peso_actual, peso_en, compra_fecha, compra_precio, notas, creado_en, actualizado_en)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $18)`,
    [id, N, d.arete, d.nombre, d.sexo, d.raza, d.nac, d.categoria, d.estado, d.lote, d.madre, d.padre, d.peso, d.peso ? hoy : null, d.compra, d.precio, d.notas, ahora],
  );
  if (d.peso) await query("insert into ganado_eventos (id, negocio_id, animal_id, tipo, fecha, valor, creado_en) values ($1, $2, $3, 'peso', $4, $5, $6)", [uid(), N, id, hoy, d.peso, ahora]);
  return { id };
}

export async function detalleAnimal(id) {
  const a = await mine(id); const hoy = todayLocal();
  const evs = await query('select id, tipo, fecha, valor, producto, detalle, proxima_fecha, extra, creado_en from ganado_eventos where animal_id = $1 and negocio_id = $2 order by fecha desc, creado_en desc limit 500', [id, nid()]);
  const asc = evs.slice().reverse();
  const repro = a.sexo === 'hembra' ? estadoRepro(asc.filter((e) => ['monta', 'diagnostico', 'parto'].includes(e.tipo))) : null;
  const crias = a.arete || a.nombre ? await query('select id, arete, nombre, sexo, nacimiento from animales where negocio_id = $1 and lower(madre) in (lower($2), lower($3)) order by nacimiento desc limit 30', [nid(), a.arete || '-', a.nombre || '-']) : [];
  return {
    animal: { ...mapA(a, hoy), foto: a.foto || null, gdp: gdp(asc.filter((e) => e.tipo === 'peso')) },
    repro, crias: crias.map((c) => ({ id: c.id, arete: c.arete || '', nombre: c.nombre || '', sexo: c.sexo, nacimiento: c.nacimiento || '' })),
    eventos: evs.map((e) => ({ id: e.id, tipo: e.tipo, fecha: e.fecha, valor: e.valor == null ? null : Number(e.valor), producto: e.producto || '', detalle: e.detalle || '', proxima_fecha: e.proxima_fecha || '', extra: json(e.extra) })),
  };
}

export async function borrarAnimal(id) {
  await mine(id);
  await query('delete from ganado_eventos where animal_id = $1 and negocio_id = $2', [id, nid()]);
  await query('delete from animales where id = $1 and negocio_id = $2', [id, nid()]);
  return { ok: true };
}
export async function fotoAnimal(id, b) {
  await mine(id);
  need(typeof b.foto === 'string' && IMG.test(b.foto) && b.foto.length <= 250_000, 'invalid_image', 'Imagen inválida o muy pesada');
  await query('update animales set foto = $3, actualizado_en = $4 where id = $1 and negocio_id = $2', [id, nid(), b.foto, nowIso()]);
  return { ok: true };
}

async function ultimaMonta(animalId, hasta) {
  const [m] = await query("select fecha, proxima_fecha from ganado_eventos where animal_id = $1 and negocio_id = $2 and tipo = 'monta' and fecha <= $3 order by fecha desc, creado_en desc limit 1", [animalId, nid(), hasta]);
  return m || null;
}

export async function crearEvento(b) {
  const N = nid(); const hoy = todayLocal();
  const tipo = b.tipo; need(TIPOS.includes(tipo), 'invalid_type', 'Tipo inválido');
  // Reintento seguro: el mismo identificador no vuelve a registrar (ni a aplicar sus efectos).
  if (b.id) {
    need(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(b.id)), 'invalid_id', 'Identificador inválido');
    const [dup] = await query('select negocio_id from ganado_eventos where id = $1', [b.id]);
    if (dup) { if (dup.negocio_id !== N) throw new HttpError(404, 'not_found'); return { id: b.id, repetido: true }; }
  }
  const fecha = ymd(b.fecha || hoy); need(fecha <= hoy, 'future_day', 'No se puede registrar una fecha futura');
  const animalId = b.animal_id || null;
  let a = null;
  if (animalId) a = await mine(animalId); else need(tipo === 'leche', 'animal_required', 'Elige un animal');
  let valor = null; let proxima = b.proxima_fecha ? ymd(b.proxima_fecha, 'Próxima fecha') : null;
  const producto = txt(b.producto, 100) || null; let detalle = txt(b.detalle, 500) || null; const extra = {};
  const ahora = nowIso(); const id = b.id || uid(); const out = { id };
  if (proxima) need(proxima >= fecha, 'invalid_date', 'La próxima fecha debe ser posterior');

  if (tipo === 'peso') { valor = num(b.valor); need(valor > 0 && valor < 3000, 'invalid_amount', 'Peso inválido (kg)'); }
  else if (tipo === 'leche') { valor = num(b.valor); need(valor > 0 && valor < 100000, 'invalid_amount', 'Litros inválidos'); }
  else if (SANIDAD.includes(tipo)) { need(producto || detalle, 'name_required', 'Escribe el producto o un detalle'); }
  else if (tipo === 'monta') {
    need(a.sexo === 'hembra', 'invalid_type', 'La monta se registra en una hembra');
    extra.toro = txt(b.toro, 80) || null; extra.metodo = b.metodo === 'inseminacion' ? 'inseminacion' : 'monta';
    proxima = addDays(fecha, GESTACION_DIAS);
  } else if (tipo === 'diagnostico') {
    need(a.sexo === 'hembra', 'invalid_type', 'El diagnóstico se registra en una hembra');
    extra.prenada = b.prenada === true || b.prenada === 'true';
    if (extra.prenada && !proxima) { const m = await ultimaMonta(animalId, fecha); need(m, 'no_service', 'Registra primero la monta o escribe la fecha probable de parto'); proxima = m.proxima_fecha; }
    if (!extra.prenada) proxima = null;
  } else if (tipo === 'parto') {
    need(a.sexo === 'hembra', 'invalid_type', 'El parto se registra en una hembra');
    const c = b.cria || null;
    if (c && (c.arete || c.nombre)) {
      const sexo = c.sexo === 'macho' ? 'macho' : 'hembra'; const peso = c.peso ? num(c.peso) : null;
      const m = await ultimaMonta(animalId, fecha);
      const { id: cid } = await guardarAnimal({ arete: c.arete, nombre: c.nombre, sexo, nacimiento: fecha, lote: a.lote, madre: a.arete || a.nombre, padre: (m && json((await query("select extra from ganado_eventos where animal_id = $1 and tipo = 'monta' and fecha = $2 limit 1", [animalId, m.fecha]))[0]?.extra).toro) || '', peso: null });
      if (peso) { need(peso > 0 && peso < 200, 'invalid_amount', 'Peso de la cría inválido'); await query("insert into ganado_eventos (id, negocio_id, animal_id, tipo, fecha, valor, creado_en) values ($1, $2, $3, 'peso', $4, $5, $6)", [uid(), N, cid, fecha, peso, ahora]); await query('update animales set peso_actual = $3, peso_en = $4 where id = $1 and negocio_id = $2', [cid, N, peso, fecha]); }
      extra.cria_id = cid; out.cria_id = cid;
    }
  } else if (tipo === 'venta') {
    need(a.estado === 'activo', 'invalid_state', 'El animal ya no está activo');
    valor = Math.round(num(b.valor)); need(valor >= 0 && valor < 1e13, 'invalid_amount', 'Precio inválido');
    extra.comprador = txt(b.comprador, 120) || null; extra.peso = b.peso ? num(b.peso) : null;
  } else if (tipo === 'muerte') { need(a.estado === 'activo', 'invalid_state', 'El animal ya no está activo'); }
  else if (tipo === 'nota') { need(detalle, 'name_required', 'Escribe la nota'); }

  if (tipo === 'leche') {
    if (animalId) await query("delete from ganado_eventos where negocio_id = $1 and tipo = 'leche' and fecha = $2 and animal_id = $3", [N, fecha, animalId]);
    else await query("delete from ganado_eventos where negocio_id = $1 and tipo = 'leche' and fecha = $2 and animal_id is null", [N, fecha]);
  }
  await query('insert into ganado_eventos (id, negocio_id, animal_id, tipo, fecha, valor, producto, detalle, proxima_fecha, extra, creado_en) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
    [id, N, animalId, tipo, fecha, valor, producto, detalle, proxima, Object.keys(extra).length ? JSON.stringify(extra) : null, ahora]);

  if (tipo === 'peso' && (!a.peso_en || fecha >= a.peso_en)) await query('update animales set peso_actual = $3, peso_en = $4, actualizado_en = $5 where id = $1 and negocio_id = $2', [animalId, N, valor, fecha, ahora]);
  if (tipo === 'venta') {
    await query("update animales set estado = 'vendido', actualizado_en = $3 where id = $1 and negocio_id = $2", [animalId, N, ahora]);
    if (b.caja !== false && valor > 0) {
      try { await agregarMovimiento(fecha, { tipo: 'ingreso', medio: 'efectivo', monto: valor, concepto: `Venta de ganado ${a.arete || a.nombre}` }); out.caja = true; } catch { out.caja = false; }
    }
  }
  if (tipo === 'muerte') await query("update animales set estado = 'muerto', actualizado_en = $3 where id = $1 and negocio_id = $2", [animalId, N, ahora]);
  if (proxima && (tipo === 'monta' || tipo === 'diagnostico')) out.parto_probable = proxima;
  return out;
}

export async function borrarEvento(id) {
  const [e] = await query('select id, animal_id, tipo from ganado_eventos where id = $1 and negocio_id = $2', [id, nid()]);
  if (!e) throw new HttpError(404, 'not_found');
  await query('delete from ganado_eventos where id = $1 and negocio_id = $2', [id, nid()]);
  if (e.animal_id && (e.tipo === 'venta' || e.tipo === 'muerte')) await query("update animales set estado = 'activo' where id = $1 and negocio_id = $2", [e.animal_id, nid()]);
  if (e.animal_id && e.tipo === 'peso') {
    const [u] = await query("select fecha, valor from ganado_eventos where animal_id = $1 and negocio_id = $2 and tipo = 'peso' order by fecha desc, creado_en desc limit 1", [e.animal_id, nid()]);
    await query('update animales set peso_actual = $3, peso_en = $4 where id = $1 and negocio_id = $2', [e.animal_id, nid(), u ? u.valor : null, u ? u.fecha : null]);
  }
  return { ok: true };
}

// Sanidad masiva: vacunar o desparasitar un lote (o todo el hato) con un solo registro.
export async function eventoLote(b) {
  const tipo = b.tipo; need(SANIDAD.includes(tipo), 'invalid_type', 'Tipo inválido');
  const fecha = ymd(b.fecha || todayLocal()); need(fecha <= todayLocal(), 'future_day', 'No se puede registrar una fecha futura');
  const producto = txt(b.producto, 100); need(producto, 'name_required', 'Escribe el producto');
  const proxima = b.proxima_fecha ? ymd(b.proxima_fecha, 'Próxima fecha') : null; need(!proxima || proxima >= fecha, 'invalid_date', 'La próxima fecha debe ser posterior');
  const lote = txt(b.lote, 60);
  const sel = Array.isArray(b.animales) ? b.animales.slice(0, 500).map(String) : null;
  const ids = sel ? (await query("select id from animales where negocio_id = $1 and estado = 'activo'", [nid()])).filter((r) => sel.includes(r.id)) : b.todos ? await query("select id from animales where negocio_id = $1 and estado = 'activo'", [nid()])
    : await query("select id from animales where negocio_id = $1 and estado = 'activo' and lower(coalesce(lote, '')) = lower($2)", [nid(), lote]);
  need(ids.length, 'empty_group', 'No hay animales activos en ese grupo');
  const ahora = nowIso();
  for (const r of ids) await query('insert into ganado_eventos (id, negocio_id, animal_id, tipo, fecha, producto, detalle, proxima_fecha, creado_en) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)', [uid(), nid(), r.id, tipo, fecha, producto, txt(b.detalle, 300) || null, proxima, ahora]);
  return { n: ids.length };
}
