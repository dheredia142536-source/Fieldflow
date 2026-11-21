// Adaptador SOLO para desarrollo/pruebas locales (FF_LOCAL_DB). En Vercel no se usa.
// Dev/test-only adapter (FF_LOCAL_DB). Not used on Vercel.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(here, '..', 'db', 'migrations');

export function createLocalPool(target) {
  if (target !== ':memory:') mkdirSync(dirname(target), { recursive: true });
  const db = new DatabaseSync(target);
  db.exec('pragma foreign_keys = on');
  db.exec('create table if not exists schema_migrations (name text primary key, aplicada_en text not null)');
  const done = new Set(db.prepare('select name from schema_migrations').all().map((r) => r.name));
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8')
      .replace(/\buuid\b/g, 'text')
      .replace(/\btimestamptz\b/g, 'text');
    db.exec(sql);
    db.prepare('insert into schema_migrations (name, aplicada_en) values (?1, ?2)').run(f, new Date().toISOString());
  }

  const norm = (v) => (v === undefined ? null : v instanceof Date ? v.toISOString() : typeof v === 'boolean' ? (v ? 1 : 0) : v);
  const run = (text, params = []) => {
    const sql = text.replace(/\$(\d+)/g, '?$1');
    const stmt = db.prepare(sql);
    const args = params.map(norm);
    if (/^\s*(select|with|pragma)\b/i.test(sql) || /\breturning\b/i.test(sql)) return { rows: stmt.all(...args) };
    stmt.run(...args);
    return { rows: [] };
  };

  // Una sola conexión: se serializa el acceso con una cola. / Single connection: serialize access.
  let tail = Promise.resolve();
  const lock = () => {
    let release;
    const next = new Promise((r) => (release = r));
    const ready = tail.then(() => release);
    tail = tail.then(() => next);
    return ready;
  };
  return {
    async query(text, params) {
      const rel = await lock();
      try { return run(text, params); } finally { rel(); }
    },
    async connect() {
      const rel = await lock();
      return { query: async (t, p) => run(t, p), release: () => rel() };
    },
  };
}
