// Teléfono interactivo de la portada. Cinco pantallas que explican el flujo completo sin texto afuera:
// WhatsApp → app de FieldFlow → agenda → confirmación → panel del negocio.
// Cada pantalla se reproduce sola (un "dedo" toca por la persona) y también responde al toque real:
// la persona puede escribir, elegir servicio, día, hora, parcela, hablar y abrir los detalles de la cita.
// Todo es HTML/CSS/SVG: se traduce, es nítido en cualquier pantalla y respeta "reducir movimiento".
import { h } from '../ui.js';
import { icon, logo } from '../icons.js';
import { t } from '../i18n.js';
import { addDays, fmtDay, fmtTime, todayLocal } from '../time.js';
import { reduced } from '../fx.js';

// ───────── Utilidades ─────────
const NS = 'http://www.w3.org/2000/svg';
const S = (tag, attrs = {}, ...kids) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  n.append(...kids.flat().filter(Boolean));
  return n;
};
const G = (cls, vb, ...kids) => S('svg', { class: cls, viewBox: vb, 'aria-hidden': 'true', focusable: 'false' }, ...kids);
const P = (d, a = {}) => S('path', { d, ...a });
const split = (k) => t(k).split('|');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const CANCEL = Symbol('cancel');

const SVCS = [[1, 'leaf', '#375033'], [2, 'search', '#8a4b2d'], [3, 'shield', '#4a5568'], [7, 'truck', '#006bb8']];
const TIMES = ['07:00', '08:30', '09:30', '11:00', '14:00', '15:30'];
const BUSY = new Set(['08:30', '14:00']);
const FULL_DAY = 3;
const CREW = [['N', '#375033'], ['M', '#006bb8']];
const svcName = (i) => t(`landing.sv${SVCS[i][0]}n`);
const svcMeta = (i) => t(`landing.sv${SVCS[i][0]}m`);
const svcTile = (i, size = 20) => h('span', { class: 'ffa-svc__ic', style: `--c:${SVCS[i][2]}` }, icon(SVCS[i][1], size));
const short = (ymd, o) => fmtDay(ymd, o).replace('.', '');

// Glifos propios (estilo iOS)
const gl = {
  chev: () => G('d-chev', '0 0 12 20', P('M10 2 2 10l8 8')),
  video: () => G('d-g', '0 0 26 18', S('rect', { x: 1, y: 2, width: 16, height: 14, rx: 3.5 }), P('M17.5 7.6 24.5 3.8v10.4l-7-3.8z')),
  call: () => G('d-g', '0 0 24 24', P('M6.6 3.3h2.6l1.6 4.2-2 1.4a12 12 0 0 0 6.3 6.3l1.4-2 4.2 1.6v2.6a2 2 0 0 1-2.2 2C10.6 19 5 13.4 4.6 5.5a2 2 0 0 1 2-2.2z')),
  ticks: () => G('wa-tk', '0 0 18 11', P('M1.2 5.9 4.4 9 11 1.6'), P('M7.4 7.8 8.8 9 15.6 1.6')),
  tail: () => G('wa-tail', '0 0 10 15', P('M0 0c0 7 1.4 11.6 10 15H0z')),
  lock: () => G('wa-lock', '0 0 12 14', P('M3.2 6V4.6a2.8 2.8 0 0 1 5.6 0V6'), S('rect', { x: 1.6, y: 6, width: 8.8, height: 6.8, rx: 1.6 })),
  sticker: () => G('wa-stk', '0 0 24 24', P('M8 3.5h8A4.5 4.5 0 0 1 20.5 8v4.6l-7.9 7.9H8A4.5 4.5 0 0 1 3.5 16V8A4.5 4.5 0 0 1 8 3.5z'), P('M20.5 12.6h-3.9a4 4 0 0 0-4 4v3.9')),
  cam: () => G('d-g', '0 0 24 24', P('M4 7.5h3l1.6-2.5h6.8L17 7.5h3A1.5 1.5 0 0 1 21.5 9v9a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5z'), S('circle', { cx: 12, cy: 13, r: 3.6 })),
  up: () => G('d-g', '0 0 24 24', P('M12 18.5V6.2M6.6 11.4 12 6l5.4 5.4')),
  ext: () => G('d-g', '0 0 24 24', P('M14 4h6v6M20 4l-8.6 8.6M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10')),
  shift: () => G('kb-g', '0 0 24 24', P('M12 4.2 4 12.6h4.6V19h6.8v-6.4H20z')),
  del: () => G('kb-g', '0 0 28 20', P('M9.4 2.5h14.1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9.4L2.5 10z'), P('M13.2 6.6l6.8 6.8M20 6.6l-6.8 6.8')),
  pin: () => G('ag-pin__g', '0 0 16 22', P('M8 21s7-6.6 7-12.4A7 7 0 0 0 1 8.6C1 14.4 8 21 8 21z'), S('circle', { cx: 8, cy: 8.4, r: 2.6 })),
  badge: () => {
    const pts = []; for (let i = 0; i < 24; i++) { const a = (Math.PI * 2 * i) / 24; const r = i % 2 ? 8.2 : 9.6; pts.push(`${(10 + r * Math.cos(a)).toFixed(2)},${(10 + r * Math.sin(a)).toFixed(2)}`); }
    return G('wa-badge', '0 0 20 20', S('polygon', { points: pts.join(' ') }), P('m6.4 10.2 2.5 2.5 4.8-5'));
  },
};

function statusIcons() {
  const sig = G('d-sig', '0 0 18 12', ...[0, 1, 2, 3].map((i) => S('rect', { x: i * 4.7, y: 9 - i * 2.8, width: 3.2, height: 3 + i * 2.8, rx: 1 })));
  const wifi = G('d-wifi', '0 0 16 12', P('M8 11.4 5.6 8.9a3.4 3.4 0 0 1 4.8 0z'), P('M3.6 6.9a6.3 6.3 0 0 1 8.8 0l-1.3 1.3a4.5 4.5 0 0 0-6.2 0z'), P('M1.5 4.8a9.3 9.3 0 0 1 13 0l-1.3 1.3a7.4 7.4 0 0 0-10.4 0z'));
  const bat = G('d-bat', '0 0 27 13', S('rect', { x: 0.6, y: 0.6, width: 22.6, height: 11.8, rx: 3.6, class: 'd-bat__o' }), S('rect', { x: 2.4, y: 2.4, width: 16.4, height: 8.2, rx: 2 }), P('M24.6 4.4c1 .3 1.6 1.1 1.6 2.1s-.6 1.8-1.6 2.1z'));
  return [sig, wifi, bat];
}

