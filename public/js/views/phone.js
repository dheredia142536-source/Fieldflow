// Teléfono animado de la portada: cinco escenas que explican el flujo completo
// (mensaje → app → agenda → confirmación → panel del negocio).
// Todo es HTML/CSS/SVG (sin imágenes): se traduce, es nítido en cualquier pantalla y respeta "reducir movimiento".
import { h } from '../ui.js';
import { icon, logo } from '../icons.js';
import { t } from '../i18n.js';
import { addDays, fmtDay, fmtTime, todayLocal } from '../time.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  n.append(...kids.filter(Boolean));
  return n;
};
/** Elemento que aparece con retraso (--dl) cuando su escena se activa. */
const pa = (cls, dl, extra = '') => ({ class: `pa ${cls}`.trim(), style: `--dl:${dl}s;${extra}` });
const ticks = () => h('span', { class: 'ticks' }, icon('check', 11), icon('check', 11));
const inputBar = (text) => h('div', { class: 'pinput pa', style: '--dl:.2s' },
  h('span', { class: 'pinput__f' }, text), h('span', { class: 'pinput__mic' }, icon('mic', 15)));

// ── Escena 1 · WhatsApp ──
function sceneWhatsApp() {
  return h('div', { class: 'scene scene--1', 'aria-hidden': 'true' },
    h('div', { class: 'pchat__head' },
      icon('left', 16), h('span', { class: 'pchat__av' }, logo(22)),
      h('span', { class: 'pchat__who' }, h('strong', null, t('landing.phBiz')), h('small', null, t('landing.phOnline')))),
    h('div', { class: 'pchat__body pchat__body--wa' },
      h('span', { ...pa('pdate', 0.1) }, t('landing.phToday')),
      h('p', { ...pa('pb pb--in', 0.3) }, t('landing.phHello'), h('span', { class: 'pb__m' }, '9:40')),
      h('p', { ...pa('pb pb--out', 1.1) }, t('landing.phMsg1'), h('span', { class: 'pb__m' }, '9:41', ticks())),
      h('p', { class: 'pb pb--in pb--typing' }, h('i'), h('i'), h('i')),
      h('div', { ...pa('pb pb--in pb--card', 3.1) },
        h('div', { class: 'plink' },
          h('span', { class: 'plink__ic' }, logo(26)),
          h('span', { class: 'plink__t' }, h('strong', null, t('landing.phLinkT')), h('small', null, t('landing.phLinkD')))),
        h('span', { class: 'pbubtxt' }, t('landing.phBot1'), h('span', { class: 'pb__m' }, '9:41'))),
      h('span', { ...pa('pbtn pbtn--tap', 3.8) }, icon('link', 15), t('landing.phOpen'))),
    inputBar(t('landing.phMsgPh')));
}

// ── Escena 2 · asistente con tarjetas de servicio ──
function sceneApp() {
  const sv = [[1, 'leaf', '#375033'], [2, 'search', '#8a4b2d'], [3, 'shield', '#4a5568'], [7, 'truck', '#006bb8']];
  return h('div', { class: 'scene scene--2', 'aria-hidden': 'true' },
    h('div', { class: 'papp__head' }, logo(22), h('strong', null, t('landing.phAssistant')), h('span', { class: 'papp__live' }, h('i'), t('landing.phOnline'))),
    h('div', { class: 'pchat__body' },
      h('p', { ...pa('pb pb--in', 0.2) }, t('landing.phAsk')),
      h('div', { class: 'psvs' }, sv.map(([k, ic, c], n) => h('div', { ...pa(`psv${n === 0 ? ' psv--pick' : ''}`, 0.7 + n * 0.25, `--c:${c};--pk:2.4s`) },
        h('span', { class: 'psv__ic' }, icon(ic, 17)),
        h('span', { class: 'psv__t' }, h('strong', null, t(`landing.sv${k}n`)), h('small', null, t(`landing.sv${k}m`))),
        h('span', { class: 'psv__r' }, h('i', null, icon('check', 11)))))),
      h('p', { ...pa('pb pb--out', 3.0) }, t('landing.sv1n'), h('span', { class: 'pb__m' }, '9:42', ticks())),
      h('p', { class: 'pb pb--in pb--typing pb--typing2' }, h('i'), h('i'), h('i')),
      h('p', { ...pa('pb pb--in', 4.6) }, t('landing.phWhen'))),
    inputBar(t('landing.phTypeHere')));
}

