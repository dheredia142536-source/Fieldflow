import { HttpError, json } from './util.mjs';
import { cookie, parseCookies, readSession } from './session.mjs';
import { withNegocio } from './tenant.mjs';

export const STAFF_COOKIE = 'ff_staff';
export const CLIENT_COOKIE = 'ff_client';

const compile = (pattern) => new RegExp(`^${pattern.replace(/:[a-z_]+/g, '([^/]+)')}$`);

export function createRouter() {
  const routes = [];
  const add = (method, pattern, auth, handler) => routes.push({ method, re: compile(pattern), auth, handler });
  const handle = async (req) => {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const secure = url.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
    const setCookies = [];
    try {
      const route = routes.find((r) => r.method === req.method && r.re.test(path));
      if (!route) {
        if (routes.some((r) => r.re.test(path))) throw new HttpError(405, 'method_not_allowed');
        throw new HttpError(404, 'not_found', `Ruta no encontrada: ${req.method} ${path}`);
      }
      if (req.method !== 'GET') {
        if (!(req.headers.get('content-type') || '').includes('application/json')) throw new HttpError(415, 'json_required');
        const origin = req.headers.get('origin');
        if (origin && new URL(origin).host !== (req.headers.get('x-forwarded-host') || url.host)) throw new HttpError(403, 'bad_origin');
      }
      const cookies = parseCookies(req.headers.get('cookie'));
      const staffS = readSession(cookies[STAFF_COOKIE]);
      const clientS = readSession(cookies[CLIENT_COOKIE]);
      const staff = staffS?.k === 'staff' && staffS.nid ? staffS : null;
      const client = clientS?.k === 'client' && clientS.nid ? clientS : null;
      const negocioId = route.auth === 'client' ? client?.nid : route.auth === 'staff' ? staff?.nid : (staff?.nid || client?.nid || null);
      if (route.auth === 'staff' && !staff) throw new HttpError(401, 'unauthorized', 'Inicia sesión');
      if (route.auth === 'client' && !client) throw new HttpError(401, 'unauthorized', 'Abre el enlace de WhatsApp de nuevo');
      let body = {};
      if (req.method !== 'GET') { try { body = (await req.json()) || {}; } catch { body = {}; } }
      const params = (path.match(route.re) || []).slice(1).map(decodeURIComponent);
      const ctx = {
        req, url, q: url.searchParams, body, params, staff, client, secure, negocioId,
        ip: (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown',
        origin: `${url.protocol}//${req.headers.get('x-forwarded-host') || url.host}`,
        setCookie: (name, value, maxAge) => setCookies.push(cookie(name, value, { maxAge, secure })),
      };
      const out = await (negocioId ? withNegocio(negocioId, () => route.handler(ctx)) : route.handler(ctx));
      const res = json(out ?? { ok: true });
      for (const c of setCookies) res.headers.append('set-cookie', c);
      return res;
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message, ...(e.detail ? { detail: e.detail } : {}), ...(e.wait != null ? { wait: e.wait } : {}), ...(e.restantes != null ? { restantes: e.restantes } : {}) }, e.status);
      console.error('[api]', e);
      return json({ error: 'server_error', message: 'Error del servidor / Server error', detail: String(e?.code || e?.name || 'error').slice(0, 40) }, 500);
    }
  };
  return { add, handle };
}