// Fondo de chat con dibujos del campo (propios)
function wallpaper() {
  const st = { fill: 'none', stroke: '#5b6b4f', 'stroke-width': 1.1, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.11 };
  return S('svg', { class: 'wa-wall', 'aria-hidden': 'true', focusable: 'false' },
    S('defs', {}, S('pattern', { id: 'ff-wall', width: 76, height: 76, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(-10)' },
      S('g', st,
        P('M7 21c0-7 5-11 12-11 0 7-5 11-12 11zM7 21c3-3 6-5 9-7'),
        S('circle', { cx: 52, cy: 14, r: 4.5 }), P('M52 5v2.5M52 20.5V23M43 14h2.5M58.5 14H61M45.6 7.6l1.8 1.8M56.6 18.6l1.8 1.8M45.6 20.4l1.8-1.8M56.6 9.4l1.8-1.8'),
        P('M30 40c3.5 4.5 5 7 5 9.5a5 5 0 0 1-10 0c0-2.5 1.5-5 5-9.5z'),
        P('M60 64V52M60 56c-4.5 0-7-2.5-7-6 4.5 0 7 2.5 7 6zM60 54c0-4.5 2.5-7 7-7 0 4.5-2.5 7-7 7z'),
        P('M12 62h14M14 62v-6h10v6M13 56l6-4 6 4'),
        P('M66 34l1.6 3.4 3.4 1.6-3.4 1.6L66 44l-1.6-3.4-3.4-1.6 3.4-1.6z'),
      ))),
    S('rect', { width: '100%', height: '100%', fill: 'url(#ff-wall)' }));
}

// Ilustración de la tarjeta de WhatsApp: parcela con surcos al amanecer (propia)
function fieldArt() {
  const rows = [];
  for (let xb = -210; xb <= 510; xb += 30) rows.push(S('line', { x1: 150 + (xb - 150) * 0.05, y1: 97, x2: xb, y2: 150, stroke: 'rgba(38,66,22,.36)', 'stroke-width': 1.6 }));
  return S('svg', { viewBox: '0 0 300 150', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true', focusable: 'false' },
    S('defs', {},
      S('linearGradient', { id: 'ff-sky', x1: 0, y1: 0, x2: 0, y2: 1 }, S('stop', { offset: 0, 'stop-color': '#bfe2f4' }), S('stop', { offset: 1, 'stop-color': '#fdf0d6' })),
      S('linearGradient', { id: 'ff-soil', x1: 0, y1: 0, x2: 0, y2: 1 }, S('stop', { offset: 0, 'stop-color': '#86b35a' }), S('stop', { offset: 1, 'stop-color': '#4c7b31' }))),
    S('rect', { width: 300, height: 150, fill: 'url(#ff-sky)' }),
    S('circle', { cx: 232, cy: 56, r: 19, fill: '#ffd36a' }), S('circle', { cx: 232, cy: 56, r: 30, fill: '#ffd36a', opacity: 0.22 }),
    S('ellipse', { cx: 70, cy: 34, rx: 26, ry: 8, fill: '#fff', opacity: 0.85 }), S('ellipse', { cx: 92, cy: 30, rx: 16, ry: 7, fill: '#fff', opacity: 0.85 }),
    P('M0 86Q55 64 112 80T226 72T300 80V150H0Z', { fill: '#b6d493' }),
    P('M0 94Q70 78 140 90T300 88V150H0Z', { fill: '#98c271' }),
    S('rect', { x: 0, y: 97, width: 300, height: 53, fill: 'url(#ff-soil)' }), ...rows,
    P('M46 97V82l11-8 11 8v15z', { fill: '#b83200' }), P('M43 83l14-11 14 11', { fill: 'none', stroke: '#7a2200', 'stroke-width': 2.4, 'stroke-linejoin': 'round' }),
    S('rect', { x: 53, y: 87, width: 8, height: 10, fill: '#5a1a00' }),
    S('circle', { cx: 92, cy: 88, r: 7, fill: '#3f6b2a' }), S('rect', { x: 91, y: 92, width: 2, height: 6, fill: '#3f6b2a' }));
}

// QR decorativo (determinista) para el ticket
function qr() {
  const n = 21; const kids = [];
  const finder = (x, y) => (x >= 0 && x < 7 && y >= 0 && y < 7 ? (x === 0 || x === 6 || y === 0 || y === 6 || (x > 1 && x < 5 && y > 1 && y < 5)) : null);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let on = finder(x, y) ?? finder(x - 14, y) ?? finder(x, y - 14);
    if (on === null) { if ((x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)) on = false; else on = ((x * 7 + y * 13 + x * y * 3) % 5) < 2; }
    if (on) kids.push(S('rect', { x, y, width: 1.02, height: 1.02 }));
  }
  return G('dn-qrg', `0 0 ${n} ${n}`, ...kids);
}

// ───────── Guion cancelable ─────────
function makeRunner() {
  let token = 0; const timers = new Set(); const offs = new Set();
  const cancel = () => { token++; timers.forEach(clearTimeout); timers.clear(); offs.forEach((f) => f()); offs.clear(); };
  const api = (my) => {
    const alive = () => my === token;
    const wait = (ms) => new Promise((res, rej) => {
      if (!alive()) { rej(CANCEL); return; }
      const id = setTimeout(() => { timers.delete(id); if (alive()) res(); else rej(CANCEL); }, reduced() ? 0 : ms);
      timers.add(id);
    });
    // Espera `ms` o hasta que la persona toque alguno de los elementos; devuelve el tocado (o null).
    const hold = (ms, els) => new Promise((res, rej) => {
      if (!alive()) { rej(CANCEL); return; }
      const list = [].concat(els).filter(Boolean); let id = null;
      const clean = () => { clearTimeout(id); timers.delete(id); list.forEach((el) => el.removeEventListener('click', on)); offs.delete(off); };
      const on = (e) => { clean(); if (alive()) res(e.currentTarget); else rej(CANCEL); };
      const off = () => { clean(); rej(CANCEL); };
      list.forEach((el) => el.addEventListener('click', on)); offs.add(off);
      if (ms !== Infinity) { id = setTimeout(() => { clean(); if (alive()) res(null); else rej(CANCEL); }, reduced() ? 0 : ms); timers.add(id); }
    });
    return { wait, hold, alive };
  };
  return {
    run(fn) { cancel(); const my = ++token; Promise.resolve().then(() => fn(api(my))).catch((e) => { if (e !== CANCEL) console.error(e); }); },
    cancel,
  };
}

// ───────── Teclado iOS ─────────
function keyboard() {
  const key = (c) => h('span', { class: 'kb-k', dataset: { k: c } }, c);
  const sug = [0, 1, 2].map(() => h('span', { class: 'kb-sug__i' }));
  const space = h('span', { class: 'kb-k kb-space' }, t('landing.dSpace'));
  const n123 = h('span', { class: 'kb-k kb-fn kb-123' }, '123');
  const pop = h('span', { class: 'kb-pop' }, h('b'));
  const el = h('div', { class: 'wa-kb', 'aria-hidden': 'true' },
    h('div', { class: 'kb-sug' }, sug),
    h('div', { class: 'kb-row' }, [...'qwertyuiop'].map(key)),
    h('div', { class: 'kb-row' }, [...t('landing.dKbRow2')].map(key)),
    h('div', { class: 'kb-row kb-row--3' }, h('span', { class: 'kb-k kb-fn kb-shift' }, gl.shift()), h('span', { class: 'kb-mid' }, [...'zxcvbnm'].map(key)), h('span', { class: 'kb-k kb-fn kb-del' }, gl.del())),
    h('div', { class: 'kb-row kb-row--4' }, n123, space, h('span', { class: 'kb-k kb-fn kb-ret' }, t('landing.dEnter'))),
    h('div', { class: 'kb-foot' }, icon('globe', 24), icon('mic', 24)), pop);
  let popT = 0;
  return {
    el,
    caps(on) { el.classList.toggle('is-caps', on); },
    suggest(a) { sug.forEach((s, i) => { s.textContent = a[i] || ''; }); },
    press(ch) {
      const c = ch.toLowerCase();
      const k = /\p{L}/u.test(c) ? el.querySelector(`[data-k="${c}"]`) || space : c === ' ' ? space : n123;
      k.classList.add('is-down'); setTimeout(() => k.classList.remove('is-down'), 95);
      if (k.dataset.k) {
        pop.firstChild.textContent = el.classList.contains('is-caps') ? c.toUpperCase() : c;
        pop.style.left = `${Math.max(2, Math.min(el.clientWidth - pop.offsetWidth - 2, k.offsetLeft + k.offsetWidth / 2 - pop.offsetWidth / 2))}px`;
        pop.style.top = `${k.offsetTop + k.offsetHeight - pop.offsetHeight}px`;
        pop.classList.add('is-on'); clearTimeout(popT); popT = setTimeout(() => pop.classList.remove('is-on'), 120);
      }
    },
  };
}

// ───────── 1 · WhatsApp ─────────
function sceneWhatsApp(ctx) {
  const sub = h('small', { class: 'wa-sub' }, t('landing.phOnline'));
  const nav = h('div', { class: 'wa-nav' },
    h('span', { class: 'wa-back', 'aria-hidden': 'true' }, gl.chev(), h('b', null, '12')),
    h('span', { class: 'wa-av', 'aria-hidden': 'true' }, icon('tractor', 19)),
    h('span', { class: 'wa-id' }, h('strong', null, h('span', null, t('landing.phBiz')), gl.badge()), sub),
    h('span', { class: 'wa-act', 'aria-hidden': 'true' }, gl.video(), gl.call()));
  const list = h('div', { class: 'wa-list' });
  const chat = h('div', { class: 'wa-chat' }, wallpaper(), list);
  const ph = h('span', { class: 'wa-ph' }, t('landing.phMsgPh'));
  const typed = h('span', { class: 'wa-typed' });
  const line = h('span', { class: 'wa-line' }, ph, typed, h('i', { class: 'wa-caret' }));
  const field = h('button', { class: 'wa-field', type: 'button', 'aria-label': t('landing.phMsgPh') }, h('span', { class: 'wa-field__t' }, line), gl.sticker());
  const send = h('button', { class: 'wa-send', type: 'button', 'aria-label': t('landing.dSend') }, gl.up());
  const bar = h('div', { class: 'wa-bar' },
    h('span', { class: 'wa-ico', 'aria-hidden': 'true' }, icon('plus', 25)), field,
    h('span', { class: 'wa-ico wa-cam', 'aria-hidden': 'true' }, gl.cam()), h('span', { class: 'wa-ico wa-mic', 'aria-hidden': 'true' }, icon('mic', 23)), send);
  const bottom = h('div', { class: 'wa-bottom' }, bar);
  const kb = keyboard();
  const el = h('div', { class: 'scene scene--1 wa' }, nav, chat, bottom, kb.el);

  const sentence = t('landing.phMsg1'); const words = sentence.split(' ');
  const alts = split('landing.dKbAlt'); const start = split('landing.dKbStart');
  let kbOpen = false; let last = null;

  const shift = () => (kbOpen ? kb.el.offsetHeight - parseFloat(getComputedStyle(bar).paddingBottom) : 0);
  const fit = () => {
    const over = Math.max(0, list.scrollHeight - (chat.clientHeight - shift()));
    list.style.transform = over ? `translateY(${-over}px)` : '';
  };
  const setKb = (on) => { kbOpen = on; el.style.setProperty('--sh', `${shift()}px`); el.classList.toggle('is-kb', on); fit(); };
  const bubble = (dir, kids, { ticks = false } = {}) => {
    const tk = ticks ? gl.ticks() : null;
    const m = h('div', { class: `wa-m wa-m--${dir} has-tail` },
      h('span', { class: 'wa-tx' }, kids, h('span', { class: `wa-sp${ticks ? ' wa-sp--t' : ''}`, 'aria-hidden': 'true' })),
      h('span', { class: 'wa-meta' }, '9:41', tk), gl.tail());
    return { m, tk };
  };
  const push = (m) => {
    const dir = m.classList.contains('wa-m--out') ? 'out' : m.classList.contains('wa-m') ? 'in' : null;
    if (dir && last && last.dir === dir) { last.m.classList.remove('has-tail'); m.classList.add('is-cont'); }
    last = dir ? { dir, m } : null;
    m.classList.add('d-new'); list.append(m); fit();
  };
  const suggest = (i) => {
    const parts = sentence.slice(0, i + 1).split(' '); const wi = parts.length - 1;
    const partial = parts[wi].replace(/[,.!?¡¿]/g, ''); const w = (words[wi] || '').replace(/[,.!?¡¿]/g, '');
    kb.suggest(partial ? [`“${partial}”`, w, alts[wi] || ''] : [w, alts[wi] || '', start[0]]);
  };
  const renderTyped = (txt) => {
    typed.textContent = txt; ph.style.display = txt ? 'none' : ''; bar.classList.toggle('has-text', !!txt);
    const over = line.scrollWidth - line.parentElement.clientWidth;
    line.style.transform = over > 0 ? `translateX(${-over}px)` : '';
  };
  const card = () => {
    const btn = h('button', { class: 'wa-cta', type: 'button' }, gl.ext(), t('landing.dCardBtn'));
    const m = h('div', { class: 'wa-m wa-m--in wa-card has-tail' },
      h('div', { class: 'wa-card__media', 'aria-hidden': 'true' }, fieldArt()),
      h('div', { class: 'wa-card__b' },
        h('strong', null, t('landing.dCardT')), h('span', { class: 'wa-tx' }, t('landing.dCardD')),
        h('small', null, t('landing.dCardF'), h('span', { class: 'wa-sp', 'aria-hidden': 'true' })),
        h('span', { class: 'wa-meta' }, '9:41')),
      btn, gl.tail());
    return { m, btn };
  };

  async function play(api) {
    list.replaceChildren(h('span', { class: 'wa-day' }, t('landing.phToday')), h('p', { class: 'wa-note' }, gl.lock(), t('landing.dNotice')));
    last = null; renderTyped(''); kb.caps(true); kb.suggest(start); setKb(false); field.classList.remove('is-focus');
    sub.textContent = t('landing.phOnline'); sub.classList.remove('is-typing');
    // 1) Tocar el campo de mensaje: aparece el teclado
    if (!(await api.hold(1300, field))) await ctx.tap(field, api);
    ctx.touchOff(); field.classList.add('is-focus'); setKb(true); await api.wait(450);
    // 2) Escribir
    let txt = '';
    for (let i = 0; i < sentence.length; i++) {
      const ch = sentence[i]; kb.press(ch); txt += ch; renderTyped(txt); suggest(i);
      if (i === 0) kb.caps(false);
      await api.wait(ch === ' ' ? 105 : 52 + ((i * 37) % 5) * 9);
    }
    // 3) Enviar
    if (!(await api.hold(500, send))) await ctx.tap(send, api);
    const out = bubble('out', [sentence], { ticks: true }); out.tk.classList.add('is-1'); push(out.m);
    renderTyped(''); kb.caps(true); kb.suggest(start);
    await api.wait(380); setKb(false); field.classList.remove('is-focus'); ctx.touchOff();
    await api.wait(420); out.tk.classList.replace('is-1', 'is-2');
    await api.wait(520); out.tk.classList.replace('is-2', 'is-read');
    // 4) El negocio responde: "escribiendo…", saludo y tarjeta con botón
    sub.textContent = t('landing.dTyping'); sub.classList.add('is-typing');
    await api.wait(1250);
    sub.textContent = t('landing.phOnline'); sub.classList.remove('is-typing');
    push(bubble('in', [t('landing.dHello')]).m);
    await api.wait(850);
    const c = card(); push(c.m);
    await api.wait(650);
    ctx.hint(c.btn);
    await api.hold(Infinity, c.btn);
    ctx.unhint(); c.btn.classList.add('is-pressed'); await api.wait(180);
    ctx.go(1, c.btn);
  }
  return { el, play };
}

// ───────── Cabecera de la app FieldFlow ─────────
function appHeader({ back = false, title, sub, step }) {
  const segs = [1, 2, 3].map((n) => h('span', { class: 'ffa-seg' }, h('i'), h('small', null, t(`landing.dStep${n}`))));
  const el = h('div', { class: 'ffa-top' },
    h('div', { class: 'ffa-bar' },
      back ? h('span', { class: 'ffa-back', 'aria-hidden': 'true' }, gl.chev()) : h('span', { class: 'ffa-logo', 'aria-hidden': 'true' }, logo(30)),
      h('span', { class: 'ffa-ttl' }, h('strong', null, title), sub ? h('small', null, sub) : null),
      h('span', { class: 'ffa-stepn' }, t('landing.dStepOf', { n: step }))),
    h('div', { class: 'ffa-steps', 'aria-hidden': 'true' }, segs));
  return { el, set(n, done = false) { segs.forEach((s, i) => { s.classList.toggle('is-done', i < n - 1 || (i === n - 1 && done)); s.classList.toggle('is-cur', i === n - 1 && !done); }); } };
}
const botMsg = (...kids) => h('div', { class: 'ffa-msg d-new' }, h('span', { class: 'ffa-msg__av', 'aria-hidden': 'true' }, logo(24)), h('div', { class: 'ffa-msg__b' }, kids));
const typingDots = () => h('div', { class: 'ffa-msg d-new' }, h('span', { class: 'ffa-msg__av', 'aria-hidden': 'true' }, logo(24)), h('div', { class: 'ffa-msg__b ffa-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')));

// ───────── 2 · App: elegir servicio ─────────
function sceneApp(ctx) {
  const hdr = appHeader({ title: 'FieldFlow', sub: t('landing.phBiz'), step: 1 });
  const body = h('div', { class: 'ffa-body' });
  const comp = h('div', { class: 'ffa-comp', 'aria-hidden': 'true' }, h('span', { class: 'ffa-comp__f' }, t('landing.dCompose')), h('span', { class: 'ffa-comp__mic' }, icon('mic', 18)));
  const el = h('div', { class: 'scene scene--2 ffa' }, hdr.el, body, comp);
  async function play(api) {
    hdr.set(1); body.replaceChildren();
    await api.wait(420);
    body.append(botMsg(t('landing.dAsk')));
    await api.wait(380);
    const cards = SVCS.map((_, i) => h('button', { class: 'ffa-svc', type: 'button', style: `--i:${i}`, 'aria-pressed': 'false' },
      svcTile(i), h('span', { class: 'ffa-svc__t' }, h('strong', null, svcName(i)), h('small', null, svcMeta(i))),
      h('span', { class: 'ffa-radio', 'aria-hidden': 'true' }, icon('check', 13))));
    body.append(h('div', { class: 'ffa-svcs d-stagger' }, cards));
    let me = null; let picked = false;
    const select = (c) => {
      picked = true;
      cards.forEach((x) => { x.classList.toggle('is-sel', x === c); x.setAttribute('aria-pressed', String(x === c)); });
      ctx.state.svc = cards.indexOf(c); if (me) me.textContent = svcName(ctx.state.svc);
    };
    cards.forEach((c) => c.addEventListener('click', () => select(c)));
    await api.wait(900);
    if (!picked && !(await api.hold(1500, cards)) && !picked) { await ctx.tap(cards[0], api); select(cards[0]); }
    hdr.set(1, true); ctx.touchOff();
    await api.wait(420);
    me = h('div', { class: 'ffa-me d-new' }, svcName(ctx.state.svc)); body.append(me);
    await api.wait(420); const dots = typingDots(); body.append(dots);
    await api.wait(1050); dots.remove();
    const btn = h('button', { class: 'ffa-cta', type: 'button' }, icon('calendar', 16), t('landing.dSeeSlots'));
    body.append(botMsg(t('landing.dWhen'), btn));
    await api.wait(600); ctx.hint(btn);
    await api.hold(Infinity, btn);
    ctx.unhint(); btn.classList.add('is-pressed'); await api.wait(180);
    ctx.go(2);
  }
  return { el, play };
}

// ───────── 3 · Agenda: día, hora, parcela y voz ─────────
function sceneAgenda(ctx) {
  const hdr = appHeader({ back: true, title: t('landing.phPick'), step: 2 });
  const sum = h('div', { class: 'ag-sum' });
  const month = h('div', { class: 'ag-month' });
  const daysBox = h('div', { class: 'ag-days' });
  const slotBox = h('div', { class: 'ag-slots' });
  const plots = split('landing.dPlots');
  const LOTS = [[4, 4, 56, 36, '#b9d39a'], [64, 4, 60, 26, '#cfe0b4'], [4, 44, 50, 40, '#a7c983'], [58, 34, 66, 50, '#c3d9a5']];
  const pct = (x, y, w, hh) => `left:${(x / 1.28).toFixed(2)}%;top:${(y / 0.88).toFixed(2)}%;width:${(w / 1.28).toFixed(2)}%;height:${(hh / 0.88).toFixed(2)}%`;
  const lots = LOTS.map(([x, y, w, hh, c], i) => h('button', { class: 'ag-lot', type: 'button', 'aria-label': plots[i], style: `${pct(x, y, w, hh)};--c:${c}` }));
  const pin = h('span', { class: 'ag-pin', 'aria-hidden': 'true' }, gl.pin());
  const plotName = h('strong');
  const plot = h('div', { class: 'ag-plot' }, h('div', { class: 'ag-map' }, lots, pin),
    h('span', { class: 'ag-info' }, h('small', null, t('landing.phPlotLbl')), plotName, h('small', { class: 'ag-info__c' }, t('landing.phCrewLbl')),
      h('span', { class: 'ag-crew' }, CREW.map(([l, c]) => h('i', { style: `--c:${c}` }, l)), h('em', null, t('landing.phCrew')))));
  const wave = (n) => h('span', { class: 'ag-wave', 'aria-hidden': 'true' }, Array.from({ length: n }, (_, i) => h('i', { style: `--n:${i}` })));
  const voice = h('button', { class: 'ag-voice', type: 'button' }, h('span', { class: 'ag-voice__mic' }, icon('mic', 16)), wave(9), h('span', null, t('landing.phVoice')));
  const confirmT = h('span', { class: 'ag-confirm__t' });
  const confirm = h('button', { class: 'ag-confirm', type: 'button' }, h('span', { class: 'ag-spin', 'aria-hidden': 'true' }), confirmT);
  const said = h('p', { class: 'ag-sheet__t' });
  const sheet = h('div', { class: 'ag-sheet', 'aria-hidden': 'true' }, h('div', { class: 'ag-sheet__p' },
    h('span', { class: 'ag-sheet__mic' }, icon('mic', 28)), h('small', { class: 'ag-sheet__l' }, t('landing.dListening')), said, wave(22)));
  const el = h('div', { class: 'scene scene--3 ffa ag' }, hdr.el,
    h('div', { class: 'ag-body' }, sum, month, daysBox, slotBox, plot, voice), h('div', { class: 'ag-foot' }, confirm), sheet);

  let days = []; let slots = []; let vt = [];
  const sel = { day: null, time: null, plot: null };
  const ready = () => sel.day != null && !!sel.time && sel.plot != null;
  const refresh = () => {
    const ok = ready(); confirm.classList.toggle('is-ready', ok);
    confirmT.textContent = ok ? t('landing.dConfirmAt', { when: `${short(ctx.days[sel.day], { weekday: 'short', day: 'numeric' })} · ${fmtTime(sel.time)}` }) : t('landing.phPick');
  };
  const pickDay = (i) => {
    if (i === FULL_DAY) return;
    sel.day = i; days.forEach((d, k) => d.classList.toggle('is-sel', k === i));
    slotBox.classList.remove('is-wait', 'd-stagger'); void slotBox.offsetWidth; slotBox.classList.add('d-stagger'); refresh();
  };
  const pickTime = (tm) => {
    const s = slots.find((x) => x.dataset.t === tm);
    if (BUSY.has(tm)) { s.classList.remove('is-shake'); void s.offsetWidth; s.classList.add('is-shake'); return; }
    if (sel.day == null) pickDay(1);
    sel.time = tm; slots.forEach((x) => x.classList.toggle('is-sel', x === s)); refresh();
  };
  const pickPlot = (i) => {
    sel.plot = i; lots.forEach((l, k) => l.classList.toggle('is-sel', k === i));
    const [x, y, w, hh] = LOTS[i];
    pin.style.left = `${((x + w / 2) / 1.28).toFixed(2)}%`; pin.style.top = `${((y + hh / 2) / 0.88).toFixed(2)}%`;
    pin.classList.remove('is-on'); void pin.offsetWidth; pin.classList.add('is-on');
    plotName.textContent = plots[i]; refresh();
  };
  const listen = () => {
    vt.forEach(clearTimeout); vt = []; const words = t('landing.dSaid').split(' ');
    said.textContent = ''; sheet.classList.add('is-on');
    const step = reduced() ? 0 : 190;
    words.forEach((w, i) => vt.push(setTimeout(() => { said.textContent = words.slice(0, i + 1).join(' '); }, 500 + i * step)));
    vt.push(setTimeout(() => { sheet.classList.remove('is-on'); pickDay(1); pickTime('09:30'); pickPlot(2); }, 900 + words.length * step + (reduced() ? 0 : 500)));
  };
  voice.addEventListener('click', listen);
  lots.forEach((l, i) => l.addEventListener('click', () => pickPlot(i)));

  async function play(api) {
    vt.forEach(clearTimeout); vt = []; sheet.classList.remove('is-on');
    Object.assign(sel, { day: null, time: null, plot: null });
    hdr.set(2); const s = ctx.state.svc;
    sum.replaceChildren(svcTile(s, 17), h('span', { class: 'ffa-svc__t' }, h('strong', null, svcName(s)), h('small', null, svcMeta(s))), h('span', { class: 'ag-sum__c' }, t('landing.dChange')));
    month.replaceChildren(h('b', null, cap(fmtDay(ctx.days[0], { month: 'long', year: 'numeric' }))), h('span', { 'aria-hidden': 'true' }, gl.chev(), gl.chev()));
    days = ctx.days.map((d, i) => h('button', { class: `ag-day${i === FULL_DAY ? ' is-full' : ''}`, type: 'button', disabled: i === FULL_DAY },
      h('small', null, short(d, { weekday: 'short' })), h('b', null, fmtDay(d, { day: 'numeric' })), i === FULL_DAY ? h('em', null, t('landing.dFull')) : h('i')));
    daysBox.replaceChildren(...days); days.forEach((d, i) => d.addEventListener('click', () => pickDay(i)));
    slots = TIMES.map((tm, i) => h('button', { class: `ag-slot${BUSY.has(tm) ? ' is-busy' : ''}`, type: 'button', dataset: { t: tm }, style: `--i:${i}`, 'aria-disabled': BUSY.has(tm) ? 'true' : null }, fmtTime(tm)));
    slotBox.replaceChildren(...slots); slotBox.className = 'ag-slots is-wait'; slots.forEach((x) => x.addEventListener('click', () => pickTime(x.dataset.t)));
    lots.forEach((l) => l.classList.remove('is-sel')); pin.classList.remove('is-on'); plotName.textContent = '—';
    confirm.classList.remove('is-loading'); refresh();

    // El dedo elige por la persona sólo lo que ella no haya elegido; si está hablando, espera.
    const listening = () => sheet.classList.contains('is-on');
    const auto = async (done, targets, def, act) => {
      if (done()) return;
      const x = await api.hold(1250, targets);
      while (listening()) await api.wait(200);
      if (!x && !done()) { await ctx.tap(def, api); act(); }
      await api.wait(380);
    };
    await api.wait(650);
    await auto(() => sel.day != null, days.filter((_, i) => i !== FULL_DAY), days[1], () => pickDay(1));
    await auto(() => !!sel.time, slots.filter((y) => !BUSY.has(y.dataset.t)), slots[TIMES.indexOf('09:30')], () => pickTime('09:30'));
    await auto(() => sel.plot != null, lots, lots[2], () => pickPlot(2));
    ctx.touchOff();
    while (!ready()) await api.wait(250);
    await api.wait(350); ctx.hint(confirm);
    for (;;) { await api.hold(Infinity, confirm); if (ready()) break; }
    ctx.unhint(); Object.assign(ctx.state, { day: sel.day, time: sel.time, plot: sel.plot });
    confirm.classList.add('is-loading'); await api.wait(700);
    ctx.go(3);
  }
  return { el, play };
}

// ───────── 4 · Confirmación ─────────
function sceneDone(ctx) {
  const hdr = appHeader({ title: 'FieldFlow', sub: t('landing.phBiz'), step: 3 });
  const ring = G('dn-ring', '0 0 52 52', S('circle', { cx: 26, cy: 26, r: 23 }), P('M15 27l8 8 15-17'));
  const conf = h('span', { class: 'dn-conf', 'aria-hidden': 'true' }, Array.from({ length: 16 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 16 + (i % 2) * 0.2; const r = 62 + (i % 3) * 16;
    return h('i', { style: `--dx:${(Math.cos(a) * r).toFixed(1)}px;--dy:${(Math.sin(a) * r * 0.8 - 10).toFixed(1)}px;--r:${(i * 47) % 360}deg;--c:${['#006bb8', '#375033', '#b83200', '#f2b705'][i % 4]}` });
  }));
  const tk = h('div', { class: 'dn-tk' });
  const addIc = h('span', { class: 'dn-add__ic' }, icon('calendar', 17));
  const addT = h('span', null, t('landing.dAddCal'));
  const add = h('button', { class: 'dn-add', type: 'button' }, addIc, addT);
  const biz = h('button', { class: 'dn-biz', type: 'button' }, t('landing.dBizView'), icon('right', 16));
  const el = h('div', { class: 'scene scene--4 ffa dn' }, hdr.el,
    h('div', { class: 'dn-body' },
      h('div', { class: 'dn-hero' }, conf, ring, h('strong', null, t('landing.dDone')), h('small', null, t('landing.dDoneSub'))),
      tk, h('div', { class: 'dn-acts' }, add, biz)));
  const cell = (l, v) => h('span', { class: 'dn-c' }, h('small', null, l), h('b', null, v));
  const added = (on) => { add.classList.toggle('is-done', on); addT.textContent = t(on ? 'landing.dAdded' : 'landing.dAddCal'); addIc.replaceChildren(icon(on ? 'check' : 'calendar', 17)); };
  add.addEventListener('click', () => added(true));
  async function play(api) {
    const st = ctx.state; hdr.set(3, true);
    el.classList.remove('is-on'); void el.offsetWidth; el.classList.add('is-on');
    added(false);
    tk.replaceChildren(
      h('div', { class: 'dn-tk__top' }, svcTile(st.svc, 19), h('span', { class: 'dn-tk__h' }, h('strong', null, svcName(st.svc)), h('small', null, t('landing.phBiz'))), h('span', { class: 'dn-pill' }, t('landing.dStatus'))),
      h('div', { class: 'dn-grid' },
        cell(t('landing.phDateLbl'), short(ctx.days[st.day], { weekday: 'short', day: 'numeric', month: 'short' })), cell(t('landing.phTimeLbl'), fmtTime(st.time)),
        cell(t('landing.phPlotLbl'), split('landing.dPlots')[st.plot]), cell(t('landing.phCrewLbl'), t('landing.phCrew'))),
      h('div', { class: 'dn-cut', 'aria-hidden': 'true' }),
      h('div', { class: 'dn-qr' }, qr(), h('span', null, h('b', null, 'FF-2481'), h('small', null, t('landing.dShow')))));
    await api.wait(2000);
    ctx.live(true); await api.wait(2900); ctx.live(false);
    await api.wait(500);
    if (!add.classList.contains('is-done')) { if (!(await api.hold(1200, add))) { await ctx.tap(add, api); added(true); } }
    await api.wait(600); ctx.hint(biz);
    await api.hold(Infinity, biz);
    ctx.unhint(); biz.classList.add('is-pressed'); await api.wait(180);
    ctx.go(4);
  }
  return { el, play };
}

// ───────── 5 · Panel del negocio ─────────
function sceneBiz(ctx) {
  const pos = (tm, hrs) => { const [hh, mm] = tm.split(':').map(Number); return [((hh + mm / 60 - 6) / 12) * 100, (hrs / 12) * 100]; };
  const BASE = [[0, '08:30', 1, 0], [0, '14:00', 1.5, 1], [1, '08:30', 1, 2], [1, '14:00', 1.5, 3], [2, '08:30', 1, 1], [2, '14:00', 1.5, 0],
    [3, '07:00', 1.5, 2], [3, '08:30', 1, 0], [3, '11:00', 2, 1], [3, '14:00', 1.5, 3], [3, '15:30', 2, 2], [4, '08:30', 1, 3], [4, '14:00', 1.5, 1]];
  const COLORS = ['#375033', '#006bb8', '#8a4b2d', '#4a5568'];
  const NAMES = ['Marta Gil', 'Finca La Esperanza', 'Coop. El Progreso', 'Hacienda Aurora'];
  const kBooks = h('b', null, '11'); const ringFg = S('circle', { cx: 18, cy: 18, r: 14, pathLength: 100 });
  const kLoad = h('b', null, '82%');
  const cols = h('div', { class: 'bz-cal' });
  const next = h('div', { class: 'bz-next' });
  const ban = h('div', { class: 'bz-ban', 'aria-hidden': 'true' });
  const shTop = h('div', { class: 'bz-sh__top' }); const shGrid = h('div', { class: 'dn-grid bz-sh__grid' });
  const close = h('button', { class: 'bz-grab', type: 'button', 'aria-label': t('landing.dClose') });
  const sheet = h('div', { class: 'bz-sheet' }, h('div', { class: 'bz-sheet__p' }, close, shTop, shGrid,
    h('div', { class: 'bz-acts', 'aria-hidden': 'true' },
      h('span', { class: 'bz-act bz-act--wa' }, icon('chat', 19), 'WhatsApp'), h('span', { class: 'bz-act' }, gl.call(), t('landing.dCall')), h('span', { class: 'bz-act' }, icon('refresh', 19), t('landing.dMove')))));
  const tabs = h('div', { class: 'bz-tabs', 'aria-hidden': 'true' },
    [['home', 'landing.phToday'], ['calendar', 'landing.phCal'], ['chat', 'landing.dTabChats'], ['more', 'landing.dTabMore']].map(([ic, k], i) => h('span', { class: `bz-tab${i === 0 ? ' is-on' : ''}` }, icon(ic, 22), t(k))));
  const dateEl = h('small');
  const el = h('div', { class: 'scene scene--5 bz' },
    h('div', { class: 'bz-top' }, h('div', { class: 'bz-row' }, h('span', null, t('landing.phBiz')), h('span', { class: 'bz-av', 'aria-hidden': 'true' }, 'AL')), h('strong', { class: 'bz-h' }, t('landing.phToday')), dateEl),
    h('div', { class: 'bz-body' },
      h('div', { class: 'bz-kpis' },
        h('div', { class: 'bz-k' }, kBooks, h('small', null, t('landing.dWeekBooks'))),
        h('div', { class: 'bz-k' }, h('b', null, '3'), h('small', null, t('landing.phStatCrew'))),
        h('div', { class: 'bz-k bz-k--dark' }, G('bz-ring', '0 0 36 36', S('circle', { cx: 18, cy: 18, r: 14, pathLength: 100 }), ringFg), kLoad, h('small', null, t('landing.phStatLoad')))),
      h('div', { class: 'bz-sec' }, h('span', null, t('landing.dWeek')), h('small', null, h('i'), t('landing.phOnline'))),
      cols, h('div', { class: 'bz-sec' }, h('span', null, t('landing.phNext'))), next),
    tabs, ban, sheet);

  const openSheet = (d) => {
    shTop.replaceChildren(h('span', { class: 'bz-cav', style: `--c:${d.color}`, 'aria-hidden': 'true' }, d.client.split(' ').map((w) => w[0]).slice(0, 2).join('')),
      h('span', { class: 'dn-tk__h' }, h('strong', null, d.client), h('small', null, d.phone)), h('span', { class: 'dn-pill' }, t('landing.dStatus')));
    shGrid.replaceChildren(
      h('span', { class: 'dn-c' }, h('small', null, t('landing.phSvcLbl')), h('b', null, d.svc)),
      h('span', { class: 'dn-c' }, h('small', null, t('landing.phDateLbl')), h('b', null, d.when)),
      h('span', { class: 'dn-c' }, h('small', null, t('landing.phPlotLbl')), h('b', null, d.plot)),
      h('span', { class: 'dn-c' }, h('small', null, t('landing.phCrewLbl')), h('b', null, t('landing.phCrew'))));
    sheet.classList.add('is-on');
  };
  const shut = () => sheet.classList.remove('is-on');
  close.addEventListener('click', shut);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) shut(); });

  async function play(api) {
    const st = ctx.state; shut(); ban.classList.remove('is-on');
    dateEl.textContent = cap(fmtDay(todayLocal(), { weekday: 'long', day: 'numeric', month: 'long' }));
    kBooks.textContent = '11'; kLoad.textContent = '82%'; ringFg.style.strokeDashoffset = '18';
    const plotsN = split('landing.dPlots');
    const when = (d, tm) => `${short(ctx.days[d], { weekday: 'short', day: 'numeric' })} · ${fmtTime(tm)}`;
    const evData = (c, tm, k) => ({ client: NAMES[k], phone: `+57 31${k} 555 01${4 + k}${2 + c}`, svc: svcName((c + k) % SVCS.length), when: when(c, tm), plot: t('landing.dLot', { n: ((c + k) % 4) + 1 }), color: COLORS[k] });
    const newData = { client: 'Jorge Rincón', phone: '+57 310 555 0142', svc: svcName(st.svc), when: when(st.day, st.time), plot: plotsN[st.plot], color: '#b83200' };
    const [nt, nh] = pos(st.time, 1.5);
    const newEv = h('button', { class: 'bz-ev bz-ev--new', type: 'button', style: `--t:${nt}%;--hh:${nh}%`, 'aria-label': `${t('landing.dNew')}: ${newData.svc}, ${newData.when}` }, t('landing.phCrew'));
    cols.replaceChildren(...ctx.days.map((d, c) => h('div', { class: 'bz-col' },
      h('span', { class: `bz-d${c === st.day ? ' is-sel' : ''}` }, h('small', null, fmtDay(d, { weekday: 'narrow' })), h('b', null, fmtDay(d, { day: 'numeric' }))),
      h('div', { class: 'bz-lane' }, BASE.filter((e) => e[0] === c).map(([, tm, hrs, k]) => {
        const [top, hh] = pos(tm, hrs); const data = evData(c, tm, k);
        const b = h('button', { class: 'bz-ev', type: 'button', style: `--t:${top}%;--hh:${hh}%;--c:${COLORS[k]}`, 'aria-label': `${data.svc}, ${data.when}` });
        b.addEventListener('click', () => openSheet(data)); return b;
      }), c === st.day ? newEv : null))));
    newEv.addEventListener('click', () => openSheet(newData));
    const row = (tm, k, d, c, isNew) => h('div', { class: `bz-r${isNew ? ' bz-r--new d-new' : ''}`, style: `--c:${c}` }, h('i'), h('b', null, fmtTime(tm)), h('span', null, `${svcName(k)} · ${short(ctx.days[d], { weekday: 'short' })}`), isNew ? h('em', null, t('landing.dNew')) : null);
    next.replaceChildren(row('08:30', 1, 0, COLORS[0]), row('14:00', 3, 0, COLORS[1]), row('08:30', 2, 1, COLORS[2]));
    ban.replaceChildren(logo(34), h('span', { class: 'bz-ban__t' }, h('span', { class: 'bz-ban__h' }, h('b', null, 'FieldFlow'), h('small', null, t('landing.dNow'))),
      h('strong', null, t('landing.dNew')), h('span', null, `${newData.svc} · ${newData.when}`)));

    await api.wait(700); ban.classList.add('is-on');
    await api.wait(900);
    newEv.classList.add('is-on'); next.prepend(row(st.time, st.svc, st.day, '#b83200', true)); next.lastChild.remove();
    kBooks.textContent = '12'; kBooks.classList.remove('is-bump'); void kBooks.offsetWidth; kBooks.classList.add('is-bump');
    kLoad.textContent = '86%'; ringFg.style.strokeDashoffset = '14';
    await api.wait(2600); ban.classList.remove('is-on');
    await api.wait(500);
    if (!(await api.hold(1400, newEv))) { await ctx.tap(newEv, api); openSheet(newData); }
    ctx.touchOff();
  }
  return { el, play };
}

