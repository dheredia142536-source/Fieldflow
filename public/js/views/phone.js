// Teléfono animado de la portada: cuatro escenas que explican el flujo (mensaje → app → agenda → calendario).
// Todo es HTML/CSS (no hay imágenes): se traduce, es nítido en cualquier pantalla y respeta "reducir movimiento".
import { h } from '../ui.js';
import { icon, logo } from '../icons.js';
import { t } from '../i18n.js';
import { addDays, fmtDay, fmtTime, todayLocal } from '../time.js';

const bubble = (cls, text, i) => h('p', { class: `pb ${cls}`, style: `--i:${i}` }, text);

function sceneWhatsApp() {
  return h('div', { class: 'scene scene--1', 'aria-hidden': 'true' },
    h('div', { class: 'pchat__head' }, h('span', { class: 'pchat__av' }, logo(22)), h('span', null, h('strong', null, 'FieldFlow'), h('small', null, t('landing.phOnline')))),
    h('div', { class: 'pchat__body' },
      bubble('pb--out', t('landing.phMsg1'), 1),
      h('p', { class: 'pb pb--in pb--typing', style: '--i:2' }, h('i'), h('i'), h('i')),
      bubble('pb--in pb--late', t('landing.phBot1'), 3),
      h('span', { class: 'pbtn', style: '--i:4' }, icon('link', 16), t('landing.phOpen'))));
}

function sceneApp() {
  const svc = ['landing.phSvc1', 'landing.phSvc2', 'landing.phSvc3'];
  return h('div', { class: 'scene scene--2', 'aria-hidden': 'true' },
    h('div', { class: 'papp__head' }, logo(22), h('strong', null, t('landing.phAssistant'))),
    h('div', { class: 'pchat__body' },
      bubble('pb--in', t('landing.phAsk'), 1),
      h('div', { class: 'pchips' }, svc.map((k, n) => h('span', { class: `pchip${n === 0 ? ' pchip--pick' : ''}`, style: `--i:${n + 2}` }, t(k)))),
      bubble('pb--out pb--late', t(svc[0]), 6)));
}

function sceneAgenda() {
  const base = addDays(todayLocal(), 1);
  const days = [0, 1, 2, 3, 4].map((n) => addDays(base, n));
  const times = ['07:00', '09:30', '11:00', '14:00'];
  return h('div', { class: 'scene scene--3', 'aria-hidden': 'true' },
    h('div', { class: 'papp__head' }, logo(22), h('strong', null, t('landing.phPick'))),
    h('div', { class: 'pdays' }, days.map((d, n) => h('span', { class: `pday${n === 1 ? ' pday--pick' : ''}`, style: `--i:${n + 1}` },
      h('small', null, fmtDay(d, { weekday: 'short' }).replace('.', '')), h('b', null, fmtDay(d, { day: 'numeric' }))))),
    h('div', { class: 'ptimes' }, times.map((tm, n) => h('span', { class: `ptime${n === 0 ? ' ptime--pick' : ''}`, style: `--i:${n + 4}` }, fmtTime(tm)))),
    h('div', { class: 'pvoice', style: '--i:8' }, h('span', { class: 'pvoice__mic' }, icon('mic', 18)),
      h('span', { class: 'pvoice__bars' }, [0, 1, 2, 3, 4, 5, 6].map((n) => h('i', { style: `--n:${n}` }))), h('small', null, t('landing.phVoice'))),
    h('span', { class: 'pbtn pbtn--confirm', style: '--i:9' }, icon('check', 16), t('landing.phConfirm')));
}

function sceneDone() {
  const day = addDays(todayLocal(), 2);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 52 52'); svg.setAttribute('class', 'pdone__svg');
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', '26'); c.setAttribute('cy', '26'); c.setAttribute('r', '23'); c.setAttribute('class', 'pdone__ring');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'M15 27l8 8 15-17'); p.setAttribute('class', 'pdone__tick');
  svg.append(c, p);
  return h('div', { class: 'scene scene--4', 'aria-hidden': 'true' },
    h('div', { class: 'pdone' }, svg,
      h('strong', { class: 'pdone__t' }, t('landing.floatTitle')),
      h('span', { class: 'pdone__s' }, `${t('landing.phSvc1')} · ${fmtDay(day, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime('09:30')}`)),
    h('div', { class: 'pcal', style: '--i:3' },
      h('div', { class: 'pcal__head' }, icon('calendar', 14), t('landing.phCal')),
      h('div', { class: 'pcal__grid' },
        [1, 2, 3, 4, 5].map((n) => h('div', { class: 'pcal__col' },
          n === 3 ? h('span', { class: 'pcal__ev pcal__ev--new' }, t('landing.phCrew')) : null,
          n === 1 ? h('span', { class: 'pcal__ev pcal__ev--a' }) : null,
          n === 2 ? h('span', { class: 'pcal__ev pcal__ev--b' }) : null,
          n === 4 ? h('span', { class: 'pcal__ev pcal__ev--c' }) : null,
          n === 5 ? h('span', { class: 'pcal__ev pcal__ev--a' }) : null))),
      h('small', { class: 'pcal__note' }, t('landing.phInCal'))));
}

/** Sección "Cómo funciona": pasos a la izquierda y teléfono a la derecha. */
export function buildStory() {
  const stepKeys = [1, 2, 3, 4];
  const steps = stepKeys.map((n) => h('li', { class: 'story__li', 'data-reveal': String(n) },
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
      sceneWhatsApp(), sceneApp(), sceneAgenda(), sceneDone(),
      h('span', { class: 'phone__home' })));
  const el = h('section', { class: 'lsec story', id: 'how', 'aria-labelledby': 'how-t' },
    h('div', { class: 'lsec__head', 'data-reveal': '1' }, h('span', { class: 'eyebrow' }, t('landing.howEyebrow')), h('h2', { id: 'how-t' }, t('landing.how'))),
    h('div', { class: 'story__grid' },
      h('ol', { class: 'story__steps', 'aria-label': t('landing.phSteps') }, steps),
      h('div', { class: 'story__stage', 'data-reveal': '2' }, h('div', { class: 'story__sticky' }, h('div', { class: 'story__glow', 'aria-hidden': 'true' }), phone))));
  return { el, phone, steps: steps.map((li) => li.firstChild) };
}
