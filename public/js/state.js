export const state = { staff: null, client: null, pub: { nombre: 'FieldFlow', whatsapp: null }, attention: 0 };

export function pref(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(`ff_${key}`);
    if (value === null) localStorage.removeItem(`ff_${key}`); else localStorage.setItem(`ff_${key}`, value);
  } catch { /* sin almacenamiento */ }
  return value;
}

export function applyTheme() {
  const th = pref('theme');
  const root = document.documentElement;
  if (th === 'light' || th === 'dark') root.dataset.theme = th; else delete root.dataset.theme;
}
