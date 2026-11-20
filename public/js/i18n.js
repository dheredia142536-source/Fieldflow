// Español / English. Idioma inicial según el navegador; la elección se recuerda.
import { dict } from './dict.js';

const KEY = 'ff_lang';
const listeners = new Set();
let lang = 'es';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};

export function initLang() {
  const saved = store.get(KEY);
  lang = saved === 'en' || saved === 'es' ? saved : (navigator.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
  document.documentElement.lang = lang;
  return lang;
}

export const getLang = () => lang;

export function setLang(next) {
  if (next !== 'es' && next !== 'en') return;
  lang = next;
  store.set(KEY, next);
  document.documentElement.lang = next;
  for (const fn of listeners) fn(next);
}

export const onLang = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function t(key, vars) {
  let s = dict[lang]?.[key] ?? dict.es[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
