// Terrenos: fichas de compra y venta con fotos, descripción, documentos, interesados y herramientas de negociación.
import { get, post, patch, del } from '../api.js';
import { h, clear, openSheet, toast, busy, field, confirmDialog, debounce } from '../ui.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { fmtRelative } from '../time.js';
import { seg, skel, kpi } from '../dui.js';
import { money, moneyShort, qty, int } from '../fmt.js';
import { resizeImage } from '../img.js';

// append que ignora null/false (Node.append escribiría la palabra «null»)
const put = (el, ...kids) => el.append(...kids.flat(Infinity).filter((k) => k != null && k !== false));
const USOS = ['agricola', 'ganadero', 'mixto', 'forestal', 'lote', 'otro'];
const ESTADOS = ['disponible', 'negociacion', 'cerrado'];
const CARACT = ['agua', 'rio', 'pozo', 'luz', 'via', 'cercado', 'casa', 'establo', 'riego', 'internet', 'pastos', 'cultivos', 'arboles', 'plano'];
const DOCS = ['escritura', 'tradicion', 'predial', 'linderos', 'uso_suelo', 'servidumbres', 'paz_salvo'];
const INTERES = ['nuevo', 'visita', 'oferta', 'descartado'];
const PASTOS = [{ id: 'natural', ua: 0.6 }, { id: 'mejorado', ua: 1.5 }, { id: 'intensivo', ua: 3 }];
const place = (x) => [x.vereda, x.municipio, x.departamento].filter(Boolean).join(', ');
const waLink = (tel, text) => `https://wa.me/${String(tel || '').replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
const mapLink = (x) => `https://www.google.com/maps?q=${x.lat},${x.lng}`;
const dirLink = (x) => `https://www.google.com/maps/dir/?api=1&destination=${x.lat},${x.lng}`;
// Zoom según el tamaño: una finca grande necesita ver más alrededor que un lote.
const zoomFor = (ha) => (ha >= 500 ? 12 : ha >= 100 ? 13 : ha >= 20 ? 14 : ha > 0 ? 15 : 14);
const mapImg = (lat, lng, w, hgt, ha = 0) => `/api/staff/geo/mapa?lat=${lat}&lng=${lng}&w=${w}&h=${hgt}&z=${zoomFor(ha)}`;
// ¿Está activado el mapa de Geoapify en este sitio? (se pregunta una vez)
let geoOn = null;
const geoEstado = () => (geoOn !== null ? Promise.resolve(geoOn) : get('/api/staff/geo/estado').then((r) => (geoOn = !!r.activo)).catch(() => (geoOn = false)));

function fichaTexto(x) {
  return [`🌿 ${x.titulo}`, x.operacion === 'compra' ? t('ter.wantBuy') : t('ter.forSale'), place(x) && `📍 ${place(x)}`,
    x.area_ha ? `📐 ${qty(x.area_ha)} ha` : '', x.precio ? `💰 ${money(x.precio)}${x.precio_ha ? ` (${money(x.precio_ha)}/ha)` : ''}${x.negociable ? ` · ${t('ter.negotiable')}` : ''}` : '',
    x.caracteristicas.length ? `✔ ${x.caracteristicas.map((c) => t(`ter.c_${c}`)).join(', ')}` : '', x.descripcion, x.lat != null ? mapLink(x) : '',
    x.contacto_tel ? `📞 ${x.contacto_nombre || ''} ${x.contacto_tel}`.trim() : ''].filter(Boolean).join('\n');
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast(t('ter.copied')); } catch {
    const ta = h('textarea', { value: text, style: 'position:fixed;opacity:0' }); document.body.append(ta); ta.select();
    try { document.execCommand('copy'); toast(t('ter.copied')); } catch { toast(text, true); } ta.remove();
  }
}
const stateBadge = (e) => h('span', { class: `badge ${e === 'disponible' ? 'badge--ok' : e === 'negociacion' ? 'badge--info' : ''}` }, t(`ter.s_${e}`));
const opBadge = (o) => h('span', { class: `badge tr-op tr-op--${o}` }, t(o === 'compra' ? 'ter.op_compra' : 'ter.op_venta'));