// ───────── Teléfono + historia ─────────
export function buildStory() {
  const stepKeys = [1, 2, 3, 4, 5];
  const steps = stepKeys.map((n) => h('li', { class: 'story__li', 'data-reveal': String(Math.min(n, 4)) },
    h('button', { class: 'story__step', type: 'button' },
      h('span', { class: 'story__n', 'aria-hidden': 'true' }, `0${n}`),
      h('span', { class: 'story__txt' }, h('strong', null, t(`landing.s${n}t`)), h('span', { class: 'story__desc' }, t(`landing.s${n}d`))))));

  const base = addDays(todayLocal(), 1);
  const ctx = { state: { svc: 0, day: 1, time: '09:30', plot: 2 }, days: [0, 1, 2, 3, 4].map((n) => addDays(base, n)) };

  const touch = h('span', { class: 'd-touch', 'aria-hidden': 'true' }, h('i'));
  const hintEl = h('span', { class: 'd-hint', 'aria-hidden': 'true' }, h('i'));
  const live = h('div', { class: 'd-live', 'aria-hidden': 'true' }, logo(38),
    h('span', { class: 'd-live__t' }, h('b', null, t('landing.dRemind')), h('small', null, t('landing.dRemindSub'))), h('span', { class: 'd-live__ok' }, icon('check', 16)));
  const screen = h('div', { class: 'phone__screen' });
  const scenes = [sceneWhatsApp(ctx), sceneApp(ctx), sceneAgenda(ctx), sceneDone(ctx), sceneBiz(ctx)];
  screen.append(
    h('div', { class: 'd-status', 'aria-hidden': 'true' }, h('b', { class: 'd-status__time' }, '9:41'), h('span'), h('span', { class: 'd-status__r' }, statusIcons())),
    h('span', { class: 'd-island', 'aria-hidden': 'true' }), live,
    ...scenes.map((s) => s.el), hintEl, touch, h('span', { class: 'd-home', 'aria-hidden': 'true' }));
  const phone = h('div', { class: 'phone', 'data-scene': '1', role: 'group', 'aria-label': t('landing.phLabel') },
    h('span', { class: 'phone__key phone__key--a', 'aria-hidden': 'true' }), h('span', { class: 'phone__key phone__key--b', 'aria-hidden': 'true' }),
    h('span', { class: 'phone__key phone__key--c', 'aria-hidden': 'true' }), h('span', { class: 'phone__key phone__key--p', 'aria-hidden': 'true' }), screen);

  // Posición de un elemento dentro de la pantalla (corrige la escala del teléfono)
  const scale = () => { const s = screen.getBoundingClientRect(); return [s, s.width / (screen.offsetWidth || 1) || 1]; };
  const at = (el) => { const [s, k] = scale(); const r = el.getBoundingClientRect(); return [(r.left - s.left + r.width / 2) / k, (r.top - s.top + r.height / 2) / k]; };
  const place = (node, el) => { const [x, y] = at(el); node.style.transform = `translate(${x}px, ${y}px)`; };
  ctx.touchOff = () => touch.classList.remove('is-on');
  let lastReal = 0; // si la persona acaba de tocar, el dedo de la demo no se interpone
  ctx.tap = async (el, api) => {
    if (performance.now() - lastReal < 1500) { ctx.touchOff(); return; }
    if (!touch.classList.contains('is-on')) { touch.classList.add('no-tr'); place(touch, el); void touch.offsetWidth; touch.classList.remove('no-tr'); touch.classList.add('is-on'); await api.wait(280); }
    else { place(touch, el); await api.wait(480); }
    touch.classList.add('is-down'); el.classList.add('is-pressed'); await api.wait(150);
    touch.classList.remove('is-down'); el.classList.remove('is-pressed'); await api.wait(110);
  };
  ctx.hint = (el) => { ctx.touchOff(); place(hintEl, el); hintEl.classList.add('is-on'); };
  ctx.unhint = () => hintEl.classList.remove('is-on');
  ctx.live = (on) => live.classList.toggle('is-on', on);
  let zoomNext = false;
  ctx.go = (i, from) => {
    zoomNext = !!from;
    if (from) { const [x, y] = at(from); screen.style.setProperty('--ox', `${x}px`); screen.style.setProperty('--oy', `${y}px`); }
    phone.dispatchEvent(new CustomEvent('ff:go', { detail: i }));
  };
  // Toque real: onda en el punto exacto, como en un teléfono
  screen.addEventListener('pointerdown', (e) => {
    lastReal = performance.now(); ctx.touchOff();
    if (reduced()) return;
    const [s, k] = scale();
    const r = h('span', { class: 'd-rip', 'aria-hidden': 'true', style: `left:${(e.clientX - s.left) / k}px;top:${(e.clientY - s.top) / k}px` });
    screen.append(r); setTimeout(() => r.remove(), 520);
  });

  const runner = makeRunner();
  let cur = 0; let visible = false;
  const run = () => { if (visible) runner.run((api) => scenes[cur].play(api)); else runner.cancel(); };
  const show = (i) => {
    const prev = cur; cur = i;
    phone.dataset.scene = String(i + 1);
    ctx.unhint(); ctx.touchOff(); ctx.live(false);
    scenes.forEach((s) => s.el.classList.remove('is-enter', 'is-back', 'is-zoom'));
    if (prev !== i) { const s = scenes[i].el; void s.offsetWidth; s.classList.add(zoomNext ? 'is-zoom' : i > prev ? 'is-enter' : 'is-back'); }
    zoomNext = false;
    run();
  };
  let io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver((es) => { const v = es[0].isIntersecting; if (v !== visible) { visible = v; run(); } }, { threshold: 0.45 });
    io.observe(phone);
  } else { visible = true; }

  const pips = stepKeys.map((n) => h('button', { class: 'story__pip', type: 'button', 'aria-label': t(`landing.s${n}t`) }, h('i')));
  const el = h('section', { class: 'lsec story', id: 'how', 'aria-labelledby': 'how-t' },
    h('div', { class: 'lsec__head', 'data-reveal': '1' }, h('span', { class: 'eyebrow' }, t('landing.howEyebrow')), h('h2', { id: 'how-t' }, t('landing.how'))),
    h('div', { class: 'story__grid' },
      h('ol', { class: 'story__steps', 'aria-label': t('landing.phSteps') }, steps),
      h('div', { class: 'story__stage' }, h('div', { class: 'story__sticky' }, h('div', { class: 'story__glow', 'aria-hidden': 'true' }), phone), h('div', { class: 'story__pips' }, pips))));
  return { el, phone, steps: steps.map((li) => li.firstChild), pips, show, destroy: () => { runner.cancel(); io?.disconnect(); } };
}
