// Portada pública (estilo "Triloe"): navegación flotante, titular, imagen con pestañas recortadas y bento.
import { h, langSwitch } from '../ui.js';
import { icon, logo } from '../icons.js';
import { t, getLang, setLang } from '../i18n.js';
import { state } from '../state.js';
import { fmtDay, todayLocal } from '../time.js';
import { reveal, scrollFx, splitWords, story } from '../fx.js';
import { buildStory } from './phone.js';
import { buildShelf } from './shelf.js';

// Imágenes del hero: una por formato (dirección de arte). Si falta alguna, se dibuja un campo ilustrado con CSS.
const HERO = { wide: '/img/hero/hero-wide.webp', mid: '/img/hero/hero-mid.webp', tall: '/img/hero/hero-tall.webp' };

export default function landing({ main, rerender, toggleTheme }) {
  const wa = state.pub.whatsapp;
  const waLink = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(t('landing.waText'))}` : null;
  const scrollTo = (id) => (e) => { e?.preventDefault(); closeMenu(); document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); };

  // ── Navegación (barra mínima en escritorio, menú expandible en móvil) ──
  const links = [['how', 'landing.navHow'], ['benefits', 'landing.navBenefits']];
  const navLinks = (cls) => links.map(([id, k]) => h('a', { class: cls, href: `#${id}`, onclick: scrollTo(id) }, t(k)));
  const menuBtn = h('button', { class: 'btn btn--ghost btn--icon lnav__burger', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'lmenu', 'aria-label': t('landing.menu') }, icon('menu', 20));
  const panel = h('div', { class: 'lmenu', id: 'lmenu', hidden: true },
    navLinks('lmenu__link'),
    h('a', { class: 'lmenu__link', href: '#/negocio' }, t('landing.staff')),
    h('div', { class: 'lmenu__row' }, langSwitch(getLang(), (c) => { setLang(c); rerender(); }),
      h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': t('common.toggleTheme'), onclick: toggleTheme }, icon('moon', 18))),
    h('a', { class: 'btn btn--ink btn--block', href: '#/registro' }, t('landing.signup'), icon('right', 18)));
  function closeMenu() { panel.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
  menuBtn.addEventListener('click', () => { const open = panel.hidden; panel.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open)); });
  const onKey = (e) => { if (e.key === 'Escape' && !panel.hidden) { closeMenu(); menuBtn.focus(); } };
  document.addEventListener('keydown', onKey);

  const nav = h('header', { class: 'lnav' },
    h('div', { class: 'lnav__bar' },
      h('a', { class: 'brand', href: '#/', 'aria-label': 'FieldFlow' }, logo(34), h('span', null, 'FieldFlow')),
      h('nav', { class: 'lnav__links', 'aria-label': t('nav.main') }, navLinks('lnav__link'), h('a', { class: 'lnav__link', href: '#/negocio' }, t('landing.staff'))),
      h('div', { class: 'lnav__end' },
        h('span', { class: 'lnav__tools' }, langSwitch(getLang(), (c) => { setLang(c); rerender(); }),
          h('button', { class: 'btn btn--ghost btn--icon btn--sm', type: 'button', 'aria-label': t('common.toggleTheme'), onclick: toggleTheme }, icon('moon', 18))),
        h('a', { class: 'btn btn--ink lnav__cta', href: '#/registro' }, t('landing.signup'), icon('right', 18)),
        menuBtn)),
    panel);

  // ── Imagen del hero ──
  const img = h('img', {
    class: 'hframe__img', src: HERO.wide, alt: t('landing.heroAlt'), width: '2400', height: '1000',
    loading: 'eager', fetchpriority: 'high', decoding: 'async',
  });
  const picture = h('picture', null,
    h('source', { media: '(min-width: 1024px)', srcset: HERO.wide }),
    h('source', { media: '(min-width: 600px)', srcset: HERO.mid }),
    h('source', { srcset: HERO.tall }),
    img);
  const frame = h('figure', { class: 'hframe' },
    h('div', { class: 'hframe__media' }, picture, h('div', { class: 'hframe__art', 'aria-hidden': 'true' })),
    // Pestaña izquierda: estado real del producto (no es un testimonio).
    h('div', { class: 'htab htab--l' },
      h('span', { class: 'htab__icon', 'aria-hidden': 'true' }, icon('chat', 18)),
      h('span', { class: 'htab__txt' }, h('strong', null, t('landing.tabTitle')), h('span', null, t('landing.tabSub')))),
    h('div', { class: 'htab htab--r' },
      h('span', { class: 'chip-o' }, t('landing.tabChip')),
      h('span', { class: 'chip-o hide-xs' }, fmtDay(todayLocal(), { day: 'numeric', month: 'short', year: 'numeric' }))),
    h('div', { class: 'hfloat', role: 'note' },
      h('span', { class: 'hfloat__ok', 'aria-hidden': 'true' }, icon('check', 18)),
      h('span', null, h('strong', null, t('landing.floatTitle')), h('span', null, t('landing.floatSub')))));
  const showArt = () => frame.classList.add('hframe--art');
  img.addEventListener('error', showArt);
  if (img.complete && img.naturalWidth === 0) showArt();

  const primary = waLink
    ? h('a', { class: 'btn btn--primary btn--lg', href: waLink, rel: 'noopener' }, icon('chat', 18), t('landing.cta'))
    : h('a', { class: 'btn btn--primary btn--lg', href: '#/registro' }, t('landing.signup'), icon('right', 18));
  const secondary = waLink
    ? h('a', { class: 'textlink', href: '#/registro' }, t('landing.signupBiz'), icon('right', 16))
    : h('a', { class: 'textlink', href: '#how', onclick: scrollTo('how') }, t('landing.how'), icon('down', 16));

  const hero = h('section', { class: 'lhero', 'aria-labelledby': 'hero-t' },
    h('div', { class: 'lhero__head' },
      h('div', null,
        h('span', { class: 'eyebrow' }, t('landing.eyebrow')),
        h('h1', { id: 'hero-t' }, t('landing.title'))),
      h('div', { class: 'lhero__side' },
        h('p', { class: 'lead' }, t('landing.lead', { biz: state.pub.nombre || 'FieldFlow' })),
        h('div', { class: 'actions' }, primary, secondary))),
    frame);

  // ── Cómo funciona: teléfono animado con escenas ──
  const st = buildStory();
  const steps = st.el;

  // ── Estantería 3D de servicios ──
  const shelf = buildShelf({ ctaHref: waLink || '#/registro' });

  // ── Franja de públicos (se desplaza sola) ──
  const kinds = ['finca', 'cooperativa', 'transporte', 'insumos', 'asistencia'].map((k) => t(`reg.type_${k}`));
  const track = (hidden) => h('ul', { class: 'mq__track', 'aria-hidden': hidden ? 'true' : null }, kinds.map((k) => h('li', null, icon('leaf', 16), k)));
  const marquee = h('div', { class: 'mq', 'data-reveal': '1' }, h('div', { class: 'mq__inner' }, track(false), track(true)));

  const benefits = h('section', { class: 'lsec', id: 'benefits', 'aria-labelledby': 'ben-t' },
    h('div', { class: 'lsec__head', 'data-reveal': '1' }, h('span', { class: 'eyebrow' }, t('landing.benEyebrow')), h('h2', { id: 'ben-t' }, t('landing.benTitle'))),
    h('ul', { class: 'bento bento--4' },
      [['shield', 'b1'], ['hand', 'b2'], ['mic', 'b3'], ['globe', 'b4']].map(([ic, k], i) => h('li', { class: 'bento__card', 'data-reveal': String(i + 1) },
        h('span', { class: 'bento__icon', 'aria-hidden': 'true' }, icon(ic, 22)),
        h('h3', null, t(`landing.${k}t`)), h('p', null, t(`landing.${k}d`))))),
    h('div', { class: 'lcta', 'data-reveal': '1' },
      h('div', null, h('h2', null, t('landing.ctaTitle')), h('p', null, t('landing.ctaSub'))),
      h('a', { class: 'btn btn--onink btn--lg', href: '#/registro' }, t('landing.signup'), icon('right', 18))));

  const bar = h('div', { class: 'lprogress', 'aria-hidden': 'true' });
  const page = h('div', { class: 'lpage' }, bar, nav,
    h('main', { class: 'landing', id: 'main' },
      state.linkError ? h('div', { class: 'banner banner--warn', role: 'alert' }, icon('alert', 20), h('span', null, `${state.linkError} ${t('landing.linkHelp')}`)) : null,
      hero, !waLink ? h('p', { class: 'hint' }, t('landing.noWa')) : null, marquee, shelf.el, steps, benefits,
      h('footer', { class: 'lfoot' }, h('span', { class: 'brand' }, logo(24), 'FieldFlow'), h('span', null, t('landing.foot')), h('a', { href: '/legal.html' }, t('reg.terms')))));
  main.append(page);

  // ── Movimiento ──
  splitWords(page.querySelector('#hero-t'));
  const stops = [
    reveal(page), shelf.destroy,
    scrollFx({ nav: nav.querySelector('.lnav__bar'), bar, parallax: [{ el: img, speed: 40 }] }),
    story({ root: steps, phone: st.phone, steps: st.steps }),
  ];
  requestAnimationFrame(() => page.classList.add('is-ready'));

  return () => { document.removeEventListener('keydown', onKey); stops.forEach((f) => f()); };
}