// ── Formulario (nuevo / editar) ───────────────────────────────────────────────────────────────
function formSheet(x, done) {
  const d = x || { titulo: '', operacion: 'venta', estado: 'disponible', uso: '', departamento: '', municipio: '', vereda: '', direccion: '', lat: '', lng: '', area_ha: '', precio: '', negociable: true, descripcion: '', caracteristicas: [], documentos: [], contacto_nombre: '', contacto_tel: '' };
  let op = d.operacion;
  const f = {
    titulo: h('input', { class: 'input', value: d.titulo, maxlength: '120', autofocus: true, placeholder: t('ter.titlePh'), autocomplete: 'off' }),
    uso: h('select', { class: 'select' }, h('option', { value: '' }, t('ter.pick')), USOS.map((u) => h('option', { value: u }, t(`ter.u_${u}`)))),
    dep: h('input', { class: 'input', value: d.departamento, maxlength: '60', autocomplete: 'off', placeholder: t('ter.depPh') }),
    mun: h('input', { class: 'input', value: d.municipio, maxlength: '80', autocomplete: 'off' }),
    ver: h('input', { class: 'input', value: d.vereda, maxlength: '80', autocomplete: 'off' }),
    dir: h('input', { class: 'input', value: d.direccion, maxlength: '200', autocomplete: 'off', placeholder: t('ter.refPh') }),
    lat: h('input', { class: 'input', type: 'number', inputmode: 'decimal', step: 'any', value: d.lat ?? '', placeholder: '4.1420' }),
    lng: h('input', { class: 'input', type: 'number', inputmode: 'decimal', step: 'any', value: d.lng ?? '', placeholder: '-73.6266' }),
    area: h('input', { class: 'input', type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: d.area_ha || '' }),
    precio: h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: '0', step: '1000000', value: d.precio || '' }),
    desc: h('textarea', { class: 'textarea', rows: '4', maxlength: '3000', placeholder: t('ter.descPh') }),
    cn: h('input', { class: 'input', value: d.contacto_nombre, maxlength: '120', autocomplete: 'off' }),
    ct: h('input', { class: 'input', type: 'tel', inputmode: 'tel', value: d.contacto_tel, maxlength: '40', autocomplete: 'off' }),
  };
  f.uso.value = d.uso || ''; f.desc.value = d.descripcion;
  const neg = h('input', { type: 'checkbox', checked: d.negociable !== false });
  const carac = new Set(d.caracteristicas);
  const chips = h('div', { class: 'checks' }, CARACT.map((c) => { const i = h('input', { type: 'checkbox', checked: carac.has(c) }); i.addEventListener('change', () => (i.checked ? carac.add(c) : carac.delete(c))); return h('label', { class: 'check' }, i, t(`ter.c_${c}`)); }));
  const perHa = h('p', { class: 'hint tr-perha' });
  const calc = () => { const a = Number(f.area.value); const p = Number(f.precio.value); perHa.textContent = a > 0 && p > 0 ? `= ${money(p / a)} ${t('ter.perHa')}` : ''; };
  f.area.addEventListener('input', calc); f.precio.addEventListener('input', calc); calc();
  const opSeg = seg([{ id: 'venta', label: t('ter.iSell') }, { id: 'compra', label: t('ter.iBuy') }], op, (id) => { op = id; opSeg.querySelectorAll('button').forEach((b) => { const on = b.dataset.id === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }); }, { label: t('ter.operation'), cls: 'seg--full' });
  // Buscador de lugares (Geoapify), ubicación actual y vista previa del mapa
  const mapPrev = h('div', { class: 'tr-mapprev', hidden: true });
  const showPrev = () => {
    clear(mapPrev); const la = Number(f.lat.value); const ln = Number(f.lng.value);
    if (!geoOn || f.lat.value === '' || f.lng.value === '' || !Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) { mapPrev.hidden = true; return; }
    mapPrev.hidden = false;
    const im = h('img', { src: mapImg(la, ln, 640, 280, Number(f.area.value) || 0), alt: t('ter.mapPreview') }); im.onerror = () => { mapPrev.hidden = true; };
    mapPrev.append(im, h('small', null, t('ter.mapPreview')));
  };
  const fillPlace = (p) => {
    if (p.departamento) f.dep.value = p.departamento; if (p.municipio) f.mun.value = p.municipio; f.ver.value = p.vereda || f.ver.value;
    if (p.direccion && !f.dir.value) f.dir.value = p.direccion;
    f.lat.value = Number(p.lat).toFixed(6); f.lng.value = Number(p.lng).toFixed(6); showPrev();
  };
  const sugg = h('ul', { class: 'tr-sugg', role: 'listbox', 'aria-label': t('ter.geoSearch'), hidden: true });
  const search = h('input', { class: 'input', type: 'search', placeholder: t('ter.geoPh'), autocomplete: 'off', 'aria-label': t('ter.geoSearch') });
  let seq = 0;
  const runSearch = debounce(async () => {
    const q = search.value.trim(); const my = ++seq;
    if (q.length < 3) { sugg.hidden = true; return; }
    clear(sugg); sugg.hidden = false; sugg.append(h('li', { class: 'tr-sugg__note' }, t('common.loading')));
    try {
      const r = await get(`/api/staff/geo/buscar?q=${encodeURIComponent(q)}`); if (my !== seq) return;
      clear(sugg);
      if (!r.resultados.length) { sugg.append(h('li', { class: 'tr-sugg__note' }, t('ter.geoNone'))); return; }
      for (const p of r.resultados) sugg.append(h('li', { role: 'option' }, h('button', { class: 'tr-sugg__it', type: 'button', onclick: () => { fillPlace(p); search.value = p.texto; sugg.hidden = true; } }, icon('pin', 16), h('span', null, h('strong', null, p.titulo || p.texto), h('small', null, p.texto)))));
    } catch (e) { if (my !== seq) return; clear(sugg); sugg.append(h('li', { class: 'tr-sugg__note' }, e.message)); }
  }, 350);
  search.addEventListener('input', runSearch); search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { sugg.hidden = true; } });
  const geoBox = h('div', { class: 'tr-geo', hidden: true }, field(t('ter.geoSearch'), search, t('ter.geoHint')), sugg);
  const here = h('button', { class: 'btn btn--secondary btn--sm', type: 'button' }, icon('pin', 16), t('ter.useMyLocation'));
  here.addEventListener('click', () => busy(here, () => new Promise((done) => {
    if (!navigator.geolocation) { toast(t('ter.locDenied'), true); done(); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: la, longitude: ln } = pos.coords; f.lat.value = la.toFixed(6); f.lng.value = ln.toFixed(6);
      if (geoOn) { try { const r = await get(`/api/staff/geo/inversa?lat=${la}&lng=${ln}`); if (r.lugar) fillPlace({ ...r.lugar, lat: la, lng: ln }); } catch { /* deja solo las coordenadas */ } }
      showPrev(); toast(t('ter.located')); done();
    }, () => { toast(t('ter.locDenied'), true); done(); }, { enableHighAccuracy: true, timeout: 15000 });
  })));
  const prevSoon = debounce(showPrev, 500); f.lat.addEventListener('input', prevSoon); f.lng.addEventListener('input', prevSoon);
  geoEstado().then((on) => { geoBox.hidden = !on; showPrev(); });
  const photos = []; const prev = h('div', { class: 'tr-queue' });
  const newId = x ? null : (crypto.randomUUID ? crypto.randomUUID() : null); // un reintento no duplica la ficha
  const pick = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'sr-only', id: 'trphotos' });
  pick.addEventListener('change', () => {
    for (const file of pick.files) { if (photos.length >= 10) break; photos.push(file); prev.append(h('span', { class: 'tr-queue__it' }, icon('camera', 14), file.name.slice(0, 22))); }
    pick.value = '';
  });
  const save = h('button', { class: 'btn btn--primary', type: 'button' }, t('common.save'));
  const sh = openSheet({
    title: x ? t('ter.edit') : t('ter.new'),
    body: h('div', null,
      h('section', { class: 'fsec' }, h('h3', null, t('ter.sBasics')), h('div', { class: 'field' }, h('span', { class: 'label' }, t('ter.operation')), opSeg), field(t('ter.title'), f.titulo), field(t('ter.use'), f.uso)),
      h('section', { class: 'fsec' }, h('h3', null, t('ter.sPlace')), geoBox, h('div', { class: 'tr-here' }, here), h('div', { class: 'grid2' }, field(t('ter.dep'), f.dep), field(t('ter.mun'), f.mun)), h('div', { class: 'grid2' }, field(t('ter.vereda'), f.ver), field(t('ter.ref'), f.dir)),
        h('div', { class: 'grid2' }, field(t('ter.lat'), f.lat), field(t('ter.lng'), f.lng)), mapPrev, h('p', { class: 'hint', style: 'margin:-8px 0 16px' }, t('ter.coordsHint'))),
      h('section', { class: 'fsec' }, h('h3', null, t('ter.sPrice')), h('div', { class: 'grid2' }, field(t('ter.area'), f.area), field(t('ter.price'), f.precio)), perHa, h('label', { class: 'check-line' }, neg, t('ter.negotiable'))),
      h('section', { class: 'fsec' }, h('h3', null, t('ter.sDesc')), field(t('ter.desc'), f.desc), h('div', { class: 'field' }, h('span', { class: 'label' }, t('ter.features')), chips)),
      h('section', { class: 'fsec' }, h('h3', null, t('ter.sContact')), h('div', { class: 'grid2' }, field(t('ter.cName'), f.cn), field(t('ter.cPhone'), f.ct))),
      h('section', { class: 'fsec' }, h('h3', null, t('ter.photos')), h('label', { class: 'btn btn--secondary btn--block', for: 'trphotos' }, icon('camera', 18), t('ter.addPhotos')), pick, prev, h('p', { class: 'hint', style: 'margin-top:8px' }, t('ter.photosHint')))),
    foot: [save],
  });
  save.addEventListener('click', () => busy(save, async () => {
    try {
      const body = { id: x?.id || newId || undefined, titulo: f.titulo.value, operacion: op, estado: d.estado, uso: f.uso.value || null, departamento: f.dep.value, municipio: f.mun.value, vereda: f.ver.value, direccion: f.dir.value, lat: f.lat.value, lng: f.lng.value,
        area_ha: Number(f.area.value) || 0, precio: Number(f.precio.value) || 0, negociable: neg.checked, descripcion: f.desc.value, caracteristicas: [...carac], documentos: d.documentos, contacto_nombre: f.cn.value, contacto_tel: f.ct.value };
      const r = await post('/api/staff/terrenos', body, { retry: true });
      let failed = 0;
      for (const file of photos) { try { await post(`/api/staff/terrenos/${r.id}/fotos`, await resizeImage(file)); } catch { failed++; } }
      sh.close(); toast(failed ? t('ter.savedPhotosFail', { n: failed }) : t('common.saved'), !!failed); done(r.id);
    } catch (e) { toast(e.message, true); }
  }));
}

