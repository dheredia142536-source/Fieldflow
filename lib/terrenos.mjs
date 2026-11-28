// Terrenos: fichas para vender o buscar comprar, con fotos, características, documentos legales e interesados.
// Land listings: sale or purchase, with photos, features, legal documents and interested people.
import { query } from './db.mjs';
import { nid } from './tenant.mjs';
import { HttpError, nowIso, uid } from './util.mjs';

const txt = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const need = (c, code, msg) => { if (!c) throw new HttpError(400, code, msg || code); };
const num = (v) => Number(v) || 0;
export const OPERACIONES = ['venta', 'compra'];
export const ESTADOS = ['disponible', 'negociacion', 'cerrado'];
export const USOS = ['agricola', 'ganadero', 'mixto', 'forestal', 'lote', 'otro'];
export const CARACTERISTICAS = ['agua', 'rio', 'pozo', 'luz', 'via', 'cercado', 'casa', 'establo', 'riego', 'internet', 'pastos', 'cultivos', 'arboles', 'plano'];
export const DOCUMENTOS = ['escritura', 'tradicion', 'predial', 'linderos', 'uso_suelo', 'servidumbres', 'paz_salvo'];
export const INTERES = ['nuevo', 'visita', 'oferta', 'descartado'];
const MAX_FOTOS = 10;
const IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

const lista = (raw, permitidos) => { try { return (JSON.parse(raw || '[]') || []).filter((x) => permitidos.includes(x)); } catch { return []; } };
const pick = (arr, permitidos) => [...new Set((Array.isArray(arr) ? arr : []).filter((x) => permitidos.includes(x)))];

function mapT(t) {
  const area = num(t.area_ha); const precio = num(t.precio);
  return {
    id: t.id, titulo: t.titulo, operacion: t.operacion, estado: t.estado, uso: t.uso || null,
    departamento: t.departamento || '', municipio: t.municipio || '', vereda: t.vereda || '', direccion: t.direccion || '',
    lat: t.lat == null ? null : Number(t.lat), lng: t.lng == null ? null : Number(t.lng),
    area_ha: area, precio, precio_ha: area > 0 ? Math.round(precio / area) : 0, negociable: !!t.negociable,
    descripcion: t.descripcion || '', caracteristicas: lista(t.caracteristicas, CARACTERISTICAS), documentos: lista(t.documentos, DOCUMENTOS),
    contacto_nombre: t.contacto_nombre || '', contacto_tel: t.contacto_tel || '', notas: t.notas || '',
    creado: t.creado_en, actualizado: t.actualizado_en,
  };
}

async function mine(id) {
  const [t] = await query('select * from terrenos where id = $1 and negocio_id = $2', [id, nid()]);
  if (!t) throw new HttpError(404, 'not_found');
  return t;
}

export async function listTerrenos() {
  const N = nid();
  const rows = await query('select * from terrenos where negocio_id = $1 order by actualizado_en desc limit 500', [N]);
  const fotos = await query('select terreno_id, mini from terreno_fotos where negocio_id = $1 and orden = (select min(f2.orden) from terreno_fotos f2 where f2.terreno_id = terreno_fotos.terreno_id)', [N]);
  const nf = await query('select terreno_id, count(*) as n from terreno_fotos where negocio_id = $1 group by terreno_id', [N]);
  const ni = await query("select terreno_id, count(*) as n from terreno_interesados where negocio_id = $1 and estado <> 'descartado' group by terreno_id", [N]);
  const cover = new Map(fotos.map((f) => [f.terreno_id, f.mini]));
  const fcount = new Map(nf.map((f) => [f.terreno_id, Number(f.n)]));
  const icount = new Map(ni.map((f) => [f.terreno_id, Number(f.n)]));
  return { terrenos: rows.map((t) => ({ ...mapT(t), portada: cover.get(t.id) || null, fotos: fcount.get(t.id) || 0, interesados: icount.get(t.id) || 0 })) };
}

