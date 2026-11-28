import { query } from './db.mjs';
import { nid } from './tenant.mjs';

export const DEFAULTS = {
  negocio_nombre: 'FieldFlow',
  idioma_defecto: 'es',
  instrucciones_bot: '',
  bienvenida_es: '¡Hola! Soy el asistente de {negocio}. ¿Qué te gustaría agendar?',
  bienvenida_en: "Hi! I'm the {negocio} assistant. What would you like to schedule?",
  anticipacion_min: '60',
  dias_max: '60',
};

export async function getConfig(q = query) {
  const rows = await q('select clave, valor from configuracion where negocio_id = $1', [nid()]);
  const cfg = { ...DEFAULTS };
  for (const r of rows) cfg[r.clave] = r.valor;
  return cfg;
}

export async function setConfig(values, q = query) {
  for (const [k, v] of Object.entries(values)) {
    if (!(k in DEFAULTS)) continue;
    await q(
      'insert into configuracion (negocio_id, clave, valor) values ($1, $2, $3) on conflict (negocio_id, clave) do update set valor = excluded.valor',
      [nid(), k, String(v ?? '')],
    );
  }
}

export async function getNegocio(q = query) {
  const [n] = await q('select * from negocios where id = $1', [nid()]);
  return n || null;
}
