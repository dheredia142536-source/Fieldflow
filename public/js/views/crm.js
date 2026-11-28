// CRM: contactos con embudo por etapas (tablero) o lista, ficha con historial y envío de correo.
import { get, post, patch, del } from '../api.js';
import { h, clear, avatar, openSheet, toast, busy, field, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';
import { t, getLang } from '../i18n.js';
import { fmtDay, fmtRelative, fmtWhen, todayLocal } from '../time.js';
import { seg, skel } from '../dui.js';
import { money, moneyShort } from '../fmt.js';

const ETAPAS = ['nuevo', 'contactado', 'cotizado', 'cerrado', 'perdido'];
const LOG = ['nota', 'llamada', 'visita', 'correo_recibido'];
const VIEW = 'ff_crm_view';
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const loc = () => (getLang() === 'en' ? 'en-US' : 'es-CO');
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const waLink = (tel) => `https://wa.me/${String(tel).replace(/\D+/g, '')}`;
const histIcon = { nota: 'edit', llamada: 'phone', visita: 'pin', correo_enviado: 'send', correo_recibido: 'mail', etapa: 'target' };

export default function crm({ main, go, params = [], isCurrent }) {
  let list = null; let q = ''; let view = 'board';
  try { view = localStorage.getItem(VIEW) === 'list' ? 'list' : 'board'; } catch { /* sin almacenamiento */ }
  const root = h('div', { class: 'd-page' });
  main.append(root);

  const matches = (c) => !q || norm(`${c.nombre} ${c.empresa} ${c.correo} ${c.telefono}`).includes(norm(q));
  const overdue = (c) => c.proxima_fecha && c.proxima_fecha <= todayLocal() && !['cerrado', 'perdido'].includes(c.etapa);

  async function load() {
    try { list = (await get('/api/staff/crm')).contactos; } catch (e) { if (!list) { clear(root); root.append(h('div', { class: 'empty' }, h('h3', null, t('err.generic')), h('p', null, e.message), h('button', { class: 'btn btn--primary', type: 'button', onclick: load }, t('common.retry')))); return; } }
    if (isCurrent()) paint();
  }

  async function move(c, etapa) {
    if (c.etapa === etapa) return;
    const prev = c.etapa; c.etapa = etapa; paint();
    try { await patch(`/api/staff/contactos/${c.id}`, { etapa }); } catch (e) { c.etapa = prev; paint(); toast(e.message, true); }
  }

  const sub = () => {
    const open = list.filter((c) => !['cerrado', 'perdido'].includes(c.etapa));
    return t('crm.sub', { n: list.length, v: moneyShort(open.reduce((a, c) => a + c.valor, 0)) });
  };

  function card(c) {
    const i = ETAPAS.indexOf(c.etapa);
    const el = h('article', { class: 'k-card', draggable: 'true', dataset: { id: c.id } },
      h('button', { class: 'k-card__main', type: 'button', onclick: () => openContact(c.id) },
        h('span', { class: 'k-card__top' }, avatar(c.nombre), h('span', { class: 'k-card__who' }, h('strong', null, c.nombre), c.empresa ? h('small', null, c.empresa) : null)),
        c.valor ? h('span', { class: 'k-card__val' }, money(c.valor)) : null,
        c.proxima_accion || c.proxima_fecha ? h('span', { class: `k-card__next${overdue(c) ? ' is-late' : ''}` }, icon('clock', 14), [c.proxima_accion, c.proxima_fecha ? fmtDay(c.proxima_fecha, { day: 'numeric', month: 'short' }) : ''].filter(Boolean).join(' · ')) : null),
      h('div', { class: 'k-card__foot' },
        h('span', { class: 'k-card__ch' }, c.correo ? icon('mail', 14) : null, c.telefono ? icon('phone', 14) : null),
        h('span', { class: 'k-card__mv' },
          h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', disabled: i === 0, 'aria-label': t('crm.moveBack'), onclick: () => move(c, ETAPAS[i - 1]) }, icon('left', 14)),
          h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', disabled: i === ETAPAS.length - 1, 'aria-label': t('crm.moveNext'), onclick: () => move(c, ETAPAS[i + 1]) }, icon('right', 14)))));
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('is-drag'); });
    el.addEventListener('dragend', () => el.classList.remove('is-drag'));
    return el;
  }

  function board() {
    return h('div', { class: 'k-board', role: 'list' }, ETAPAS.map((e) => {
      const items = list.filter((c) => c.etapa === e && matches(c));
      const col = h('section', { class: `k-col st-${e}`, role: 'listitem', 'aria-label': t(`crm.st_${e}`) },
        h('header', { class: 'k-col__head' }, h('h2', null, h('i', { class: 'k-dot' }), t(`crm.st_${e}`)), h('span', { class: 'k-col__n' }, String(items.length)), items.length ? h('span', { class: 'k-col__v' }, moneyShort(items.reduce((a, c) => a + c.valor, 0))) : null),
        h('div', { class: 'k-col__body' }, items.length ? items.map(card) : h('p', { class: 'k-col__empty' }, t('crm.emptyCol'))));
      col.addEventListener('dragover', (ev) => { ev.preventDefault(); col.classList.add('is-over'); });
      col.addEventListener('dragleave', (ev) => { if (!col.contains(ev.relatedTarget)) col.classList.remove('is-over'); });
      col.addEventListener('drop', (ev) => { ev.preventDefault(); col.classList.remove('is-over'); const c = list.find((x) => x.id === ev.dataTransfer.getData('text/plain')); if (c) move(c, e); });
      return col;
    }));
  }

  function rows() {
    const items = list.filter(matches);
    if (!items.length) return h('p', { class: 'd-calm' }, t('crm.noMatch'));
    return h('ul', { class: 'k-list' }, items.map((c) => h('li', null, h('button', { class: 'k-row', type: 'button', onclick: () => openContact(c.id) },
      avatar(c.nombre), h('span', { class: 'k-row__main' }, h('strong', null, c.nombre), h('small', null, [c.empresa, c.correo || (c.telefono ? `+${c.telefono}` : '')].filter(Boolean).join(' · '))),
      h('span', { class: `k-stage st-${c.etapa}` }, h('i', { class: 'k-dot' }), t(`crm.st_${c.etapa}`)),
      h('span', { class: 'k-row__val' }, c.valor ? moneyShort(c.valor) : ''),
      h('span', { class: `k-row__next${overdue(c) ? ' is-late' : ''}` }, c.proxima_fecha ? fmtDay(c.proxima_fecha, { day: 'numeric', month: 'short' }) : '—')))));
  }

  function paint() {
    const y = window.scrollY; const focusSearch = document.activeElement?.id === 'crm-q';
    clear(root);
    const search = h('input', { id: 'crm-q', class: 'input d-search', type: 'search', placeholder: t('crm.search'), 'aria-label': t('crm.search'), value: q, autocomplete: 'off' });
    search.addEventListener('input', () => { q = search.value; paintBody(); });
    root.append(
      h('header', { class: 'd-head' }, h('div', null, h('h1', null, t('nav.crm')), h('p', null, list ? sub() : '')),
        h('div', { class: 'd-head__act' }, h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: () => openEdit(null) }, icon('plus', 16), t('crm.add')))),
      h('div', { class: 'd-toolbar' }, search, seg([{ id: 'board', label: t('crm.vBoard') }, { id: 'list', label: t('crm.vList') }], view, (v) => { view = v; try { localStorage.setItem(VIEW, v); } catch { /* ok */ } paint(); }, { label: t('crm.view') })),
      h('div', { id: 'crm-body' }));
    paintBody();
    if (focusSearch) { const s = root.querySelector('#crm-q'); s.focus(); s.setSelectionRange(q.length, q.length); }
    window.scrollTo(0, y);
  }
  function paintBody() {
    const body = root.querySelector('#crm-body'); if (!body) return;
    clear(body);
    if (!list.length) { body.append(h('div', { class: 'empty' }, h('h3', null, t('crm.emptyTitle')), h('p', null, t('crm.emptyText')), h('button', { class: 'btn btn--primary', type: 'button', onclick: () => openEdit(null) }, icon('plus', 16), t('crm.add')))); return; }
    body.append(view === 'board' ? board() : rows());
  }

  // ── Crear / editar ────────────────────────────────────────────────────────────────────────────
  function openEdit(c, after) {
    const d = c || { nombre: '', empresa: '', correo: '', telefono: '', valor: 0, etapa: 'nuevo', proxima_accion: '', proxima_fecha: '', notas: '' };
    const x = {
      nombre: h('input', { class: 'input', value: d.nombre, maxlength: '120', autocomplete: 'off', autofocus: true }),
      empresa: h('input', { class: 'input', value: d.empresa, maxlength: '120', autocomplete: 'off' }),
      correo: h('input', { class: 'input', type: 'email', inputmode: 'email', value: d.correo, maxlength: '160', autocomplete: 'off', autocapitalize: 'none' }),
      telefono: h('input', { class: 'input', type: 'tel', inputmode: 'tel', value: d.telefono, maxlength: '40', autocomplete: 'off' }),
      valor: h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: '0', step: '1000', value: d.valor || '' }),
      etapa: h('select', { class: 'select' }, ETAPAS.map((e) => h('option', { value: e, selected: e === d.etapa }, t(`crm.st_${e}`)))),
      acc: h('input', { class: 'input', value: d.proxima_accion, maxlength: '160', placeholder: t('crm.nextPh') }),
      fecha: h('input', { class: 'input', type: 'date', value: d.proxima_fecha }),
      notas: h('textarea', { class: 'textarea', maxlength: '2000' }),
    };
    x.notas.value = d.notas || '';
    const save = h('button', { class: 'btn btn--primary', type: 'button' }, t('common.save'));
    const sh = openSheet({
      title: c ? t('crm.edit') : t('crm.add'),
      body: h('div', null, field(t('crm.name'), x.nombre), h('div', { class: 'grid2' }, field(t('crm.company'), x.empresa), field(t('crm.value'), x.valor)),
        h('div', { class: 'grid2' }, field(t('crm.email'), x.correo), field(t('crm.phone'), x.telefono)), field(t('crm.stage'), x.etapa),
        h('div', { class: 'grid2' }, field(t('crm.next'), x.acc), field(t('crm.nextDate'), x.fecha)), field(t('crm.notes'), x.notas)),
      foot: [save],
    });
    save.addEventListener('click', () => busy(save, async () => {
      const b = { nombre: x.nombre.value, empresa: x.empresa.value, correo: x.correo.value, telefono: x.telefono.value, valor: Number(x.valor.value) || 0, etapa: x.etapa.value, proxima_accion: x.acc.value, proxima_fecha: x.fecha.value, notas: x.notas.value };
      try { if (c) await patch(`/api/staff/contactos/${c.id}`, b); else await post('/api/staff/contactos', b); toast(t('common.saved')); sh.close(); await load(); after?.(); } catch (e) { toast(e.message, true); }
    }));
  }

  // ── Ficha del contacto ────────────────────────────────────────────────────────────────────────
  async function openContact(id) {
    const holder = h('div', null, skel('d-skel--row'), skel('d-skel--row'));
    const sh = openSheet({ title: t('crm.contact'), body: holder });
    const render = async () => {
      let r;
      try { r = await get(`/api/staff/contactos/${id}`); } catch (e) { toast(e.message, true); sh.close(); return; }
      const c = r.contacto;
      const kind = h('select', { class: 'select', 'aria-label': t('crm.logType') }, LOG.map((k) => h('option', { value: k }, t(`crm.h_${k}`))));
      const text = h('textarea', { class: 'textarea', maxlength: '5000', placeholder: t('crm.logPh'), 'aria-label': t('crm.logPh') });
      const add = h('button', { class: 'btn btn--secondary btn--sm', type: 'button' }, icon('plus', 16), t('crm.logAdd'));
      add.addEventListener('click', () => busy(add, async () => {
        if (!text.value.trim()) return;
        try { await post(`/api/staff/contactos/${id}/historial`, { tipo: kind.value, cuerpo: text.value }); await render(); await load(); } catch (e) { toast(e.message, true); }
      }));
      const stageSeg = h('div', { class: 'k-stages', role: 'group', 'aria-label': t('crm.stage') }, ETAPAS.map((e) => {
        const b = h('button', { type: 'button', class: `k-stagebtn st-${e}`, 'aria-pressed': String(c.etapa === e) }, h('i', { class: 'k-dot' }), t(`crm.st_${e}`));
        b.addEventListener('click', async () => { try { await patch(`/api/staff/contactos/${id}`, { etapa: e }); await render(); await load(); } catch (er) { toast(er.message, true); } });
        return b;
      }));
      clear(holder);
      holder.append(
        h('div', { class: 'k-sheethead' }, avatar(c.nombre, 'avatar--lg'), h('div', null, h('h3', null, c.nombre), h('p', null, [c.empresa, c.valor ? money(c.valor) : ''].filter(Boolean).join(' · ')))),
        stageSeg,
        h('div', { class: 'k-actions' },
          c.telefono ? h('a', { class: 'btn btn--secondary btn--sm', href: `tel:${c.telefono}` }, icon('phone', 16), t('crm.call')) : null,
          c.telefono ? h('a', { class: 'btn btn--secondary btn--sm', href: waLink(c.telefono), target: '_blank', rel: 'noopener noreferrer' }, icon('chat', 16), 'WhatsApp') : null,
          c.correo ? h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: () => compose(c, render) }, icon('mail', 16), t('crm.sendMail')) : null,
          r.conversacion_id ? h('a', { class: 'btn btn--secondary btn--sm', href: '#/chats', onclick: () => sh.close() }, icon('chat', 16), t('crm.openChat')) : null,
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { sh.close(); openEdit(c); } }, icon('edit', 16), t('crm.edit'))),
        h('dl', { class: 'kv' },
          h('dt', null, t('crm.email')), h('dd', null, c.correo ? h('a', { href: `mailto:${c.correo}` }, c.correo) : '—'),
          h('dt', null, t('crm.phone')), h('dd', null, c.telefono ? h('a', { href: `tel:${c.telefono}` }, c.telefono) : '—'),
          h('dt', null, t('crm.next')), h('dd', null, [c.proxima_accion, c.proxima_fecha ? fmtDay(c.proxima_fecha, { day: 'numeric', month: 'long' }) : ''].filter(Boolean).join(' · ') || '—'),
          c.notas ? [h('dt', null, t('crm.notes')), h('dd', null, c.notas)] : null),
        r.citas.length ? h('section', { class: 'k-sec' }, h('h4', null, t('crm.appointments')), h('ul', { class: 'k-hist' }, r.citas.slice(0, 5).map((a) => h('li', null, h('span', { class: 'k-hist__ic' }, icon('calendar', 16)), h('div', null, h('strong', null, getLang() === 'en' ? a.en : a.es), h('small', null, `${fmtWhen(a.inicio)} · ${t(`status.${a.estado}`)}`)))))) : null,
        h('section', { class: 'k-sec' }, h('h4', null, t('crm.history')), h('div', { class: 'k-log' }, kind, text, add),
          r.historial.length ? h('ul', { class: 'k-hist' }, r.historial.map((x) => h('li', null, h('span', { class: 'k-hist__ic' }, icon(histIcon[x.tipo] || 'edit', 16)),
            h('div', null, h('strong', null, x.tipo === 'etapa' ? `${t('crm.h_etapa')}: ${x.asunto.split(' → ').map((s) => t(`crm.st_${s}`)).join(' → ')}` : x.asunto || t(`crm.h_${x.tipo}`)), x.cuerpo ? h('p', null, x.cuerpo) : null, h('small', null, `${t(`crm.h_${x.tipo}`)} · ${fmtRelative(x.en)}`))))) : h('p', { class: 'd-calm' }, t('crm.noHistory'))),
        h('button', { class: 'btn btn--danger btn--sm', type: 'button', onclick: async () => { if (await confirmDialog({ title: t('crm.delete'), text: t('crm.deleteText', { n: c.nombre }), okLabel: t('crm.delete'), danger: true })) { try { await del(`/api/staff/contactos/${id}`); sh.close(); await load(); } catch (e) { toast(e.message, true); } } } }, icon('x', 16), t('crm.delete')));
    };
    render();
  }

  function compose(c, done) {
    const subj = h('input', { class: 'input', maxlength: '200', autofocus: true, autocomplete: 'off' });
    const body = h('textarea', { class: 'textarea', maxlength: '8000', rows: '8' });
    const send = h('button', { class: 'btn btn--primary', type: 'button' }, icon('send', 16), t('crm.send'));
    const sh = openSheet({ title: t('crm.sendMail'), body: h('div', null, field(t('crm.to'), h('input', { class: 'input', value: c.correo, readonly: true })), field(t('crm.subject'), subj), field(t('crm.message'), body), h('p', { class: 'hint' }, t('crm.replyHint'))), foot: [send] });
    send.addEventListener('click', () => busy(send, async () => {
      try { await post(`/api/staff/contactos/${c.id}/correo`, { asunto: subj.value, cuerpo: body.value }); toast(t('crm.sent')); sh.close(); await done(); await load(); } catch (e) { toast(e.status === 503 ? t('crm.mailOff') : e.message, true); }
    }));
  }

  root.append(h('div', { class: 'd-head' }, h('div', null, h('h1', null, t('nav.crm')))), h('div', { class: 'k-board' }, [0, 1, 2].map(() => skel('d-skel--chart'))));
  load().then(() => { if (params[0] === 'nuevo' && isCurrent()) { history.replaceState(null, '', '#/crm'); openEdit(null); } });
}
