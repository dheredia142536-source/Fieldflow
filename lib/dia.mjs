// Control diario independiente: caja y productos (stock). Cada día tiene su apertura, movimientos y cierre.
// Independent daily control: cash and products (stock). Each day has its own opening, movements and close.
import { query, tx } from './db.mjs';
import { nid } from './tenant.mjs';
import { HttpError, iso, nowIso, uid } from './util.mjs';
import { addDays, isYmd, todayLocal } from './time.mjs';

const txt = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const need = (c, code, msg) => { if (!c) throw new HttpError(400, code, msg || code); };
const num = (v) => Number(v) || 0;
const ymdOk = (d) => { need(isYmd(d), 'invalid_date', 'Fecha inválida'); need(d <= addDays(todayLocal(), 1), 'future_day', 'No se puede registrar un día futuro'); return d; };
export const MEDIOS = ['efectivo', 'transferencia', 'otro'];
const delta = (tipo, c) => (tipo === 'entrada' ? c : tipo === 'ajuste' ? c : -c);

// ── Productos ────────────────────────────────────────────────────────────────
export async function listProductos() {
  const r = await query('select * from productos where negocio_id = $1 order by activo desc, nombre', [nid()]);
  return { productos: r.map((p) => ({ id: p.id, nombre: p.nombre, unidad: p.unidad, precio: num(p.precio), stock_minimo: num(p.stock_minimo), activo: !!p.activo })) };
}
export async function guardarProducto(b) {
  const nombre = txt(b.nombre, 120); need(nombre, 'name_required', 'Nombre requerido');
  const unidad = txt(b.unidad, 30) || 'unidad';
  const precio = Math.round(num(b.precio)); need(precio >= 0 && precio < 1e12, 'invalid_amount', 'Precio inválido');
  const min = num(b.stock_minimo); need(min >= 0 && min < 1e9, 'invalid_amount', 'Mínimo inválido');
  const id = b.id || uid();
  const [prev] = await query('select negocio_id from productos where id = $1', [id]);
  if (prev && prev.negocio_id !== nid()) throw new HttpError(404, 'not_found');
  await query(
    `insert into productos (id, negocio_id, nombre, unidad, precio, stock_minimo, activo, creado_en) values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (id) do update set nombre = excluded.nombre, unidad = excluded.unidad, precio = excluded.precio, stock_minimo = excluded.stock_minimo, activo = excluded.activo`,
    [id, nid(), nombre, unidad, precio, min, b.activo === false ? 0 : 1, nowIso()],
  );
  return { id };
}

// ── Día ──────────────────────────────────────────────────────────────────────
async function stockInicial(dia, productos) {
  const N = nid();
  const out = new Map(productos.map((p) => [p.id, 0]));
  if (!productos.length) return out;
  const conteos = await query('select producto_id, dia, cantidad from stock_conteos where negocio_id = $1 and dia < $2 order by dia', [N, dia]);
  const ultimo = new Map(); // producto → { dia, cantidad } del conteo más reciente
  for (const c of conteos) ultimo.set(c.producto_id, { dia: c.dia, cantidad: num(c.cantidad) });
  const movs = await query('select producto_id, dia, tipo, cantidad from stock_movimientos where negocio_id = $1 and dia < $2', [N, dia]);
  for (const p of productos) out.set(p.id, ultimo.get(p.id)?.cantidad || 0);
  for (const m of movs) {
    if (!out.has(m.producto_id)) continue;
    const u = ultimo.get(m.producto_id);
    if (u && m.dia <= u.dia) continue; // ya está incluido en el conteo físico de ese día
    out.set(m.producto_id, out.get(m.producto_id) + delta(m.tipo, num(m.cantidad)));
  }
  return out;
}