function datos(b) {
  const titulo = txt(b.titulo, 120); need(titulo, 'name_required', 'Título requerido');
  const operacion = b.operacion || 'venta'; need(OPERACIONES.includes(operacion), 'invalid_type', 'Operación inválida');
  const estado = b.estado || 'disponible'; need(ESTADOS.includes(estado), 'invalid_state', 'Estado inválido');
  const uso = b.uso ? b.uso : null; need(!uso || USOS.includes(uso), 'invalid_type', 'Uso inválido');
  const area = num(b.area_ha); need(area >= 0 && area < 1e7, 'invalid_amount', 'Área inválida');
  const precio = Math.round(num(b.precio)); need(precio >= 0 && precio < 1e14, 'invalid_amount', 'Precio inválido');
  const coord = (v, lim) => { if (v === '' || v == null) return null; const n = Number(v); need(Number.isFinite(n) && Math.abs(n) <= lim, 'invalid_coords', 'Coordenadas inválidas'); return n; };
  return {
    titulo, operacion, estado, uso, area, precio, negociable: b.negociable === false ? 0 : 1,
    departamento: txt(b.departamento, 60) || null, municipio: txt(b.municipio, 80) || null, vereda: txt(b.vereda, 80) || null, direccion: txt(b.direccion, 200) || null,
    lat: coord(b.lat, 90), lng: coord(b.lng, 180), descripcion: txt(b.descripcion, 3000) || null,
    caracteristicas: JSON.stringify(pick(b.caracteristicas, CARACTERISTICAS)), documentos: JSON.stringify(pick(b.documentos, DOCUMENTOS)),
    contacto_nombre: txt(b.contacto_nombre, 120) || null, contacto_tel: txt(b.contacto_tel, 40) || null, notas: txt(b.notas, 2000) || null,
  };
}

export async function guardarTerreno(b) {
  const d = datos(b);
  const ahora = nowIso();
  if (b.id) {
    await mine(b.id);
    await query(
      `update terrenos set titulo = $3, operacion = $4, estado = $5, uso = $6, departamento = $7, municipio = $8, vereda = $9, direccion = $10, lat = $11, lng = $12, area_ha = $13, precio = $14,
         negociable = $15, descripcion = $16, caracteristicas = $17, documentos = $18, contacto_nombre = $19, contacto_tel = $20, notas = $21, actualizado_en = $22 where id = $1 and negocio_id = $2`,
      [b.id, nid(), d.titulo, d.operacion, d.estado, d.uso, d.departamento, d.municipio, d.vereda, d.direccion, d.lat, d.lng, d.area, d.precio, d.negociable, d.descripcion, d.caracteristicas, d.documentos, d.contacto_nombre, d.contacto_tel, d.notas, ahora],
    );
    return { id: b.id };
  }
  const id = uid();
  await query(
    `insert into terrenos (id, negocio_id, titulo, operacion, estado, uso, departamento, municipio, vereda, direccion, lat, lng, area_ha, precio, negociable, descripcion, caracteristicas, documentos, contacto_nombre, contacto_tel, notas, creado_en, actualizado_en)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $22)`,
    [id, nid(), d.titulo, d.operacion, d.estado, d.uso, d.departamento, d.municipio, d.vereda, d.direccion, d.lat, d.lng, d.area, d.precio, d.negociable, d.descripcion, d.caracteristicas, d.documentos, d.contacto_nombre, d.contacto_tel, d.notas, ahora],
  );
  return { id };
}

export async function detalleTerreno(id) {
  const t = await mine(id);
  const fotos = await query('select id, orden, grande, mini from terreno_fotos where terreno_id = $1 and negocio_id = $2 order by orden, creado_en', [id, nid()]);
  const inter = await query('select id, nombre, telefono, oferta, estado, nota, creado_en from terreno_interesados where terreno_id = $1 and negocio_id = $2 order by creado_en desc', [id, nid()]);
  // Referencia de precio: otros terrenos del mismo municipio (o departamento) con precio y área.
  const comp = await query(
    `select precio, area_ha from terrenos where negocio_id = $1 and id <> $2 and operacion = $3 and area_ha > 0 and precio > 0 and (lower(coalesce(municipio, '')) = lower($4) or lower(coalesce(departamento, '')) = lower($5)) limit 200`,
    [nid(), id, t.operacion, t.municipio || '', t.departamento || '-'],
  );
  const phs = comp.map((c) => num(c.precio) / num(c.area_ha));
  return {
    terreno: mapT(t), fotos: fotos.map((f) => ({ id: f.id, grande: f.grande, mini: f.mini })),
    interesados: inter.map((i) => ({ id: i.id, nombre: i.nombre, telefono: i.telefono || '', oferta: num(i.oferta), estado: i.estado, nota: i.nota || '', creado: i.creado_en })),
    referencia: phs.length ? { n: phs.length, promedio_ha: Math.round(phs.reduce((a, b) => a + b, 0) / phs.length), min_ha: Math.round(Math.min(...phs)), max_ha: Math.round(Math.max(...phs)) } : null,
  };
}