// Mapa de parcelas y surcos (el lenguaje visual de la marca)
function plotMap() {
  const parcels = [[4, 4, 40, 27, '#cfe0b8'], [48, 4, 48, 19, '#b9d29a'], [4, 35, 34, 31, '#9fc07a'], [42, 27, 54, 39, '#d9e6c4']];
  const g = svg('g');
  parcels.forEach(([x, y, w, hh, f], i) => {
    g.append(svg('rect', { x, y, width: w, height: hh, rx: 3, fill: f, class: i === 2 ? 'pmap__sel' : '' }));
    for (let yy = y + 4; yy < y + hh - 1; yy += 4) g.append(svg('line', { x1: x + 3, x2: x + w - 3, y1: yy, y2: yy, class: 'pmap__f' }));
  });
  return svg('svg', { viewBox: '0 0 100 70', class: 'pmap', focusable: 'false' }, g,
    svg('circle', { cx: 21, cy: 50, r: 5, class: 'pmap__pulse' }),
    svg('circle', { cx: 21, cy: 50, r: 4.2, fill: '#b83200', stroke: '#fff', 'stroke-width': 1.6 }),
    svg('circle', { cx: 21, cy: 50, r: 1.4, fill: '#fff' }));
}

// ── Escena 3 · día, hora, parcela, cuadrilla y voz ──
function sceneAgenda() {
  const base = addDays(todayLocal(), 1);
  const days = [0, 1, 2, 3, 4].map((n) => addDays(base, n));
  const slots = [['07:00', 0], ['09:30', 1], ['11:00', 0], ['14:00', 2], ['15:30', 0], ['16:30', 2]]; // 1 = elegido, 2 = ocupado
  return h('div', { class: 'scene scene--3', 'aria-hidden': 'true' },
    h('div', { class: 'papp__head' }, logo(22), h('strong', null, t('landing.phPick'))),
    h('div', { ...pa('psum', 0.1) }, h('span', { class: 'psv__ic', style: '--c:#375033' }, icon('leaf', 17)),
      h('span', { class: 'psv__t' }, h('strong', null, t('landing.sv1n')), h('small', null, t('landing.sv1m')))),
    h('div', { class: 'pmonth pa', style: '--dl:.1s' }, fmtDay(base, { month: 'long', year: 'numeric' })),
    h('div', { class: 'pdays' }, days.map((d, n) => h('span', { ...pa(`pday${n === 1 ? ' pday--pick' : ''}`, 0.2 + n * 0.08, '--pk:1.6s') },
      h('small', null, fmtDay(d, { weekday: 'short' }).replace('.', '')), h('b', null, fmtDay(d, { day: 'numeric' }))))),
    h('div', { class: 'ptimes' }, slots.map(([tm, st], n) => h('span', { ...pa(`ptime${st === 1 ? ' ptime--pick' : ''}${st === 2 ? ' ptime--busy' : ''}`, 0.7 + n * 0.08, '--pk:2.5s') }, fmtTime(tm)))),
    h('div', { ...pa('pplot', 1.3) }, plotMap(),
      h('span', { class: 'pplot__t' },
        h('small', null, t('landing.phPlotLbl')), h('strong', null, t('landing.phPlot')),
        h('small', { class: 'pplot__c' }, t('landing.phCrewLbl')),
        h('span', { class: 'pplot__crew' }, h('i', { style: '--c:#375033' }, 'N'), h('i', { style: '--c:#006bb8' }, 'M'), h('em', null, t('landing.phCrew'))))),
    h('div', { ...pa('pvoice', 1.6) }, h('span', { class: 'pvoice__mic' }, icon('mic', 16)),
      h('span', { class: 'pvoice__bars' }, [0, 1, 2, 3, 4, 5, 6, 7].map((n) => h('i', { style: `--n:${n}` }))), h('small', null, t('landing.phVoice'))),
    h('span', { ...pa('pbtn pbtn--confirm', 1.9, '--pr:3.6s') }, icon('check', 15), t('landing.phConfirm')));
}

