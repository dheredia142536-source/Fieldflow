// "Más": accesos a bandeja y ajustes, preferencias y cierre de sesión (móvil).
import { post } from '../api.js';
import { h, langSwitch } from '../ui.js';
import { icon } from '../icons.js';
import { t, getLang, setLang } from '../i18n.js';
import { state } from '../state.js';
import { todayLocal } from '../time.js';
import { isIOS, isStandalone, canPrompt, promptInstall } from '../install.js';

export default function mas({ main, go, rerender, toggleTheme }) {
  const link = (href, ic, title, sub) => h('a', { class: 'item', href }, h('span', { class: 'avatar', 'aria-hidden': 'true' }, icon(ic, 20)), h('div', { class: 'item__main' }, h('div', { class: 'item__title' }, title), h('div', { class: 'item__sub' }, sub)), icon('right', 18));
  main.append(h('div', { class: 'stack--lg stack' },
    h('div', { class: 'pagehead' }, h('div', null, h('h1', null, t('nav.more')), h('p', null, state.staff?.correo || ''))),
    h('div', { class: 'list' },
      link('#/calendario', 'calendar', t('nav.calendar'), t('mas.calSub')),
      link('#/enlace', 'link', t('nav.link'), t('mas.linkSub')),
      link('#/terrenos', 'land', t('nav.land'), t('mas.landSub')),
      link('#/ganado', 'cow', t('nav.cattle'), t('mas.cattleSub')),
      link('#/chats', 'chat', t('nav.chats'), t('mas.chatsSub')),
      link(`#/dia/${todayLocal()}/cierre`, 'check', t('nav.closing'), t('mas.closeSub')),
      link('#/config', 'settings', t('nav.settings'), t('mas.settingsSub'))),
    h('section', { class: 'card card--surface stack' }, h('h2', { class: 'sectiontitle' }, t('mas.prefs')),
      h('div', { class: 'statusrow' }, h('span', null, t('common.language')), langSwitch(getLang(), (c) => { setLang(c); rerender(); })),
      h('div', { class: 'statusrow' }, h('span', null, t('common.theme')), h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: toggleTheme }, icon('moon', 16), t('common.toggleTheme'))),
      canPrompt() ? h('div', { class: 'statusrow' }, h('span', null, t('install.prompt')), h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: promptInstall }, t('install.cta'))) : null,
      isIOS() && !isStandalone() ? h('p', { class: 'hint' }, t('install.ios')) : null),
    h('button', { class: 'btn btn--danger btn--block', type: 'button', onclick: async () => { await post('/api/auth/logout', { rol: 'staff' }).catch(() => {}); state.staff = null; try { localStorage.removeItem('ff_hint'); } catch { /* ignora */ } go('#/'); } }, icon('logout', 18), t('nav.logout'))));
}
