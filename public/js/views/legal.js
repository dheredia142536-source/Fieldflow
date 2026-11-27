// Páginas legales (Términos de servicio y Política de privacidad): encabezado del sitio, portada con fecha,
// índice «En esta página» que sigue tu lectura y secciones numeradas.
import { h } from '../ui.js';
import { t, getLang } from '../i18n.js';
import { LEGAL, CONTACT, UPDATED } from '../legal-content.js';
import { siteNav } from './sitenav.js';

// Texto con {contact} → enlace de correo.
const rich = (s) => s.split('{contact}').flatMap((part, i, arr) => (i < arr.length - 1 ? [part, h('a', { href: `mailto:${CONTACT}` }, CONTACT)] : [part]));
const item = (s) => {
  const i = s.indexOf('|');
  return h('li', null, ...(i > 0 ? [h('strong', null, s.slice(0, i)), ' ', ...rich(s.slice(i + 1))] : rich(s)));
};
const block = (b) => (Array.isArray(b) ? h('ul', { class: 'lg__list' }, b.map(item)) : h('p', null, ...rich(b)));

export default function legal({ main, rerender, doc }) {
  const lang = getLang();
  const d = LEGAL[doc][lang];
  const other = doc === 'privacidad' ? 'terminos' : 'privacidad';
  const nav = siteNav({ rerender, light: true, brandLink: true });
  document.title = `${d.title} · FieldFlow`;
  const updated = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'es-CO', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${UPDATED}T12:00:00Z`));

  const ids = d.sections.map((_, i) => `s${i + 1}`);
  const goTo = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  };
  const links = d.sections.map((s, i) => h('li', null, h('button', { class: 'lg__tl', type: 'button', 'data-id': ids[i], onclick: () => goTo(ids[i]) }, h('span', null, `${i + 1}.`), s.title)));
  const toc = h('details', { class: 'lg__toc' }, h('summary', null, t('legal.onThisPage')), h('ol', null, links));
  const desktop = matchMedia('(min-width: 900px)');
  toc.open = desktop.matches;
  const onMq = () => { toc.open = desktop.matches; };
  desktop.addEventListener('change', onMq);

  const sections = d.sections.map((s, i) => h('section', { class: 'lg__sec', id: ids[i], tabindex: '-1', 'aria-labelledby': `${ids[i]}-h` },
    h('h2', { id: `${ids[i]}-h` }, h('span', null, `${i + 1}.`), s.title), s.blocks.map(block)));

  // Resalta en el índice la sección que estás leyendo.
  let io = null;
  const mark = (id) => links.forEach((li) => { const b = li.firstChild; const on = b.dataset.id === id; b.classList.toggle('is-on', on); if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver((es) => { const v = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) mark(v.target.id); }, { rootMargin: '-10% 0px -75% 0px' });
    queueMicrotask(() => sections.forEach((s) => io.observe(s)));
  }
  mark(ids[0]);

  main.append(h('div', { class: 'lg' },
    h('div', { class: 'lg__head' }, h('div', { class: 'lg__wrap' }, nav.header)),
    h('div', { class: 'lg__hero' }, h('div', { class: 'lg__wrap' },
      h('p', { class: 'lg__eyebrow' }, t('legal.legal')),
      h('h1', null, d.title),
      h('p', { class: 'lg__date' }, t('legal.updated', { date: updated })),
      h('p', { class: 'lg__lead' }, d.lead))),
    h('main', { class: 'lg__body lg__wrap', id: 'main' },
      h('aside', { class: 'lg__side' }, toc),
      h('article', { class: 'lg__art' }, sections,
        h('div', { class: 'lg__more' },
          h('a', { class: 'btn', href: `#/${other}` }, t(`legal.read_${other}`)),
          h('a', { class: 'btn btn--ghost', href: '#/' }, t('legal.home'))))),
    h('footer', { class: 'lg__foot' }, h('div', { class: 'lg__wrap lg__footin' },
      h('span', null, '© 2026 FieldFlow'),
      h('nav', { 'aria-label': t('legal.legal') }, h('a', { href: '#/terminos' }, t('res.terms')), h('a', { href: '#/privacidad' }, t('res.privacy')), h('a', { href: `mailto:${CONTACT}` }, CONTACT)))),
    nav.drawer));
  nav.reopen();
  window.scrollTo(0, 0);
  return () => { io?.disconnect(); desktop.removeEventListener('change', onMq); nav.cleanup(); };
}