// ── Escena 4 · confirmación con ticket y recordatorio ──
function sceneDone() {
  const day = addDays(todayLocal(), 2);
  const ring = svg('svg', { viewBox: '0 0 52 52', class: 'pdone__svg', focusable: 'false' },
    svg('circle', { cx: 26, cy: 26, r: 23, class: 'pdone__ring' }), svg('path', { d: 'M15 27l8 8 15-17', class: 'pdone__tick' }));
  const row = (l, v) => h('span', { class: 'ptk__c' }, h('small', null, l), h('b', null, v));
  const bars = svg('svg', { viewBox: '0 0 100 14', class: 'ptk__code', preserveAspectRatio: 'none', focusable: 'false' },
    ...Array.from({ length: 34 }, (_, i) => svg('rect', { x: i * 2.95, y: 0, width: [0.9, 1.6, 0.6, 1.3][(i * 7) % 4], height: 14 })));
  return h('div', { class: 'scene scene--4', 'aria-hidden': 'true' },
    h('div', { class: 'pdone' }, ring, h('strong', { ...pa('pdone__t', 1.0) }, t('landing.floatTitle'))),
    h('div', { ...pa('ptk', 1.3) },
      h('div', { class: 'ptk__top' },
        h('span', { class: 'ptk__ic' }, icon('leaf', 18)), h('span', { class: 'ptk__h' }, h('strong', null, t('landing.phSvc1')), h('small', null, t('landing.phBiz')))),
      h('div', { class: 'ptk__grid' },
        row(t('landing.phDateLbl'), fmtDay(day, { weekday: 'short', day: 'numeric', month: 'short' })), row(t('landing.phTimeLbl'), fmtTime('09:30')),
        row(t('landing.phCrewLbl'), t('landing.phCrew')), row(t('landing.phPlotLbl'), t('landing.phPlot'))),
      h('div', { class: 'ptk__cut', 'aria-hidden': 'true' }),
      h('div', { class: 'ptk__foot' }, bars, h('small', null, 'FF-2481'))),
    h('div', { ...pa('ptoast', 2.4) },
      h('span', { class: 'ptoast__ic' }, icon('chat', 17)),
      h('span', { class: 'ptoast__t' }, h('strong', null, t('landing.phNotif')), h('small', null, `${t('landing.phTomorrow')} · ${fmtTime('06:00')}`)),
      h('span', { class: 'ptoast__ok' }, icon('check', 13))));
}

// ── Escena 5 · panel del negocio ──
function scenePanel() {
  const base = addDays(todayLocal(), 1);
  const days = [0, 1, 2, 3, 4].map((n) => addDays(base, n));
  const ev = [[0, 8, 30, 'a'], [0, 52, 26, 'c'], [1, 22, 22, 'b'], [2, 14, 38, 'new'], [2, 64, 22, 'b'], [3, 40, 32, 'a'], [4, 10, 24, 'c'], [4, 58, 26, 'a']];
  const donut = svg('svg', { viewBox: '0 0 36 36', class: 'pstat__ring', focusable: 'false' },
    svg('circle', { cx: 18, cy: 18, r: 14, class: 'pstat__bg', pathLength: 100 }), svg('circle', { cx: 18, cy: 18, r: 14, class: 'pstat__fg', pathLength: 100 }));
  return h('div', { class: 'scene scene--5', 'aria-hidden': 'true' },
    h('div', { class: 'papp__head' }, logo(22), h('strong', null, t('landing.phPanel')), h('span', { class: 'papp__av' }, 'AL')),
    h('div', { class: 'pstats' },
      h('div', { ...pa('pstat', 0.2) }, h('b', null, '6'), h('small', null, t('landing.phStatBook'))),
      h('div', { ...pa('pstat', 0.35) }, h('b', null, '3'), h('small', null, t('landing.phStatCrew'))),
      h('div', { ...pa('pstat pstat--ring', 0.5) }, donut, h('b', null, '82%'), h('small', null, t('landing.phStatLoad')))),
    h('div', { ...pa('pcal', 0.7) },
      h('div', { class: 'pcal__head' }, icon('calendar', 14), t('landing.phCal'), h('span', { class: 'pcal__live' }, h('i'), t('landing.phOnline'))),
      h('div', { class: 'pcal__grid' }, days.map((d, n) => h('div', { class: 'pcal__col' },
        h('span', { class: 'pcal__d' }, h('small', null, fmtDay(d, { weekday: 'narrow' })), h('b', null, fmtDay(d, { day: 'numeric' }))),
        h('div', { class: 'pcal__lane' }, ev.filter((e) => e[0] === n).map(([, top, hh, k]) => h('span', { class: `pcal__ev pcal__ev--${k}`, style: `--t:${top}%;--hh:${hh}%` }, k === 'new' ? t('landing.phCrew') : null)))))),
      h('small', { class: 'pcal__note' }, t('landing.phInCal'))),
    h('div', { class: 'pnext' }, h('strong', { class: 'pnext__h' }, t('landing.phNext')),
      [['07:00', 1, '#375033'], ['11:00', 3, '#006bb8'], ['14:00', 7, '#8a4b2d']].map(([tm, k, c], n) => h('div', { ...pa('pnext__r', 2.6 + n * 0.2, `--c:${c}`) },
        h('i'), h('b', null, fmtTime(tm)), h('span', null, t(`landing.sv${k}n`))))));
}

