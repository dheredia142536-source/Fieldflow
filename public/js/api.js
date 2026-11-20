import { t } from './i18n.js';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: method === 'GET' ? {} : { 'content-type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
  } catch {
    throw new ApiError(0, 'offline', t('err.offline'));
  }
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) {
    const known = data?.error && t(`err.${data.error}`) !== `err.${data.error}` ? t(`err.${data.error}`) : null;
    throw new ApiError(res.status, data?.error || 'error', known || data?.message || t('err.generic'));
  }
  return data;
}

export const get = (p) => request('GET', p);
export const post = (p, b) => request('POST', p, b);
export const patch = (p, b) => request('PATCH', p, b);
export const put = (p, b) => request('PUT', p, b);
