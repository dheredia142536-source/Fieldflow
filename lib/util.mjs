import { randomUUID } from 'node:crypto';

export const uid = () => randomUUID();
export const nowIso = () => new Date().toISOString();
export const iso = (v) => (v == null ? null : new Date(v).toISOString());

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

export const digits = (s) => String(s || '').replace(/\D+/g, '');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function detectLang(text, fallback = 'es') {
  const t = String(text || '').toLowerCase();
  if (/\b(hi|hello|hey|please|thanks|thank you|book|appointment|schedule|need|want|tomorrow|harvest)\b/.test(t)) return 'en';
  if (/\b(hola|buenas|buenos|gracias|necesito|quiero|agendar|cita|cosecha|mañana|por favor)\b/.test(t)) return 'es';
  return fallback;
}