/** Sección "Cómo funciona": pasos y teléfono (en el celular el teléfono queda fijo y la escena cambia con el scroll). */
export function buildStory() {
  const stepKeys = [1, 2, 3, 4, 5];
  const steps = stepKeys.map((n) => h('li', { class: 'story__li', 'data-reveal': String(Math.min(n, 4)) },
    h('button', { class: 'story__step', type: 'button' },
      h('span', { class: 'story__n', 'aria-hidden': 'true' }, `0${n}`),
      h('span', { class: 'story__txt' }, h('strong', null, t(`landing.s${n}t`)), h('span', { class: 'story__desc' }, t(`landing.s${n}d`))),
      h('span', { class: 'story__bar', 'aria-hidden': 'true' }, h('i')))));
  const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(2026, 0, 1, 9, 41));
  const phone = h('div', { class: 'phone', 'data-scene': '1', role: 'img', 'aria-label': t('landing.phLabel') },
    h('span', { class: 'phone__key phone__key--a', 'aria-hidden': 'true' }), h('span', { class: 'phone__key phone__key--b', 'aria-hidden': 'true' }),
    h('span', { class: 'phone__key phone__key--c', 'aria-hidden': 'true' }), h('span', { class: 'phone__key phone__key--p', 'aria-hidden': 'true' }),
    h('div', { class: 'phone__screen', 'aria-hidden': 'true' },
      h('div', { class: 'phone__status' }, h('b', null, clock), h('span', { class: 'phone__island' }), h('span', { class: 'phone__sig' }, h('i'), h('i'), h('i'), h('em'))),
      sceneWhatsApp(), sceneApp(), sceneAgenda(), sceneDone(), scenePanel(),
      h('span', { class: 'phone__home' })));
  // Sólo celular: texto del paso activo y puntos de avance debajo del teléfono fijo.
  const caps = stepKeys.map((n) => h('div', { class: 'story__capi' },
    h('span', { class: 'story__capn' }, `0${n}`), h('strong', null, t(`landing.s${n}t`)), h('p', null, t(`landing.s${n}d`))));
  const pips = stepKeys.map((n) => h('button', { class: 'story__pip', type: 'button', 'aria-label': t(`landing.s${n}t`) }, h('i')));
  const cap = h('div', { class: 'story__cap', 'aria-hidden': 'true' }, caps);
  const pipBar = h('div', { class: 'story__pips' }, pips);
  const el = h('section', { class: 'lsec story', id: 'how', 'aria-labelledby': 'how-t' },
    h('div', { class: 'lsec__head', 'data-reveal': '1' }, h('span', { class: 'eyebrow' }, t('landing.howEyebrow')), h('h2', { id: 'how-t' }, t('landing.how'))),
    h('div', { class: 'story__grid' },
      h('ol', { class: 'story__steps', 'aria-label': t('landing.phSteps') }, steps),
      h('div', { class: 'story__stage' }, h('div', { class: 'story__sticky' }, h('div', { class: 'story__glow', 'aria-hidden': 'true' }), phone), cap, pipBar)));
  return { el, phone, steps: steps.map((li) => li.firstChild), caps, pips };
}
