// Mapas con Geoapify. La clave (GEOAPIFY_API_KEY) vive solo en el servidor: el navegador nunca la ve.
// Búsqueda de lugares, ubicación inversa e imagen de mapa pasan por aquí.
// Geoapify maps. The key stays on the server: the browser never sees it.
import { HttpError } from './util.mjs';

const apiBase = () => (process.env.GEOAPIFY_API_BASE || 'https://api.geoapify.com').replace(/\/$/, '');
const mapsBase = () => (process.env.GEOAPIFY_MAPS_BASE || 'https://maps.geoapify.com').replace(/\/$/, '');
export const geoActivo = () => !!process.env.GEOAPIFY_API_KEY;
const need = (c, code, msg) => { if (!c) throw new HttpError(400, code, msg || code); };

function ensure() {
  if (!geoActivo()) throw new HttpError(503, 'geo_not_configured', 'El mapa aún no está activado en este sitio');
}

// Límite por negocio (mejor esfuerzo por instancia) y caché corta: cuidan los créditos del plan.
const usos = new Map();
function limitar(key, max = 90) {
  const now = Date.now(); const arr = (usos.get(key) || []).filter((t) => now - t < 60_000);
  if (arr.length >= max) throw new HttpError(429, 'too_many', 'Demasiadas búsquedas seguidas. Espera un momento.');
  arr.push(now); usos.set(key, arr); if (usos.size > 2000) usos.clear();
}
const cache = new Map();
const remember = (k, v, ms) => { cache.set(k, { v, until: Date.now() + ms }); if (cache.size > 400) cache.delete(cache.keys().next().value); return v; };
const recall = (k) => { const c = cache.get(k); if (c && c.until > Date.now()) return c.v; cache.delete(k); return null; };

async function call(url) {
  let res;
  try { res = await fetch(url, { signal: AbortSignal.timeout(8000) }); } catch { throw new HttpError(502, 'geo_unreachable', 'No se pudo consultar el mapa. Intenta de nuevo.'); }
  if (res.status === 401 || res.status === 403) { console.error('[geo] clave rechazada por Geoapify'); throw new HttpError(502, 'geo_key_invalid', 'La clave del mapa no es válida. Revísala en Vercel.'); }
  if (res.status === 429) throw new HttpError(503, 'geo_quota', 'Se acabaron los créditos del mapa por hoy.');
  if (!res.ok) throw new HttpError(502, 'geo_error', 'El mapa no respondió bien. Intenta de nuevo.');
  return res;
}
const withKey = (base, path, params) => {
  const u = new URL(path, `${base}/`); for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, String(v));
  u.searchParams.set('apiKey', process.env.GEOAPIFY_API_KEY); return u;
};

// Convierte una propiedad de Geoapify en los campos de un terreno (Colombia: departamento / municipio / vereda).
function normalizar(p) {
  const municipio = p.city || p.town || p.village || p.municipality || p.county || '';
  const vereda = p.hamlet || p.suburb || p.neighbourhood || p.quarter || p.district || '';
  return {
    texto: p.formatted || [p.address_line1, p.address_line2].filter(Boolean).join(', '),
    titulo: p.name || p.address_line1 || municipio || '',
    departamento: p.state || '', municipio, vereda: vereda === municipio ? '' : vereda,
    direccion: p.street ? [p.street, p.housenumber].filter(Boolean).join(' ') : '',
    lat: Number(p.lat), lng: Number(p.lon),
  };
}

export async function buscarLugar(q, negocioId) {
  ensure();
  const text = String(q || '').trim().slice(0, 120);
  need(text.length >= 3, 'query_short', 'Escribe al menos 3 letras');
  limitar(negocioId);
  const key = `s:${text.toLowerCase()}`;
  const hit = recall(key); if (hit) return hit;
  const res = await call(withKey(apiBase(), '/v1/geocode/autocomplete', { text, lang: 'es', limit: 6, filter: 'countrycode:co', format: 'json' }));
  const data = await res.json();
  const rows = (data.results || data.features?.map((f) => f.properties) || []).map(normalizar).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng) && r.texto);
  return remember(key, { resultados: rows }, 10 * 60_000);
}

export async function lugarDeCoordenadas(lat, lng, negocioId) {
  ensure();
  lat = Number(lat); lng = Number(lng);
  need(Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180, 'invalid_coords', 'Coordenadas inválidas');
  limitar(negocioId);
  const key = `r:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = recall(key); if (hit) return hit;
  const res = await call(withKey(apiBase(), '/v1/geocode/reverse', { lat, lon: lng, lang: 'es', format: 'json' }));
  const data = await res.json();
  const p = data.results?.[0] || data.features?.[0]?.properties;
  return remember(key, { lugar: p ? { ...normalizar(p), lat, lng } : null }, 60 * 60_000);
}

// Imagen del mapa con el punto marcado. Se entrega desde nuestro servidor para no exponer la clave.
export async function imagenMapa(lat, lng, { w = 800, h = 450, zoom = 14 } = {}, negocioId) {
  ensure();
  lat = Number(lat); lng = Number(lng);
  need(Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180, 'invalid_coords', 'Coordenadas inválidas');
  const W = Math.min(1200, Math.max(200, Math.round(Number(w) || 800))); const H = Math.min(800, Math.max(150, Math.round(Number(h) || 450))); const Z = Math.min(18, Math.max(4, Math.round(Number(zoom) || 14)));
  limitar(negocioId, 120);
  const u = withKey(mapsBase(), '/v1/staticmap', { style: 'osm-bright', width: W, height: H, zoom: Z, center: `lonlat:${lng},${lat}`, marker: `lonlat:${lng},${lat};color:#0118df;size:large` });
  const res = await call(u);
  const buf = Buffer.from(await res.arrayBuffer());
  return new Response(buf, { status: 200, headers: { 'content-type': res.headers.get('content-type') || 'image/png', 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' } });
}
