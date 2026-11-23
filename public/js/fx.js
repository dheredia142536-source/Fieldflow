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
 * Historia con teléfono. El teléfono queda fijo y la pantalla cambia sola al hacer scroll, sin tocar nada:
 * - Pantallas anchas: el paso que cruza el centro de la pantalla es el activo.
 * - Celular: el teléfono se queda fijo y el avance del scroll dentro de la sección decide la pantalla.
 * Además, el teléfono pide avanzar (evento 'ff:go') cuando la persona toca su botón principal:
 * se muestra la pantalla siguiente al instante y la página se desplaza hasta ella.
 */
export function story({ root, phone, steps, pips = [], onScene }) {
  const wide = matchMedia('(min-width: 900px)');
  const grid = root.querySelector('.story__grid'); const stage = root.querySelector('.story__stage');
  const lis = steps.map((s) => s.parentElement);
  const n = steps.length; let current = -1; let raf = 0; let lockUntil = 0; let lockT = 0;
  const set = (i) => {
    if (i === current) return;
    current = i;
    steps.forEach((s, k) => { s.classList.toggle('is-active', k === i); s.setAttribute('aria-current', k === i ? 'step' : 'false'); });
    pips.forEach((c, k) => { c.classList.toggle('is-active', k === i); c.classList.toggle('is-past', k < i); c.setAttribute('aria-current', k === i ? 'step' : 'false'); });
    onScene?.(i);
  };
  const metrics = () => {
    const top = parseFloat(getComputedStyle(stage).top) || 0;
    const travel = Math.max(1, grid.offsetHeight - stage.offsetHeight);
    return { top, travel, absTop: grid.getBoundingClientRect().top + scrollY };
  };
  const locked = () => performance.now() < lockUntil;
  const update = () => {
    raf = 0;
    if (wide.matches) return;
    if (locked()) { clearTimeout(lockT); lockT = setTimeout(queue, lockUntil - performance.now() + 30); return; }
    const { top, travel, absTop } = metrics();
    const p = (scrollY + top - absTop) / travel;
    set(Math.min(n - 1, Math.max(0, Math.floor(p * n))));
  };
  function queue() { if (!raf) raf = requestAnimationFrame(update); }
  const behavior = () => (reduced() ? 'auto' : 'smooth');
  const scrollToScene = (i) => {
    if (wide.matches) { lis[i].scrollIntoView({ block: 'center', behavior: behavior() }); return; }
    const { top, travel, absTop } = metrics();
    scrollTo({ top: absTop - top + ((i + 0.5) / n) * travel, behavior: behavior() });
  };
  const go = (i) => { lockUntil = performance.now() + 1100; set(i); scrollToScene(i); };
  steps.forEach((s, i) => s.addEventListener('click', () => go(i)));
  pips.forEach((b, i) => b.addEventListener('click', () => go(i)));
  const onGo = (e) => go(Math.min(n - 1, Math.max(0, Number(e.detail) || 0)));
  phone.addEventListener('ff:go', onGo);
  set(0);

  const cleanups = [() => phone.removeEventListener('ff:go', onGo), () => clearTimeout(lockT)];
  addEventListener('scroll', queue, { passive: true }); addEventListener('resize', queue, { passive: true });
  cleanups.push(() => { removeEventListener('scroll', queue); removeEventListener('resize', queue); cancelAnimationFrame(raf); });
  if ('IntersectionObserver' in window) {
    // Escritorio: el paso que cruza el centro de la pantalla es el activo.
    const pick = new IntersectionObserver((es) => {
      if (!wide.matches || locked()) return;
      for (const en of es) if (en.isIntersecting) set(lis.indexOf(en.target));
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    lis.forEach((li) => pick.observe(li)); cleanups.push(() => pick.disconnect());
  }
  wide.addEventListener?.('change', queue); cleanups.push(() => wide.removeEventListener?.('change', queue));
  queue();
  return () => cleanups.forEach((c) => c());
}
