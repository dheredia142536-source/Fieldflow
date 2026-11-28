// Datos de ejemplo del CRM, productos, caja y stock (sólo si el negocio aún no tiene nada de eso).
import { query } from './db.mjs';
import { nid } from './tenant.mjs';
import { addDays, todayLocal } from './time.mjs';
import { nowIso, uid } from './util.mjs';

export async function loadDemoCrm() {
  const N = nid();
  const [{ n }] = await query('select cast(count(*) as integer) as n from productos where negocio_id = $1', [N]);
  if (Number(n) > 0) return { skipped: true };
  const hoy = todayLocal();
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const at = (dia, h, m = 0) => new Date(Date.parse(`${dia}T00:00:00Z`) + (h + 5) * 3600000 + m * 60000).toISOString();

  // Contactos
  const contactos = [
    ['Finca La Esperanza', 'Hacienda La Esperanza', 'compras@laesperanza.co', '573112223344', 'cotizado', 4800000, 'Enviar cotización de cosecha', 1],
    ['María Fernanda Ruiz', 'Cultivos del Meta', 'mf.ruiz@cultivosmeta.co', '573104445566', 'contactado', 2200000, 'Llamar para confirmar fecha', 0],
    ['Cooperativa Agroriente', 'Agroriente', 'gerencia@agroriente.co', '573205550011', 'nuevo', 9000000, '', 0],
    ['Jorge Andrés Peña', '', 'jorge.pena@correo.co', '573001234567', 'cerrado', 1500000, '', 0],
    ['Hacienda San Pedro', 'San Pedro Ganadería', 'admin@sanpedro.co', '573155556677', 'cotizado', 6300000, 'Visita técnica', 2],
    ['Luz Marina Ortiz', 'Frutas de Villavicencio', 'luz@frutasvilla.co', '573126667788', 'nuevo', 800000, '', 0],
    ['Transportes El Llano', 'El Llano S.A.S.', 'operaciones@elllano.co', '573187778899', 'contactado', 3100000, 'Enviar tarifas', -1],
    ['Campo Alegre', 'Campo Alegre', 'hola@campoalegre.co', '573198889900', 'perdido', 1200000, '', 0],
    ['Insumos del Oriente', 'Insumos del Oriente', 'ventas@insumosoriente.co', '573129990011', 'nuevo', 0, '', 0],
  ];
  let i = 0;
  for (const [nombre, empresa, correo, tel, etapa, valor, acc, off] of contactos) {
    const id = uid(); const creado = at(addDays(hoy, -(i * 2 + (i === 0 || i === 5 ? 0 : 3))), 9);
    await query(
      `insert into contactos (id, negocio_id, nombre, correo, telefono, empresa, etapa, origen, valor, proxima_accion, proxima_fecha, ultimo_contacto_en, creado_en, actualizado_en)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
      [id, N, nombre, correo, tel, empresa || null, etapa, i % 3 === 0 ? 'asistente' : 'manual', valor, acc || null, acc ? addDays(hoy, off) : null, etapa === 'nuevo' ? null : creado, creado],
    );
    if (etapa !== 'nuevo') {
      await query('insert into contacto_historial (id, negocio_id, contacto_id, tipo, asunto, cuerpo, creado_en) values ($1, $2, $3, $4, $5, $6, $7)', [uid(), N, id, 'llamada', null, 'Hablamos sobre fechas de cosecha y volumen aproximado.', creado]);
    }
    i++;
  }

  // Productos libres
  const prods = [
    ['Empanadas', 'unidad', 3000, 40, 60, 12, 20], ['Vacas', 'cabeza', 4500000, 0, 0, 0, 0], ['Abono orgánico', 'bulto', 65000, 5, 30, 4, 8], ['Café pergamino', 'kg', 14000, 50, 80, 25, 15],
  ];
  const P = [];
  for (const [nombre, unidad, precio, min, ini] of prods) {
    const id = uid(); P.push({ id, nombre, ini, min }); await query('insert into productos (id, negocio_id, nombre, unidad, precio, stock_minimo, activo, creado_en) values ($1, $2, $3, $4, $5, $6, 1, $7)', [id, N, nombre, unidad, precio, min, nowIso()]);
  }
  // Historial de 10 días: ventas, gastos, entradas y salidas; los días pasados quedan cerrados (menos ayer).
  let cash = 200000; const stock = [60, 14, 30, 120];
  for (let d = 10; d >= 0; d--) {
    const dia = addDays(hoy, -d);
    const ing = Math.round((180000 + rnd() * 420000) / 1000) * 1000; const egr = Math.round((40000 + rnd() * 90000) / 1000) * 1000; const tr = Math.round((30000 + rnd() * 120000) / 1000) * 1000;
    const mv = [['ingreso', 'efectivo', 'Ventas del día', ing, 11], ['ingreso', 'transferencia', 'Pago de cliente', tr, 14], ['egreso', 'efectivo', 'Combustible y jornales', egr, 16]];
    if (d === 0) mv.pop();
    for (const [tipo, medio, concepto, monto, h] of mv) await query('insert into caja_movimientos (id, negocio_id, dia, tipo, medio, concepto, monto, creado_en) values ($1, $2, $3, $4, $5, $6, $7, $8)', [uid(), N, dia, tipo, medio, concepto, monto, at(dia, h)]);
    const apertura = cash;
    for (let k = 0; k < P.length; k++) {
      if (k === 1) continue;
      const ent = d % 3 === 0 ? Math.round(P[k].ini * 0.5) : 0; const sal = Math.round(P[k].ini * (0.08 + rnd() * 0.14));
      if (ent) await query('insert into stock_movimientos (id, negocio_id, dia, producto_id, tipo, cantidad, nota, creado_en) values ($1, $2, $3, $4, $5, $6, $7, $8)', [uid(), N, dia, P[k].id, 'entrada', ent, 'Reposición', at(dia, 8)]);
      if (d > 0 || k !== 0) await query('insert into stock_movimientos (id, negocio_id, dia, producto_id, tipo, cantidad, nota, creado_en) values ($1, $2, $3, $4, $5, $6, $7, $8)', [uid(), N, dia, P[k].id, 'salida', sal, 'Ventas', at(dia, 12)]);
      stock[k] = Math.max(0, stock[k] + ent - sal);
    }
    cash = apertura + ing - egr;
    if (d >= 2) {
      const real = d === 4 ? cash - 2000 : cash;
      await query('insert into caja_dias (negocio_id, dia, apertura, cierre_real, cerrado_en, nota) values ($1, $2, $3, $4, $5, $6)', [N, dia, apertura, real, at(dia, 19), d === 4 ? 'Faltaron 2.000 en caja' : null]);
      cash = real;
      for (let k = 0; k < P.length; k++) if (k !== 1) await query('insert into stock_conteos (negocio_id, dia, producto_id, cantidad) values ($1, $2, $3, $4)', [N, dia, P[k].id, stock[k]]);
    }
  }
  // Las vacas: un inventario pequeño y estable.
  await query('insert into stock_movimientos (id, negocio_id, dia, producto_id, tipo, cantidad, nota, creado_en) values ($1, $2, $3, $4, $5, $6, $7, $8)', [uid(), N, addDays(hoy, -10), P[1].id, 'entrada', 14, 'Inventario inicial', at(addDays(hoy, -10), 8)]);
  return { ok: true };
}
