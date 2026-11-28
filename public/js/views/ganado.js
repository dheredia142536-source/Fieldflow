// Ganado: hato, pesajes, sanidad (con avisos), reproducción (parto probable), leche y ventas.
import { get, post, del } from '../api.js';
import { h, clear, openSheet, toast, busy, field, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';
import { t, getLang } from '../i18n.js';
import { addDays, fmtDay, todayLocal } from '../time.js';
import { seg, skel, kpi } from '../dui.js';
import { money, qty, int } from '../fmt.js';
import { resizeOne } from '../img.js';

// append que ignora null/false (Node.append escribiría la palabra «null»)
const put = (el, ...kids) => el.append(...kids.flat(Infinity).filter((k) => k != null && k !== false));
const TABS = ['resumen', 'hato', 'salud', 'repro', 'leche'];
const CATS = ['ternera', 'ternero', 'novilla', 'novillo', 'vaca', 'toro', 'buey'];
const dayShort = (ymd) => fmtDay(ymd, { day: 'numeric', month: 'short' });
// Iniciales o últimos dígitos del arete para el círculo de cada animal
const tagOf = (a) => (a.nombre ? a.nombre.trim().slice(0, 2) : String(a.arete || '?').slice(-3)).toUpperCase();
const label = (a) => [a.arete, a.nombre].filter(Boolean).join(' · ');
const ageText = (m) => (m == null ? '' : m < 24 ? t('ga.months', { n: m }) : t('ga.years', { n: (m / 12).toFixed(1).replace(/\.0$/, '') }));
const whenText = (dias) => (dias === -1 ? t('ga.yesterday') : dias < 0 ? t('ga.overdue', { n: -dias }) : dias === 0 ? t('ga.today') : dias === 1 ? t('ga.tomorrow') : t('ga.inDays', { n: dias }));
const num = (el) => (el.value === '' ? null : Number(el.value));
const segSet = (wrap, id) => wrap.querySelectorAll('button').forEach((b) => { const on = b.dataset.id === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });

export default function ganado({ main, params, go, isCurrent }) {
  let tab = TABS.includes(params[0]) ? params[0] : 'resumen';
  let G = null; const S = { q: '', estado: 'activo', cat: '', lote: '' };
  const root = h('div', { class: 'd-page' }); main.append(root);
  const lotes = () => [...new Set((G?.animales || []).map((a) => a.lote).filter(Boolean))].sort();
  const reload = async () => { try { G = await get('/api/staff/ganado'); if (isCurrent()) paint(); } catch (e) { toast(e.message, true); } };
  const act = (fn, ok) => async () => { try { await fn(); if (ok) toast(ok); await reload(); } catch (e) { toast(e.message, true); } };

  // ── Elegir animal ───────────────────────────────────────────────────────────────────────────
  function pickAnimal(filter, onPick, title) {
    const q = h('input', { class: 'input', type: 'search', placeholder: t('ga.searchAnimal'), autofocus: true, 'aria-label': t('ga.searchAnimal'), autocomplete: 'off' });
    const box = h('ul', { class: 'ga-pick' });
    let sh;
    const fill = () => {
      clear(box); const s = q.value.trim().toLowerCase();
      const list = G.animales.filter((a) => a.estado === 'activo' && filter(a) && (!s || label(a).toLowerCase().includes(s))).slice(0, 60);
      put(box, ...(list.length ? list.map((a) => h('li', null, h('button', { class: 'ga-pick__it', type: 'button', onclick: () => { sh.close(); onPick(a); } }, h('span', { class: 'avatar' }, tagOf(a)), h('span', null, h('strong', null, label(a)), h('small', null, `${t(`ga.cat_${a.categoria}`)}${a.lote ? ` · ${a.lote}` : ''}`))))) : [h('li', { class: 'd-calm' }, t('ga.noAnimals'))]));
    };
    q.addEventListener('input', fill);
    sh = openSheet({ title, body: h('div', null, h('div', { class: 'field' }, q), box) });
    fill();
  }

  // ── Formulario de animal ───────────────────────────────────────────────────────────────────
  function animalForm(a, done) {
    const d = a || { arete: '', nombre: '', sexo: 'hembra', raza: '', nacimiento: '', categoria: '', lote: '', madre: '', padre: '', peso: '', compra_fecha: '', compra_precio: '', notas: '' };
    let sexo = d.sexo;
    const newId = a ? null : (crypto.randomUUID ? crypto.randomUUID() : null); // un reintento no duplica el animal
    const f = {
      arete: h('input', { class: 'input', value: d.arete, maxlength: '40', autofocus: true, autocomplete: 'off', placeholder: 'A-001' }),
      nombre: h('input', { class: 'input', value: d.nombre, maxlength: '80', autocomplete: 'off', placeholder: 'Luna' }),
      raza: h('input', { class: 'input', value: d.raza, maxlength: '60', autocomplete: 'off', placeholder: 'Holstein, Brahman…' }),
      nac: h('input', { class: 'input', type: 'date', value: d.nacimiento, max: todayLocal() }),
      cat: h('select', { class: 'select' }, h('option', { value: '' }, t('ga.autoCat')), CATS.map((c) => h('option', { value: c }, t(`ga.cat_${c}`)))),
      lote: h('input', { class: 'input', value: d.lote, maxlength: '60', list: 'ga-lotes', autocomplete: 'off', placeholder: t('ga.lotePh') }),
      madre: h('input', { class: 'input', value: d.madre, maxlength: '60', autocomplete: 'off' }), padre: h('input', { class: 'input', value: d.padre, maxlength: '60', autocomplete: 'off' }),
      peso: h('input', { class: 'input', type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: a ? '' : d.peso }),
      cf: h('input', { class: 'input', type: 'date', value: d.compra_fecha, max: todayLocal() }), cp: h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: '0', step: '10000', value: d.compra_precio || '' }),
      notas: h('textarea', { class: 'textarea', rows: '3', maxlength: '1500' }),
    };
    f.cat.value = d.categoria || ''; f.notas.value = d.notas || '';
    const sx = seg([{ id: 'hembra', label: t('ga.female') }, { id: 'macho', label: t('ga.male') }], sexo, (id) => { sexo = id; segSet(sx, id); }, { label: t('ga.sex'), cls: 'seg--full' });
    const save = h('button', { class: 'btn btn--primary', type: 'button' }, t('common.save'));
    const sh = openSheet({
      title: a ? t('ga.editAnimal') : t('ga.newAnimal'),
      body: h('div', null, h('datalist', { id: 'ga-lotes' }, lotes().map((l) => h('option', { value: l }))),
        h('section', { class: 'fsec' }, h('h3', null, t('ga.sId')), h('div', { class: 'grid2' }, field(t('ga.tag'), f.arete), field(t('ga.name'), f.nombre)), h('div', { class: 'field' }, h('span', { class: 'label' }, t('ga.sex')), sx), h('div', { class: 'grid2' }, field(t('ga.breed'), f.raza), field(t('ga.birth'), f.nac)),
          h('div', { class: 'grid2' }, field(t('ga.category'), f.cat), field(t('ga.lote'), f.lote))),
        h('section', { class: 'fsec' }, h('h3', null, t('ga.sOrigin')), h('div', { class: 'grid2' }, field(t('ga.mother'), f.madre), field(t('ga.father'), f.padre)), a ? null : field(t('ga.weightNow'), f.peso, t('ga.weightHint')),
          h('div', { class: 'grid2' }, field(t('ga.buyDate'), f.cf), field(t('ga.buyPrice'), f.cp))),
        h('section', { class: 'fsec' }, field(t('ga.notes'), f.notas))),
      foot: [save],
    });
    save.addEventListener('click', () => busy(save, async () => {
      try {
        const r = await post('/api/staff/ganado/animales', { id: a?.id || newId || undefined, arete: f.arete.value, nombre: f.nombre.value, sexo, raza: f.raza.value, nacimiento: f.nac.value, categoria: f.cat.value || null, lote: f.lote.value, madre: f.madre.value, padre: f.padre.value, peso: a ? undefined : num(f.peso), compra_fecha: f.cf.value, compra_precio: num(f.cp) || 0, notas: f.notas.value, estado: a?.estado }, { retry: true });
        sh.close(); toast(t('common.saved')); await done(r.id);
      } catch (e) { toast(e.message, true); }
    }));
  }

  // ── Registrar un evento (peso, sanidad, monta, parto, leche, venta…) ──────────────────────
  function eventSheet(tipo, a, done) {
    const hoy = todayLocal();
    const evId = crypto.randomUUID ? crypto.randomUUID() : undefined; // un reintento no repite el registro
    const fecha = h('input', { class: 'input', type: 'date', value: hoy, max: hoy, 'aria-label': t('ga.date') });
    const x = {
      valor: h('input', { class: 'input', type: 'number', inputmode: 'decimal', step: 'any', min: '0', autofocus: true }),
      producto: h('input', { class: 'input', maxlength: '100', autocomplete: 'off', placeholder: tipo === 'vacuna' ? t('ga.vaccinePh') : t('ga.productPh') }),
      proxima: h('input', { class: 'input', type: 'date', min: hoy }),
      detalle: h('input', { class: 'input', maxlength: '500', autocomplete: 'off' }),
      toro: h('input', { class: 'input', maxlength: '80', autocomplete: 'off', placeholder: t('ga.bullPh') }),
      comprador: h('input', { class: 'input', maxlength: '120', autocomplete: 'off' }),
      cArete: h('input', { class: 'input', maxlength: '40', autocomplete: 'off', placeholder: 'T-001' }), cPeso: h('input', { class: 'input', type: 'number', inputmode: 'decimal', step: 'any', min: '0' }),
    };
    let metodo = 'monta'; let prenada = true; let cSexo = 'hembra';
    const caja = h('input', { type: 'checkbox', checked: true }); const conCria = h('input', { type: 'checkbox', checked: true });
    const presets = h('div', { class: 'ga-presets' }, [[30, 'ga.p30'], [90, 'ga.p90'], [180, 'ga.p180'], [365, 'ga.p365']].map(([n, k]) => h('button', { class: 'chip chip--quiet', type: 'button', onclick: () => { x.proxima.value = addDays(fecha.value || hoy, n); } }, t(k))));
    const mseg = seg([{ id: 'monta', label: t('ga.natural') }, { id: 'inseminacion', label: t('ga.insem') }], metodo, (id) => { metodo = id; segSet(mseg, id); }, { label: t('ga.method'), cls: 'seg--full' });
    const dseg = seg([{ id: 'si', label: t('ga.pregnant') }, { id: 'no', label: t('ga.empty') }], 'si', (id) => { prenada = id === 'si'; segSet(dseg, id); }, { label: t('ga.result'), cls: 'seg--full' });
    const sseg = seg([{ id: 'hembra', label: t('ga.female') }, { id: 'macho', label: t('ga.male') }], cSexo, (id) => { cSexo = id; segSet(sseg, id); }, { label: t('ga.sex'), cls: 'seg--full' });
    const F = field;
    const unit = { peso: 'kg', leche: t('ga.liters'), venta: '$' };
    const body = {
      peso: () => [F(`${t('ga.weight')} (kg)`, x.valor), F(t('ga.date'), fecha)],
      leche: () => [F(t('ga.litersDay'), x.valor, a ? null : t('ga.milkHint')), F(t('ga.date'), fecha)],
      vacuna: () => [F(t('ga.product'), x.producto), F(t('ga.date'), fecha), F(t('ga.nextDate'), x.proxima, t('ga.nextHint')), presets, F(t('ga.detail'), x.detalle)],
      desparasitacion: () => body.vacuna(), tratamiento: () => body.vacuna(),
      monta: () => [h('div', { class: 'field' }, h('span', { class: 'label' }, t('ga.method')), mseg), F(t('ga.bull'), x.toro), F(t('ga.date'), fecha), h('p', { class: 'hint ga-note' }, t('ga.gestHint'))],
      diagnostico: () => [h('div', { class: 'field' }, h('span', { class: 'label' }, t('ga.result')), dseg), F(t('ga.date'), fecha), h('p', { class: 'hint ga-note' }, t('ga.diagHint'))],
      parto: () => [F(t('ga.date'), fecha), h('label', { class: 'check-line' }, conCria, t('ga.addCalf')), F(t('ga.calfTag'), x.cArete), h('div', { class: 'field' }, h('span', { class: 'label' }, t('ga.sex')), sseg), F(`${t('ga.calfWeight')} (kg)`, x.cPeso)],
      venta: () => [F(`${t('ga.salePrice')} ($)`, x.valor), F(t('ga.buyer'), x.comprador), F(t('ga.date'), fecha), h('label', { class: 'check-line' }, caja, t('ga.toCash'))],
      muerte: () => [F(t('ga.cause'), x.detalle), F(t('ga.date'), fecha)],
      nota: () => [F(t('ga.note'), x.detalle), F(t('ga.date'), fecha)],
    }[tipo]();
    const save = h('button', { class: `btn ${tipo === 'muerte' ? 'btn--danger' : 'btn--primary'}`, type: 'button' }, t('common.save'));
    const sh = openSheet({ title: `${t(`ga.ev_${tipo}`)}${a ? ` · ${label(a)}` : ''}`, body: h('div', null, ...body), foot: [save] });
    save.addEventListener('click', () => busy(save, async () => {
      try {
        const b = { id: evId, animal_id: a?.id, tipo, fecha: fecha.value, valor: num(x.valor), producto: x.producto.value, proxima_fecha: x.proxima.value || undefined, detalle: x.detalle.value, toro: x.toro.value, metodo, prenada, comprador: x.comprador.value, caja: caja.checked };
        if (tipo === 'parto' && conCria.checked && x.cArete.value.trim()) b.cria = { arete: x.cArete.value, sexo: cSexo, peso: num(x.cPeso) };
        const r = await post('/api/staff/ganado/eventos', b, { retry: true });
        sh.close();
        toast(r.parto_probable ? t('ga.calving', { d: dayShort(r.parto_probable) }) : tipo === 'venta' && b.caja && r.caja === false ? t('ga.cashFail') : t('common.saved'));
        await done?.();
      } catch (e) { toast(e.status === 404 ? t('err.generic') : e.message, true); }
    }));
    void unit;
  }

  // ── Sanidad en grupo ──────────────────────────────────────────────────────────────────────
  function groupSheet(pre) {
    let tipo = pre?.tipo || 'vacuna';
    const lsel = h('select', { class: 'select' }, h('option', { value: '*' }, t('ga.allHerd')), lotes().map((l) => h('option', { value: l }, l)));
    const tseg = seg(['vacuna', 'desparasitacion', 'tratamiento'].map((k) => ({ id: k, label: t(`ga.ev_${k}`) })), tipo, (id) => { tipo = id; segSet(tseg, id); }, { label: t('ga.kind'), cls: 'seg--full' });
    const producto = h('input', { class: 'input', maxlength: '100', value: pre?.producto || '', autofocus: true, autocomplete: 'off', placeholder: t('ga.vaccinePh') });
    const fecha = h('input', { class: 'input', type: 'date', value: todayLocal(), max: todayLocal() }); const prox = h('input', { class: 'input', type: 'date', min: todayLocal() });
    const presets = h('div', { class: 'ga-presets' }, [[30, 'ga.p30'], [90, 'ga.p90'], [180, 'ga.p180'], [365, 'ga.p365']].map(([n, k]) => h('button', { class: 'chip chip--quiet', type: 'button', onclick: () => { prox.value = addDays(fecha.value, n); } }, t(k))));
    const save = h('button', { class: 'btn btn--primary', type: 'button' }, t('common.save'));
    const sh = openSheet({ title: pre?.animales ? t('ga.applyGroup', { n: pre.animales.length }) : t('ga.groupTitle'), body: h('div', null,
      pre?.animales ? null : h('div', { class: 'field' }, h('label', null, t('ga.group')), lsel),
      h('div', { class: 'field' }, h('span', { class: 'label' }, t('ga.kind')), tseg), field(t('ga.product'), producto), field(t('ga.date'), fecha), field(t('ga.nextDate'), prox, t('ga.nextHint')), presets), foot: [save] });
    save.addEventListener('click', () => busy(save, async () => {
      try {
        const r = await post('/api/staff/ganado/lote', { tipo, producto: producto.value, fecha: fecha.value, proxima_fecha: prox.value || undefined, animales: pre?.animales, todos: !pre?.animales && lsel.value === '*', lote: lsel.value === '*' ? '' : lsel.value });
        sh.close(); toast(t('ga.groupDone', { n: r.n })); await reload();
      } catch (e) { toast(e.status === 400 && e.message ? e.message : t('err.generic'), true); }
    }));
  }

  // ── Ficha del animal ────────────────────────────────────────────────────────────────────────
  async function ficha(id) {
    let sh = null; const holder = h('div');
    const render = async () => {
      let D; try { D = await get(`/api/staff/ganado/animales/${id}`); } catch (e) { toast(e.message, true); return; }
      const a = D.animal; const act2 = a.estado === 'activo'; const refresh = async () => { await render(); await reload(); };
      const photoIn = h('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: 'gaphoto' });
      photoIn.addEventListener('change', async () => { const file = photoIn.files[0]; if (!file) return; try { await post(`/api/staff/ganado/animales/${id}/foto`, { foto: await resizeOne(file) }); await refresh(); } catch (e) { toast(e.message, true); } });
      const btn = (ic, text, tipo, cls = 'btn--secondary') => h('button', { class: `btn ${cls} btn--sm`, type: 'button', onclick: () => eventSheet(tipo, a, refresh) }, icon(ic, 16), text);
      const repro = D.repro && D.repro.estado !== 'sin_servicio' ? D.repro : null;
      const facts = [[t('ga.sex'), a.sexo === 'hembra' ? t('ga.female') : t('ga.male')], [t('ga.breed'), a.raza], [t('ga.age'), ageText(a.edad_meses)], [t('ga.lote'), a.lote], [t('ga.mother'), a.madre], [t('ga.father'), a.padre],
        [t('ga.weight'), a.peso ? `${qty(a.peso)} kg${a.peso_en ? ` · ${dayShort(a.peso_en)}` : ''}` : ''], [t('ga.gdp'), a.gdp != null ? `${a.gdp > 0 ? '+' : ''}${qty(a.gdp)} kg/${t('ga.day')}` : ''], [t('ga.buyPrice'), a.compra_precio ? money(a.compra_precio) : '']].filter((r) => r[1]);
      const evText = (e) => {
        const bits = { peso: `${qty(e.valor)} kg`, leche: `${qty(e.valor)} ${t('ga.liters')}`, venta: `${money(e.valor || 0)}${e.extra.comprador ? ` · ${e.extra.comprador}` : ''}`, monta: `${e.extra.metodo === 'inseminacion' ? t('ga.insem') : t('ga.natural')}${e.extra.toro ? ` · ${e.extra.toro}` : ''}`, diagnostico: e.extra.prenada ? t('ga.pregnant') : t('ga.empty') };
        return [bits[e.tipo], e.producto, e.detalle, e.proxima_fecha ? `${e.tipo === 'monta' || e.tipo === 'diagnostico' ? t('ga.calving', { d: dayShort(e.proxima_fecha) }) : `${t('ga.next')}: ${dayShort(e.proxima_fecha)}`}` : ''].filter(Boolean).join(' · ');
      };
      clear(holder);
      put(holder, 
        h('div', { class: 'ga-head' }, h('label', { class: 'ga-photo', for: 'gaphoto', title: t('ga.changePhoto') }, a.foto ? h('img', { src: a.foto, alt: '' }) : h('span', null, icon('camera', 22)), h('i', null, icon('edit', 12))), photoIn,
          h('div', { class: 'ga-head__tx' }, h('h3', null, label(a)), h('p', null, [t(`ga.cat_${a.categoria}`), a.raza].filter(Boolean).join(' · ')),
            h('div', { class: 'ga-badges' }, h('span', { class: `badge ${act2 ? 'badge--ok' : ''}` }, t(`ga.st_${a.estado}`)), repro ? h('span', { class: `badge ${repro.estado === 'prenada' ? 'badge--info' : ''}` }, t(`ga.r_${repro.estado}`)) : null))),
        act2 ? h('div', { class: 'ga-actions' }, btn('gauge', t('ga.ev_peso'), 'peso', 'btn--primary'), btn('syringe', t('ga.ev_vacuna'), 'vacuna'), btn('syringe', t('ga.ev_desparasitacion'), 'desparasitacion'), btn('edit', t('ga.ev_tratamiento'), 'tratamiento'),
          a.sexo === 'hembra' ? [btn('heart', t('ga.ev_monta'), 'monta'), btn('check', t('ga.ev_diagnostico'), 'diagnostico'), btn('cow', t('ga.ev_parto'), 'parto'), btn('drop', t('ga.ev_leche'), 'leche')] : null,
          btn('doc', t('ga.ev_venta'), 'venta'), btn('alert', t('ga.ev_muerte'), 'muerte'), btn('edit', t('ga.ev_nota'), 'nota')) : null,
        repro?.parto ? h('div', { class: 'ga-callout' }, icon('heart', 18), h('div', null, h('strong', null, t('ga.calving', { d: dayShort(repro.parto) })), h('small', null, whenText(Math.round((Date.parse(`${repro.parto}T12:00:00Z`) - Date.parse(`${todayLocal()}T12:00:00Z`)) / 86400000))))) : null,
        h('dl', { class: 'kv ga-facts' }, facts.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])),
        D.crias.length ? h('section', { class: 'k-sec' }, h('h4', null, t('ga.calves')), h('ul', { class: 'k-hist' }, D.crias.map((c) => h('li', null, h('span', { class: 'k-hist__ic' }, icon('cow', 16)), h('div', null, h('strong', null, label(c)), h('small', null, `${c.sexo === 'macho' ? t('ga.male') : t('ga.female')}${c.nacimiento ? ` · ${dayShort(c.nacimiento)}` : ''}`)))))) : null,
        a.notas ? h('p', { class: 'ga-notes' }, a.notas) : null,
        h('section', { class: 'k-sec' }, h('h4', null, t('ga.history')),
          D.eventos.length ? h('ul', { class: 'k-hist' }, D.eventos.map((e) => h('li', null, h('span', { class: 'k-hist__ic' }, icon({ peso: 'gauge', vacuna: 'syringe', desparasitacion: 'syringe', tratamiento: 'edit', monta: 'heart', diagnostico: 'check', parto: 'cow', leche: 'drop', venta: 'doc', muerte: 'alert', nota: 'edit' }[e.tipo], 16)),
            h('div', { class: 'ga-ev' }, h('strong', null, t(`ga.ev_${e.tipo}`)), h('p', null, evText(e)), h('small', null, dayShort(e.fecha))),
            h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': t('rg.remove'), onclick: async () => { try { await del(`/api/staff/ganado/eventos/${e.id}`); await refresh(); } catch (er) { toast(er.message, true); } } }, icon('x', 14))))) : h('p', { class: 'd-calm' }, t('ga.noHistory'))),
        h('div', { class: 'row', style: 'margin-top:20px' }, h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => { sh.close(); animalForm({ ...a, id }, async () => { await reload(); ficha(id); }); } }, icon('edit', 16), t('ga.editAnimal')),
          h('button', { class: 'btn btn--danger btn--sm', type: 'button', onclick: async () => { if (await confirmDialog({ title: t('ga.deleteAnimal'), text: t('ga.deleteText', { n: label(a) }), okLabel: t('rg.remove'), danger: true })) { try { await del(`/api/staff/ganado/animales/${id}`); sh.close(); await reload(); } catch (e) { toast(e.message, true); } } } }, icon('trash', 16), t('rg.remove'))));
    };
    sh = openSheet({ title: t('ga.animal'), body: holder });
    await render();
  }

  // ── Pestañas ────────────────────────────────────────────────────────────────────────────────
  const quick = () => h('div', { class: 'ga-quick' },
    h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: () => animalForm(null, async (nid) => { await reload(); ficha(nid); }) }, icon('plus', 16), t('ga.newAnimal')),
    h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => pickAnimal(() => true, (a) => eventSheet('peso', a, reload), t('ga.pickWeigh')) }, icon('gauge', 16), t('ga.ev_peso')),
    h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => groupSheet() }, icon('syringe', 16), t('ga.vaccinateGroup')),
    h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => eventSheet('leche', null, reload) }, icon('drop', 16), t('ga.milkToday')));

  function resumen() {
    const r = G.resumen; const al = G.alertas;
    const items = [];
    for (const s of al.sanidad.filter((x) => x.dias < 0)) items.push({ tone: 'warn', ic: 'syringe', text: t('ga.alVacOver', { p: s.producto || t(`ga.ev_${s.tipo}`), n: s.n }), sub: whenText(s.dias), go: 'salud' });
    for (const s of al.sanidad.filter((x) => x.dias >= 0)) items.push({ tone: 'info', ic: 'syringe', text: t('ga.alVacSoon', { p: s.producto || t(`ga.ev_${s.tipo}`), n: s.n }), sub: whenText(s.dias), go: 'salud' });
    for (const p of al.partos.filter((x) => x.dias <= 30)) items.push({ tone: p.dias <= 7 ? 'warn' : 'info', ic: 'heart', text: t('ga.alCalving', { n: p.nombre }), sub: whenText(p.dias), go: 'repro' });
    if (al.sin_diagnostico.length) items.push({ tone: 'info', ic: 'check', text: t('ga.alDiag', { n: al.sin_diagnostico.length }), sub: t('ga.alDiagSub'), go: 'repro' });
    if (r.sin_pesar) items.push({ tone: 'info', ic: 'gauge', text: t('ga.alWeigh', { n: r.sin_pesar }), sub: t('ga.alWeighSub'), go: 'hato' });
    const bars = (obj, tr) => { const e = Object.entries(obj).sort((a, b) => b[1] - a[1]); const mx = Math.max(1, ...e.map((x) => x[1])); return e.length ? h('ul', { class: 'd-funrows' }, e.map(([k, n]) => h('li', { class: 'd-fun ga-bar' }, h('span', { class: 'd-fun__n' }, tr(k)), h('span', { class: 'd-fun__track' }, h('i', { class: 'st-contactado', style: `width:${(n / mx) * 100}%` })), h('span', { class: 'd-fun__c' }, String(n))))) : h('p', { class: 'd-calm' }, t('ga.noAnimals')); };
    return h('div', { class: 'ga-sum' },
      h('div', { class: 'd-kpis' },
        kpi({ ic: 'cow', label: t('ga.kHerd'), value: int(r.activos), caption: t('ga.kHerdCap', { v: r.vendidos }) }), kpi({ ic: 'heart', label: t('ga.kPreg'), value: int(r.prenadas), caption: t('ga.kPregCap') }),
        kpi({ ic: 'drop', label: t('ga.kMilk'), value: `${qty(r.leche_hoy)} L`, caption: t('ga.kMilkCap', { n: qty(r.leche_prom7) }) }), kpi({ ic: 'gauge', label: t('ga.kWeight'), value: r.peso_promedio ? `${int(r.peso_promedio)} kg` : '—', caption: t('ga.kWeightCap') })),
      h('div', { class: 'd-grid' },
        h('section', { class: 'd-card' }, h('header', { class: 'd-card__head' }, h('div', null, h('h2', { class: 'd-card__title' }, t('ga.todo')), h('p', { class: 'd-card__sub' }, t('ga.todoSub')))),
          items.length ? h('ul', { class: 'd-attlist' }, items.slice(0, 8).map((x) => h('li', null, h('button', { class: `d-att__it is-${x.tone}`, type: 'button', onclick: () => { tab = x.go; paint(); } }, h('span', { class: 'd-att__ic' }, icon(x.ic, 18)), h('span', { class: 'd-att__tx' }, h('strong', null, x.text), h('small', null, x.sub)), icon('right', 16)))))
            : h('div', { class: 'd-allgood' }, icon('check', 22), h('div', null, h('strong', null, t('ga.allGood')), h('p', null, t('ga.allGoodSub'))))),
        h('div', { class: 'ga-side' }, h('section', { class: 'd-card' }, h('h2', { class: 'd-card__title' }, t('ga.byCategory')), bars(r.por_categoria, (k) => t(`ga.cat_${k}`))),
          h('section', { class: 'd-card' }, h('h2', { class: 'd-card__title' }, t('ga.byLote')), bars(r.por_lote, (k) => k || t('ga.noLote'))))));
  }

  function hato() {
    const q = S.q.trim().toLowerCase();
    const list = G.animales.filter((a) => (S.estado === 'todos' || a.estado === S.estado) && (!S.cat || a.categoria === S.cat) && (!S.lote || a.lote === S.lote) && (!q || `${label(a)} ${a.raza}`.toLowerCase().includes(q)));
    const search = h('input', { class: 'input d-search', type: 'search', placeholder: t('ga.searchAnimal'), 'aria-label': t('ga.searchAnimal'), value: S.q });
    search.addEventListener('input', () => { S.q = search.value; const p = search.selectionStart; paint(); const s2 = root.querySelector('.d-search'); s2.focus(); s2.setSelectionRange(p, p); });
    const catSel = h('select', { class: 'select ga-filter', 'aria-label': t('ga.category') }, h('option', { value: '' }, t('ga.allCats')), CATS.map((c) => h('option', { value: c }, t(`ga.cat_${c}`)))); catSel.value = S.cat; catSel.addEventListener('change', () => { S.cat = catSel.value; paint(); });
    const loteSel = h('select', { class: 'select ga-filter', 'aria-label': t('ga.lote') }, h('option', { value: '' }, t('ga.allLotes')), lotes().map((l) => h('option', { value: l }, l))); loteSel.value = S.lote; loteSel.addEventListener('change', () => { S.lote = loteSel.value; paint(); });
    const row = (a) => h('li', null, h('button', { class: 'ga-row', type: 'button', onclick: () => ficha(a.id) },
      h('span', { class: 'avatar' }, tagOf(a)),
      h('span', { class: 'ga-row__main' }, h('strong', null, label(a)), h('small', null, [t(`ga.cat_${a.categoria}`), a.raza, ageText(a.edad_meses), a.lote].filter(Boolean).join(' · '))),
      h('span', { class: 'ga-row__meta' }, a.peso ? h('b', null, `${int(a.peso)} kg`) : null, a.estado !== 'activo' ? h('span', { class: 'badge' }, t(`ga.st_${a.estado}`)) : a.repro === 'prenada' ? h('span', { class: 'badge badge--info' }, t('ga.r_prenada')) : a.gdp != null ? h('span', { class: `d-delta ${a.gdp >= 0 ? 'is-up' : 'is-down'}` }, `${a.gdp > 0 ? '+' : ''}${qty(a.gdp)}/${t('ga.day')}`) : null)));
    return h('div', { class: 'ga-hato' },
      h('div', { class: 'd-toolbar' }, seg([{ id: 'activo', label: t('ga.fActive') }, { id: 'vendido', label: t('ga.fSold') }, { id: 'todos', label: t('ga.fAll') }], S.estado, (id) => { S.estado = id; paint(); }, { label: t('ga.state'), cls: 'd-seg--scroll' }), search, catSel, loteSel),
      list.length ? h('ul', { class: 'ga-list' }, list.map(row)) : h('div', { class: 'empty' }, h('span', { class: 'tr-empty__ic' }, icon('cow', 30)), h('h3', null, G.animales.length ? t('ga.noMatch') : t('ga.emptyTitle')), h('p', null, G.animales.length ? t('ga.noMatchText') : t('ga.emptyText')),
        G.animales.length ? null : h('button', { class: 'btn btn--primary', type: 'button', onclick: () => animalForm(null, async (nid) => { await reload(); ficha(nid); }) }, icon('plus', 16), t('ga.newAnimal'))));
  }

  function salud() {
    const pend = G.alertas.sanidad;
    const row = (s) => h('li', { class: 'ga-pend' }, h('span', { class: `ga-pend__d ${s.dias < 0 ? 'is-late' : ''}` }, h('b', null, s.dias < 0 ? String(-s.dias) : String(s.dias)), h('small', null, s.dias < 0 ? t('ga.daysLate') : t('ga.daysLeft'))),
      h('div', { class: 'ga-pend__main' }, h('strong', null, `${t(`ga.ev_${s.tipo}`)}${s.producto ? ` · ${s.producto}` : ''}`), h('small', null, `${t('ga.nAnimals', { n: s.n })} · ${dayShort(s.fecha)}`)),
      h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: () => groupSheet({ tipo: s.tipo, producto: s.producto, animales: s.animales }) }, icon('check', 16), t('ga.applyNow')));
    return h('div', { class: 'ga-sec' }, h('section', { class: 'd-card' }, h('header', { class: 'd-card__head' }, h('div', null, h('h2', { class: 'd-card__title' }, t('ga.healthTitle')), h('p', { class: 'd-card__sub' }, t('ga.healthSub'))),
      h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => groupSheet() }, icon('syringe', 16), t('ga.vaccinateGroup'))),
    pend.length ? h('ul', { class: 'ga-pends' }, pend.map(row)) : h('div', { class: 'd-allgood' }, icon('check', 22), h('div', null, h('strong', null, t('ga.healthOk')), h('p', null, t('ga.healthOkSub'))))));
  }

  function repro() {
    const hembras = G.animales.filter((a) => a.estado === 'activo' && a.sexo === 'hembra');
    const pre = hembras.filter((a) => a.repro === 'prenada').sort((a, b) => (a.parto_probable || '9').localeCompare(b.parto_probable || '9'));
    const serv = G.alertas.sin_diagnostico;
    const dias = (d) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${todayLocal()}T12:00:00Z`)) / 86400000);
    const rowP = (a) => h('li', null, h('button', { class: 'ga-row', type: 'button', onclick: () => ficha(a.id) }, h('span', { class: 'avatar' }, tagOf(a)), h('span', { class: 'ga-row__main' }, h('strong', null, label(a)), h('small', null, a.parto_probable ? t('ga.calving', { d: dayShort(a.parto_probable) }) : '')),
      h('span', { class: 'ga-row__meta' }, a.parto_probable ? h('span', { class: `badge ${dias(a.parto_probable) <= 15 ? 'badge--warn' : 'badge--info'}` }, whenText(dias(a.parto_probable))) : null)));
    return h('div', { class: 'ga-sec' },
      h('div', { class: 'ga-quick' }, h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: () => pickAnimal((a) => a.sexo === 'hembra', (a) => eventSheet('monta', a, reload), t('ga.pickFemale')) }, icon('heart', 16), t('ga.ev_monta')),
        h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => pickAnimal((a) => a.sexo === 'hembra', (a) => eventSheet('diagnostico', a, reload), t('ga.pickFemale')) }, icon('check', 16), t('ga.ev_diagnostico')),
        h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => pickAnimal((a) => a.sexo === 'hembra', (a) => eventSheet('parto', a, reload), t('ga.pickFemale')) }, icon('cow', 16), t('ga.ev_parto'))),
      h('section', { class: 'd-card' }, h('h2', { class: 'd-card__title' }, t('ga.pregnantList')), h('p', { class: 'd-card__sub' }, t('ga.pregnantSub')), pre.length ? h('ul', { class: 'ga-list' }, pre.map(rowP)) : h('p', { class: 'd-calm' }, t('ga.noPregnant'))),
      h('section', { class: 'd-card' }, h('h2', { class: 'd-card__title' }, t('ga.needDiag')), h('p', { class: 'd-card__sub' }, t('ga.needDiagSub')),
        serv.length ? h('ul', { class: 'ga-list' }, serv.map((s) => h('li', null, h('button', { class: 'ga-row', type: 'button', onclick: () => ficha(s.id) }, h('span', { class: 'avatar' }, tagOf({ nombre: s.nombre })), h('span', { class: 'ga-row__main' }, h('strong', null, s.nombre), h('small', null, t('ga.servedAgo', { n: s.dias }))), h('span', { class: 'ga-row__meta' }, icon('right', 16)))))) : h('p', { class: 'd-calm' }, t('ga.noNeedDiag'))));
  }

  function leche() {
    const serie = G.leche; const mx = Math.max(1, ...serie.map((x) => x[1])); const tot = serie.reduce((s, x) => s + x[1], 0);
    const fecha = h('input', { class: 'input', type: 'date', value: todayLocal(), max: todayLocal(), 'aria-label': t('ga.date') });
    const lit = h('input', { class: 'input', type: 'number', inputmode: 'decimal', step: 'any', min: '0', placeholder: '0', 'aria-label': t('ga.litersDay') });
    const save = h('button', { class: 'btn btn--primary', type: 'button' }, icon('check', 16), t('common.save'));
    save.addEventListener('click', () => busy(save, async () => { try { await post('/api/staff/ganado/eventos', { tipo: 'leche', fecha: fecha.value, valor: Number(lit.value) }); toast(t('common.saved')); await reload(); } catch (e) { toast(e.message, true); } }));
    return h('div', { class: 'ga-sec' }, h('div', { class: 'd-kpis ga-k3' }, kpi({ ic: 'drop', label: t('ga.kMilk'), value: `${qty(G.resumen.leche_hoy)} L`, caption: t('ga.kMilkCap', { n: qty(G.resumen.leche_prom7) }) }), kpi({ ic: 'calendar', label: t('ga.milk14'), value: `${qty(tot)} L`, caption: t('ga.milk14Cap') }), kpi({ ic: 'cow', label: t('ga.perCow'), value: G.resumen.activos && G.resumen.leche_prom7 ? `${qty(G.resumen.leche_prom7 / Math.max(1, G.animales.filter((a) => a.estado === 'activo' && a.sexo === 'hembra' && a.repro !== 'sin_servicio').length || 1))} L` : '—', caption: t('ga.perCowCap') })),
      h('section', { class: 'd-card' }, h('h2', { class: 'd-card__title' }, t('ga.milkRegister')), h('p', { class: 'd-card__sub' }, t('ga.milkSub')), h('div', { class: 'ga-milkform' }, field(t('ga.litersDay'), lit), field(t('ga.date'), fecha), save)),
      h('section', { class: 'd-card' }, h('h2', { class: 'd-card__title' }, t('ga.milkChart')),
        h('div', { class: 'ga-chart', role: 'img', 'aria-label': t('ga.milkChart') }, serie.map(([d, v]) => h('div', { class: 'ga-chart__col' }, h('span', { class: 'ga-chart__v' }, v ? qty(v) : ''), h('span', { class: 'ga-chart__bar', style: `height:${(v / mx) * 100}%` }), h('small', null, String(Number(d.slice(8)))))))));
  }

  function paint() {
    const y = window.scrollY; clear(root);
    const head = h('header', { class: 'd-head' }, h('div', null, h('h1', null, t('nav.cattle')), h('p', null, t('ga.lead'))), G ? quick() : null);
    if (!G) { put(root, head, h('div', { class: 'd-kpis' }, [0, 1, 2, 3].map(() => skel('d-skel--kpi'))), skel('d-skel--chart')); return; }
    const tabs = seg(TABS.map((x) => ({ id: x, label: t(`ga.tab_${x}`) })), tab, (id) => { tab = id; history.replaceState(null, '', `#/ganado${id === 'resumen' ? '' : `/${id}`}`); paint(); }, { label: t('ga.tabs'), cls: 'd-seg--scroll' });
    put(root, head, tabs, { resumen, hato, salud, repro, leche }[tab]());
    window.scrollTo(0, y);
  }

  paint();
  reload().then(() => { if (params[0] === 'nuevo' && isCurrent()) { history.replaceState(null, '', '#/ganado'); animalForm(null, async (nid) => { await reload(); ficha(nid); }); } });
  void go; void getLang;
}