// ── Lista ──────────────────────────────────────────────────────────────────────────────────────
function lista({ main, go, isCurrent }) {
  const root = h('div', { class: 'd-page' }); main.append(root);
  let data = null; const S = { f: 'todos', q: '' };
  const card = (x) => h('a', { class: 'tr-card', href: `#/terrenos/${x.id}` },
    h('div', { class: 'tr-card__img' }, x.portada ? h('img', { src: x.portada, alt: '', loading: 'lazy' }) : h('span', { class: 'tr-card__ph' }, icon('land', 34)), h('span', { class: 'tr-card__tags' }, opBadge(x.operacion), x.estado !== 'disponible' ? stateBadge(x.estado) : null),
      x.fotos > 1 ? h('span', { class: 'tr-card__n' }, icon('camera', 13), String(x.fotos)) : null),
    h('div', { class: 'tr-card__body' }, h('strong', null, x.titulo), h('span', { class: 'tr-card__loc' }, icon('pin', 14), place(x) || t('ter.noPlace')),
      h('div', { class: 'tr-card__price' }, h('b', null, x.precio ? money(x.precio) : t('ter.noPrice')), h('small', null, [x.area_ha ? `${qty(x.area_ha)} ha` : '', x.precio_ha ? `${moneyShort(x.precio_ha)}/ha` : ''].filter(Boolean).join(' · '))),
      x.interesados ? h('span', { class: 'tr-card__int' }, icon('users', 14), t('ter.nInterested', { n: x.interesados })) : null));
  const paint = () => {
    clear(root);
    const head = h('header', { class: 'd-head' }, h('div', null, h('h1', null, t('nav.land')), h('p', null, t('ter.lead'))),
      // Sin terrenos todavía, el botón principal está en el centro de la pantalla (no se repite arriba).
      !data || data.terrenos.length ? h('div', { class: 'd-head__act' }, h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: () => formSheet(null, (id) => go(`#/terrenos/${id}`)) }, icon('plus', 16), t('ter.new'))) : null);
    if (!data) { put(root, head, h('div', { class: 'tr-grid' }, [0, 1, 2].map(() => skel('d-skel--chart')))); return; }
    const all = data.terrenos; const live = all.filter((x) => x.estado !== 'cerrado');
    const kp = h('div', { class: 'd-kpis' },
      kpi({ ic: 'land', label: t('ter.kAvail'), value: int(all.filter((x) => x.estado === 'disponible').length), caption: t('ter.kAvailCap') }),
      kpi({ ic: 'users', label: t('ter.kNeg'), value: int(all.filter((x) => x.estado === 'negociacion').length), caption: t('ter.kNegCap') }),
      kpi({ ic: 'map', label: t('ter.kHa'), value: qty(live.reduce((s, x) => s + x.area_ha, 0)), caption: t('ter.kHaCap') }),
      kpi({ ic: 'doc', label: t('ter.kValue'), value: moneyShort(live.filter((x) => x.operacion === 'venta').reduce((s, x) => s + x.precio, 0)), caption: t('ter.kValueCap') }));
    const q = S.q.trim().toLowerCase();
    const shown = all.filter((x) => (S.f === 'todos' || x.operacion === S.f) && (!q || `${x.titulo} ${place(x)}`.toLowerCase().includes(q)));
    const search = h('input', { class: 'input d-search', type: 'search', placeholder: t('ter.search'), 'aria-label': t('ter.search'), value: S.q });
    search.addEventListener('input', () => { S.q = search.value; const pos = search.selectionStart; paint(); const s2 = root.querySelector('.d-search'); s2.focus(); s2.setSelectionRange(pos, pos); });
    put(root, head, all.length ? kp : null,
      all.length ? h('div', { class: 'd-toolbar' }, seg([{ id: 'todos', label: t('ter.fAll') }, { id: 'venta', label: t('ter.fSell') }, { id: 'compra', label: t('ter.fBuy') }], S.f, (id) => { S.f = id; paint(); }, { label: t('ter.filter') }), search) : null,
      shown.length ? h('div', { class: 'tr-grid' }, shown.map(card))
        : h('div', { class: 'empty tr-empty' }, h('span', { class: 'tr-empty__ic' }, icon('land', 30)), h('h3', null, all.length ? t('ter.noMatch') : t('ter.emptyTitle')), h('p', null, all.length ? t('ter.noMatchText') : t('ter.emptyText')),
          all.length ? null : h('button', { class: 'btn btn--primary', type: 'button', onclick: () => formSheet(null, (id) => go(`#/terrenos/${id}`)) }, icon('plus', 16), t('ter.new'))));
  };
  paint();
  get('/api/staff/terrenos').then((r) => { if (isCurrent()) { data = r; paint(); } }).catch((e) => { clear(root); put(root, h('div', { class: 'empty' }, h('h3', null, t('err.generic')), h('p', null, e.message))); });
}

