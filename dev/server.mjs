// Servidor de desarrollo local (sin Vercel). Sirve /public y enruta /api y /webhooks a las funciones.
// Local dev server (no Vercel). Serves /public and routes /api and /webhooks to the functions.
// Uso / Usage:  npm run dev   → http://localhost:8888   (Node ≥ 22.13, base de datos SQLite local)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockCompletion } from './mock-llm.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.env.FF_LOCAL_DB ||= join(root, 'dev', '.data', 'dev.sqlite');
process.env.SESSION_SECRET ||= 'dev-session-secret-not-for-production';
process.env.ADMIN_EMAIL ||= 'admin@fieldflow.test';
process.env.ADMIN_PASSWORD ||= 'fieldflow-demo';
process.env.APP_SECRET ||= 'dev-app-secret';
process.env.VERIFY_TOKEN ||= 'dev-verify-token';
const PORT = Number(process.env.PORT || 8888);
process.env.APP_URL ||= `http://localhost:${PORT}`;
if (process.env.FF_MOCK_LLM === '1') {
  process.env.LLM_API_KEY ||= 'mock';
  process.env.LLM_BASE_URL ||= `http://localhost:${PORT}/mock-llm/v1`;
}

const { GET: api } = await import('../api/router.mjs');
const { POST: whatsapp } = await import('../api/whatsapp.mjs');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain',
};

async function toRequest(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  return new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
}

async function send(res, response) {
  res.statusCode = response.status;
  const cookies = response.headers.getSetCookie?.() || [];
  response.headers.forEach((v, k) => { if (k !== 'set-cookie') res.setHeader(k, v); });
  if (cookies.length) res.setHeader('set-cookie', cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}

http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://x').pathname;
    if (path.startsWith('/mock-llm/v1/chat/completions')) {
      const body = JSON.parse((await toRequest(req).then((r) => r.text())) || '{}');
      const out = mockCompletion(body);
      if (out.__status) { res.statusCode = out.__status; res.setHeader('retry-after', '0'); return res.end('{"error":"rate"}'); }
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ choices: [{ message: out }] }));
    }
    if (path.startsWith('/api/')) return send(res, await api(await toRequest(req)));
    if (path.startsWith('/webhooks/whatsapp')) return send(res, await whatsapp(await toRequest(req)));
    let file = normalize(join(root, 'public', path === '/' || path === '/terminos' || path === '/privacidad' || path.startsWith('/n/') ? 'index.html' : path));
    if (!file.startsWith(join(root, 'public'))) { res.statusCode = 403; return res.end(); }
    try {
      const data = await readFile(file);
      res.setHeader('content-type', MIME[extname(file)] || 'application/octet-stream');
      if (file.endsWith('sw.js')) res.setHeader('cache-control', 'no-cache');
      return res.end(data);
    } catch {
      res.statusCode = 404;
      return res.end('Not found');
    }
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end('Server error');
  }
}).listen(PORT, () => console.log(`FieldFlow dev → http://localhost:${PORT}  (admin: ${process.env.ADMIN_EMAIL} / ${process.env.ADMIN_PASSWORD})`));
