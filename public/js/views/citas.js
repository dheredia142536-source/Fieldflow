// Mis citas (cliente): próximas e historial, con cancelar y reprogramar.
import { get, post } from '../api.js';
import { h, clear, toast, confirmDialog, busy, empty } from '../ui.js';
import { icon, emptyArt } from '../icons.js';
import { t, getLang } from '../i18n.js';
import { state } from '../state.js';
import { fmtWhen } from '../time.js';
import { statusBadge, svcLabel, parcelColor } from '../components.js';
import { canPrompt, promptInstall, isIOS, isStandalone } from '../install.js';

export default async function citasView({ main, go, rerender, isCurrent, toggleTheme }) {
  const { citas } = await get('/api/client/citas');
  if (!isCurrent()) return null;
  clear(main);
  const now = Date.now();
  const upcoming = citas.filter((c) => c.estado !== 'cancelada' && new Date(c.fin).getTime() >= now);
  const past = citas.filter((c) => !upcoming.includes(c)).reverse();
  const lang = getLang();

  const card = (c, canAct) => {
    const cancel = h('button', { class: 'btn btn--danger btn--sm', type: 'button' }, t('citas.cancel'));
    const resched = h('button', { class: 'btn btn--secondary btn--sm', type: 'button' }, t('citas.resched'));
    cancel.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: t('citas.cancelTitle'), text: `${svcLabel(c, lang)} · ${fmtWhen(c.inicio)}`, okLabel: t('citas.cancelYes'), danger: true }))) return;
      await busy(cancel, async () => { try { await post(`/api/client/citas/${c.id}/cancelar`, {}); toast(t('citas.cancelled')); rerender(); } catch (e) { toast(e.message, true); } });
    });
    resched.addEventListener('click', () => {
      try { sessionStorage.setItem('ff_pending', JSON.stringify({ texto: t('citas.reschedMsg'), payload: `resched:${c.id}` })); } catch { /* sin almacenamiento */ }
      go('#/chat');
    });
    return h('article', { class: `pcard${c.estado === 'cancelada' ? ' pcard--cancel' : ''}`, style: `--p:${parcelColor(c.servicio_id)}` },
      h('span', { class: 'pcard__bar' }),
      h('div', { class: 'item__main' },
        h('div', { class: 'item__title' }, svcLabel(c, lang)),
        h('div', { class: 'item__sub' }, fmtWhen(c.inicio)),
        h('div', { class: 'item__sub' }, c.recurso_nombre),
        h('div', { class: 'row mt' }, statusBadge(c.estado), canAct ? [resched, cancel] : null)));
  };

  const prefs = h('section', { class: 'card card--surface stack', 'aria-labelledby': 'prefs' },
    h('h2', { class: 'sectiontitle', id: 'prefs' }, t('citas.prefs')),
    h('p', { class: 'muted' }, state.client?.nombre ? t('citas.hello', { name: state.client.nombre }) : t('citas.helloAnon')),
    h('div', { class: 'row' },
      canPrompt() ? h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: promptInstall }, icon('download', 16), t('install.cta')) : null,
      h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: toggleTheme }, icon('moon', 16), t('common.toggleTheme')),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: async () => { await post('/api/auth/logout', { rol: 'client' }).catch(() => {}); state.client = null; go('#/'); } }, icon('logout', 16), t('citas.signOut'))),
    isIOS() && !isStandalone() ? h('p', { class: 'hint' }, t('install.ios')) : null);

  main.append(h('div', { class: 'stack--lg stack' },
    h('div', { class: 'pagehead' }, h('div', null, h('h1', null, t('citas.title')), h('p', null, t('citas.subtitle'))),
      h('a', { class: 'btn btn--primary', href: '#/chat' }, icon('plus', 18), t('citas.new'))),
    upcoming.length
      ? h('section', { 'aria-labelledby': 'up' }, h('h2', { class: 'sectiontitle', id: 'up' }, t('citas.upcoming')), h('div', { class: 'list' }, upcoming.map((c) => card(c, true))))
      : empty({ art: emptyArt(), title: t('citas.emptyTitle'), text: t('citas.emptyText'), action: h('a', { class: 'btn btn--primary', href: '#/chat' }, t('citas.new')) }),
    past.length ? h('section', { 'aria-labelledby': 'hist' }, h('h2', { class: 'sectiontitle', id: 'hist' }, t('citas.history')), h('div', { class: 'list' }, past.slice(0, 20).map((c) => card(c, false)))) : null,
    prefs));
  return null;
}