// ── Detalle ────────────────────────────────────────────────────────────────────────────────────
function detalle({ main, go, id, isCurrent }) {
  const root = h('div', { class: 'd-page' }); main.append(root);
  let D = null; let cur = 0;
  const load = async () => { try { D = await get(`/api/staff/terrenos/${id}`); } catch (e) { if (e.status === 404) { go('#/terrenos'); return; } toast(e.message, true); return; } if (isCurrent()) paint(); };
  const saveT = async (patchObj) => { try { await post('/api/staff/terrenos', { ...D.terreno, ...patchObj }); await load(); } catch (e) { toast(e.message, true); } };

  function gallery() {
    const fs = D.fotos; if (cur >= fs.length) cur = 0;
    const input = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'sr-only', id: 'trmore' });
    input.addEventListener('change', async () => {
      const files = [...input.files]; input.value = ''; if (!files.length) return;
      let bad = 0;
      for (const file of files) { try { await post(`/api/staff/terrenos/${id}/fotos`, await resizeImage(file)); } catch (e) { bad++; if (e.message) toast(e.message, true); } }
      if (!bad) toast(t('common.saved')); await load();
    });
    const add = h('label', { class: 'btn btn--secondary btn--sm', for: 'trmore' }, icon('camera', 16), fs.length ? t('ter.addMore') : t('ter.addPhotos'));
    if (!fs.length) return h('div', { class: 'tr-gal tr-gal--empty' }, h('span', { class: 'tr-empty__ic' }, icon('camera', 30)), h('p', null, t('ter.noPhotos')), add, input);
    const big = fs[cur];
    return h('div', { class: 'tr-gal' },
      h('div', { class: 'tr-gal__main' }, h('img', { src: big.grande, alt: D.terreno.titulo }),
        h('div', { class: 'tr-gal__act' },
          cur !== 0 ? h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': t('ter.makeCover'), title: t('ter.makeCover'), onclick: async () => { try { await post(`/api/staff/terreno-fotos/${big.id}/portada`, {}); cur = 0; await load(); } catch (e) { toast(e.message, true); } } }, icon('star', 16)) : null,
          h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': t('ter.delPhoto'), title: t('ter.delPhoto'), onclick: async () => { if (await confirmDialog({ title: t('ter.delPhoto'), text: t('ter.delPhotoText'), okLabel: t('rg.remove'), danger: true })) { try { await del(`/api/staff/terreno-fotos/${big.id}`); cur = 0; await load(); } catch (e) { toast(e.message, true); } } } }, icon('trash', 16)))),
      h('div', { class: 'tr-gal__thumbs' }, fs.map((f, i) => h('button', { class: `tr-thumb${i === cur ? ' is-on' : ''}`, type: 'button', 'aria-label': `${t('ter.photo')} ${i + 1}`, onclick: () => { cur = i; paint(); } }, h('img', { src: f.mini, alt: '' }))), add, input));
  }

  function tools() {
    const x = D.terreno;
    // 1) Oferta
    const off = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: '0', step: '1000000', placeholder: money(x.precio) });
    const com = h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: '0', max: '30', step: '0.5', value: '3' });
    const offOut = h('div', { class: 'tr-out' });
    const calcOff = () => {
      clear(offOut); const o = Number(off.value); if (!(o > 0) || !(x.precio > 0)) return;
      const diff = ((o - x.precio) / x.precio) * 100; const cm = Number(com.value) || 0;
      offOut.append(h('div', null, h('span', null, t('ter.vsAsk')), h('strong', { class: diff < 0 ? 'is-down' : 'is-up' }, `${diff > 0 ? '+' : ''}${diff.toFixed(1)} %`)),
        x.area_ha ? h('div', null, h('span', null, t('ter.offerHa')), h('strong', null, money(o / x.area_ha))) : null,
        h('div', null, h('span', null, t('ter.netAfter', { n: cm })), h('strong', null, money(o * (1 - cm / 100)))));
    };
    off.addEventListener('input', calcOff); com.addEventListener('input', calcOff);
    // 2) Zona
    const ref = D.referencia;
    const zone = !x.precio_ha ? h('p', { class: 'd-calm' }, t('ter.zoneNeed'))
      : !ref ? h('p', { class: 'd-calm' }, t('ter.zoneNone'))
        : (() => { const diff = ((x.precio_ha - ref.promedio_ha) / ref.promedio_ha) * 100; return h('div', { class: 'tr-out' },
          h('div', null, h('span', null, t('ter.zoneAvg', { n: ref.n })), h('strong', null, `${money(ref.promedio_ha)}/ha`)),
          h('div', null, h('span', null, t('ter.zoneRange')), h('strong', null, `${moneyShort(ref.min_ha)} – ${moneyShort(ref.max_ha)}`)),
          h('div', null, h('span', null, t('ter.zoneThis')), h('strong', { class: diff > 5 ? 'is-down' : diff < -5 ? 'is-up' : '' }, `${diff > 0 ? '+' : ''}${diff.toFixed(0)} %`))); })();
    // 3) Capacidad ganadera
    let ua = PASTOS[1].ua;
    const pastoSeg = seg(PASTOS.map((p) => ({ id: p.id, label: t(`ter.p_${p.id}`) })), 'mejorado', (idp) => { ua = PASTOS.find((p) => p.id === idp).ua; pastoSeg.querySelectorAll('button').forEach((b) => { const on = b.dataset.id === idp; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }); calcCap(); }, { label: t('ter.pasture'), cls: 'd-seg--scroll' });
    const capOut = h('div', { class: 'tr-out' });
    const calcCap = () => {
      clear(capOut); if (!(x.area_ha > 0)) { capOut.append(h('p', { class: 'd-calm' }, t('ter.capNeed'))); return; }
      const cab = Math.floor(x.area_ha * ua);
      capOut.append(h('div', null, h('span', null, t('ter.capHeads')), h('strong', null, `${int(cab)} ${t('ter.heads')}`)), h('div', null, h('span', null, t('ter.capPer')), h('strong', null, cab && x.precio ? money(x.precio / cab) : '—')), h('p', { class: 'hint' }, t('ter.capNote')));
    };
    calcCap();
    const tool = (ic, title, ...kids) => h('section', { class: 'tr-tool' }, h('h3', null, icon(ic, 18), title), ...kids);
    return h('div', { class: 'tr-tools' },
      tool('doc', t('ter.toolOffer'), h('div', { class: 'grid2' }, field(t('ter.offer'), off), field(t('ter.commission'), com)), offOut),
      tool('trendUp', t('ter.toolZone'), zone),
      tool('cow', t('ter.toolCap'), pastoSeg, capOut),
      tool('share', t('ter.toolShare'), h('p', { class: 'd-calm' }, t('ter.shareText')), h('div', { class: 'row' }, h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => copy(fichaTexto(x)) }, icon('copy', 16), t('ter.copy')),
        h('a', { class: 'btn btn--primary btn--sm', href: waLink('', fichaTexto(x)), target: '_blank', rel: 'noopener noreferrer' }, icon('send', 16), 'WhatsApp'))));
  }

  function ubicacion() {
    const x = D.terreno; const has = x.lat != null && x.lng != null;
    const img = has ? h('img', { src: mapImg(x.lat, x.lng, 900, 480, x.area_ha), alt: `${t('ter.mapTitle')}: ${place(x) || x.titulo}`, loading: 'lazy' }) : null;
    const frame = has ? h('a', { class: 'tr-map', href: mapLink(x), target: '_blank', rel: 'noopener noreferrer', 'aria-label': t('ter.openMap') }, img) : null;
    if (img) img.onerror = () => { frame.hidden = true; };
    return h('section', { class: 'd-card' }, h('header', { class: 'd-card__head' }, h('div', null, h('h2', { class: 'd-card__title' }, t('ter.mapTitle')), h('p', { class: 'd-card__sub' }, [place(x), x.direccion].filter(Boolean).join(' · ') || t('ter.noPlace')))),
      frame,
      has ? h('div', { class: 'row' },
        h('a', { class: 'btn btn--primary btn--sm', href: dirLink(x), target: '_blank', rel: 'noopener noreferrer' }, icon('send', 16), t('ter.directions')),
        h('a', { class: 'btn btn--secondary btn--sm', href: mapLink(x), target: '_blank', rel: 'noopener noreferrer' }, icon('map', 16), t('ter.openMap')),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => copy(`${x.lat}, ${x.lng}`, t('ter.coordsCopied')) }, icon('copy', 16), `${Number(x.lat).toFixed(4)}, ${Number(x.lng).toFixed(4)}`))
        : h('div', { class: 'tr-addplace' }, h('p', { class: 'd-calm' }, t('ter.addPlace')), h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => formSheet(x, () => load()) }, icon('pin', 16), t('ter.edit'))));
  }

  function interesados() {
    const nm = h('input', { class: 'input', maxlength: '120', placeholder: t('ter.iName'), 'aria-label': t('ter.iName'), autocomplete: 'off' });
    const tl = h('input', { class: 'input', type: 'tel', inputmode: 'tel', maxlength: '40', placeholder: t('ter.iPhone'), 'aria-label': t('ter.iPhone'), autocomplete: 'off' });
    const of = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: '0', placeholder: t('ter.iOffer'), 'aria-label': t('ter.iOffer') });
    const addB = h('button', { class: 'btn btn--primary btn--sm', type: 'button' }, icon('plus', 16), t('ter.iAdd'));
    addB.addEventListener('click', () => busy(addB, async () => { try { await post(`/api/staff/terrenos/${id}/interesados`, { nombre: nm.value, telefono: tl.value, oferta: Number(of.value) || 0 }); await load(); } catch (e) { toast(e.message, true); } }));
    const row = (i) => {
      const sel = h('select', { class: 'select tr-int__st', 'aria-label': t('ter.iState') }, INTERES.map((s) => h('option', { value: s }, t(`ter.i_${s}`))));
      sel.value = i.estado; sel.addEventListener('change', async () => { try { await patch(`/api/staff/terreno-interesados/${i.id}`, { estado: sel.value }); await load(); } catch (e) { toast(e.message, true); } });
      return h('li', { class: 'tr-int' }, h('div', { class: 'tr-int__main' }, h('strong', null, i.nombre), h('small', null, [i.oferta ? `${t('ter.iOffered')} ${money(i.oferta)}` : '', fmtRelative(i.creado)].filter(Boolean).join(' · '))),
        i.telefono ? h('a', { class: 'btn btn--ghost btn--icon btn--sm', href: waLink(i.telefono, `${t('ter.hello')} ${i.nombre}, ${t('ter.aboutLand', { n: D.terreno.titulo })}`), target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'WhatsApp' }, icon('chat', 16)) : null,
        sel, h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': t('rg.remove'), onclick: async () => { try { await del(`/api/staff/terreno-interesados/${i.id}`); await load(); } catch (e) { toast(e.message, true); } } }, icon('x', 14)));
    };
    return h('section', { class: 'd-card' }, h('header', { class: 'd-card__head' }, h('div', null, h('h2', { class: 'd-card__title' }, t('ter.interested')), h('p', { class: 'd-card__sub' }, t('ter.interestedSub')))),
      D.interesados.length ? h('ul', { class: 'tr-ints' }, D.interesados.map(row)) : h('p', { class: 'd-calm' }, t('ter.iNone')),
      h('div', { class: 'tr-intform' }, nm, tl, of, addB));
  }

  function paint() {
    const x = D.terreno; const y = window.scrollY; clear(root);
    const docs = new Set(x.documentos);
    const toggleDoc = (k) => saveT({ documentos: docs.has(k) ? x.documentos.filter((d) => d !== k) : [...x.documentos, k] });
    const stateSeg = seg(ESTADOS.map((e) => ({ id: e, label: t(`ter.s_${e}`) })), x.estado, (e) => saveT({ estado: e }), { label: t('ter.state'), cls: 'd-seg--scroll' });
    put(root, 
      h('a', { class: 'd-link tr-back', href: '#/terrenos' }, icon('left', 14), t('nav.land')),
      h('header', { class: 'd-head' }, h('div', null, h('h1', null, x.titulo), h('p', { class: 'tr-sub' }, opBadge(x.operacion), x.uso ? h('span', { class: 'badge' }, t(`ter.u_${x.uso}`)) : null, place(x) ? h('span', { class: 'tr-loc' }, icon('pin', 14), place(x)) : null)),
        h('div', { class: 'd-head__act' },
          h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => formSheet(x, () => load()) }, icon('edit', 16), t('ter.edit')),
          h('button', { class: 'btn btn--danger btn--sm', type: 'button', onclick: async () => { if (await confirmDialog({ title: t('ter.delete'), text: t('ter.deleteText', { n: x.titulo }), okLabel: t('rg.remove'), danger: true })) { try { await del(`/api/staff/terrenos/${id}`); go('#/terrenos'); } catch (e) { toast(e.message, true); } } } }, icon('trash', 16), t('rg.remove')))),
      h('div', { class: 'tr-layout' },
        h('div', { class: 'tr-col' }, gallery(),
          h('section', { class: 'd-card' }, h('h2', { class: 'd-card__title' }, t('ter.sDesc')), x.descripcion ? h('p', { class: 'tr-desc' }, x.descripcion) : h('p', { class: 'd-calm' }, t('ter.noDesc')),
            x.caracteristicas.length ? h('div', { class: 'tr-feats' }, x.caracteristicas.map((c) => h('span', { class: 'tr-feat' }, icon('check', 14), t(`ter.c_${c}`)))) : null),
          ubicacion(), interesados()),
        h('div', { class: 'tr-col' },
          h('section', { class: 'd-card tr-price' }, h('div', null, h('small', null, x.operacion === 'compra' ? t('ter.budget') : t('ter.askPrice')), h('strong', null, x.precio ? money(x.precio) : '—'), x.negociable ? h('span', { class: 'badge badge--info' }, t('ter.negotiable')) : null),
            h('dl', { class: 'tr-facts' }, h('dt', null, t('ter.area')), h('dd', null, x.area_ha ? `${qty(x.area_ha)} ha` : '—'), h('dt', null, t('ter.perHaLabel')), h('dd', null, x.precio_ha ? money(x.precio_ha) : '—'),
              h('dt', null, t('ter.perM2')), h('dd', null, x.precio_ha ? money(x.precio_ha / 10000) : '—'), x.contacto_tel ? [h('dt', null, t('ter.contact')), h('dd', null, h('a', { href: `tel:${x.contacto_tel}` }, `${x.contacto_nombre ? `${x.contacto_nombre} · ` : ''}${x.contacto_tel}`))] : null),
            h('div', { class: 'field', style: 'margin:0' }, h('span', { class: 'label' }, t('ter.state')), stateSeg),
            null),
          h('section', { class: 'd-card' }, h('header', { class: 'd-card__head' }, h('div', null, h('h2', { class: 'd-card__title' }, t('ter.docs')), h('p', { class: 'd-card__sub' }, t('ter.docsSub', { a: docs.size, b: DOCS.length })))),
            h('div', { class: 'tr-bar', role: 'progressbar', 'aria-valuenow': String(docs.size), 'aria-valuemin': '0', 'aria-valuemax': String(DOCS.length) }, h('i', { style: `width:${(docs.size / DOCS.length) * 100}%` })),
            h('ul', { class: 'tr-docs' }, DOCS.map((k) => h('li', null, h('label', { class: 'check-line' }, h('input', { type: 'checkbox', checked: docs.has(k), onchange: () => toggleDoc(k) }), h('span', null, h('strong', null, t(`ter.d_${k}`)), h('small', null, t(`ter.d_${k}_h`)))))))),
          tools())));
    window.scrollTo(0, y);
  }
  put(root, skel('d-skel--kpi'), skel('d-skel--chart'));
  load();
}

export default function terrenos(ctx) {
  const first = ctx.params[0];
  if (first === 'nuevo') {
    ctx.go('#/terrenos');
    setTimeout(() => formSheet(null, (id) => ctx.go(`#/terrenos/${id}`)), 60);
    return undefined;
  }
  if (first) return detalle({ ...ctx, id: first });
  return lista(ctx);
}
