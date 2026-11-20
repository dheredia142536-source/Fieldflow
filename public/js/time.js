// Fechas en hora de Bogotá (UTC-5 fijo, sin horario de verano). Espejo de lib/time.mjs.
import { getLang } from './i18n.js';

const OFF = 5;
export const pad = (n) => String(n).padStart(2, '0');
export const minutes = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
export const hmFrom = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

export function localToUtc(ymd, hm = '00:00') {
  const [y, mo, d] = ymd.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + OFF, mi));
}
export function toLocal(date) {
  const d = new Date(new Date(date).getTime() - OFF * 3600000);
  const s = d.toISOString();
  return { ymd: s.slice(0, 10), hm: s.slice(11, 16), dow: (d.getUTCDay() + 6) % 7 };
}
export const weekdayOf = (ymd) => (new Date(`${ymd}T12:00:00Z`).getUTCDay() + 6) % 7;
export function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const todayLocal = () => toLocal(new Date()).ymd;
export const startOfWeek = (ymd) => addDays(ymd, -weekdayOf(ymd));

const loc = () => (getLang() === 'en' ? 'en-US' : 'es-CO');
export const fmtDay = (ymd, opts = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Intl.DateTimeFormat(loc(), { ...opts, timeZone: 'UTC' }).format(new Date(`${ymd}T12:00:00Z`));

export function fmtTime(hm) {
  const [h, m] = hm.split(':').map(Number);
  const hh = ((h + 11) % 12) + 1;
  if (getLang() === 'en') return `${hh}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
  return `${hh}:${pad(m)} ${h >= 12 ? 'p. m.' : 'a. m.'}`;
}
export const fmtIsoTime = (iso) => fmtTime(toLocal(iso).hm);
export function fmtWhen(iso) {
  const { ymd, hm } = toLocal(iso);
  return `${fmtDay(ymd, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(hm)}`;
}
export function fmtRelative(iso) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return getLang() === 'en' ? 'now' : 'ahora';
  const { ymd, hm } = toLocal(d);
  if (ymd === todayLocal()) return fmtTime(hm);
  return fmtDay(ymd, { day: 'numeric', month: 'short' });
}
export const durationMin = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);
