// Se ejecuta al compilar en Vercel: estampa versión y lista de archivos en public/sw.js.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const root = new URL('../public/', import.meta.url).pathname;
const skip = new Set(['sw.js']);
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (!['splash'].includes(f)) walk(p); continue; }
    const rel = `/${relative(root, p)}`;
    if (!skip.has(rel.slice(1)) && !rel.endsWith('.txt')) files.push(rel);
  }
})(root);
files.sort();
const hash = createHash('sha256');
const strip = (f, buf) => (f === '/index.html' ? Buffer.from(buf.toString('utf8').replace(/\?v=[0-9a-f]+/g, '')) : buf);
for (const f of files) hash.update(f).update(strip(f, readFileSync(join(root, f))));
const version = hash.digest('hex').slice(0, 10);
const precache = ['/', ...files.filter((f) => f !== '/index.html')];
let sw = readFileSync(join(root, 'sw.js'), 'utf8');
sw = sw.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`).replace(/const PRECACHE = \[[^\]]*\];/, `const PRECACHE = ${JSON.stringify(precache)};`);
writeFileSync(join(root, 'sw.js'), sw);
// index.html: ?v=<versión> en hojas de estilo y scripts, para que Safari nunca use una copia vieja.
const ix = join(root, 'index.html');
const html = readFileSync(ix, 'utf8').replace(/((?:href|src)="\/(?:css|js)\/[^"?]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"/g, `$1?v=${version}"`);
writeFileSync(ix, html);
console.log(`sw.js: versión ${version}, ${precache.length} archivos en precarga`);
