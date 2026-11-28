// Enlace público de cada negocio: el cliente toca el enlace (que el negocio pega en su WhatsApp Business)
// y entra directo al asistente, sin cuenta. El nombre y el teléfono se piden dentro del chat, al agendar.
// Public link of each business: the customer taps the link and lands in the assistant, no account needed.
import { query } from './db.mjs';
import { nid, withNegocio } from './tenant.mjs';
import { getConfig } from './config.mjs';
import { HttpError, digits, nowIso, uid } from './util.mjs';

const RESERVED = new Set(['api', 'n', 'terminos', 'privacidad', 'registro', 'negocio', 'recuperar', 'admin', 'app', 'www', 'fieldflow', 'webhooks', 'css', 'js', 'img', 'icons', 'fonts']);
const need = (c, code, msg) => { if (!c) throw new HttpError(400, code, msg || code); };
export const ES_VISITANTE = (tel) => String(tel || '').startsWith('web-');

export const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const slugOk = (s) => /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/.test(s) && !RESERVED.has(s);

async function libre(base) {
  let s = slugOk(base) ? base : `negocio-${uid().slice(0, 6)}`;
  for (let i = 0; i < 20; i++) {
    const cand = i === 0 ? s : `${s.slice(0, 34)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const [x] = await query('select id from negocios where slug = $1', [cand]);
    if (!x) return cand;
  }
  return `negocio-${uid().slice(0, 10)}`;
}

// Devuelve el enlace del negocio actual; lo crea la primera vez a partir del nombre.
export async function miEnlace(origin) {
  const [n] = await query('select id, nombre, slug, telefono from negocios where id = $1', [nid()]);
  if (!n) throw new HttpError(404, 'not_found');
  let slug = n.slug;
  if (!slug) { slug = await libre(slugify(n.nombre)); await query('update negocios set slug = $2 where id = $1', [n.id, slug]); }
  const [v] = await query("select count(*) as n from clientes where negocio_id = $1 and origen = 'enlace' and creado_en > $2", [n.id, new Date(Date.now() - 30 * 86400000).toISOString()]);
  const [i] = await query("select count(*) as n from clientes where negocio_id = $1 and origen = 'enlace' and contacto_tel is not null and creado_en > $2", [n.id, new Date(Date.now() - 30 * 86400000).toISOString()]);
  const [c] = await query("select count(*) as n from citas ci join clientes cl on cl.id = ci.cliente_id where ci.negocio_id = $1 and cl.origen = 'enlace' and ci.estado <> 'cancelada' and ci.creado_en > $2", [n.id, new Date(Date.now() - 30 * 86400000).toISOString()]);
  return { slug, url: `${origin}/n/${slug}`, nombre: n.nombre, telefono: n.telefono || '', ultimos30: { entraron: Number(v.n), dejaron_datos: Number(i.n), agendaron: Number(c.n) } };
}

export async function cambiarSlug(nuevo, origin) {
  const s = slugify(nuevo);
  need(slugOk(s), 'invalid_slug', 'Usa de 3 a 40 letras, números o guiones');
  const [dup] = await query('select id from negocios where slug = $1', [s]);
  need(!dup || dup.id === nid(), 'slug_taken', 'Ese nombre ya está en uso. Prueba con otro.');
  await query('update negocios set slug = $2 where id = $1', [nid(), s]);
  return miEnlace(origin);
}

// ── Entrada pública (sin sesión): crea un visitante y le entrega la cookie de cliente ─────────────
const visitas = new Map(); // IP → [marcas de tiempo] (mejor esfuerzo por instancia)
function limitar(ip) {
  const now = Date.now(); const arr = (visitas.get(ip) || []).filter((t) => now - t < 3600_000);
  if (arr.length >= 30) throw new HttpError(429, 'too_many', 'Demasiados intentos. Intenta de nuevo en un rato.');
  arr.push(now); visitas.set(ip, arr);
  if (visitas.size > 5000) visitas.clear();
}

export async function negocioPorSlug(slug) {
  const [n] = await query('select id, nombre, idioma from negocios where slug = $1', [String(slug || '').toLowerCase()]);
  return n || null;
}

export async function entrarPorEnlace({ slug, idioma, ip, clienteActual }) {
  const n = await negocioPorSlug(slug);
  if (!n) throw new HttpError(404, 'not_found', 'Este enlace no existe');
  // Si la persona ya tiene una sesión de este negocio, se conserva (continúa su misma conversación).
  if (clienteActual && clienteActual.nid === n.id) {
    const [ok] = await withNegocio(n.id, () => query('select id from clientes where id = $1 and negocio_id = $2', [clienteActual.id, n.id]));
    if (ok) return { negocio: n, clienteId: ok.id, nuevo: false };
  }
  limitar(ip);
  return withNegocio(n.id, async () => {
    const [{ n: hora }] = await query("select count(*) as n from clientes where negocio_id = $1 and origen = 'enlace' and creado_en > $2", [n.id, new Date(Date.now() - 3600_000).toISOString()]);
    if (Number(hora) >= 300) throw new HttpError(429, 'too_many', 'Hay muchas visitas ahora mismo. Intenta en unos minutos.');
    const cfg = await getConfig();
    const lang = idioma === 'en' ? 'en' : (cfg.idioma_defecto === 'en' ? 'en' : 'es');
    const id = uid();
    await query('insert into clientes (id, negocio_id, telefono, nombre, idioma, origen, creado_en) values ($1, $2, $3, $4, $5, $6, $7)',
      [id, n.id, `web-${id.replace(/-/g, '').slice(0, 12)}`, lang === 'en' ? 'Web visitor' : 'Visitante web', lang, 'enlace', nowIso()]);
    return { negocio: n, clienteId: id, nuevo: true };
  });
}

// Teléfono de Colombia: 10 dígitos que empiezan por 3 → se antepone 57. Otros países: 8 a 15 dígitos con su código.
export function normalizarTelefono(v) {
  let d = digits(v);
  if (d.length === 10 && d.startsWith('3')) d = `57${d}`;
  need(d.length >= 8 && d.length <= 15, 'invalid_phone', 'Escribe un teléfono válido, con el código del país si no es de Colombia');
  return d;
}

export async function identificarVisitante(cliente, b) {
  const nombre = String(b.nombre || '').trim().slice(0, 80);
  need(nombre.length >= 2, 'name_required', 'Escribe tu nombre');
  need(b.acepta === true, 'terms_required', 'Debes aceptar el uso de tus datos para agendar');
  const tel = normalizarTelefono(b.telefono);
  const correo = String(b.correo || '').trim().toLowerCase().slice(0, 160);
  need(!correo || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo), 'invalid_email', 'El correo no parece válido');
  await query('update clientes set nombre = $3, contacto_tel = $4, acepto_datos_en = $5, correo = $6 where id = $1 and negocio_id = $2', [cliente.id, nid(), nombre, tel, nowIso(), correo || null]);
  return { ok: true, nombre, telefono: tel };
}
