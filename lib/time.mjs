// Colombia no usa horario de verano: UTC-5 fijo. / Colombia has no DST: fixed UTC-5.
export const TZ = 'America/Bogota';
const OFFSET_H = 5;

export const pad = (n) => String(n).padStart(2, '0');
export const minutes = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
export const hmFrom = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

export function localToUtc(ymd, hm) {
  const [y, mo, d] = ymd.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + OFFSET_H, mi));
}

export function toLocal(date) {
  const d = new Date(new Date(date).getTime() - OFFSET_H * 3600000);
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
export const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

export function fmtDay(ymd, lang, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'es-CO', { ...opts, timeZone: 'UTC' }).format(new Date(`${ymd}T12:00:00Z`));
}

export function fmtTime(hm, lang) {
  const [h, m] = hm.split(':').map(Number);
  const hh = ((h + 11) % 12) + 1;
  const mm = pad(m);
  if (lang === 'en') return `${hh}:${mm} ${h >= 12 ? 'PM' : 'AM'}`;
  return `${hh}:${mm} ${h >= 12 ? 'p. m.' : 'a. m.'}`;
}

export function fmtWhen(isoStr, lang) {
  const { ymd, hm } = toLocal(isoStr);
  return `${fmtDay(ymd, lang)} · ${fmtTime(hm, lang)}`;
}
