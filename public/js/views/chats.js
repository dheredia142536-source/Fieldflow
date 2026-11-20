// Bandeja de conversaciones: lista + detalle, con toma de control humana.
import { get, post } from '../api.js';
import { h, clear, toast, avatar, empty, busy } from '../ui.js';
import { icon, emptyArt } from '../icons.js';
import { t } from '../i18n.js';
import { state } from '../state.js';
import { fmtRelative } from '../time.js';
import { renderMessage } from '../components.js';

export default async function chats({ main, params, isCurrent }) {
  const activeId = params[0] || null;
  let rows = (await get('/api/staff/conversaciones')).conversaciones;
  if (!isCurrent()) return null;
  state.attention = rows.filter((r) => r.necesita_atencion).length;
  clear(main);

  const listEl = h('div', { class: 'inbox__list', role: 'list', 'aria-label': t('chats.list') });
  const detailEl = h('section', { class: 'inbox__detail', 'aria-label': t('chats.detail') });
  const wrap = h('div', { class: `inbox${activeId ? ' has-detail' : ''}` }, listEl, detailEl);

  const drawList = () => {
    clear(listEl);
    if (!rows.length) { listEl.append(empty({ art: emptyArt(), title: t('chats.emptyTitle'), text: t('chats.emptyText') })); return; }
    rows.forEach((r) => listEl.append(h('a', { class: `item${r.id === activeId ? ' item--active' : ''}`, role: 'listitem', href: `#/chats/${r.id}`, 'aria-current': r.id === activeId ? 'true' : null },
      avatar(r.nombre || r.telefono),
      h('div', { class: 'item__main' }, h('div', { class: 'item__title' }, r.nombre || `+${r.telefono}`), h('div', { class: 'item__sub' }, r.ultimo || '…')),
      h('div', { class: 'stack tight', style: 'justify-items:end' }, h('span', { class: 'item__meta' }, fmtRelative(r.ultimo_mensaje_en)),
        r.necesita_atencion ? h('span', { class: 'unread', role: 'img', 'aria-label': t('chats.needsAttention') }) : r.atendida_por === 'humano' ? h('span', { class: 'badge badge--info' }, t('chat.team')) : null))));
  };
  drawList();

  let timers = [];
  if (!activeId) {
    detailEl.append(h('div', { class: 'inbox__empty' }, empty({ art: emptyArt(), title: t('chats.pick'), text: t('chats.pickText') })));
    timers.push(setInterval(async () => { if (document.visibilityState !== 'visible') return; try { rows = (await get('/api/staff/conversaciones')).conversaciones; state.attention = rows.filter((r) => r.necesita_atencion).length; drawList(); } catch { /* reintenta */ } }, 8000));
  } else {
    let conv; let msgs = [];
    try { ({ conversacion: conv, mensajes: msgs } = await get(`/api/staff/conversaciones/${activeId}`)); } catch (e) { detailEl.append(h('p', { class: 'pad' }, e.message)); return null; }
    if (!isCurrent()) return null;

    const list = h('div', { class: 'chat__list', role: 'log', 'aria-live': 'polite', tabindex: '0', 'aria-label': t('chat.log') });
    const takeBtn = h('button', { class: 'btn btn--primary btn--sm', type: 'button' });
    const badge = h('span', { class: 'badge' });
    const ta = h('textarea', { rows: '1', 'aria-label': t('chats.reply'), placeholder: t('chats.reply'), maxlength: '1000', enterkeyhint: 'send' });
    const send = h('button', { class: 'btn btn--primary btn--icon', type: 'button', 'aria-label': t('chat.send') }, icon('send', 20));
    let lastKey = '';

    const paintHead = () => {
      const human = conv.atendida_por === 'humano';
      badge.className = `badge ${human ? 'badge--info' : 'badge--ok'}`; badge.textContent = t(human ? 'chats.byTeam' : 'chats.byBot');
      takeBtn.textContent = t(human ? 'chats.giveBack' : 'chats.take');
      takeBtn.className = `btn btn--sm ${human ? 'btn--secondary' : 'btn--primary'}`;
    };
    const paintMsgs = (force) => {
      const key = msgs.map((m) => m.id).join(',');
      if (!force && key === lastKey) return;
      lastKey = key;
      const near = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
      clear(list);
      msgs.forEach((m) => { const el = renderMessage(m, { readonly: true, staffView: true }); if (el) list.append(el); });
      if (near || force) requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
    };
    takeBtn.addEventListener('click', () => busy(takeBtn, async () => {
      try { await post(`/api/staff/conversaciones/${activeId}/${conv.atendida_por === 'humano' ? 'devolver' : 'tomar'}`, {}); conv.atendida_por = conv.atendida_por === 'humano' ? 'bot' : 'humano'; conv.necesita_atencion = false; const row = rows.find((r) => r.id === activeId); if (row) { row.atendida_por = conv.atendida_por; row.necesita_atencion = false; } paintHead(); drawList(); toast(t(conv.atendida_por === 'humano' ? 'chats.taken' : 'chats.returned')); } catch (e) { toast(e.message, true); }
    }));
    const doSend = () => busy(send, async () => {
      const text = ta.value.trim(); if (!text) return;
      try { const r = await post(`/api/staff/conversaciones/${activeId}/mensajes`, { texto: text }); ta.value = ''; msgs.push(r.mensaje); conv.atendida_por = 'humano'; paintHead(); paintMsgs(true); } catch (e) { toast(e.message, true); }
    });
    send.addEventListener('click', doSend);
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); doSend(); } });

    detailEl.append(
      h('div', { class: 'detailhead' },
        h('a', { class: 'btn btn--ghost btn--icon btn--sm only-sm-flex', href: '#/chats', 'aria-label': t('common.back') }, icon('left', 18)),
        avatar(conv.nombre || conv.telefono),
        h('div', { class: 'grow' }, h('strong', null, conv.nombre || `+${conv.telefono}`), h('div', { class: 'hint' }, `+${conv.telefono}`)),
        badge, takeBtn),
      list,
      h('div', { class: 'composer' }, ta, send));
    paintHead(); paintMsgs(true);
    if (conv.necesita_atencion) { /* se limpia al tomar o devolver */ }

    timers.push(setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const d = await get(`/api/staff/conversaciones/${activeId}`);
        msgs = d.mensajes; conv.atendida_por = d.conversacion.atendida_por; paintHead(); paintMsgs(false);
        rows = (await get('/api/staff/conversaciones')).conversaciones; drawList();
      } catch { /* reintenta */ }
    }, 4000));
  }
  main.append(wrap);
  return () => timers.forEach(clearInterval);
}