export async function getDia(dia) {
  ymdOk(dia);
  const N = nid();
  const [caja] = await query('select * from caja_dias where negocio_id = $1 and dia = $2', [N, dia]);
  const [prev] = await query('select cierre_real from caja_dias where negocio_id = $1 and dia < $2 and cierre_real is not null order by dia desc limit 1', [N, dia]);
  const movs = await query('select id, tipo, medio, concepto, monto, creado_en from caja_movimientos where negocio_id = $1 and dia = $2 order by creado_en', [N, dia]);
  const prods = await query('select * from productos where negocio_id = $1 and activo = 1 order by nombre', [N]);
  const smov = await query('select id, producto_id, tipo, cantidad, nota, creado_en from stock_movimientos where negocio_id = $1 and dia = $2 order by creado_en', [N, dia]);
  const conteos = await query('select producto_id, cantidad from stock_conteos where negocio_id = $1 and dia = $2', [N, dia]);
  const ini = await stockInicial(dia, prods);
  const cnt = new Map(conteos.map((c) => [c.producto_id, num(c.cantidad)]));

  const sum = (tipo, medio) => movs.filter((m) => m.tipo === tipo && m.medio === medio).reduce((a, m) => a + num(m.monto), 0);
  const apertura = caja ? num(caja.apertura) : num(prev?.cierre_real);
  const ingE = sum('ingreso', 'efectivo'); const egrE = sum('egreso', 'efectivo');
  const resumen = {
    ingresos: movs.filter((m) => m.tipo === 'ingreso').reduce((a, m) => a + num(m.monto), 0),
    egresos: movs.filter((m) => m.tipo === 'egreso').reduce((a, m) => a + num(m.monto), 0),
    ing_efectivo: ingE, egr_efectivo: egrE, ing_transferencia: sum('ingreso', 'transferencia'), egr_transferencia: sum('egreso', 'transferencia'),
    esperado_efectivo: apertura + ingE - egrE,
  };
  const productos = prods.map((p) => {
    const ms = smov.filter((m) => m.producto_id === p.id);
    const entradas = ms.filter((m) => m.tipo === 'entrada').reduce((a, m) => a + num(m.cantidad), 0);
    const salidas = ms.filter((m) => m.tipo === 'salida' || m.tipo === 'merma').reduce((a, m) => a + num(m.cantidad), 0);
    const ajustes = ms.filter((m) => m.tipo === 'ajuste').reduce((a, m) => a + num(m.cantidad), 0);
    const inicial = ini.get(p.id) || 0;
    return { id: p.id, nombre: p.nombre, unidad: p.unidad, precio: num(p.precio), stock_minimo: num(p.stock_minimo), inicial, entradas, salidas, ajustes, esperado: inicial + entradas - salidas + ajustes, conteo: cnt.has(p.id) ? cnt.get(p.id) : null };
  });
  return {
    dia, hoy: todayLocal(), cerrado: !!caja?.cerrado_en, cerrado_en: caja?.cerrado_en ? iso(caja.cerrado_en) : null, apertura, apertura_sugerida: num(prev?.cierre_real), apertura_fijada: !!caja,
    cierre_real: caja?.cierre_real == null ? null : num(caja.cierre_real), nota: caja?.nota || '', resumen,
    movimientos: movs.map((m) => ({ id: m.id, tipo: m.tipo, medio: m.medio, concepto: m.concepto || '', monto: num(m.monto), en: iso(m.creado_en) })),
    productos,
    movs_stock: smov.map((m) => ({ id: m.id, producto_id: m.producto_id, tipo: m.tipo, cantidad: num(m.cantidad), nota: m.nota || '', en: iso(m.creado_en) })),
  };
}

async function abierto(dia) {
  const [c] = await query('select cerrado_en from caja_dias where negocio_id = $1 and dia = $2', [nid(), dia]);
  if (c?.cerrado_en) throw new HttpError(409, 'day_closed', 'Este día ya está cerrado. Reábrelo para editarlo.');
}

export async function fijarApertura(dia, b) {
  ymdOk(dia); await abierto(dia);
  const ap = Math.round(num(b.apertura)); need(ap >= 0 && ap < 1e12, 'invalid_amount', 'Monto inválido');
  await query(
    `insert into caja_dias (negocio_id, dia, apertura) values ($1, $2, $3) on conflict (negocio_id, dia) do update set apertura = excluded.apertura`,
    [nid(), dia, ap],
  );
  return { ok: true };
}

export async function agregarMovimiento(dia, b) {
  ymdOk(dia); await abierto(dia);
  need(['ingreso', 'egreso'].includes(b.tipo), 'invalid_type', 'Tipo inválido');
  const medio = MEDIOS.includes(b.medio) ? b.medio : 'efectivo';
  const monto = Math.round(num(b.monto)); need(monto > 0 && monto < 1e12, 'invalid_amount', 'Monto inválido');
  const id = uid();
  await query('insert into caja_movimientos (id, negocio_id, dia, tipo, medio, concepto, monto, creado_en) values ($1, $2, $3, $4, $5, $6, $7, $8)', [id, nid(), dia, b.tipo, medio, txt(b.concepto, 160) || null, monto, nowIso()]);
  return { id };
}
export async function borrarMovimiento(id) {
  const [m] = await query('select dia from caja_movimientos where id = $1 and negocio_id = $2', [id, nid()]);
  if (!m) throw new HttpError(404, 'not_found');
  await abierto(m.dia);
  await query('delete from caja_movimientos where id = $1 and negocio_id = $2', [id, nid()]);
  return { ok: true };
}