export async function borrarTerreno(id) {
  await mine(id);
  await query('delete from terreno_fotos where terreno_id = $1 and negocio_id = $2', [id, nid()]);
  await query('delete from terreno_interesados where terreno_id = $1 and negocio_id = $2', [id, nid()]);
  await query('delete from terrenos where id = $1 and negocio_id = $2', [id, nid()]);
  return { ok: true };
}

// ── Fotos (el navegador las reduce antes de enviarlas) ─────────────────────────
export async function agregarFoto(id, b) {
  await mine(id);
  need(typeof b.grande === 'string' && typeof b.mini === 'string' && IMG.test(b.grande) && IMG.test(b.mini), 'invalid_image', 'Imagen inválida');
  need(b.grande.length <= 1_200_000 && b.mini.length <= 120_000, 'image_too_large', 'La imagen es muy pesada');
  const [{ n }] = await query('select count(*) as n from terreno_fotos where terreno_id = $1 and negocio_id = $2', [id, nid()]);
  need(Number(n) < MAX_FOTOS, 'too_many_photos', `Máximo ${MAX_FOTOS} fotos por terreno`);
  const [{ m }] = await query('select coalesce(max(orden), -1) as m from terreno_fotos where terreno_id = $1 and negocio_id = $2', [id, nid()]);
  const fid = uid();
  await query('insert into terreno_fotos (id, negocio_id, terreno_id, orden, grande, mini, creado_en) values ($1, $2, $3, $4, $5, $6, $7)', [fid, nid(), id, Number(m) + 1, b.grande, b.mini, nowIso()]);
  return { id: fid };
}
export async function borrarFoto(fid) {
  const [f] = await query('select id from terreno_fotos where id = $1 and negocio_id = $2', [fid, nid()]);
  if (!f) throw new HttpError(404, 'not_found');
  await query('delete from terreno_fotos where id = $1 and negocio_id = $2', [fid, nid()]);
  return { ok: true };
}
export async function fotoPortada(fid) {
  const [f] = await query('select terreno_id from terreno_fotos where id = $1 and negocio_id = $2', [fid, nid()]);
  if (!f) throw new HttpError(404, 'not_found');
  const [{ m }] = await query('select coalesce(min(orden), 0) as m from terreno_fotos where terreno_id = $1 and negocio_id = $2', [f.terreno_id, nid()]);
  await query('update terreno_fotos set orden = $3 where id = $1 and negocio_id = $2', [fid, nid(), Number(m) - 1]);
  return { ok: true };
}

// ── Interesados ───────────────────────────────────────────────────────────────
export async function agregarInteresado(id, b) {
  await mine(id);
  const nombre = txt(b.nombre, 120); need(nombre, 'name_required', 'Nombre requerido');
  const oferta = Math.round(num(b.oferta)); need(oferta >= 0 && oferta < 1e14, 'invalid_amount', 'Oferta inválida');
  const estado = b.estado || 'nuevo'; need(INTERES.includes(estado), 'invalid_state', 'Estado inválido');
  const iid = uid();
  await query('insert into terreno_interesados (id, negocio_id, terreno_id, nombre, telefono, oferta, estado, nota, creado_en) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [iid, nid(), id, nombre, txt(b.telefono, 40) || null, oferta, estado, txt(b.nota, 500) || null, nowIso()]);
  return { id: iid };
}
export async function editarInteresado(iid, b) {
  const [i] = await query('select id from terreno_interesados where id = $1 and negocio_id = $2', [iid, nid()]);
  if (!i) throw new HttpError(404, 'not_found');
  const estado = b.estado; need(INTERES.includes(estado), 'invalid_state', 'Estado inválido');
  await query('update terreno_interesados set estado = $3 where id = $1 and negocio_id = $2', [iid, nid(), estado]);
  return { ok: true };
}
export async function borrarInteresado(iid) {
  const [i] = await query('select id from terreno_interesados where id = $1 and negocio_id = $2', [iid, nid()]);
  if (!i) throw new HttpError(404, 'not_found');
  await query('delete from terreno_interesados where id = $1 and negocio_id = $2', [iid, nid()]);
  return { ok: true };
}
