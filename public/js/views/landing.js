// Portada pública: explica el flujo WhatsApp → app.
import { h, langSwitch } from '../ui.js';
import { icon, logo } from '../icons.js';
import { t, getLang, setLang } from '../i18n.js';
import { state } from '../state.js';

export default function landing({ main, rerender, toggleTheme }) {
  const wa = state.pub.whatsapp;
  const biz = state.pub.nombre || 'FieldFlow';
  const waLink = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(t('landing.waText'))}` : null;
  main.append(h('div', { class: 'authwrap', style: 'align-items:start' }, h('main', { class: 'landing', id: 'main' },
    h('header', { class: 'landing__top' }, h('span', { class: 'brand' }, logo(36), 'FieldFlow'),
      h('div', { class: 'row' }, langSwitch(getLang(), (c) => { setLang(c); rerender(); }),
        h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': t('common.toggleTheme'), onclick: toggleTheme }, icon('moon', 18)))),
    state.linkError ? h('div', { class: 'banner banner--warn', role: 'alert' }, icon('alert', 20), h('span', null, `${state.linkError} ${t('landing.linkHelp')}`)) : null,
    h('section', { class: 'hero' },
      h('h1', null, t('landing.title')),
      h('p', { class: 'lead' }, t('landing.lead', { biz })),
      h('div', { class: 'actions' },
        waLink ? h('a', { class: 'btn btn--primary', href: waLink, rel: 'noopener' }, icon('chat', 18), t('landing.cta')) : null,
        h('a', { class: 'btn btn--secondary', href: '#/negocio' }, icon('settings', 18), t('landing.staff')))),
    !waLink ? h('p', { class: 'hint center' }, t('landing.noWa')) : null,
    h('section', { 'aria-labelledby': 'how' }, h('h2', { class: 'sectiontitle', id: 'how' }, t('landing.how')),
      h('ol', { class: 'steps', style: 'list-style:none;padding:0' },
        [1, 2, 3].map((n) => h('li', { class: 'step' }, h('h3', null, t(`landing.s${n}t`)), h('p', null, t(`landing.s${n}d`)))))),
    h('footer', { class: 'hint center' }, t('landing.foot')))));
}
