// Mi enlace: el negocio copia su enlace (o su QR / mensaje listo) y lo pega en la bienvenida de su WhatsApp Business.
import { get, post } from '../api.js';
import { h, clear, openSheet, toast, busy, field } from '../ui.js';
import { icon } from '../icons.js';
import { t, getLang } from '../i18n.js';
import { seg, skel, kpi } from '../dui.js';
import { int } from '../fmt.js';
import qrcode from '../vendor/qrcode.js';

const NS = 'http://www.w3.org/2000/svg';
async function copy(text, ok) {
  try { await navigator.clipboard.writeText(text); toast(ok); } catch {
    const ta = h('textarea', { value: text, style: 'position:fixed;opacity:0' }); document.body.append(ta); ta.select();
    try { document.execCommand('copy'); toast(ok); } catch { toast(text, true); } ta.remove();
  }
}
const msgText = (lang, nombre, url) => (lang === 'en'
  ? `Hi! 👋 I'm the assistant of ${nombre}. Book here in 1 minute, no sign-up needed: ${url}`
  : `¡Hola! 👋 Soy el asistente de ${nombre}. Agenda aquí en 1 minuto, sin registrarte: ${url}`);

// QR como SVG (se dibuja con nodos, sin innerHTML)
function qrSvg(url, px = 216) {
  const q = qrcode(0, 'M'); q.addData(url); q.make();
  const n = q.getModuleCount(); const m = 2;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n + m * 2} ${n + m * 2}`); svg.setAttribute('width', px); svg.setAttribute('height', px); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'QR');
  const bg = document.createElementNS(NS, 'rect'); bg.setAttribute('width', n + m * 2); bg.setAttribute('height', n + m * 2); bg.setAttribute('fill', '#fff'); svg.append(bg);
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
  const path = document.createElementNS(NS, 'path'); path.setAttribute('d', d); path.setAttribute('fill', '#161616'); svg.append(path);
  return { svg, q, n, m };
}
function downloadQr(url, name) {
  const { q, n, m } = qrSvg(url); const scale = 12; const size = (n + m * 2) * scale;
  const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#161616';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect((c + m) * scale, (r + m) * scale, scale, scale);
  cv.toBlob((b) => { const a = h('a', { href: URL.createObjectURL(b), download: `qr-${name}.png` }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); });
}

export default function enlace({ main, isCurrent }) {
  const root = h('div', { class: 'd-page lk' }); main.append(root);
  let D = null; let lang = getLang(); let msg = null; let phone = '';

  const load = async () => { try { D = await get('/api/staff/enlace'); phone = phone || D.telefono || ''; msg = null; if (isCurrent()) paint(); } catch (e) { toast(e.message, true); } };

  function editSlug() {
    const host = location.host;
    const inp = h('input', { class: 'input', value: D.slug, maxlength: '40', autofocus: true, autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', 'aria-label': t('link.name') });
    const save = h('button', { class: 'btn btn--primary', type: 'button' }, t('common.save'));
    const sh = openSheet({ title: t('link.customize'), body: h('div', null, field(t('link.name'), inp, t('link.nameHint')), h('p', { class: 'lk-prev' }, `${host}/n/`, h('b', null, D.slug))), foot: [save] });
    inp.addEventListener('input', () => { sh.sheet.querySelector('.lk-prev b').textContent = inp.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-'); });
    save.addEventListener('click', () => busy(save, async () => {
      try { D = await post('/api/staff/enlace', { slug: inp.value }); sh.close(); toast(t('common.saved')); msg = null; paint(); } catch (e) { toast(e.message, true); }
    }));
  }

  const step = (n, title, text) => h('li', { class: 'lk-step' }, h('span', { class: 'lk-step__n' }, String(n)), h('div', null, h('strong', null, title), h('p', null, text)));

  function paint() {
    const y = window.scrollY; clear(root);
    const head = h('header', { class: 'd-head' }, h('div', null, h('h1', null, t('nav.link')), h('p', null, t('link.lead'))));
    if (!D) { root.append(head, skel('d-skel--kpi'), skel('d-skel--chart')); return; }
    if (msg == null) msg = msgText(lang, D.nombre, D.url);
    const area = h('textarea', { class: 'textarea', rows: '4', 'aria-label': t('link.message'), maxlength: '600' }); area.value = msg;
    area.addEventListener('input', () => { msg = area.value; });
    const langSeg = seg([{ id: 'es', label: 'Español' }, { id: 'en', label: 'English' }], lang, (id) => { lang = id; msg = msgText(lang, D.nombre, D.url); paint(); }, { label: t('common.language') });
    const waNum = h('input', { class: 'input', type: 'tel', inputmode: 'tel', value: phone, placeholder: '3001234567', autocomplete: 'off', 'aria-label': t('link.waNumber') });
    const waOut = h('p', { class: 'lk-wa' });
    const calcWa = () => {
      phone = waNum.value; clear(waOut);
      let d = phone.replace(/\D/g, ''); if (d.length === 10 && d.startsWith('3')) d = `57${d}`;
      if (d.length < 8) return;
      const link = `https://wa.me/${d}?text=${encodeURIComponent(lang === 'en' ? 'Hi, I want to book' : 'Hola, quiero agendar')}`;
      waOut.append(h('code', null, link), h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => copy(link, t('link.copied')) }, icon('copy', 16), t('link.copy')));
    };
    waNum.addEventListener('input', calcWa); calcWa();
    const s = D.ultimos30;
    const share = navigator.share ? h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => navigator.share({ title: D.nombre, text: msg, url: D.url }).catch(() => {}) }, icon('share', 16), t('link.share')) : null;

    root.append(head,
      h('section', { class: 'd-card lk-main' },
        h('div', { class: 'lk-main__l' },
          h('h2', { class: 'd-card__title' }, t('link.yours')), h('p', { class: 'd-card__sub' }, t('link.yoursSub')),
          h('div', { class: 'lk-url' }, h('code', null, D.url)),
          h('div', { class: 'row' },
            h('button', { class: 'btn btn--primary', type: 'button', onclick: () => copy(D.url, t('link.copied')) }, icon('copy', 18), t('link.copy')), share,
            h('a', { class: 'btn btn--secondary btn--sm', href: D.url, target: '_blank', rel: 'noopener noreferrer' }, icon('link', 16), t('link.test')),
            h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: editSlug }, icon('edit', 16), t('link.customize')))),
        h('div', { class: 'lk-qr' }, qrSvg(D.url).svg, h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => downloadQr(D.url, D.slug) }, icon('download', 16), t('link.downloadQr')))),
      h('div', { class: 'd-kpis lk-k3' },
        kpi({ ic: 'link', label: t('link.kIn'), value: int(s.entraron), caption: t('link.k30') }), kpi({ ic: 'user', label: t('link.kData'), value: int(s.dejaron_datos), caption: t('link.kDataCap') }), kpi({ ic: 'calendar', label: t('link.kBooked'), value: int(s.agendaron), caption: t('link.kBookedCap') })),
      h('section', { class: 'd-card' }, h('header', { class: 'd-card__head' }, h('div', null, h('h2', { class: 'd-card__title' }, t('link.message')), h('p', { class: 'd-card__sub' }, t('link.messageSub'))), langSeg),
        area, h('div', { class: 'row' }, h('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: () => copy(msg, t('link.copiedMsg')) }, icon('copy', 16), t('link.copyMsg')))),
      h('section', { class: 'd-card' }, h('h2', { class: 'd-card__title' }, t('link.how')), h('p', { class: 'd-card__sub' }, t('link.howSub')),
        h('ol', { class: 'lk-steps' },
          step(1, t('link.s1t'), t('link.s1')), step(2, t('link.s2t'), t('link.s2')), step(3, t('link.s3t'), t('link.s3')), step(4, t('link.s4t'), t('link.s4'))),
        h('p', { class: 'hint' }, t('link.menusNote'))),
      h('section', { class: 'd-card' }, h('h2', { class: 'd-card__title' }, t('link.waTitle')), h('p', { class: 'd-card__sub' }, t('link.waSub')), h('div', { class: 'field', style: 'margin:0' }, h('label', null, t('link.waNumber')), waNum), waOut));
    window.scrollTo(0, y);
  }
  paint(); load();
}
