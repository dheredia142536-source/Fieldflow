// Acceso a datos / Data access.
// Producción (Vercel): Postgres (Neon u otro) vía DATABASE_URL o POSTGRES_URL con el paquete `pg`.
// Local: SQLite si FF_LOCAL_DB está definido (solo desarrollo y pruebas).
import { readdir, readFile } from 'node:fs/promises';

let poolPromise;

async function createPool() {
  if (process.env.FF_LOCAL_DB) {
    const path = './dev-sqlite.mjs'; // import dinámico: no se empaqueta en producción
    return (await import(path)).createLocalPool(process.env.FF_LOCAL_DB);
  }
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (!url) throw Object.assign(new Error('DATABASE_URL no está configurado / is not set'), { status: 500, code: 'db_missing' });
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 8_000 });
  pool.on('error', (e) => console.error('[pg]', e.message));
  await migrate(pool);
  return pool;
}

// Aplica db/migrations/*.sql una sola vez (con bloqueo, seguro con arranques simultáneos).
async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock(7420112001)');
    await client.query('create table if not exists schema_migrations (name text primary key, aplicada_en text not null)');
    const dir = new URL('../db/migrations/', import.meta.url);
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    const done = new Set((await client.query('select name from schema_migrations')).rows.map((r) => r.name));
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = await readFile(new URL(f, dir), 'utf8');
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into schema_migrations (name, aplicada_en) values ($1, $2)', [f, new Date().toISOString()]);
        await client.query('commit');
        console.log('[db] migración aplicada', f);
      } catch (e) { await client.query('rollback').catch(() => {}); throw e; }
    }
  } finally {
    await client.query('select pg_advisory_unlock(7420112001)').catch(() => {});
    client.release();
  }
}

function getPool() {
  poolPromise ||= createPool().catch((e) => { poolPromise = null; throw e; });
  return poolPromise;
}

export async function query(text, params = []) {
  const p = await getPool();
  const res = await p.query(text, params);
  return res.rows;
}

// Transacción: fn recibe una función q(text, params) ligada a la misma conexión.
export async function tx(fn) {
  const p = await getPool();
  const client = await p.connect();
  const q = async (text, params = []) => (await client.query(text, params)).rows;
  try {
    await client.query('begin');
    const out = await fn(q);
    await client.query('commit');
    return out;
  } catch (e) {
    try { await client.query('rollback'); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}
