// Utilidades de interfaz. Todo se construye con nodos DOM y textContent (nunca innerHTML con datos).
import { icon } from './icons.js';
import { t } from './i18n.js';

function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'value') value = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, kids);
  if (value !== undefined) el.value = value;
  return el;
}

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const $ = (sel, el = document) => el.querySelector(sel);

export function initials(name) {
  const p = String(name || '?').trim().split(/\s+/).slice(0, 2);
  return p.map((s) => s[0]?.toUpperCase() || '').join('') || '?';
}
export const avatar = (name, cls = '') => h('span', { class: `avatar ${cls}`, 'aria-hidden': 'true' }, initials(name));

// ── Toast ───────────────────────────────────────────────────────────────────
export function toast(msg, isErr = false) {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  const el = h('div', { class: `toast${isErr ? ' toast--err' : ''}` }, msg);
  box.append(el);
  setTimeout(() => el.remove(), isErr ? 6000 : 3500);
}

// ── Hoja / diálogo accesible ────────────────────────────────────────────────
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function openSheet({ title, body, foot = [], onClose }) {
  const opener = document.activeElement;
  const titleId = `sh${Math.random().toString(36).slice(2, 8)}`;
  const closeBtn = h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': t('common.close') }, icon('x', 18));
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div', { class: 'sheet__grab' }),
    h('div', { class: 'sheet__head' }, h('h2', { id: titleId }, title), closeBtn),
    h('div', { class: 'sheet__body' }, body),
    foot.length ? h('div', { class: 'sheet__foot' }, foot) : null);
  const overlay = h('div', { class: 'overlay' }, sheet);
  const app = document.getElementById('app');
  app?.setAttribute('inert', '');
  document.body.append(overlay);
  document.body.style.overflow = 'hidden';
  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    overlay.remove();
    app?.removeAttribute('inert');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey, true);
    try { opener?.focus?.(); } catch { /* sin foco */ }
    onClose?.(result);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const items = [...sheet.querySelectorAll(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0]; const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey, true);
  closeBtn.addEventListener('click', () => close());
  overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });
  setTimeout(() => (sheet.querySelector('[autofocus]') || sheet.querySelector('.sheet__body input,.sheet__body select,.sheet__body textarea,.sheet__foot button') || closeBtn).focus(), 30);
  return { close, sheet };
}

export function confirmDialog({ title, text, okLabel, danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const ok = h('button', { class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, type: 'button' }, okLabel || t('common.confirm'));
    const no = h('button', { class: 'btn btn--secondary', type: 'button' }, t('common.back'));
    const s = openSheet({ title, body: h('p', null, text), foot: [no, ok], onClose: () => finish(false) });
    ok.addEventListener('click', () => { finish(true); s.close(); });
    no.addEventListener('click', () => s.close());
  });
}

// Botón que muestra "cargando" mientras corre una acción asíncrona.
export async function busy(btn, fn) {
  const prev = btn.disabled;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  try { return await fn(); } finally { btn.disabled = prev; btn.removeAttribute('aria-busy'); }
}

export const loading = () => h('div', { class: 'loading', role: 'status', 'aria-label': t('common.loading') }, h('div', { class: 'spinner' }));

export function empty({ art, title, text, action }) {
  return h('div', { class: 'empty' }, art, h('h3', null, title), text ? h('p', null, text) : null, action || null);
}

export function langSwitch(current, onPick, cls = '') {
  const mk = (code, label, full) => h('button', { type: 'button', 'aria-pressed': String(current === code), 'aria-label': full, lang: code, onclick: () => onPick(code) }, label);
  return h('div', { class: `seg seg--lang ${cls}`, role: 'group', 'aria-label': t('common.language') }, mk('es', 'ES', 'Español'), mk('en', 'EN', 'English'));
}

export function field(label, control, hint) {
  const id = control.id || `f${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('span', { class: 'hint' }, hint) : null);
}

export function debounce(fn, ms) {
  let id;
  return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
}