export async function agregarStock(dia, b) {
  ymdOk(dia); await abierto(dia);
  need(['entrada', 'salida', 'merma', 'ajuste'].includes(b.tipo), 'invalid_type', 'Tipo inválido');
  const cant = num(b.cantidad);
  need(b.tipo === 'ajuste' ? cant !== 0 : cant > 0, 'invalid_amount', 'Cantidad inválida'); need(Math.abs(cant) < 1e9, 'invalid_amount');
  const [p] = await query('select id from productos where id = $1 and negocio_id = $2', [b.producto_id, nid()]);
  need(p, 'invalid_product', 'Producto no válido');
  const id = uid();
  await query('insert into stock_movimientos (id, negocio_id, dia, producto_id, tipo, cantidad, nota, creado_en) values ($1, $2, $3, $4, $5, $6, $7, $8)', [id, nid(), dia, p.id, b.tipo, cant, txt(b.nota, 160) || null, nowIso()]);
  return { id };
}
export async function borrarStock(id) {
  const [m] = await query('select dia from stock_movimientos where id = $1 and negocio_id = $2', [id, nid()]);
  if (!m) throw new HttpError(404, 'not_found');
  await abierto(m.dia);
  await query('delete from stock_movimientos where id = $1 and negocio_id = $2', [id, nid()]);
  return { ok: true };
}

// Cierra el día: guarda el efectivo contado y el conteo físico de cada producto. Las diferencias quedan a la vista.
export async function cerrarDia(dia, b) {
  ymdOk(dia); await abierto(dia);
  const N = nid();
  const real = b.cierre_real == null || b.cierre_real === '' ? null : Math.round(num(b.cierre_real));
  need(real == null || (real >= 0 && real < 1e12), 'invalid_amount', 'Monto inválido');
  const conteos = b.conteos && typeof b.conteos === 'object' ? b.conteos : {};
  const prods = new Set((await query('select id from productos where negocio_id = $1', [N])).map((p) => p.id));
  const d = await getDia(dia);
  await tx(async (q) => {
    await q(
      `insert into caja_dias (negocio_id, dia, apertura, cierre_real, cerrado_en, nota) values ($1, $2, $3, $4, $5, $6)
       on conflict (negocio_id, dia) do update set cierre_real = excluded.cierre_real, cerrado_en = excluded.cerrado_en, nota = excluded.nota, apertura = excluded.apertura`,
      [N, dia, d.apertura, real, nowIso(), txt(b.nota, 500) || null],
    );
    await q('delete from stock_conteos where negocio_id = $1 and dia = $2', [N, dia]);
    for (const [pid, v] of Object.entries(conteos)) {
      if (!prods.has(pid) || v === '' || v == null) continue;
      const n = num(v); need(n >= 0 && n < 1e9, 'invalid_amount', 'Cantidad inválida');
      await q('insert into stock_conteos (negocio_id, dia, producto_id, cantidad) values ($1, $2, $3, $4)', [N, dia, pid, n]);
    }
  });
  return { ok: true };
}
export async function reabrirDia(dia) {
  ymdOk(dia);
  await query('update caja_dias set cerrado_en = null where negocio_id = $1 and dia = $2', [nid(), dia]);
  return { ok: true };
}

// Serie diaria de ingresos y egresos (para el gráfico; el navegador agrupa por rango).
export async function finanzas() {
  const desde = addDays(todayLocal(), -800);
  const r = await query(
    `select dia, sum(case when tipo = 'ingreso' then monto else 0 end) as ing, sum(case when tipo = 'egreso' then monto else 0 end) as egr
     from caja_movimientos where negocio_id = $1 and dia >= $2 group by dia order by dia`,
    [nid(), desde],
  );
  const cierres = await query('select dia, cierre_real, cerrado_en from caja_dias where negocio_id = $1 and dia >= $2 order by dia', [nid(), addDays(todayLocal(), -45)]);
  return { hoy: todayLocal(), dias: r.map((x) => [x.dia, num(x.ing), num(x.egr)]), cierres: cierres.map((c) => ({ dia: c.dia, cerrado: !!c.cerrado_en })) };
}
