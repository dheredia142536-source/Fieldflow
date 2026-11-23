// Movimiento de la portada: aparición al hacer scroll, paralaje, barra de progreso y escenas del teléfono.
// Reglas: sólo transform/opacity (fluido a 60 fps), observadores en vez de cálculos en cada scroll,
// y todo se desactiva con "reducir movimiento" (el contenido queda visible y estático).
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Aparición escalonada: marca .is-in cuando el elemento entra en pantalla. */
export function reveal(root) {
  const els = [...root.querySelectorAll('[data-reveal]')];
  if (reduced() || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return () => {}; }
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
  els.forEach((e) => {
    const d = e.dataset.reveal;
    if (d && d !== '1') e.style.setProperty('--d', `${Number(d) * 90}ms`);
    e.addEventListener('transitionend', (ev) => { if (ev.target === e) { e.style.removeProperty('--d'); e.classList.add('is-done'); } }, { once: true });
    io.observe(e);
  });
  return () => io.disconnect();
}

/** Parte un titular en palabras para animarlas una a una (el texto sigue siendo el mismo para lectores de pantalla). */
export function splitWords(el) {
  const text = el.textContent;
  el.setAttribute('aria-label', text);
  el.textContent = '';
  text.split(/\s+/).forEach((w, i, all) => {
    const s = document.createElement('span');
    s.className = 'w'; s.setAttribute('aria-hidden', 'true'); s.style.setProperty('--i', String(i));
    const inner = document.createElement('span'); inner.textContent = w; s.append(inner);
    el.append(s);
    if (i < all.length - 1) el.append(' ');
  });
}

/** Barra de progreso, barra de navegación con cristal al bajar y paralaje suave del hero. */
export function scrollFx({ nav, bar, parallax }) {
  let ticking = false;
  const run = () => {
    ticking = false;
    const y = window.scrollY;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    if (bar) bar.style.transform = `scaleX(${Math.min(1, y / max)})`;
    nav?.classList.toggle('is-scrolled', y > 24);
    if (parallax && !reduced()) {
      for (const p of parallax) {
        const r = p.el.getBoundingClientRect();
        if (r.bottom < -100 || r.top > innerHeight + 100) continue;
        const k = (r.top + r.height / 2 - innerHeight / 2) / innerHeight; // -1..1
        p.el.style.setProperty('--py', `${(-k * p.speed).toFixed(1)}px`);
      }
    }
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(run); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  run();
  return () => { removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); };
}

/**
 * Historia con teléfono. El teléfono queda fijo y la escena cambia sola al hacer scroll, sin tocar nada:
 * - Pantallas anchas: el paso que cruza el centro de la pantalla es el activo.
 * - Celular: el teléfono se queda fijo arriba y el avance del scroll dentro de la sección decide la escena.
 * Los puntos de avance (celular) y los pasos (escritorio) siguen siendo pulsables para saltar a una escena.
 */
export function story({ root, phone, steps, caps = [], pips = [], onScene }) {
  const wide = matchMedia('(min-width: 900px)');
  const grid = root.querySelector('.story__grid'); const stage = root.querySelector('.story__stage');
  const lis = steps.map((s) => s.parentElement);
  const n = steps.length; let current = -1; let raf = 0;
  const set = (i) => {
    if (i === current) return;
    current = i;
    phone.dataset.scene = String(i + 1);
    steps.forEach((s, k) => { s.classList.toggle('is-active', k === i); s.setAttribute('aria-current', k === i ? 'step' : 'false'); });
    caps.forEach((c, k) => c.classList.toggle('is-active', k === i));
    pips.forEach((c, k) => { c.classList.toggle('is-active', k === i); c.classList.toggle('is-past', k < i); c.setAttribute('aria-current', k === i ? 'step' : 'false'); });
    onScene?.(i);
  };
  const metrics = () => {
    const top = parseFloat(getComputedStyle(stage).top) || 0;
    const travel = Math.max(1, grid.offsetHeight - stage.offsetHeight);
    const absTop = grid.getBoundingClientRect().top + scrollY;
    return { top, travel, absTop };
  };
  const update = () => {
    raf = 0;
    if (wide.matches) return;
    const { top, travel, absTop } = metrics();
    const p = (scrollY + top - absTop) / travel;
    set(Math.min(n - 1, Math.max(0, Math.floor(p * n))));
  };
  const queue = () => { if (!raf) raf = requestAnimationFrame(update); };
  const behavior = () => (reduced() ? 'auto' : 'smooth');
  steps.forEach((s, i) => s.addEventListener('click', () => {
    if (wide.matches) lis[i].scrollIntoView({ block: 'center', behavior: behavior() });
    else { const { top, travel, absTop } = metrics(); scrollTo({ top: absTop - top + ((i + 0.5) / n) * travel, behavior: behavior() }); }
  }));
  pips.forEach((b, i) => b.addEventListener('click', () => { const { top, travel, absTop } = metrics(); scrollTo({ top: absTop - top + ((i + 0.5) / n) * travel, behavior: behavior() }); }));
  set(0);

  const cleanups = [];
  addEventListener('scroll', queue, { passive: true }); addEventListener('resize', queue, { passive: true });
  cleanups.push(() => { removeEventListener('scroll', queue); removeEventListener('resize', queue); cancelAnimationFrame(raf); });
  if ('IntersectionObserver' in window) {
    // Escritorio: el paso que cruza el centro de la pantalla es el activo.
    const pick = new IntersectionObserver((es) => {
      if (!wide.matches) return;
      for (const en of es) if (en.isIntersecting) set(lis.indexOf(en.target));
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    lis.forEach((li) => pick.observe(li)); cleanups.push(() => pick.disconnect());
  }
  wide.addEventListener?.('change', queue); cleanups.push(() => wide.removeEventListener?.('change', queue));
  queue();
  return () => cleanups.forEach((c) => c());
}
