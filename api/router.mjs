import { buildRouter } from '../lib/routes.mjs';

const handle = buildRouter();

// Vercel Functions: vercel.json reescribe /api/<ruta> → /api/router?__p=<ruta>
// (las rutas con varios tramos, como /api/auth/login, no coinciden con un comodín de archivo).
// Aquí se reconstruye la URL original antes de enrutar.
function restore(req) {
  const url = new URL(req.url);
  const p = url.searchParams.get('__p');
  if (p == null) return req;
  url.searchParams.delete('__p');
  let route = p;
  for (let i = 0; i < 2; i++) { try { const d = decodeURIComponent(route); if (d === route) break; route = d; } catch { break; } }
  route = route.replace(/^\/+/, '').replace(/^api\//, '');
  url.pathname = `/api/${route}`;
  const init = { method: req.method, headers: req.headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') { init.body = req.body; init.duplex = 'half'; }
  return new Request(url, init);
}

const run = (req) => handle(restore(req));
export const GET = run;
export const POST = run;
export const PUT = run;
export const PATCH = run;
export const DELETE = run;
